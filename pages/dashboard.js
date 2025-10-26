'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signOut } from 'firebase/auth';

import { auth } from '../backend/Firebase';
import { useFirestoreDb } from '../backend/Database';

/* --------------- helper to render a grade or suggestion --------------- */
function renderGrade(submission) {
  const g = submission?.grade || {};
  const ai = submission?.aiSuggested || null;

  const suggestedScore =
    g.suggestedScore != null ? g.suggestedScore : ai?.score;
  const suggestedFeedback =
    g.suggestedFeedback != null ? g.suggestedFeedback : ai?.rationale;

  if (g.status === 'graded') {
    return `Score ${g.score ?? 0}${g.feedback ? ` — ${g.feedback}` : ''}`;
  }
  if (g.status === 'ai_pending') return 'Generating AI suggestion…';
  if ((g.status === 'ai_suggested' || g.status === 'pending') && suggestedScore != null) {
    return `Suggested ${suggestedScore}${suggestedFeedback ? ` — ${suggestedFeedback}` : ''}`;
  }
  return 'Not graded';
}

export default function Dashboard() {
  const router = useRouter();

  /* ------------------------- Auth state ------------------------- */
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  /* ---------------------- Firestore (hook) ---------------------- */
  const {
    ready,
    db,
    addCourse,
    addAssignment,
    addQuestion,
    updateQuestion,
    joinCourseByCode,
    submitAnswer,
    getSubmissionsForAssignment,
    gradeSubmission,
    requestAiGrade,
  } = useFirestoreDb(user?.uid || 'anon');

  /* ------------------------ Simple router ----------------------- */
  const [view, setView] = useState('home'); // 'home' | 'create' | 'join' | 'my'

  /* ------------------------- TTS (voices) ----------------------- */
  const selectedVoiceRef = useRef(null);
  const [voices, setVoices] = useState([]);
  const [voicesEn, setVoicesEn] = useState([]);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [selectedVoiceName, setSelectedVoiceName] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const score = (v) => {
      const n = (v.name || '').toLowerCase();
      let s = 0;
      if (/neural|wavenet|natural|studio|premium|siri/.test(n)) s += 3;
      if (/google|microsoft/.test(n)) s += 2;
      if ((v.lang || '').toLowerCase().startsWith('en')) s += 1;
      return s;
    };

    const refresh = () => {
      const all = window.speechSynthesis.getVoices() || [];
      setVoices(all);
      const enOnly = all
        .filter((v) => (v.lang || '').toLowerCase().startsWith('en'))
        .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
      setVoicesEn(enOnly);

      const saved = localStorage.getItem('tts_voice_name') || '';
      if (saved) {
        const match = all.find((x) => x.name === saved);
        if (match) {
          selectedVoiceRef.current = match;
          setSelectedVoiceName(saved);
        }
      }
    };

    refresh();
    window.speechSynthesis.onvoiceschanged = refresh;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  function speak(text) {
    if (typeof window === 'undefined') return;
    if (!('speechSynthesis' in window)) {
      alert('speechSynthesis not supported in this browser');
      return;
    }
    const utter = new SpeechSynthesisUtterance(text);
    if (selectedVoiceRef.current) utter.voice = selectedVoiceRef.current;
    else if (voicesEn[0]) utter.voice = voicesEn[0];
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }

  /* ------------------ Live STT (Web Speech API) ----------------- */
  function useWebSpeechSTT({ lang = 'en-US', interim = true } = {}) {
    const [supported, setSupported] = useState(false);
    const [listening, setListening] = useState(false);
    const [text, setText] = useState('');
    const recRef = useRef(null);

    useEffect(() => {
      if (typeof window === 'undefined') return;
      const has =
        'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
      setSupported(!!has);
    }, []);

    const start = () => {
      if (!supported || listening) return;
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SR();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = interim;

      rec.onresult = (ev) => {
        let finalText = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          finalText += ev.results[i][0].transcript;
        }
        setText(finalText.trim());
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);

      recRef.current = rec;
      rec.start();
      setListening(true);
    };

    const stop = () => {
      if (recRef.current) {
        recRef.current.stop();
        recRef.current = null;
      }
      setListening(false);
    };

    const reset = () => setText('');

    return { supported, listening, text, setText, start, stop, reset };
  }

  /* ----------------- Recorder (MediaRecorder) ------------------- */
  function useAudioRecorder() {
    const [recording, setRecording] = useState(false);
    const [audioUrl, setAudioUrl] = useState('');
    const mediaRef = useRef(null);
    const chunksRef = useRef([]);

    const start = async () => {
      if (recording) return;
      if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
        alert('MediaRecorder not supported in this environment');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRef.current = mr;
      mr.start();
      setRecording(true);
    };

    const stop = () => {
      if (!recording || !mediaRef.current) return;
      mediaRef.current.stop();
      setRecording(false);
    };

    const reset = () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl('');
    };

    return { recording, audioUrl, start, stop, reset };
  }

  /* ------------------ Create / Manage (owner) ------------------- */
  function CreateCourseView() {
    const [courseTitle, setCourseTitle] = useState('');
    const [lastCode, setLastCode] = useState('');
    const [openCourseId, setOpenCourseId] = useState('');
    const [assignForm, setAssignForm] = useState({ title: '', dueISO: '' });
    const [openAssignId, setOpenAssignId] = useState('');
    const [qForm, setQForm] = useState({ text: '', answer: '' });

    const myId = user?.uid || 'anon';
    const myCourses = useMemo(
      () => db.courses.filter((c) => c.ownerId === myId),
      [db.courses, myId]
    );

    const assignments = db.assignmentsByCourse[openCourseId] || [];
    const [editQId, setEditQId] = useState('');
    const [editQ, setEditQ] = useState({ text: '', answer: '' });

    const [showSubs, setShowSubs] = useState(false);
    const subs = useMemo(
      () => (openAssignId ? getSubmissionsForAssignment(openAssignId) : []),
      [openAssignId, getSubmissionsForAssignment, db.submissionsByAssignment]
    );

    // Auto-request AI suggestion when submissions panel is open
    const aiQueuedRef = useRef(new Set());
    useEffect(() => {
      if (!showSubs) return;
      subs.forEach((s) => {
        const needsSuggestion =
          !s.grade || s.grade.status === 'pending' || s.grade.status === 'ai_pending';
        if (needsSuggestion && !aiQueuedRef.current.has(s.id)) {
          aiQueuedRef.current.add(s.id);
          requestAiGrade(s.id).catch(() => {});
        }
      });
    }, [showSubs, subs, requestAiGrade]);

    const doAddCourse = async () => {
      const title = courseTitle.trim();
      if (!title) return;
      const { id, code } = await addCourse(title);
      setCourseTitle('');
      setLastCode(code);
      setOpenCourseId(id);
    };

    const beginEdit = (qid) => {
      const q = (db.questionsByAssignment[openAssignId] || []).find((x) => x.id === qid);
      if (!q) return;
      setEditQId(qid);
      setEditQ({ text: q.text || '', answer: q.answer || '' });
    };

    const saveEdit = async () => {
      if (!editQId) return;
      await updateQuestion(openAssignId, editQId, {
        text: editQ.text,
        answer: editQ.answer,
      });
      setEditQId('');
      setEditQ({ text: '', answer: '' });
    };

    return (
      <Block>
        <h2>Create & Manage My Courses</h2>

        <Card>
          <h3>Create Course</h3>
          <Row>
            <input
              placeholder="Course title"
              value={courseTitle}
              onChange={(e) => setCourseTitle(e.target.value)}
            />
            <button onClick={doAddCourse} disabled={!user}>Create</button>
          </Row>
          {!user && <Small>Sign in to create courses.</Small>}
          {lastCode && <Small>Share this code with students: <b>{lastCode}</b></Small>}
        </Card>

        <Card>
          <h3>My Courses</h3>
          {myCourses.length === 0 && <Small>No courses yet</Small>}
          {myCourses.map((c) => (
            <div key={c.id} style={{ marginBottom: 8 }}>
              <Row>
                <b>{c.title}</b>
                <span style={{ opacity: 0.7 }}>code: {c.code}</span>
                <button onClick={() => setOpenCourseId(c.id)}>
                  {openCourseId === c.id ? 'Opened' : 'Open'}
                </button>
              </Row>
            </div>
          ))}
        </Card>

        {openCourseId && (
          <Card>
            <h3>Assignments</h3>
            <Row>
              <input
                placeholder="Assignment title"
                value={assignForm.title}
                onChange={(e) => setAssignForm((s) => ({ ...s, title: e.target.value }))}
              />
              <input
                type="datetime-local"
                value={assignForm.dueISO}
                onChange={(e) => setAssignForm((s) => ({ ...s, dueISO: e.target.value }))}
              />
              <button
                onClick={async () => {
                  if (!assignForm.title || !assignForm.dueISO) return;
                  const id = await addAssignment(openCourseId, assignForm.title, assignForm.dueISO);
                  setOpenAssignId(id);
                  setAssignForm({ title: '', dueISO: '' });
                }}
                disabled={!user}
              >
                Add Assignment
              </button>
            </Row>

            <ul>
              {assignments.map((a) => (
                <li key={a.id} style={{ marginTop: 6 }}>
                  <Row>
                    <span><b>{a.title}</b> · Due: {a.dueISO || '—'}</span>
                    <button onClick={() => setOpenAssignId(a.id)}>
                      {openAssignId === a.id ? 'Opened' : 'Open'}
                    </button>
                  </Row>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {openAssignId && (
          <Card>
            <h3>Questions</h3>

            <Row>
              <input
                placeholder="Question text"
                value={qForm.text}
                onChange={(e) => setQForm((s) => ({ ...s, text: e.target.value }))}
              />
              <input
                placeholder="Answer (teacher key)"
                value={qForm.answer}
                onChange={(e) => setQForm((s) => ({ ...s, answer: e.target.value }))}
              />
              <button
                onClick={async () => {
                  if (!qForm.text.trim()) return;
                  await addQuestion(openAssignId, qForm.text.trim(), qForm.answer || '');
                  setQForm({ text: '', answer: '' });
                }}
                disabled={!user}
              >
                Add Question
              </button>
            </Row>

            <ol style={{ marginTop: 10 }}>
              {(db.questionsByAssignment[openAssignId] || []).map((q, i) => {
                const editing = q.id === editQId;
                return (
                  <li key={q.id} style={{ marginBottom: 10 }}>
                    {editing ? (
                      <div>
                        <div>Editing Q{i + 1}</div>
                        <Row style={{ marginTop: 6 }}>
                          <input
                            value={editQ.text}
                            onChange={(e) => setEditQ((s) => ({ ...s, text: e.target.value }))}
                            placeholder="Question text"
                          />
                          <input
                            value={editQ.answer}
                            onChange={(e) => setEditQ((s) => ({ ...s, answer: e.target.value }))}
                            placeholder="Answer"
                          />
                          <button onClick={saveEdit} disabled={!user}>Save</button>
                          <button onClick={() => setEditQId('')}>Cancel</button>
                        </Row>
                      </div>
                    ) : (
                      <div>
                        Q{i + 1}: {q.text}{' '}
                        {q.answer ? <Small>· Answer: <b>{q.answer}</b></Small> : null}
                        <div style={{ marginTop: 6 }}>
                          <button onClick={() => beginEdit(q.id)} disabled={!user}>Edit</button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>

            {/* Submissions panel */}
            <div style={{ marginTop: 12 }}>
              <button onClick={() => setShowSubs((s) => !s)}>
                {showSubs ? 'Hide submissions' : 'View submissions'}
              </button>
            </div>

            {showSubs && (
              <div style={{ marginTop: 10 }}>
                <Small> Total submissions: <b>{subs.length}</b> </Small>
                {subs.length === 0 ? (
                  <Small>None yet.</Small>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    {subs.map((s) => (
                      <div key={s.id} style={{ borderTop: '1px solid #2a2c33', paddingTop: 8, marginTop: 8 }}>
                        <div>
                          <b>Student:</b> {s.studentEmail || s.studentId}{' '}
                          <Small>({new Date(s.tsISO || Date.now()).toLocaleString()})</Small>
                        </div>
                        <div><b>Question:</b> {s.questionId}</div>

                        <div style={{ marginTop: 4 }}>
                          <b>Transcript:</b>
                          <div style={{ whiteSpace: 'pre-wrap', background: '#111216', border: '1px solid #2a2c33', borderRadius: 8, padding: 8, marginTop: 4 }}>
                            {s.transcript || <i>(empty)</i>}
                          </div>
                        </div>

                        {s.audioUrl ? (
                          <div style={{ marginTop: 6 }}>
                            <audio controls src={s.audioUrl} />
                          </div>
                        ) : null}

                        <div style={{ marginTop: 6 }}>
                          <b>Grade:</b> {renderGrade(s)}
                        </div>

                        {/* Manual grade + optional re-run AI */}
                        <div style={{ marginTop: 8 }}>
                          <input style={{ width: 90 }} type="number" min="0" step="1" placeholder="Score" id={`g-score-${s.id}`} />
                          <input style={{ width: 260 }} type="text" placeholder="Feedback" id={`g-fb-${s.id}`} />
                          <button
                            onClick={async () => {
                              const raw = document.getElementById(`g-score-${s.id}`).value.trim();
                              if (raw === '') { alert('Enter a score'); return; }
                              const score = Number(raw);
                              if (!Number.isFinite(score)) { alert('Score must be a number'); return; }
                              const feedback = document.getElementById(`g-fb-${s.id}`).value;
                              await gradeSubmission(s.id, { score, feedback });
                              alert('Saved grade');
                            }}
                          >
                            Save Grade
                          </button>
                          <button
                            onClick={async () => {
                              await requestAiGrade(s.id);
                              alert('AI grading requested.');
                            }}
                            style={{ marginLeft: 8 }}
                          >
                            AI Grade (Gemini)
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        )}
      </Block>
    );
  }

  /* ------------------------- Join Course ------------------------ */
  function JoinCourseView() {
    const [code, setCode] = useState('');
    const [msg, setMsg] = useState('');

    const doJoin = async () => {
      const val = code.trim();
      if (!val) return;
      const res = await joinCourseByCode(user?.uid || 'anon', val);
      if (!res.ok) setMsg(res.error || 'Error');
      else setMsg(`Joined: ${res.course.title}`);
      setCode('');
    };

    return (
      <Block>
        <h2>Join a Course</h2>
        <Card>
          <Row>
            <input
              placeholder="Enter 6-digit course code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button onClick={doJoin}>Join</button>
          </Row>
          {msg && <Small>{msg}</Small>}
        </Card>
      </Block>
    );
  }

  /* -------------------------- My Courses ------------------------ */
  function MyCoursesView() {
    const studentId = user?.uid || 'anon';
    const enrolledIds = db.studentEnrollments[studentId] || [];
    const myCourses = db.courses.filter(
      (c) => enrolledIds.includes(c.id) || c.ownerId === studentId
    );

    const [openCourseId, setOpenCourseId] = useState('');
    const [openAssignId, setOpenAssignId] = useState('');
    const assignments = db.assignmentsByCourse[openCourseId] || [];
    const questions = db.questionsByAssignment[openAssignId] || [];

    const { recording, audioUrl, start, stop, reset } = useAudioRecorder();
    const stt = useWebSpeechSTT({ lang: 'en-US', interim: true });

    const latestSubmissionFor = (questionId) => {
      const all = db.submissionsByQuestion[questionId] || [];
      const mine = all.filter((s) => s.studentId === studentId);
      return mine.length ? mine[mine.length - 1] : null;
    };

    const submit = async (qid) => {
      if (!qid) return;
      const payload = {
        transcript: stt.text || '',
        audioUrl: audioUrl || '',
        tsISO: new Date().toISOString(),
        studentEmail: user?.email || '',
      };
      await submitAnswer(qid, studentId, payload);
      stt.reset();
      reset();
      alert('Answer submitted!');
    };

    return (
      <Block>
        <h2>My Courses</h2>

        <Card>
          <h3>Courses</h3>
          {myCourses.length === 0 && <Small>No courses yet</Small>}
          {myCourses.map((c) => (
            <div key={c.id} style={{ marginBottom: 8 }}>
              <Row>
                <b>{c.title}</b>
                <span style={{ opacity: 0.7 }}>code: {c.code}</span>
                <button onClick={() => setOpenCourseId(c.id)}>
                  {openCourseId === c.id ? 'Opened' : 'Open'}
                </button>
              </Row>
            </div>
          ))}
        </Card>

        {openCourseId && (
          <Card>
            <h3>Assignments</h3>
            <ul>
              {assignments.map((a) => (
                <li key={a.id} style={{ marginTop: 6 }}>
                  <Row>
                    <span><b>{a.title}</b> · Due: {a.dueISO || '—'}</span>
                    <button onClick={() => setOpenAssignId(a.id)}>
                      {openAssignId === a.id ? 'Opened' : 'Open'}
                    </button>
                  </Row>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {openAssignId && (
          <Card>
            <h3>Questions</h3>
            {questions.length === 0 && <Small>No questions yet</Small>}
            <ol>
              {questions.map((q, i) => {
                const last = latestSubmissionFor(q.id);
                const gradeLine = last ? renderGrade(last) : 'Not graded';

                return (
                  <li key={q.id} style={{ marginBottom: 14 }}>
                    <div>Q{i + 1}: {q.text}</div>

                    <Row style={{ marginTop: 6 }}>
                      <button onClick={() => speak(q.text)}>▶ Listen</button>
                      {!recording ? (
                        <button onClick={start}>● Record</button>
                      ) : (
                        <button onClick={stop}>■ Stop</button>
                      )}
                      {stt.supported ? (
                        !stt.listening ? (
                          <button onClick={stt.start}>🎤 Live Transcribe</button>
                        ) : (
                          <button onClick={stt.stop}>■ Stop STT</button>
                        )
                      ) : (
                        <Small>Live transcription not supported</Small>
                      )}
                    </Row>

                    {audioUrl && (
                      <div style={{ marginTop: 6 }}>
                        <audio controls src={audioUrl} />
                        <div><button onClick={reset}>Reset recording</button></div>
                      </div>
                    )}

                    <div style={{ marginTop: 6 }}>
                      <textarea
                        placeholder="Transcript (auto; typing disabled)"
                        value={stt.text}
                        readOnly
                        rows={3}
                        style={{
                          width: '100%',
                          background: '#0f1012',
                          color: '#eaeaea',
                          border: '1px solid #2a2c33',
                          borderRadius: 8,
                          padding: 8,
                        }}
                      />
                    </div>

                    <div style={{ marginTop: 6 }}>
                      <button onClick={() => submit(q.id)}>Submit answer</button>
                    </div>

                    <Small style={{ marginTop: 6 }}>
                      <b>Grade:</b> {gradeLine}
                    </Small>
                  </li>
                );
              })}
            </ol>
          </Card>
        )}
      </Block>
    );
  }

  /* ----------------------- Styled components -------------------- */
  const Section = styled.section`
    width: 100%;
    min-height: 100vh;
    display: flex;
    justify-content: center;
    background: #101114;
    color: #eaeaea;
  `;
  const Container = styled.div`
    width: min(960px, 100%);
    padding: 24px;
  `;
  const Header = styled.h1`
    font-size: 20px;
    margin-bottom: 12px;
    font-weight: 600;
  `;
  const Block = styled.div`
    margin-top: 16px;
  `;
  const Card = styled.div`
    background: #17181c;
    border: 1px solid #2a2c33;
    border-radius: 12px;
    padding: 14px;
    margin-top: 10px;
  `;
  const Row = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  `;
  const Small = styled.div`
    font-size: 12px;
    opacity: 0.8;
    margin-top: 6px;
  `;

  /* ------------------------- Top-level render ------------------- */
  if (authLoading || !ready) {
    return <div style={{ padding: 24 }}>Loading…</div>;
  }

  return (
    <Section>
      <Container>
        <Header>Dashboard</Header>

        {/* User bar */}
        <Card>
          <Row>
            {user ? (
              <>
                <Small>Signed in as <b>{user.email || user.uid}</b></Small>
                <button onClick={() => signOut(auth)}>Sign out</button>
              </>
            ) : (
              <>
                <Small>Not signed in.</Small>
                <button onClick={() => router.push('/signinout')}>
                  Go to Sign In / Up
                </button>
              </>
            )}
          </Row>
        </Card>

        {/* Voice picker */}
        <Card>
          <Row>
            <button onClick={() => setShowVoicePicker((s) => !s)}>
              🎙 Choose TTS Voice
            </button>
            {selectedVoiceRef.current ? (
              <Small>
                Current: {selectedVoiceRef.current.name} ({selectedVoiceRef.current.lang})
              </Small>
            ) : (
              <Small>Current: Browser default</Small>
            )}
          </Row>

          {showVoicePicker && (
            <div style={{ marginTop: 8 }}>
              <Row>
                <select
                  value={selectedVoiceName}
                  onChange={(e) => setSelectedVoiceName(e.target.value)}
                >
                  <option value="">(Best English fallback)</option>
                  {voicesEn.map((v) => {
                    const star = /neural|wavenet|natural|studio|premium|siri/i.test(v.name) ? '⭐ ' : '';
                    return (
                      <option key={v.name + v.lang} value={v.name}>
                        {star}{v.name} ({v.lang})
                      </option>
                    );
                  })}
                </select>

                <button
                  onClick={() => {
                    const chosen = voices.find((v) => v.name === selectedVoiceName) || null;
                    selectedVoiceRef.current = chosen;
                    if (chosen) localStorage.setItem('tts_voice_name', chosen.name);
                    else localStorage.removeItem('tts_voice_name');
                  }}
                >
                  Save
                </button>

                <button
                  onClick={() => {
                    const chosen = voices.find((v) => v.name === selectedVoiceName) || null;
                    const phrase = chosen ? `Hello from ${chosen.name}` : 'Hello from the default voice';
                    const u = new SpeechSynthesisUtterance(phrase);
                    if (chosen) u.voice = chosen;
                    window.speechSynthesis.speak(u);
                  }}
                >
                  Preview
                </button>

                <button
                  onClick={() => {
                    setSelectedVoiceName('');
                    selectedVoiceRef.current = null;
                    localStorage.removeItem('tts_voice_name');
                  }}
                >
                  Clear
                </button>
              </Row>
            </div>
          )}
        </Card>

        {/* Action chooser */}
        <Card>
          <Row>
            <button onClick={() => setView('create')} disabled={!user}>Create a Course</button>
            <button onClick={() => setView('join')} disabled={!user}>Join a Course</button>
            <button onClick={() => setView('my')} disabled={!user}>My Courses</button>
          </Row>
          {view === 'home' && <Small style={{ marginTop: 8 }}>Choose an action above to get started.</Small>}
          {!user && <Small style={{ marginTop: 8 }}>Sign in to enable actions.</Small>}
        </Card>

        {/* Views */}
        {view === 'create' && user && <CreateCourseView />}
        {view === 'join' && user && <JoinCourseView />}
        {view === 'my' && user && <MyCoursesView />}

        {/* Back */}
        {view !== 'home' && (
          <Row style={{ marginTop: 16 }}>
            <button onClick={() => setView('home')}>⇦ Back</button>
          </Row>
        )}
      </Container>
    </Section>
  );
}