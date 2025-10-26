// backend/Database.js
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  updateDoc,
  where,
} from 'firebase/firestore';
import { database } from './Firebase';

/**
 * React hook that keeps a denormalized, real-time view of your classroom data,
 * and gives you helpers to write to Firestore.
 */
export function useFirestoreDb(userId = 'anon') {
  const [ready, setReady] = useState(false);

  const [courses, setCourses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [submissions, setSubmissions] = useState([]);

  const firstLoadDone = useRef(false);

  useEffect(() => {
    const unsubs = [];

    unsubs.push(
      onSnapshot(
        query(collection(database, 'courses'), orderBy('createdAt', 'desc')),
        (snap) => setCourses(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      )
    );

    unsubs.push(
      onSnapshot(collection(database, 'assignments'), (snap) =>
        setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      )
    );

    unsubs.push(
      onSnapshot(collection(database, 'questions'), (snap) =>
        setQuestions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      )
    );

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

  const assignmentsByCourse = useMemo(() => {
    const m = {};
    for (const a of assignments) (m[a.courseId] ||= []).push(a);
    return m;
  }, [assignments]);

  const questionsByAssignment = useMemo(() => {
    const m = {};
    for (const q of questions) (m[q.assignmentId] ||= []).push(q);
    return m;
  }, [questions]);

  const studentEnrollments = useMemo(() => {
    const m = {};
    for (const e of enrollments) (m[e.studentId] ||= []).push(e.courseId);
    return m;
  }, [enrollments]);

  const submissionsByAssignment = useMemo(() => {
    const m = {};
    for (const s of submissions) (m[s.assignmentId] ||= []).push(s);
    return m;
  }, [submissions]);

  const submissionsByQuestion = useMemo(() => {
    const m = {};
    for (const s of submissions) (m[s.questionId] ||= []).push(s);
    return m;
  }, [submissions]);

  function randomCode() {
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
      grade: { status: 'pending' },
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

  async function requestAiGrade(submissionId) {
    const sSnap = await getDoc(doc(database, 'submissions', submissionId));
    if (!sSnap.exists()) throw new Error('Submission not found');
    const s = { id: sSnap.id, ...sSnap.data() };

    const qSnap = await getDoc(doc(database, 'questions', s.questionId));
    if (!qSnap.exists()) throw new Error('Question not found');
    const q = { id: qSnap.id, ...qSnap.data() };

    try {
      const resp = await fetch('/api/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q.text || '',
          expectedAnswer: q.answer || '',
          studentAnswer: s.transcript || '',
        }),
      });
      const data = await resp.json();

      await updateDoc(doc(database, 'submissions', submissionId), {
        aiSuggested: {
          score: data?.score ?? null,
          rationale: data?.rationale || '',
          model: data?.model || 'gemini',
          at: serverTimestamp(),
        },
        grade: { ...(s.grade || {}), status: 'ai_suggested' },
      });
    } catch {
      await updateDoc(doc(database, 'submissions', submissionId), {
        grade: { ...(s.grade || {}), status: 'ai_suggested' },
      });
    }
  }

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

// Export default as well so either import style works.
export default useFirestoreDb;