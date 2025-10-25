'use client';
import React, { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";

/* =========================
   Styled primitives (outside components)
========================= */
const Section = styled.section`
  width: 100%;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  background: #101114;
  color: #eaeaea;
`;
const Container = styled.div`width: min(960px, 100%); padding: 24px;`;
const Header = styled.h1`font-size: 20px; margin-bottom: 12px; font-weight: 600;`;
const Block = styled.div`margin-top: 16px;`;
const Card = styled.div`
  background: #17181c; border: 1px solid #2a2c33; border-radius: 12px; padding: 14px; margin-top: 10px;
`;
const Row = styled.div`display: flex; align-items: center; gap: 12px; flex-wrap: wrap;`;
const Small = styled.div`font-size: 12px; opacity: 0.8; margin-top: 6px;`;
const TextArea = styled.textarea`
  width: 100%; min-height: 80px; background:#0f1012; color:#eaeaea;
  border:1px solid #2a2c33; border-radius: 8px; padding:10px; resize: vertical;
`;

/* =========================
   Default export wrapper
========================= */
export default function Dashboard() {
  return <DashboardImpl />;
}

/* =========================================================
   Dashboard with live STT (Vosk if available, WebSpeech fallback)
========================================================= */
function DashboardImpl() {
  // id + local "DB"
  const newId = () => Math.random().toString(36).slice(2, 10);
  const DB_KEY = "demo_classroom_db_v1";
  const USER_KEY = "demo_user_v1";

  const emptyDb = {
    courses: [], // [{ id, title, code, ownerId }]
    assignmentsByCourse: {}, // { [courseId]: [{ id, title, dueISO }] }
    questionsByAssignment: {}, // { [assignmentId]: [{ id, text, answer }] }
    studentEnrollments: {}, // { [studentId]: [courseId, ...] }
    submissions: {}, // { [questionId]: { [studentId]: { transcript, audioUrl, tsISO } } }
  };

  /* ---------------- TTS picker (English voices) ---------------- */
  const [voices, setVoices] = useState([]);
  const [voicesEn, setVoicesEn] = useState([]);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [selectedVoiceName, setSelectedVoiceName] = useState("");
  const selectedVoiceRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const score = (v) => {
      const n = (v.name || "").toLowerCase();
      let s = 0;
      if (/neural|wavenet|natural|studio|premium|siri/.test(n)) s += 3;
      if (/google|microsoft/.test(n)) s += 2;
      if ((v.lang || "").toLowerCase().startsWith("en")) s += 1;
      return s;
    };

    const refresh = () => {
      const all = window.speechSynthesis.getVoices() || [];
      setVoices(all);
      const enOnly = all
        .filter(v => (v.lang || "").toLowerCase().startsWith("en"))
        .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
      setVoicesEn(enOnly);
      const saved = localStorage.getItem("tts_voice_name") || "";
      const match = saved && enOnly.find(v => v.name === saved);
      if (match) { selectedVoiceRef.current = match; setSelectedVoiceName(saved); }
    };

    refresh();
    window.speechSynthesis.onvoiceschanged = refresh;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  function speak(text) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const utter = new SpeechSynthesisUtterance(text);
    if (selectedVoiceRef.current) utter.voice = selectedVoiceRef.current;
    else if (voicesEn[0]) utter.voice = voicesEn[0];
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }

  /* ---------------- local DB with permissions & submissions ---------------- */
  function useLocalDb() {
    const [db, setDb] = useState(emptyDb);
    const [ready, setReady] = useState(false);

    useEffect(() => {
      if (typeof window === "undefined") return;
      const raw = localStorage.getItem(DB_KEY);
      setDb(raw ? JSON.parse(raw) : emptyDb);
      setReady(true);
    }, []);

    const save = (next) => {
      setDb(next);
      if (typeof window !== "undefined") localStorage.setItem(DB_KEY, JSON.stringify(next));
    };

    const getCourseById = (courseId) => db.courses.find(c => c.id === courseId) || null;
    const getCourseIdByAssignment = (assignmentId) => {
      for (const cid of Object.keys(db.assignmentsByCourse)) {
        const list = db.assignmentsByCourse[cid] || [];
        if (list.some(a => a.id === assignmentId)) return cid;
      }
      return null;
    };

    const addCourse = (title, ownerId) => {
      const id = newId();
      const code = ((Math.random() * 1e6) | 0).toString().padStart(6, "0");
      const next = {
        ...db,
        courses: [...db.courses, { id, title, code, ownerId }],
        assignmentsByCourse: { ...db.assignmentsByCourse, [id]: [] },
      };
      save(next);
      return { id, code };
    };

    const addAssignment = (courseId, title, dueISO, userId) => {
      const course = getCourseById(courseId);
      if (!course) return { ok: false, error: "Course not found" };
      if (course.ownerId !== userId) return { ok: false, error: "Only owner can add assignments" };

      const id = newId();
      const next = {
        ...db,
        assignmentsByCourse: {
          ...db.assignmentsByCourse,
          [courseId]: [...(db.assignmentsByCourse[courseId] || []), { id, title, dueISO }],
        },
        questionsByAssignment: { ...db.questionsByAssignment, [id]: [] },
      };
      save(next);
      return { ok: true, id };
    };

    const addQuestion = (assignmentId, text, answer, userId) => {
      const courseId = getCourseIdByAssignment(assignmentId);
      const course = courseId && getCourseById(courseId);
      if (!course) return { ok: false, error: "Assignment not found" };
      if (course.ownerId !== userId) return { ok: false, error: "Only owner can add questions" };

      const id = newId();
      const next = {
        ...db,
        questionsByAssignment: {
          ...db.questionsByAssignment,
          [assignmentId]: [...(db.questionsByAssignment[assignmentId] || []), { id, text, answer }],
        },
      };
      save(next);
      return { ok: true, id };
    };

    const updateQuestion = (assignmentId, qid, updates, userId) => {
      const courseId = getCourseIdByAssignment(assignmentId);
      const course = courseId && getCourseById(courseId);
      if (!course) return { ok: false, error: "Assignment not found" };
      if (course.ownerId !== userId) return { ok: false, error: "Only owner can edit questions" };

      const list = db.questionsByAssignment[assignmentId] || [];
      const idx = list.findIndex(q => q.id === qid);
      if (idx === -1) return { ok: false, error: "Question not found" };
      const nextList = [...list];
      nextList[idx] = { ...nextList[idx], ...updates };
      const next = { ...db, questionsByAssignment: { ...db.questionsByAssignment, [assignmentId]: nextList } };
      save(next);
      return { ok: true };
    };

    const joinCourseByCode = (studentId, code) => {
      const course = db.courses.find((c) => c.code === code);
      if (!course) return { ok: false, error: "No course found for that code" };
      const existing = db.studentEnrollments[studentId] || [];
      if (existing.includes(course.id)) return { ok: true, already: true, course };
      const next = {
        ...db,
        studentEnrollments: {
          ...db.studentEnrollments,
          [studentId]: [...existing, course.id],
        },
      };
      save(next);
      return { ok: true, course };
    };

    // Store a submission for questionId by studentId
    const submitAnswer = (questionId, studentId, payload /* { transcript, audioUrl, tsISO } */) => {
      const next = {
        ...db,
        submissions: {
          ...db.submissions,
          [questionId]: {
            ...(db.submissions[questionId] || {}),
            [studentId]: payload,
          },
        },
      };
      save(next);
      return { ok: true };
    };

    return {
      ready,
      db,
      addCourse,
      addAssignment,
      addQuestion,
      updateQuestion,
      joinCourseByCode,
      submitAnswer,
    };
  }

  /* ---------------- Audio recorder (MediaRecorder) ---------------- */
  function useAudioRecorder() {
    const [recording, setRecording] = useState(false);
    const [audioUrl, setAudioUrl] = useState("");
    const mediaRef = useRef(null);
    const chunksRef = useRef([]);

    const start = async () => {
      if (recording) return;
      if (!navigator?.mediaDevices) { alert("MediaRecorder not supported"); return; }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
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
      setAudioUrl("");
    };
    return { recording, audioUrl, start, stop, reset };
  }

  /* ---------------- Speech-to-Text (Vosk if available; fallback to Web Speech) ---------------- */
  function useSpeechToText() {
    const [engine, setEngine] = useState("none"); // "vosk" | "webspeech" | "none"
    const [ready, setReady] = useState(false);
    const [listening, setListening] = useState(false);
    const [finalText, setFinalText] = useState("");
    const [partialText, setPartialText] = useState("");
    const [error, setError] = useState(null);

    // Vosk bits
    const voskRef = useRef({ model: null, recognizer: null, audioCtx: null, source: null, processor: null });

    // Web Speech bits
    const webRecRef = useRef(null);

    useEffect(() => {
      let cancelled = false;

      const tryInitVosk = async () => {
        try {
          // Dynamically import vosk-browser if installed
          const m = await import(/* webpackIgnore: true */ 'vosk-browser').catch(() => null);
          if (!m) throw new Error("vosk-browser not installed");

          // Model path must exist under public/
          const modelPath = "/models/vosk-model-small-en-us-0.15";
          const model = new m.Model(modelPath);
          await model.init(); // loads worker + model files

          if (cancelled) return;
          voskRef.current.model = model;
          setEngine("vosk");
          setReady(true);
          console.log("[STT] Vosk ready");
          return true;
        } catch (e) {
          console.warn("[STT] Vosk unavailable →", e?.message || e);
          return false;
        }
      };

      const fallbackWebSpeech = () => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SR) {
          setEngine("webspeech");
          setReady(true);
          console.log("[STT] Web Speech API ready");
        } else {
          setEngine("none");
          setReady(false);
          console.warn("[STT] No STT engine available in this browser");
        }
      };

      (async () => {
        if (typeof window === "undefined") return;
        const ok = await tryInitVosk();
        if (!ok) fallbackWebSpeech();
      })();

      return () => { cancelled = true; };
    }, []);

    const clear = () => { setFinalText(""); setPartialText(""); };

    const start = async () => {
      setError(null);
      clear();

      if (engine === "vosk") {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const source = audioCtx.createMediaStreamSource(stream);

          // m.Model#recognizer might differ depending on version; this is the common API.
          const rec = await voskRef.current.model.recognizer({ sampleRate: audioCtx.sampleRate });

          // Simple ScriptProcessor (for compatibility; AudioWorklet is nicer if available)
          const processor = audioCtx.createScriptProcessor(4096, 1, 1);
          processor.onaudioprocess = (e) => {
            const input = e.inputBuffer.getChannelData(0);
            // Feed PCM float32 to Vosk
            const res = rec.acceptWaveform(input);
            if (res) {
              const { text } = rec.result(); // final chunk
              setFinalText((prev) => (prev ? prev + " " : "") + text);
              setPartialText("");
            } else {
              const { partial } = rec.partialResult();
              setPartialText(partial || "");
            }
          };

          source.connect(processor);
          processor.connect(audioCtx.destination);

          voskRef.current = { ...voskRef.current, recognizer: rec, audioCtx, source, processor };

          setListening(true);
        } catch (e) {
          console.warn("[STT] Vosk start error:", e);
          setError(e);
        }
        return;
      }

      if (engine === "webspeech") {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { setError("Web Speech not supported"); return; }
        const rec = new SR();
        rec.lang = "en-US";
        rec.continuous = true;
        rec.interimResults = true;

        rec.onresult = (event) => {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const r = event.results[i];
            const str = (r[0] && r[0].transcript) ? r[0].transcript.trim() : "";
            if (!str) continue;
            if (r.isFinal) {
              setFinalText((prev) => (prev ? prev + " " : "") + str);
              setPartialText("");
            } else {
              setPartialText(str);
            }
          }
        };
        rec.onerror = (e) => { setError(e.error || "speech error"); };
        rec.onend = () => { setListening(false); };
        webRecRef.current = rec;
        rec.start();
        setListening(true);
        return;
      }
    };

    const stop = () => {
      if (engine === "vosk") {
        try {
          const { recognizer, audioCtx, source, processor } = voskRef.current;
          if (recognizer) {
            const res = recognizer.finalResult();
            if (res?.text) setFinalText((prev) => (prev ? prev + " " : "") + res.text);
            recognizer.free && recognizer.free();
            voskRef.current.recognizer = null;
          }
          if (processor) { processor.disconnect(); voskRef.current.processor = null; }
          if (source?.mediaStream) { source.mediaStream.getTracks().forEach(t => t.stop()); }
          if (audioCtx) { audioCtx.close(); voskRef.current.audioCtx = null; }
        } catch (e) { /* noop */ }
        setListening(false);
        return;
      }

      if (engine === "webspeech" && webRecRef.current) {
        try { webRecRef.current.stop(); } catch {}
        setListening(false);
        return;
      }
    };

    const text = (finalText + (partialText ? " " + partialText : "")).trim();

    return { engine, ready, listening, text, finalText, partialText, start, stop, clear, error };
  }

  /* ---------------- Panels ---------------- */
  function CreatorPanel({ user, db, addCourse, addAssignment, addQuestion, updateQuestion }) {
    const [title, setTitle] = useState("");
    const [openCourseId, setOpenCourseId] = useState("");
    const [assignForm, setAssignForm] = useState({ title: "", dueISO: "" });
    const [openAssignId, setOpenAssignId] = useState("");
    const [qForm, setQForm] = useState({ text: "", answer: "" });
    const [editing, setEditing] = useState(null);

    const myCourses = useMemo(
      () => db.courses.filter(c => c.ownerId === user.id),
      [db.courses, user.id]
    );
    const selectedAssignments = useMemo(
      () => db.assignmentsByCourse[openCourseId] || [],
      [db.assignmentsByCourse, openCourseId]
    );
    const selectedQuestions = useMemo(
      () => db.questionsByAssignment[openAssignId] || [],
      [db.questionsByAssignment, openAssignId]
    );

    const onAddCourse = () => {
      if (!title.trim()) return;
      const { id } = addCourse(title.trim(), user.id);
      setOpenCourseId(id);
      setTitle("");
    };
    const tryAddAssignment = () => {
      if (!assignForm.title || !assignForm.dueISO) return;
      const res = addAssignment(openCourseId, assignForm.title, assignForm.dueISO, user.id);
      if (!res.ok) { alert(res.error); return; }
      setOpenAssignId(res.id);
      setAssignForm({ title: "", dueISO: "" });
    };
    const tryAddQuestion = () => {
      if (!qForm.text) return;
      const res = addQuestion(openAssignId, qForm.text, qForm.answer || "", user.id);
      if (!res.ok) { alert(res.error); return; }
      setQForm({ text: "", answer: "" });
    };

    const startEdit = (q) => setEditing({ qid: q.id, text: q.text, answer: q.answer || "" });
    const saveEdit = () => {
      const r = updateQuestion(openAssignId, editing.qid, { text: editing.text, answer: editing.answer }, user.id);
      if (!r.ok) alert(r.error);
      setEditing(null);
    };

    return (
      <Block>
        <h2>Create a Course</h2>

        <Card>
          <h3>New Course</h3>
          <Row>
            <input placeholder="Course title" value={title} onChange={(e)=>setTitle(e.target.value)} />
            <button onClick={onAddCourse}>Create Course</button>
          </Row>
        </Card>

        <Card>
          <h3>My Created Courses</h3>
          {myCourses.length === 0 && <Small>No courses yet</Small>}
          {myCourses.map((c) => (
            <div key={c.id} style={{ marginBottom: 8 }}>
              <Row>
                <b>{c.title}</b><span style={{opacity:.7}}>code: {c.code}</span>
                <button onClick={()=>{ setOpenCourseId(c.id); setOpenAssignId(""); setEditing(null); }}>
                  {openCourseId===c.id ? "Opened" : "Open"}
                </button>
              </Row>
            </div>
          ))}
        </Card>

        {openCourseId && (
          <Card>
            <h3>Assignments</h3>
            <Row>
              <input placeholder="Assignment title" value={assignForm.title}
                     onChange={e=>setAssignForm(s=>({...s, title:e.target.value}))}/>
              <input type="datetime-local" value={assignForm.dueISO}
                     onChange={e=>setAssignForm(s=>({...s, dueISO:e.target.value}))}/>
              <button onClick={tryAddAssignment}>Add Assignment</button>
            </Row>
            <ul>
              {selectedAssignments.map(a=>(
                <li key={a.id} style={{ marginTop: 6 }}>
                  <Row>
                    <span><b>{a.title}</b> · Due: {a.dueISO||"—"}</span>
                    <button onClick={()=>{ setOpenAssignId(a.id); setEditing(null); }}>
                      {openAssignId===a.id ? "Opened" : "Open"}
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
              <input placeholder="Question text" value={qForm.text}
                     onChange={e=>setQForm(s=>({...s, text:e.target.value}))}/>
              <input placeholder="Answer (teacher key)" value={qForm.answer}
                     onChange={e=>setQForm(s=>({...s, answer:e.target.value}))}/>
              <button onClick={tryAddQuestion}>Add Question</button>
            </Row>

            <ol style={{ marginTop: 8 }}>
              {selectedQuestions.map((q, i) => {
                const isEditing = editing?.qid === q.id;
                return (
                  <li key={q.id} style={{ marginBottom: 10 }}>
                    {!isEditing ? (
                      <>
                        <div>Q{i+1}: {q.text}{q.answer ? <Small> · Answer: <b>{q.answer}</b></Small> : null}</div>
                        <Row><button onClick={()=>startEdit(q)}>✎ Edit</button></Row>
                      </>
                    ) : (
                      <>
                        <div>Editing Q{i+1}</div>
                        <Row>
                          <input value={editing.text} onChange={e=>setEditing(s=>({...s, text:e.target.value}))} />
                          <input value={editing.answer} onChange={e=>setEditing(s=>({...s, answer:e.target.value}))} />
                          <button onClick={saveEdit}>Save</button>
                          <button onClick={()=>setEditing(null)}>Cancel</button>
                        </Row>
                      </>
                    )}
                  </li>
                );
              })}
            </ol>
          </Card>
        )}
      </Block>
    );
  }

  function JoinOnlyPanel({ user, joinCourseByCode }) {
    const [code, setCode] = useState(""); const [msg, setMsg] = useState("");
    const doJoin = () => {
      const trimmed = code.trim(); if (!trimmed) return;
      const res = joinCourseByCode(user.id, trimmed);
      setMsg(!res.ok ? (res.error || "Error") : (res.already ? `Already joined: ${res.course.title}` : `Joined: ${res.course.title}`));
      setCode("");
    };
    return (
      <Block>
        <h2>Join a Course</h2>
        <Card>
          <Row>
            <input placeholder="6-digit course code" value={code} onChange={e=>setCode(e.target.value)} />
            <button onClick={doJoin}>Join</button>
          </Row>
          {msg && <Small>{msg}</Small>}
        </Card>
      </Block>
    );
  }

  // ---- My Courses panel WITH live STT + Submit Answer ----
  function MyCoursesPanel({ user, db, submitAnswer }) {
    const studentId = user.id;
    const [openCourseId, setOpenCourseId] = useState("");
    const [openAssignId, setOpenAssignId] = useState("");
    const enrolledIds = db.studentEnrollments[studentId] || [];
    const myCourses = db.courses.filter(c => enrolledIds.includes(c.id));
    const assignments = db.assignmentsByCourse[openCourseId] || [];
    const questions = db.questionsByAssignment[openAssignId] || [];

    const { recording, audioUrl, start: startRec, stop: stopRec, reset: resetRec } = useAudioRecorder();
    const stt = useSpeechToText(); // {engine, ready, listening, text, start, stop, clear}

    const startBoth = async () => {
      await startRec();
      await stt.start();
    };
    const stopBoth = () => {
      stopRec();
      stt.stop();
    };
    const resetBoth = () => {
      resetRec();
      stt.clear();
    };

    const onSubmit = (qid) => {
      const payload = {
        transcript: stt.text,
        audioUrl: audioUrl || "",
        tsISO: new Date().toISOString(),
      };
      submitAnswer(qid, studentId, payload);
      alert("Answer submitted!");
      resetBoth();
    };

    return (
      <Block>
        <h2>My Courses</h2>

        <Card>
          <h3>Enrolled Courses</h3>
          {myCourses.length === 0 && <Small>No enrollments yet. Use “Join a Course”.</Small>}
          {myCourses.map(c=>(
            <div key={c.id} style={{marginBottom:8}}>
              <Row>
                <b>{c.title}</b>
                <button onClick={()=>{ setOpenCourseId(c.id); setOpenAssignId(""); }}>
                  {openCourseId===c.id?"Opened":"Open"}
                </button>
              </Row>
            </div>
          ))}
        </Card>

        {openCourseId && (
          <Card>
            <h3>Assignments</h3>
            <ul>
              {assignments.map(a=>(
                <li key={a.id} style={{marginTop:6}}>
                  <Row>
                    <span><b>{a.title}</b> · Due: {a.dueISO||"—"}</span>
                    <button onClick={()=>setOpenAssignId(a.id)}>{openAssignId===a.id?"Opened":"Open"}</button>
                  </Row>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {openAssignId && (
          <Card>
            <h3>Questions</h3>
            {questions.length===0 && <Small>No questions yet</Small>}
            <ol>
              {questions.map((q,i)=> {
                const submission = db.submissions?.[q.id]?.[studentId] || null;
                return (
                  <li key={q.id} style={{marginBottom:16}}>
                    <div>Q{i+1}: {q.text}</div>
                    <Row style={{ marginTop: 6 }}>
                      <button onClick={()=>speak(q.text)}>▶ Listen (TTS)</button>

                      {!recording && !stt.listening ? (
                        <button onClick={startBoth}>● Record & Transcribe</button>
                      ) : (
                        <button onClick={stopBoth}>■ Stop</button>
                      )}

                      <button onClick={resetBoth} disabled={recording || stt.listening}>Reset</button>
                    </Row>

                    {/* Live transcript box */}
                    <div style={{ marginTop: 8 }}>
                      <Small>
                        STT engine: {stt.engine}{!stt.ready ? " (loading…)" : ""}{stt.error ? ` — ${stt.error}` : ""}
                      </Small>
                      <TextArea
                        value={stt.text}
                        onChange={(e)=>{/* allow user to correct text */}}
                        placeholder="Your spoken answer will appear here in real time…"
                      />
                    </div>

                    {/* Audio preview */}
                    {audioUrl && (
                      <div style={{ marginTop: 6 }}>
                        <audio controls src={audioUrl} />
                      </div>
                    )}

                    <Row style={{ marginTop: 6 }}>
                      <button
                        onClick={()=>onSubmit(q.id)}
                        disabled={(recording || stt.listening) || (!stt.text && !audioUrl)}
                      >
                        Submit Answer
                      </button>
                    </Row>

                    {/* Previously submitted */}
                    {submission && (
                      <Small style={{ marginTop: 6 }}>
                        Last submitted: {new Date(submission.tsISO).toLocaleString()}
                        {submission.transcript ? <> — “{submission.transcript.slice(0,120)}{submission.transcript.length>120?'…':''}”</> : null}
                      </Small>
                    )}
                  </li>
                );
              })}
            </ol>
            <Small>
              Vosk is used if available (offline). If not found, this falls back to the browser Web Speech API.
            </Small>
          </Card>
        )}
      </Block>
    );
  }

  /* ---------------- Top-level state & routing ---------------- */
  const {
    ready, db,
    addCourse, addAssignment, addQuestion, updateQuestion,
    joinCourseByCode, submitAnswer
  } = useLocalDb();

  const [user, setUser] = useState(null);      // { id, name }
  const [loginName, setLoginName] = useState("");
  const [mode, setMode] = useState("");        // "", "menu", "create", "join", "mycourses"

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(USER_KEY);
    try {
      const u = raw && JSON.parse(raw);
      if (u?.id && u?.name) { setUser(u); setMode("menu"); }
    } catch {}
  }, []);
  const doLogin = () => {
    const name = loginName.trim(); if (!name) return;
    const u = { id: "user_" + newId(), name };
    setUser(u); setMode("menu"); localStorage.setItem(USER_KEY, JSON.stringify(u));
    setLoginName("");
  };
  const doLogout = () => { setUser(null); setMode(""); localStorage.removeItem(USER_KEY); };
  if (!ready) return <div style={{ padding: 24 }}>Loading…</div>;

  /* ---------------- Render ---------------- */
  return (
    <Section>
      <Container>
        <Header>Dashboard (Test Harness)</Header>

        {/* TTS voice picker */}
        <Card>
          <Row>
            <button onClick={()=>setShowVoicePicker(s=>!s)}>🎙 Choose TTS Voice</button>
            {selectedVoiceRef.current
              ? <Small>Current: {selectedVoiceRef.current.name} ({selectedVoiceRef.current.lang})</Small>
              : <Small>Current: Best English fallback / Default</Small>}
          </Row>
          {showVoicePicker && (
            <div style={{ marginTop: 8 }}>
              <Row>
                <select value={selectedVoiceName} onChange={e=>setSelectedVoiceName(e.target.value)}>
                  <option value="">(Best English fallback)</option>
                  {voicesEn.map(v=>{
                    const star = /neural|wavenet|natural|studio|premium|siri/i.test(v.name) ? "⭐ " : "";
                    return <option key={v.name+v.lang} value={v.name}>{star}{v.name} ({v.lang})</option>;
                  })}
                </select>
                <button onClick={()=>{
                  const chosen = voicesEn.find(v=>v.name===selectedVoiceName) || voices.find(v=>v.name===selectedVoiceName) || null;
                  selectedVoiceRef.current = chosen;
                  if (chosen) localStorage.setItem("tts_voice_name", chosen.name);
                  else localStorage.removeItem("tts_voice_name");
                }}>Save</button>
                <button onClick={()=>{
                  const chosen = voicesEn.find(v=>v.name===selectedVoiceName) || voices.find(v=>v.name===selectedVoiceName) || null;
                  const u = new SpeechSynthesisUtterance(chosen ? `Hello from ${chosen.name}` : "Hello from the default voice");
                  if (chosen) u.voice = chosen; window.speechSynthesis.speak(u);
                }}>Preview</button>
                <button onClick={()=>{ setSelectedVoiceName(""); selectedVoiceRef.current=null; localStorage.removeItem("tts_voice_name"); }}>
                  Clear
                </button>
              </Row>
            </div>
          )}
        </Card>

        {/* Login */}
        {!user && (
          <Card>
            <h3>Login</h3>
            <Row>
              <input placeholder="Enter your name" value={loginName} onChange={e=>setLoginName(e.target.value)} />
              <button onClick={doLogin}>Login</button>
            </Row>
            <Small>Local test login only (stored in localStorage).</Small>
          </Card>
        )}

        {/* Menu */}
        {user && mode === "menu" && (
          <Card>
            <h3>Welcome, {user.name}</h3>
            <Row>
              <button onClick={()=>setMode("join")}>Join a Course</button>
              <button onClick={()=>setMode("mycourses")}>My Courses</button>
              <button onClick={()=>setMode("create")}>Create a Course</button>
              <button onClick={doLogout}>Log out</button>
            </Row>
          </Card>
        )}

        {/* Flows */}
        {user && mode === "create" && (
          <>
            <CreatorPanel
              user={user} db={db}
              addCourse={addCourse} addAssignment={addAssignment}
              addQuestion={addQuestion} updateQuestion={updateQuestion}
            />
            <Row style={{ marginTop: 16 }}>
              <button onClick={()=>setMode("menu")}>⇦ Back to menu</button>
              <button onClick={doLogout}>Log out</button>
            </Row>
          </>
        )}

        {user && mode === "join" && (
          <>
            <JoinOnlyPanel user={user} joinCourseByCode={joinCourseByCode} />
            <Row style={{ marginTop: 16 }}>
              <button onClick={()=>setMode("menu")}>⇦ Back to menu</button>
              <button onClick={()=>setMode("mycourses")}>Go to My Courses →</button>
              <button onClick={doLogout}>Log out</button>
            </Row>
          </>
        )}

        {user && mode === "mycourses" && (
          <>
            <MyCoursesPanel user={user} db={db} submitAnswer={submitAnswer} />
            <Row style={{ marginTop: 16 }}>
              <button onClick={()=>setMode("menu")}>⇦ Back to menu</button>
              <button onClick={doLogout}>Log out</button>
            </Row>
          </>
        )}
      </Container>
    </Section>
  );
}