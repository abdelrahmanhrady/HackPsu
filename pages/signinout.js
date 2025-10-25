'use client';
import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './Firebase';

import {
  signUpWithEmail,
  signInWithEmail,
  checkEmailProviders,
} from './Auth';

export default function SignInOut() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [user, setUser] = useState(null);
  const [loadingAuthState, setLoadingAuthState] = useState(true);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [methods, setMethods] = useState([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setLoadingAuthState(false);
      if (u) {
        console.log('[Auth] signed in:', u.uid, u.email);
      } else {
        console.log('[Auth] signed out');
      }
    });
    return () => unsub();
  }, []);

  async function doSignUp(e) {
    e?.preventDefault();
    setMsg(''); setBusy(true);
    const { user, error } = await signUpWithEmail(email.trim(), password);
    setBusy(false);
    if (error) {
      console.error(error);
      setMsg(readableError(error));
    } else {
      setMsg('✅ Signed up successfully.');
      console.log('[UI] signed up as', user?.email);
    }
  }

  async function doSignIn(e) {
    e?.preventDefault();
    setMsg(''); setBusy(true);
    const { user, error } = await signInWithEmail(email.trim(), password);
    setBusy(false);
    if (error) {
      console.error(error);
      setMsg(readableError(error));
    } else {
      setMsg('✅ Signed in!');
      console.log('[UI] signed in as', user?.email);
    }
  }

  async function doCheckProviders(e) {
    e?.preventDefault();
    setMsg(''); setBusy(true);
    const { methods, error } = await checkEmailProviders(email.trim());
    setBusy(false);
    if (error) {
      console.error(error);
      setMsg(readableError(error));
      setMethods([]);
    } else {
      setMethods(methods);
      setMsg(`Providers for ${email.trim() || '(empty)'}: ${methods.join(', ') || '(none)'}`);
    }
  }

  async function doLogout() {
    setMsg(''); setBusy(true);
    try {
      await signOut(auth);
      setMsg('Signed out.');
    } catch (e) {
      console.error(e);
      setMsg('Failed to sign out.');
    } finally {
      setBusy(false);
    }
  }

  if (loadingAuthState) {
    return <div style={{ padding: 24 }}>Loading auth…</div>;
    }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2>Firebase Email/Password Auth</h2>

        {!user ? (
          <>
            <form onSubmit={(e) => e.preventDefault()} style={styles.form}>
              <label style={styles.label}>
                Email
                <input
                  style={styles.input}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </label>

              <label style={styles.label}>
                Password
                <input
                  style={styles.input}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </label>

              <div style={styles.row}>
                <button onClick={doSignIn} disabled={busy || !email || !password}>
                  Sign In
                </button>
                <button onClick={doSignUp} disabled={busy || !email || !password}>
                  Sign Up
                </button>
                <button onClick={doCheckProviders} disabled={busy || !email}>
                  Check Providers
                </button>
              </div>
            </form>

            {methods.length > 0 && (
              <div style={styles.helper}>
                Known providers: {methods.join(', ')}
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <b>Signed in as:</b> {user.email || '(no email)'} <br />
              <small>UID: {user.uid}</small>
            </div>
            <div style={styles.row}>
              <button onClick={doLogout} disabled={busy}>Log out</button>
            </div>
          </>
        )}

        {msg && <div style={styles.message}>{msg}</div>}
      </div>
    </div>
  );
}

/* ---------- tiny helper to prettify Firebase error codes ---------- */
function readableError(error) {
  const code = (error && error.code) || '';
  switch (code) {
    case 'auth/invalid-email':
      return 'Invalid email address.';
    case 'auth/email-already-in-use':
      return 'Email is already in use.';
    case 'auth/weak-password':
      return 'Password is too weak.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Incorrect email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts — try again later.';
    default:
      return code ? `Error: ${code}` : 'Something went wrong.';
  }
}

/* ---------- inline styles (simple & neutral) ---------- */
const styles = {
  page: { minHeight: '100vh', padding: 24, display: 'flex', justifyContent: 'center', background: '#101114', color: '#eaeaea' },
  card: { width: 420, maxWidth: '100%', background: '#17181c', border: '1px solid #2a2c33', borderRadius: 12, padding: 18 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 },
  input: { background: '#0f1012', color: '#eaeaea', border: '1px solid #2a2c33', borderRadius: 8, padding: '10px 12px' },
  row: { display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' },
  helper: { fontSize: 12, opacity: 0.85, marginTop: 6 },
  message: { marginTop: 12, fontSize: 14, opacity: 0.95 },
};