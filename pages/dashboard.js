"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import styled, { createGlobalStyle, keyframes } from "styled-components";
import { useRouter } from "next/router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { FaUserCircle } from "react-icons/fa";
import Image from "next/image";
import { FaArrowRight, FaMicrophone, FaPlay, FaRobot, FaStop } from "react-icons/fa";

import { auth } from "../backend/Firebase";
import { useFirestoreDb } from "../backend/Database";
const GlobalStyle = createGlobalStyle`
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@700&display=swap');
    * {
      font-family: 'Montserrat', sans-serif;
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      scrollbar-width: none; /* Firefox */
      -ms-overflow-style: none; /* IE 10+ */
    }
    *::-webkit-scrollbar {
      display: none; /* Chrome, Safari, Edge */
    }
    html, body {
      overflow-x: hidden;
    }
    body {
      font-family: 'Montserrat', sans-serif;
    }
  `;
/* --------------- helper to render a grade or suggestion --------------- */
function renderGrade(submission) {
  const g = submission?.grade || {};
  const ai = submission?.aiSuggested || null;

  const suggestedScore =
    g.suggestedScore != null ? g.suggestedScore : ai?.score;
  const suggestedFeedback =
    g.suggestedFeedback != null ? g.suggestedFeedback : ai?.rationale;

  if (g.status === "graded") {
    return `Score ${g.score ?? 0}${g.feedback ? ` — ${g.feedback}` : ""}`;
  }
  if (g.status === "ai_pending") return "Generating AI suggestion…";
  if (
    (g.status === "ai_suggested" || g.status === "pending") &&
    suggestedScore != null
  ) {
    return `Suggested ${suggestedScore}${
      suggestedFeedback ? ` — ${suggestedFeedback}` : ""
    }`;
  }
  return "Not graded";
}

export default function Dashboard() {
  const router = useRouter();

  /* ------------------------- Auth state ------------------------- */
  const [user, setUser] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [showAssignmentsModal, setShowAssignmentsModal] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [courseTitle, setCourseTitle] = useState("");
  const [lastCode, setLastCode] = useState("");
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showSection, setShowSection] = useState(false);

  // Dashboard top-level
  const doAddCourse = async (title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const { id, code } = await addCourse(trimmed);
    setCourseTitle("");
    setLastCode(code);
    setShowCreateModal(false);
  };
useEffect(() => {
  const unsub = onAuthStateChanged(auth, (u) => {
    if (!u) {
      router.push("/LogIn"); // redirect if not logged in
    } else {
      setUser(u);
    }
    setAuthLoading(false);
  });
  return () => unsub();
}, [router]);

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
  } = useFirestoreDb(user?.uid || "anon");

  /* ------------------------ Simple router ----------------------- */
  const [view, setView] = useState("my"); // 'home' | 'create' | 'join' | 'my'

  /* ------------------------- TTS (voices) ----------------------- */
  const selectedVoiceRef = useRef(null);
  const [voices, setVoices] = useState([]);
  const [voicesEn, setVoicesEn] = useState([]);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [selectedVoiceName, setSelectedVoiceName] = useState("");

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
        .filter((v) => (v.lang || "").toLowerCase().startsWith("en"))
        .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
      setVoicesEn(enOnly);

      const saved = localStorage.getItem("tts_voice_name") || "";
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

  const speakQuestion = (question) => {
    if (!question) return;
    const utter = new SpeechSynthesisUtterance(question.text);
    window.speechSynthesis.speak(utter);
  };

  // Start speech recognition when FaMicrophone is clicked
  const startListening = (setTranscript, recognitionRef) => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window))
      return;
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join("");
      setTranscript(text);
    };
    recognition.start();
    recognitionRef.current = recognition;
  };

  // Stop speech recognition
  const stopListening = (recognitionRef) => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  };
  /* -------------------------- My Courses ------------------------ */
  function MyCoursesView({ onJoin, onOpenAssignments }) {
    const studentId = user?.uid || "anon";
    const enrolledIds = db.studentEnrollments[studentId] || [];
    const myCourses = db.courses.filter(
      (c) => enrolledIds.includes(c.id) || c.ownerId === studentId
    );

    return (
      <div
        style={{
          columnWidth: "220px",
          columnGap: "12px",
        }}
      >
        {/* Join Course Card */}
        <div
          onClick={onJoin}
          style={{
            width: "200px",
            breakInside: "avoid",
            marginBottom: "20px",
            border: "2px dashed #2a2c33",
            borderRadius: "8px",
            padding: "12px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            cursor: "pointer",
            fontSize: "2rem",
            color: "#05AADB",
            fontWeight: "700",
          }}
        >
          +
        </div>

        {myCourses.map((c) => (
          <div
            key={c.id}
            onClick={() => onOpenAssignments(c)}
            style={{
              width: "200px",
              breakInside: "avoid",
              marginBottom: "20px",
              border: "1px solid #2a2c33",
              borderRadius: "8px",
              padding: "12px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              <div style={{ fontSize: "1.4rem", fontWeight: "700" }}>
                {c.title}
              </div>
              <div style={{ fontSize: "0.8rem", opacity: 0.7 }}>
                Code: {c.code}
              </div>
            </div>
            <FaArrowRight size={18} style={{ opacity: 0.8 }} />
          </div>
        ))}
      </div>
    );
  }

  const ModalTextArea = styled.textarea`
  flex: 1;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid #ccc;
  font-size: 1rem;
  outline: none;
  background: #f8f9fa;
  color: #041a32;
  min-height: 120px;
  resize: vertical;

  &:focus {
    border-color: #05aadb;
    box-shadow: 0 0 8px rgba(5, 170, 219, 0.4);
  }
`;


  const ModalInput = styled.input`
    flex: 1;
    padding: 10px 14px;
    border-radius: 8px;
    border: 1px solid #ccc;
    font-size: 1rem;
    transition: all 0.2s ease;
    outline: none;
    background: #f8f9fa;
    color: #041a32;

    &:focus {
      border-color: #05aadb;
      box-shadow: 0 0 8px rgba(5, 170, 219, 0.4);
    }
  `;
  const ProfileContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    position: relative;
    cursor: pointer;
  `;

  const Dropdown = styled.div`
    position: absolute;
    top: 40px;
    right: 0;
    background: #17181c;
    border: 1px solid #2a2c33;
    border-radius: 6px;
    padding: 8px;
    min-width: 100px;
    z-index: 20;
  `;
  const Navbar = styled.nav`
    position: fixed;
    top: 0;
    width: 100%;
    height: 80px;
    background-color: #001f3f;
    color: white;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 35px;
    font-size: 1.6rem;
    font-weight: bold;
    z-index: 10;
  `;

  const LogoContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
  `;

  const NavLinks = styled.ul`
    list-style: none;
    display: flex;
    gap: 40px;
    justify-content: center;
    flex: 1;
  `;

  const NavLink = styled.a`
    color: white;
    text-decoration: none;
    position: relative;
    font-size: 1.2rem;

    &::after {
      content: "";
      position: absolute;
      left: 50%;
      bottom: -4px;
      width: 0%;
      height: 2px;
      background: linear-gradient(to right, #05aadb, #0a7fd5);
      transition: all 0.3s ease;
      transform: translateX(-50%);
    }

    &:hover::after {
      width: 100%;
    }

    &.active::after {
      width: 100%;
    }
  `;

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

  function UserProfile({ user }) {
  const [open, setOpen] = useState(false);

  return (
    <ProfileContainer onClick={() => setOpen((o) => !o)}>
      <FaUserCircle size={30} />
      <span style={{ fontSize: "1rem" }}>{user?.email}</span>

      {open && (
        <Dropdown>
          <button
            style={{
              width: "100%",
              padding: "8px 12px",
              background: "#0A7FD5",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: 600,
              transition: "background 0.2s ease",
            }}
            onClick={() => signOut(auth)}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#05AADB")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#0A7FD5")}
          >
            Sign Out
          </button>
        </Dropdown>
      )}
    </ProfileContainer>
  );
}

  const ModalOverlay = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: radial-gradient(circle, #10325c 0%, #041a32 70%);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 50;
  `;

  const ModalCard = styled.div`
    width: 420px;
    max-width: 90%;
    background: linear-gradient(270deg, #70c1f5, #a6e0ff, #70c1f5);
    background-size: 200% 100%;
    animation: gradientAnim 5s ease infinite;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
    text-align: center;
  `;

  const ModalText = styled.p`
    color: #041a32;
    font-weight: 700;
    margin-bottom: 16px;
  `;

  const ModalButton = styled.button`
    background: #05aadb;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    font-weight: bold;
    cursor: pointer;
    transition: background 0.3s ease;

    &:hover {
      background: #0a7fd5;
    }
  `;

  const gradientAnim = keyframes`
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  `;
  function LoginPromptModal() {
    const router = useRouter();

    return (
      <ModalOverlay>
        <ModalCard>
          <ModalText>You aren't Logged In!</ModalText>
          <ModalButton onClick={() => router.push("/LogIn")}>
            Go to Log In
          </ModalButton>
        </ModalCard>
      </ModalOverlay>
    );
  }
  const CreateCourseModal = React.memo(function ({
    open,
    onClose,
    doAddCourse,
    user,
  }) {
    const [localTitle, setLocalTitle] = useState("");

    if (!open) return null;

    const handleCreate = async () => {
      if (!localTitle.trim()) return;
      await doAddCourse(localTitle.trim());
      setLocalTitle("");
      onClose();
    };

    return (
      <>
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            zIndex: 999,
          }}
        />
        <ModalCard
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 1000,
          }}
        >
          <Row style={{ justifyContent: "center", marginTop: 12 }}>
            <ModalInput
              placeholder="Course title"
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
            />
            <ModalButton
              style={{ background: "#05AADB", color: "#fff" }}
              onClick={handleCreate}
              disabled={!user}
            >
              Create
            </ModalButton>
          </Row>

          <Row style={{ justifyContent: "center", marginTop: 20 }}>
            <ModalButton
              style={{ background: "#ccc", color: "#041A32" }}
              onClick={onClose}
            >
              Cancel
            </ModalButton>
          </Row>
        </ModalCard>
      </>
    );
  });
  function renderGrade(submission) {
    const g = submission?.grade || {};
    const ai = submission?.aiSuggested || null;

    const suggestedScore =
      g.suggestedScore != null ? g.suggestedScore : ai?.score;
    const suggestedFeedback =
      g.suggestedFeedback != null ? g.suggestedFeedback : ai?.rationale;

    if (g.status === "graded") {
      return `Score ${g.score ?? 0}${g.feedback ? ` — ${g.feedback}` : ""}`;
    }
    if (g.status === "ai_pending") return "Generating AI suggestion…";
    if (
      (g.status === "ai_suggested" || g.status === "pending") &&
      suggestedScore != null
    ) {
      return `Suggested ${suggestedScore}${
        suggestedFeedback ? ` — ${suggestedFeedback}` : ""
      }`;
    }
    return "Not graded";
  }

  // ---------------- JoinCourseModal ----------------
  const JoinCourseModal = React.memo(function ({
    open,
    onClose,
    joinCourseByCode,
    user,
  }) {
    const [code, setCode] = useState("");
    const [msg, setMsg] = useState("");

    if (!open) return null;

    const handleJoin = async () => {
      const val = code.trim();
      if (!val) return;
      const res = await joinCourseByCode(user?.uid || "anon", val);
      if (!res.ok) setMsg(res.error || "Error");
      else setMsg(`Joined: ${res.course.title}`);
      setCode("");
    };

    return (
      <>
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            zIndex: 999,
          }}
        />
        <ModalCard
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 1000,
          }}
        >
          <Row style={{ justifyContent: "center", marginTop: 12 }}>
            <ModalInput
              placeholder="Enter 6-digit course code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <ModalButton
              style={{ background: "#05AADB", color: "#fff" }}
              onClick={handleJoin}
              disabled={!user}
            >
              Join
            </ModalButton>
          </Row>

          {msg && <Small style={{ marginTop: 12 }}>{msg}</Small>}

          <Row style={{ justifyContent: "center", marginTop: 20 }}>
            <ModalButton
              style={{ background: "#ccc", color: "#041A32" }}
              onClick={onClose}
            >
              Cancel
            </ModalButton>
          </Row>
        </ModalCard>
      </>
    );
  });
  const Body = styled.div`
    padding-top: 100px; /* leave space for fixed navbar */
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    position: relative;
    background: linear-gradient(to right, #70c1f5, #a6e0ff, #70c1f5);
    padding-left: 20px;
    padding-right: 20px;
    overflow-x: hidden;
  `;
  // ✅ Updated CreatedCourseQuestionsModal to call SubmissionsSidebar
 const CreatedCourseQuestionsModal = React.memo(function ({
  open,
  onClose,
  assignmentId,
  db,
  addQuestion,
  user,
  showAddButton = true,
  view = "create", // default to 'create' for Created Courses
  getSubmissionsForAssignment,
  gradeSubmission,
  requestAiGrade,
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [qForm, setQForm] = useState({ text: "", answer: "" });
  const [showSolveBar, setShowSolveBar] = useState(false);
  const [showSubmissions, setShowSubmissions] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [submissions, setSubmissions] = useState([]);

  if (!open || !assignmentId) return null;
  const questions = db.questionsByAssignment[assignmentId] || [];

  const handleAddQuestion = async () => {
    if (!qForm.text.trim()) return;
    await addQuestion(assignmentId, qForm.text.trim(), qForm.answer || "");
    setQForm({ text: "", answer: "" });
    setShowAddForm(false);
  };

  const openSubmissions = async (question) => {
    setActiveQuestion(question);
    try {
      const subs = await getSubmissionsForAssignment(question.assignmentId);
      setSubmissions(subs);
      setShowSubmissions(true);
    } catch (err) {
      console.error("Error fetching submissions:", err);
    }
  };

  return (
    <>
      {/* Background Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          backgroundColor: "rgba(0,0,0,0.6)",
          zIndex: 1001,
        }}
      />

      {/* Main Modal */}
      <ModalCard
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 1002,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <h3 style={{ textAlign: "left", marginBottom: 12 }}>Questions</h3>

        {showAddButton && view !== "my" && (
          <div
            style={{
              border: "1px dashed #2a2c33",
              padding: 10,
              marginBottom: 12,
              cursor: "pointer",
              fontWeight: 700,
              color: "#05AADB",
              borderRadius: 6,
              textAlign: "center",
            }}
            onClick={() => setShowAddForm(true)}
          >
            + Add New Question
          </div>
        )}

        {showAddForm && (
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 12,
              flexWrap: "wrap",
            }}
          >
            <input
              style={{
                flex: 1,
                padding: 8,
                borderRadius: 6,
                border: "1px solid #ccc",
                minWidth: 120,
              }}
              placeholder="Question"
              value={qForm.text}
              onChange={(e) =>
                setQForm((s) => ({ ...s, text: e.target.value }))
              }
            />
            <input
              style={{
                flex: 1,
                padding: 8,
                borderRadius: 6,
                border: "1px solid #ccc",
                minWidth: 120,
              }}
              placeholder="Answer"
              value={qForm.answer}
              onChange={(e) =>
                setQForm((s) => ({ ...s, answer: e.target.value }))
              }
            />
            <button
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                background: "#05AADB",
                color: "#fff",
                whiteSpace: "nowrap",
              }}
              onClick={handleAddQuestion}
              disabled={!user}
            >
              Add
            </button>
          </div>
        )}

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
          className="hide-scrollbar"
        >
          {questions.map((q, index) => {
            const submission = db.submissionsByAssignment?.[q.assignmentId]?.find(
              (s) => s.userId === user?.id && s.questionId === q.id
            );
            const score = submission?.grade?.score ?? "-";

            return (
              <div
                key={q.id}
                style={{
                  border: "1px solid #041A32",
                  borderRadius: 8,
                  padding: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  textAlign: "left",
                }}
              >
                <div style={{ fontWeight: 700, wordBreak: "break-word" }}>
                  {view === "my"
                    ? `Question ${index + 1}`
                    : `Q${index + 1}: ${q.text}`}
                </div>

<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
  {view === "my" && <span style={{ fontWeight: 600 }}>{score}%</span>}
  <button
    style={{
      padding: "4px 8px",
      borderRadius: 6,
      background: "#05AADB",
      color: "#fff",
      fontSize: "0.8rem",
    }}
    onClick={() => {
      if (view === "my") {
        setActiveQuestion(q);
        setShowSolveBar(true);
      } else {
        openSubmissions(q);
      }
    }}
  >
    {view === "my" ? "Solve" : "Submissions"}
  </button>
</div>

              </div>
            );
          })}
        </div>

        <Row style={{ justifyContent: "center", marginTop: 16 }}>
          <ModalButton onClick={onClose}>Close</ModalButton>
        </Row>
      </ModalCard>

      {/* Solve Sidebar */}
      <SolveSidebar
        open={showSolveBar}
        onClose={() => setShowSolveBar(false)}
        question={activeQuestion}
        grade="?%"
        index={questions.findIndex((q) => q.id === activeQuestion?.id)}
        user={user}
        submitAnswer={submitAnswer}
        db={db}
      />

      {/* Submissions Sidebar */}
      <SubmissionsSidebar
        open={showSubmissions}
        onClose={() => setShowSubmissions(false)}
        question={activeQuestion}
        submissions={submissions}
        gradeSubmission={gradeSubmission}
        requestAiGrade={requestAiGrade}
      />
    </>
  );
});


  // ✅ GradeModal saving directly to Firestore
  const GradeModal = React.memo(function ({
  open,
  onClose,
  submission,
  gradeSubmission,
  prefill, // { score: number|string, feedback: string } | undefined
}) {
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');

  // When the modal opens (or the target submission changes), seed inputs.
  useEffect(() => {
    if (!open) return;
    setScore(
      prefill && prefill.score !== undefined && prefill.score !== null
        ? String(prefill.score)
        : ''
    );
    setFeedback(prefill?.feedback ?? '');
  }, [open, submission?.id, prefill?.score, prefill?.feedback]);

  if (!open || !submission) return null;

  const handleGrade = async () => {
    const numericScore = Number(score);
    if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 100) {
      alert('Score must be a number between 0 and 100');
      return;
    }
    await gradeSubmission(submission.id, { score: numericScore, feedback });
    alert('Grade submitted successfully!');
    onClose();
  };

  return (
    <ModalOverlay onClick={onClose} style={{ zIndex: 2000 }}>
      <ModalCard onClick={(e) => e.stopPropagation()} style={{ zIndex: 2001 }}>
        <h3 style={{ marginBottom: 12 }}>Grade Submission</h3>

        <div style={{ marginBottom: 16, textAlign: 'left' }}>
          <div style={{ fontWeight: 600 }}>Student Answer:</div>
          <div style={{ fontSize: '0.9rem', marginTop: 6, wordBreak: 'break-word' }}>
            {submission.transcript || submission.text || 'No answer provided'}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ModalInput
            placeholder="Score (0-100)"
            value={score}
            onChange={(e) => setScore(e.target.value)}
            type="number"
          />
          <ModalTextArea
            placeholder="Feedback"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={5}
          />
        </div>

        <Row style={{ justifyContent: 'center', marginTop: 20 }}>
          <ModalButton onClick={handleGrade}>Submit Grade</ModalButton>
          <ModalButton style={{ background: '#ccc', color: '#041A32' }} onClick={onClose}>
            Cancel
          </ModalButton>
        </Row>
      </ModalCard>
    </ModalOverlay>
  );
});

  // ✅ Updated SubmissionsSidebar to use GradeModal, hi
  const SubmissionsSidebar = React.memo(function ({
  open,
  onClose,
  question,               // has .text and .answer
  submissions = [],
  gradeSubmission,
  requestAiGrade,         // kept if you still need it elsewhere
}) {
  const [gradingSubmission, setGradingSubmission] = useState(null);
  const [prefill, setPrefill] = useState(null); // {score, feedback} or null
  const [suggestingId, setSuggestingId] = useState(null);

  if (!open || !question) return null;

  const openBlankGrade = (sub) => {
    setPrefill(null);               // <- blank fields
    setGradingSubmission(sub);
  };

  const openWithAiSuggestion = async (sub) => {
    setSuggestingId(sub.id);
    try {
      // Call your existing API route directly to get a suggestion immediately
      const resp = await fetch('/api/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question?.text || '',
          expectedAnswer: question?.answer || '',
          studentAnswer: sub?.transcript || '',
        }),
      });

      const data = await resp.json();
      // Prefill the modal with AI suggestion
      setPrefill({
        score: data?.score ?? '',
        feedback: data?.rationale ?? '',
      });

      // Optionally also persist the suggestion in Firestore in the background:
      // await requestAiGrade(sub.id);

      setGradingSubmission(sub);
    } catch (e) {
      console.error(e);
      alert('AI suggestion failed. Try again.');
    } finally {
      setSuggestingId(null);
    }
  };

  return (
    <>
      <div
        style={{
          position: 'fixed',
          left: 0,
          bottom: 0,
          width: '100%',
          height: '65vh',
          background: '#041A32',
          color: '#fff',
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px',
          boxShadow: '0 -4px 15px rgba(0,0,0,0.4)',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.4s ease',
          zIndex: 1100,
          display: 'flex',
          flexDirection: 'column',
          padding: '20px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '1.2rem',
            fontWeight: 700,
          }}
        >
          {/* nicer header that shows the actual question */}
          <div>Submissions for: {question?.text || question?.id}</div>
          <button
            style={{ background: 'transparent', border: 'none', color: '#bbb', cursor: 'pointer' }}
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            marginTop: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {submissions.length === 0 && <div>No submissions yet</div>}

          {submissions.map((sub) => (
            <div
              key={sub.id}
              style={{
                border: '1px solid #2a2c33',
                borderRadius: 8,
                padding: 10,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{sub.studentEmail}</div>
                <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>{sub.transcript}</div>
                <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                  {sub.grade?.status || 'Not graded'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={{
                    background: '#05AADB',
                    border: 'none',
                    color: '#fff',
                    borderRadius: 6,
                    padding: '4px 8px',
                    cursor: 'pointer',
                  }}
                  onClick={() => openBlankGrade(sub)}
                >
                  Grade
                </button>

                <button
                  style={{
                    background: '#0A7FD5',
                    border: 'none',
                    color: '#fff',
                    borderRadius: 6,
                    padding: '4px 8px',
                    cursor: 'pointer',
                    opacity: suggestingId === sub.id ? 0.7 : 1,
                  }}
                  disabled={suggestingId === sub.id}
                  onClick={() => openWithAiSuggestion(sub)}
                >
                  {suggestingId === sub.id ? 'Suggesting…' : 'AI Suggest'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Grade Modal (blank or prefilled) */}
      <GradeModal
        open={!!gradingSubmission}
        onClose={() => {
          setGradingSubmission(null);
          setPrefill(null);
        }}
        submission={gradingSubmission}
        gradeSubmission={gradeSubmission}
        prefill={prefill}        // <-- the magic line
      />
    </>
  );
});
  // ✅ FIXED CreatedCourseAssignmentsModal
  const CreatedCourseAssignmentsModal = React.memo(function ({
    open,
    onClose,
    course,
    assignments,
    addAssignment,
    addQuestion,
    db,
    user,
    showAddButton = true,
    view = "create",
  }) {
    const [selectedAssignId, setSelectedAssignId] = useState("");
    const [showQuestionsModal, setShowQuestionsModal] = useState(false);
    const [showAddAssignForm, setShowAddAssignForm] = useState(false);
    const [assignForm, setAssignForm] = useState({ title: "", dueISO: "" });

    if (!open) return null;

    const handleAddAssignment = async () => {
      if (!assignForm.title.trim()) return;
      await addAssignment(
        course.id,
        assignForm.title.trim(),
        assignForm.dueISO || ""
      );
      setAssignForm({ title: "", dueISO: "" });
      setShowAddAssignForm(false);
    };

    return (
      <>
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0,0,0,0.6)",
            zIndex: 999,
          }}
        />

        <ModalCard
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 1000,
            maxHeight: "80vh",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <h3 style={{ textAlign: "left", marginBottom: 12 }}>
            {course.title} Assignments
          </h3>

          {showAddButton && (
            <div
              style={{
                border: "1px dashed #2a2c33",
                padding: 10,
                marginBottom: 12,
                cursor: "pointer",
                fontWeight: 700,
                color: "#05AADB",
                borderRadius: 6,
                textAlign: "center",
              }}
              onClick={() => setShowAddAssignForm(true)}
            >
              + Add Assignment
            </div>
          )}

          {showAddAssignForm && (
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 12,
                flexWrap: "wrap",
              }}
            >
              <input
                style={{
                  flex: 1,
                  padding: 8,
                  borderRadius: 6,
                  border: "1px solid #ccc",
                  minWidth: 120,
                }}
                placeholder="Assignment title"
                value={assignForm.title}
                onChange={(e) =>
                  setAssignForm((s) => ({ ...s, title: e.target.value }))
                }
              />
              <input
                style={{
                  flex: 1,
                  padding: 8,
                  borderRadius: 6,
                  border: "1px solid #ccc",
                  minWidth: 120,
                }}
                type="date"
                value={assignForm.dueISO}
                onChange={(e) =>
                  setAssignForm((s) => ({ ...s, dueISO: e.target.value }))
                }
              />
              <button
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  background: "#05AADB",
                  color: "#fff",
                  whiteSpace: "nowrap",
                }}
                onClick={handleAddAssignment}
                disabled={!user}
              >
                Add
              </button>
            </div>
          )}

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginBottom: 12,
            }}
            className="hide-scrollbar"
          >
            {assignments.map((a) => (
              <div
                key={a.id}
                style={{
                  border: "1px solid #041A32",
                  padding: 12,
                  borderRadius: 6,
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  textAlign: "left",
                }}
                onClick={() => {
                  setSelectedAssignId(a.id);
                  setShowQuestionsModal(true);
                }}
              >
                <div
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "calc(100% - 40px)",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{a.title}</div>
                  <div style={{ fontSize: "0.85rem", opacity: 0.7 }}>
                    Due: {a.dueISO || "—"}
                  </div>
                </div>
                <FaArrowRight
                  size={18}
                  style={{ opacity: 0.8, flexShrink: 0 }}
                />
              </div>
            ))}
          </div>

          <Row style={{ justifyContent: "center", marginTop: 0 }}>
            <ModalButton onClick={onClose}>Close</ModalButton>
          </Row>
        </ModalCard>

        {/* ✅ Correct Nested Modal Call */}
        <CreatedCourseQuestionsModal
          open={showQuestionsModal}
          onClose={() => setShowQuestionsModal(false)}
          assignmentId={selectedAssignId}
          db={db}
          addQuestion={addQuestion}
          user={user}
          view={view}
          getSubmissionsForAssignment={(assignmentId) =>
            db.submissionsByAssignment[assignmentId] || []
          }
          gradeSubmission={gradeSubmission}
          requestAiGrade={requestAiGrade}
        />
      </>
    );
  });

  function CreatedCoursesList({ onCreate, onOpenAssignments }) {
    const myId = user?.uid || "anon";
    const createdCourses = useMemo(
      () => db.courses.filter((c) => c.ownerId === myId),
      [db.courses, myId]
    );

    return (
      <div
        style={{
          columnWidth: "220px",
          columnGap: "12px",
        }}
      >
        {/* Add Course Card */}
        <div
          onClick={onCreate}
          style={{
            width: "200px",
            breakInside: "avoid",
            marginBottom: "20px",
            border: "2px dashed #2a2c33",
            borderRadius: "8px",
            padding: "12px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            cursor: "pointer",
            fontSize: "2rem",
            color: "#05AADB",
            fontWeight: "700",
          }}
        >
          +
        </div>

        {createdCourses.map((c) => (
          <div
            key={c.id}
            onClick={() => onOpenAssignments(c)}
            style={{
              width: "200px",
              breakInside: "avoid",
              marginBottom: "20px",
              border: "1px solid #2a2c33",
              borderRadius: "8px",
              padding: "12px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              <div style={{ fontSize: "1.4rem", fontWeight: "700" }}>
                {c.title}
              </div>
              <div style={{ fontSize: "0.8rem", opacity: 0.7 }}>
                Code: {c.code}
              </div>
            </div>
            <FaArrowRight size={18} style={{ opacity: 0.8 }} />
          </div>
        ))}
      </div>
    );
  }
const SolveSidebar = React.memo(function ({
  open,
  onClose,
  question,
  index = 0,
  submitAnswer,
  user,
  db,
}) {
  const [transcript, setTranscript] = useState("");
  const [submission, setSubmission] = useState(null);
  const recognitionRef = useRef(null);
  const [geminiResponse, setGeminiResponse] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const stopRequestedRef = useRef(false);

  useEffect(() => {
    if (!question || !user || !db) return;
    const subs = db.submissionsByAssignment?.[question.assignmentId] || [];
    const mySub = subs.find(
      (s) => s.studentId === user.uid && s.questionId === question.id
    );
    setSubmission(mySub || null);
    setTranscript(mySub?.transcript || "");
  }, [question, user, db]);

  const handleSubmit = async () => {
    if (!question || !user) return;
    const payload = {
      transcript,
      tsISO: new Date().toISOString(),
      studentEmail: user.email,
    };
    await submitAnswer(question.id, user.uid, payload);
    setSubmission({ ...payload, grade: null });
    alert("Answer submitted!");
    setTranscript("");
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setIsRecording(false);
    }
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    stopRequestedRef.current = false;
    onClose();
  };

  const handleMicClick = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setIsRecording(false);
    } else if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.onresult = (event) => {
        const text = Array.from(event.results)
          .map((r) => r[0].transcript)
          .join("");
        setTranscript(text);
      };
      recognition.start();
      recognitionRef.current = recognition;
      setIsRecording(true);
    }
  };

  const handlePlay = () => {
    if (!question) return;
    const utter = new SpeechSynthesisUtterance(question.text);
    window.speechSynthesis.speak(utter);
  };

  const handleRobotClick = async () => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      stopRequestedRef.current = true;
      setIsSpeaking(false);
      return;
    }

    if (!transcript.trim()) {
      window.speechSynthesis.speak(
        new SpeechSynthesisUtterance("You have not answered yet.")
      );
      return;
    }

    try {
      setIsSpeaking(true);
      stopRequestedRef.current = false;

      const response = await fetch("/api/gradeWithGemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentAnswer: transcript,
          correctAnswer: question.answer,
        }),
      });
      const data = await response.json();

      const friendlyPrompt = `
You are a teacher talking to a student and guiding them kindly to the correct answer.
Don't use complex words — talk like a 5-year-old can understand.

Here is the teacher's question:
"${question.text}"

Here is the correct answer the teacher expected:
"${question.answer}"

Here is what the student said:
"${transcript}"

Here is the teacher's feedback from Gemini:
"${data.feedback}"

Now explain nicely in one or two short sentences why their answer was good or how to make it better.
Use examples if possible, but do NOT mention scores or the correct answer.
      `.trim();

      const friendlyRes = await fetch("/api/friendlyFeedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: friendlyPrompt }),
      });
      const friendlyData = await friendlyRes.json();

      if (stopRequestedRef.current) return;

      const responseText =
        friendlyData.simplified ||
        "I think you tried very well! Let's make your answer even better next time!";
      setGeminiResponse(responseText);

      if (stopRequestedRef.current) return;

      const utter = new SpeechSynthesisUtterance(responseText);
      utter.pitch = 1.1;
      utter.rate = 1;
      utter.voice =
        window.speechSynthesis
          .getVoices()
          .find(
            (v) =>
              v.name.toLowerCase().includes("female") ||
              v.name.toLowerCase().includes("child")
          ) || null;

      utter.onend = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utter);
    } catch (e) {
      console.error("❌ Failed to fetch Gemini response:", e);
      setIsSpeaking(false);
      if (!stopRequestedRef.current) {
        window.speechSynthesis.speak(
          new SpeechSynthesisUtterance("Oops! Something went wrong.")
        );
      }
    }
  };

  if (!open || !question) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        bottom: 0,
        width: "100%",
        height: "65vh",
        background: "#041A32",
        color: "#fff",
        borderTopLeftRadius: "16px",
        borderTopRightRadius: "16px",
        boxShadow: "0 -4px 15px rgba(0,0,0,0.4)",
        transform: open ? "translateY(0)" : "translateY(100%)",
        transition: "transform 0.4s ease",
        zIndex: 1100,
        display: "flex",
        flexDirection: "column",
        padding: "10px 20px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontWeight: 600,
        }}
      >
        <div>Feedback</div>
        <button
          style={{
            background: "transparent",
            border: "none",
            color: "#bbb",
            cursor: "pointer",
          }}
          onClick={onClose}
        >
          Close
        </button>
      </div>

      <div
        style={{
          fontSize: "1.6rem",
          fontWeight: 700,
          marginTop: 10,
          marginBottom: 10,
          textAlign: "center",
        }}
      >
        Question {index + 1}
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          alignItems: "center",
          textAlign: "center",
          gap: 12,
        }}
      >
        <button
          onClick={handlePlay}
          style={{
            background: "#05AADB",
            border: "none",
            borderRadius: "50%",
            width: 80,
            height: 80,
            color: "#fff",
            fontSize: "1.8rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <FaPlay />
        </button>
      </div>

      <hr style={{ borderColor: "#2a2c33", margin: "10px 0" }} />

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={handleMicClick}
          style={{
            background: "#05AADB",
            border: "none",
            borderRadius: "50%",
            width: 50,
            height: 50,
            color: "#fff",
            fontSize: "1.6rem",
            cursor: "pointer",
          }}
        >
          {isRecording ? <FaStop /> : <FaMicrophone />}
        </button>

        <button
          onClick={handleRobotClick}
          style={{
            background: "#0AD5A0",
            border: "none",
            borderRadius: "50%",
            width: 50,
            height: 50,
            color: "#fff",
            fontSize: "1.6rem",
            cursor: "pointer",
          }}
        >
          {isSpeaking ? <FaStop /> : <FaRobot />}
        </button>

        <input
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Transcript..."
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 8,
            border: "1px solid #2a2c33",
            background: "transparent",
            color: "#fff",
            fontSize: "1rem",
          }}
        />

        <button
          onClick={handleSubmit}
          style={{
            background: "#05AADB",
            border: "none",
            color: "#fff",
            borderRadius: 8,
            padding: "8px 16px",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Submit
        </button>
      </div>
    </div>
  );
});













  return (
    <>
      <GlobalStyle />

      {!user && <LoginPromptModal />}

      <Navbar>
        <LogoContainer>
          <Image src="/LearnLiveLogo.png" alt="Logo" width={50} height={50} />
        </LogoContainer>

        <NavLinks>
          <NavLinks>
            <li>
              <NavLink
                href="#create"
                className={view === "create" ? "active" : ""}
                onClick={(e) => {
                  e.preventDefault();
                  setView("create");
                }}
              >
                Created Courses
              </NavLink>
            </li>
            <li>
              <NavLink
                href="#my"
                className={view === "my" ? "active" : ""}
                onClick={(e) => {
                  e.preventDefault();
                  setView("my");
                }}
              >
                My Courses
              </NavLink>
            </li>
          </NavLinks>
        </NavLinks>
        <LogoContainer>
          <UserProfile user={user} />
        </LogoContainer>
      </Navbar>
      <Body>
        {view === "create" && (
          <CreatedCoursesList
            onCreate={() => setShowCreateModal(true)}
            onOpenAssignments={(course) => {
              setSelectedCourse(course);
              setShowAssignmentsModal(true);
            }}
          />
        )}

        {view === "my" && (
          <MyCoursesView
            onJoin={() => setShowJoinModal(true)}
            onOpenAssignments={(course) => {
              setSelectedCourse(course);
              setShowAssignmentsModal(true);
            }}
          />
        )}

        {/* Modals */}
        {view === "create" && selectedCourse && (
          <CreatedCourseAssignmentsModal
            open={showAssignmentsModal}
            onClose={() => setShowAssignmentsModal(false)}
            course={selectedCourse}
            assignments={db.assignmentsByCourse[selectedCourse.id] || []}
            addAssignment={addAssignment}
            addQuestion={addQuestion}
            db={db}
            user={user}
            showAddButton={true}
          />
        )}

        {view === "my" && selectedCourse && (
          <CreatedCourseAssignmentsModal
            open={showAssignmentsModal}
            onClose={() => setShowAssignmentsModal(false)}
            course={selectedCourse}
            assignments={db.assignmentsByCourse[selectedCourse.id] || []}
            addAssignment={addAssignment}
            addQuestion={addQuestion}
            db={db}
            user={user}
            showAddButton={false}
            view="my" // ✅ ensures buttons show “Solve” instead of “Submissions”
          />
        )}
      </Body>

      <JoinCourseModal
        open={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        joinCourseByCode={joinCourseByCode}
        user={user}
      />
      <CreateCourseModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        courseTitle={courseTitle}
        setCourseTitle={setCourseTitle}
        doAddCourse={doAddCourse}
        user={user}
      />
    </>
  );
}
