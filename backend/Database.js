// backend/Database.js
import { useEffect, useMemo, useRef, useState } from 'react';
import { database } from './Firebase';

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

/**
 * React hook that keeps a denormalized, real-time view of classroom data,
 * and provides helpers to write to Firestore.
 *
 * @param {string} userId - current auth uid (e.g. user?.uid). Use 'anon' for unauth.
 */
export function useFirestoreDb(userId = 'anon') {
  // --------------------- local state ---------------------
  const [ready, setReady] = useState(false);

  const [courses, setCourses] = useState([]); // [{id, title, code, ownerId, createdAt}]
  const [assignments, setAssignments] = useState([]); // [{id, courseId, title, dueISO}]
  const [questions, setQuestions] = useState([]); // [{id, assignmentId, text, answer}]
  const [enrollments, setEnrollments] = useState([]); // [{id, studentId, courseId}]
  const [submissions, setSubmissions] = useState([]); // [{id, questionId, assignmentId, courseId, studentId, ...}]

  const firstLoadDone = useRef(false);

  // --------------------- live listeners ---------------------
  useEffect(() => {
    const unsubs = [];

    // Courses
    unsubs.push(
      onSnapshot(
        query(collection(database, 'courses'), orderBy('createdAt', 'desc')),
        (snap) => setCourses(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      )
    );

    // Assignments
    unsubs.push(
      onSnapshot(collection(database, 'assignments'), (snap) => {
        setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      })
    );

    // Questions
    unsubs.push(
      onSnapshot(collection(database, 'questions'), (snap) => {
        setQuestions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      })
    );

    // Enrollments (current user only)
    if (userId) {
      unsubs.push(
        onSnapshot(
          query(
            collection(database, 'enrollments'),
            where('studentId', '==', userId)
          ),
          (snap) => setEnrollments(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        )
      );
    }

    // Submissions (all) — if this grows very large, add filtering or pagination
    unsubs.push(
      onSnapshot(
        query(collection(database, 'submissions'), orderBy('tsISO', 'asc')),
        (snap) => setSubmissions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      )
    );

    if (!firstLoadDone.current) {
      firstLoadDone.current = true;
      setReady(true);
    }

    return () => unsubs.forEach((u) => u && u());
  }, [userId]);

  // --------------------- derived maps ---------------------
  const assignmentsByCourse = useMemo(() => {
    const m = {};
    for (const a of assignments) {
      (m[a.courseId] ||= []).push(a);
    }
    return m;
  }, [assignments]);

  const questionsByAssignment = useMemo(() => {
    const m = {};
    for (const q of questions) {
      (m[q.assignmentId] ||= []).push(q);
    }
    return m;
  }, [questions]);

  const studentEnrollments = useMemo(() => {
    const m = {};
    for (const e of enrollments) {
      (m[e.studentId] ||= []).push(e.courseId);
    }
    return m;
  }, [enrollments]);

  const submissionsByAssignment = useMemo(() => {
    const m = {};
    for (const s of submissions) {
      (m[s.assignmentId] ||= []).push(s);
    }
    return m;
  }, [submissions]);

  const submissionsByQuestion = useMemo(() => {
    const m = {};
    for (const s of submissions) {
      (m[s.questionId] ||= []).push(s);
    }
    return m;
  }, [submissions]);

  // --------------------- helpers ---------------------
  function randomCode() {
    // 6-digit zero-padded
    return String((Math.random() * 1e6) | 0).padStart(6, '0');
  }

  async function generateUniqueCourseCode() {
    for (let i = 0; i < 8; i++) {
      const code = randomCode();
      const qs = await getDocs(
        query(collection(database, 'courses'), where('code', '==', code), limit(1))
      );
      if (qs.empty) return code;
    }
    throw new Error('Failed to generate unique course code; try again.');
  }

  // --------------------- CRUD exposed to UI ---------------------
  async function addCourse(title) {
    const code = await generateUniqueCourseCode();
    const ref = await addDoc(collection(database, 'courses'), {
      title,
      code,
      ownerId: userId || 'unknown',
      createdAt: serverTimestamp(),
    });
    return { id: ref.id, code };
  }

  async function addAssignment(courseId, title, dueISO) {
    const ref = await addDoc(collection(database, 'assignments'), {
      courseId,
      title,
      dueISO,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }

  async function addQuestion(assignmentId, text, answer) {
    const ref = await addDoc(collection(database, 'questions'), {
      assignmentId,
      text,
      answer: answer || '',
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }

  async function updateQuestion(_assignmentId, questionId, data) {
    await updateDoc(doc(database, 'questions', questionId), {
      ...(data.text != null ? { text: data.text } : {}),
      ...(data.answer != null ? { answer: data.answer } : {}),
      updatedAt: serverTimestamp(),
    });
  }

  async function joinCourseByCode(studentId, code) {
    const cs = await getDocs(
      query(collection(database, 'courses'), where('code', '==', code), limit(1))
    );
    if (cs.empty) return { ok: false, error: 'No course found for that code' };
    const course = { id: cs.docs[0].id, ...cs.docs[0].data() };

    // Check if already enrolled
    const existing = await getDocs(
      query(
        collection(database, 'enrollments'),
        where('studentId', '==', studentId),
        where('courseId', '==', course.id),
        limit(1)
      )
    );
    if (!existing.empty) return { ok: true, already: true, course };

    await addDoc(collection(database, 'enrollments'), {
      studentId,
      courseId: course.id,
      createdAt: serverTimestamp(),
    });
    return { ok: true, course };
  }

  async function submitAnswer(questionId, studentId, payload) {
    // find assignmentId and courseId
    const qSnap = await getDoc(doc(database, 'questions', questionId));
    if (!qSnap.exists()) throw new Error('Question not found');
    const assignmentId = qSnap.data().assignmentId;

    const aSnap = await getDoc(doc(database, 'assignments', assignmentId));
    if (!aSnap.exists()) throw new Error('Assignment not found');
    const courseId = aSnap.data().courseId;

    await addDoc(collection(database, 'submissions'), {
      questionId,
      assignmentId,
      courseId,
      studentId,
      studentEmail: payload.studentEmail || '',
      transcript: payload.transcript || '',
      audioUrl: payload.audioUrl || '',
      tsISO: payload.tsISO || new Date().toISOString(),
      grade: { status: 'pending' }, // teacher must commit an official grade
      createdAt: serverTimestamp(),
    });
  }

  function getSubmissionsForAssignment(assignmentId) {
    return submissionsByAssignment[assignmentId] || [];
  }

  async function gradeSubmission(submissionId, { score, feedback }) {
    const num = Number(score);
    await updateDoc(doc(database, 'submissions', submissionId), {
      grade: {
        status: 'graded',
        score: Number.isFinite(num) ? num : 0,
        feedback: feedback || '',
        gradedBy: userId || 'unknown',
        gradedAt: serverTimestamp(),
      },
    });
  }

  /**
   * Ask Gemini for a *suggested* score/feedback.
   * Writes to:
   *   grade: { status: 'ai_suggested', suggestedScore, suggestedFeedback, suggestedModel }
   * Teacher still clicks "Save Grade" to commit the official grade.
   */
  async function requestAiGrade(submissionId, ctx = {}) {
    const subRef = doc(database, 'submissions', submissionId);

    // flag UI as pending
    await updateDoc(subRef, { grade: { status: 'ai_pending' } });

    try {
      // Load submission
      const sSnap = await getDoc(subRef);
      if (!sSnap.exists()) throw new Error('Submission not found');
      const sub = sSnap.data() || {};

      // We allow caller to pass question text/answer to avoid extra reads
      let { questionText, expectedAnswer } = ctx;
      if (!questionText || !expectedAnswer) {
        const qSnap = await getDoc(doc(database, 'questions', sub.questionId));
        if (!qSnap.exists()) throw new Error('Question not found');
        const q = qSnap.data() || {};
        questionText = questionText || q.text || '';
        expectedAnswer = expectedAnswer || q.answer || '';
      }

      const studentAnswer = sub.transcript || '';

      // Use public key for demo; move to server route for production
      const apiKey =
        process.env.NEXT_PUBLIC_GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;
      if (!apiKey) throw new Error('Missing GOOGLE_API_KEY');

      const body = {
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `
You are grading a short answer. Return STRICT JSON only.

Question: ${questionText}
Expected (teacher) answer: ${expectedAnswer}
Student answer (transcribed): ${studentAnswer}

Return JSON exactly like:
{"score": <integer 0-100>, "feedback": "<one short sentence>"}
`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      };

      const endpoint =
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

      const res = await fetch(`${endpoint}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      const text =
        json?.candidates?.[0]?.content?.parts?.[0]?.text ||
        json?.output_text ||
        '';

      let suggestedScore = null;
      let suggestedFeedback = '';

      try {
        const parsed = JSON.parse(text);
        suggestedScore = Math.max(
          0,
          Math.min(100, Math.round(Number(parsed.score)))
        );
        suggestedFeedback = String(parsed.feedback || '');
      } catch {
        suggestedFeedback =
          'AI could not parse a suggestion. Please grade manually.';
      }

      if (suggestedScore != null) {
        await updateDoc(subRef, {
          grade: {
            status: 'ai_suggested',
            suggestedScore,
            suggestedFeedback,
            suggestedModel: 'gemini-2.0-flash',
          },
        });
        return { ok: true, suggestedScore, suggestedFeedback };
      } else {
        await updateDoc(subRef, {
          grade: { status: 'ai_error', error: 'PARSE_ERROR' },
        });
        return { ok: false, error: 'PARSE_ERROR' };
      }
    } catch (e) {
      await updateDoc(subRef, {
        grade: { status: 'ai_error', error: String(e?.message || e) },
      });
      return { ok: false, error: e };
    }
  }

  // --------------------- public API ---------------------
  const db = {
    courses,
    assignmentsByCourse,
    questionsByAssignment,
    studentEnrollments,
    submissionsByAssignment,
    submissionsByQuestion,
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
    getSubmissionsForAssignment,
    gradeSubmission,
    requestAiGrade,
  };
}