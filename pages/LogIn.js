// login.js
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../backend/Firebase';
import { signInWithEmail } from '../backend/Auth';
import styled, { keyframes, createGlobalStyle } from 'styled-components';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState(null);
  const [loadingAuthState, setLoadingAuthState] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setLoadingAuthState(false);
      if (u) router.replace('/dashboard');
    });
    return () => unsub();
  }, [router]);

  async function doSignIn(e) {
    e?.preventDefault();
    setMsg(''); setBusy(true);
    const { error } = await signInWithEmail(email.trim(), password);
    setBusy(false);
    if (error) setMsg(readableError(error));
  }

  if (loadingAuthState) return <Page>Loading auth…</Page>;

  return (
    <>
      <GlobalStyle />
      <Page>
        <Card>
          <Title>Log In</Title>
          {!user && (
            <>
              <Form onSubmit={(e) => e.preventDefault()}>
                <Label>Email
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
                </Label>
                <Label>Password
                  <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
                </Label>
                <Row>
                  <Button onClick={doSignIn} disabled={busy || !email || !password}>Sign In</Button>
                                <SignupRedirect onClick={() => router.push('/SignUp')}>
                Don't have an Account?
              </SignupRedirect>
                </Row>
              </Form>

            </>
          )}
          {msg && <Message>{msg}</Message>}
        </Card>
      </Page>
    </>
  );
}

function readableError(error) {
  const code = (error && error.code) || '';
  switch (code) {
    case 'auth/invalid-email': return 'Invalid email address.';
    case 'auth/user-not-found':
    case 'auth/wrong-password': return 'Incorrect email or password.';
    case 'auth/too-many-requests': return 'Too many attempts — try again later.';
    default: return code ? `Error: ${code}` : 'Something went wrong.';
  }
}

// Global Styles
const GlobalStyle = createGlobalStyle`
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&display=swap');
  * { font-family: 'Montserrat', sans-serif; margin: 0; padding: 0; box-sizing: border-box; }
  html, body { overflow-x: hidden; }
  body { font-family: 'Montserrat', sans-serif; }
`;

const gradientAnim = keyframes`
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
`;

const Page = styled.div`
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24px;
  background: radial-gradient(circle, #10325c 0%, #041A32 70%);
`;

const Card = styled.div`
  width: 420px;
  max-width: 100%;
  background: linear-gradient(270deg, #70c1f5, #a6e0ff, #70c1f5);
  background-size: 200% 100%;
  animation: ${gradientAnim} 5s ease infinite;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 8px 20px rgba(0,0,0,0.3);
`;

const Title = styled.h2`
  color: #041A32;
  font-weight: 700;
  margin-bottom: 16px;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Label = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
  color: #041A32;
  font-weight: 700;
`;

const Input = styled.input`
  background: rgba(255,255,255,0.8);
  color: #041A32;
  border: 1px solid #2a2c33;
  border-radius: 8px;
  padding: 10px 12px;
  font-family: 'Montserrat', sans-serif;
  font-weight: 400;
`;

const Row = styled.div`
  display: flex;
  gap: 10px;
  margin-top: 8px;
  flex-wrap: wrap;
`;

const Button = styled.button`
  background: #05AADB;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: bold;
  cursor: pointer;
  transition: background 0.3s ease;

  &:hover { background: #0A7FD5; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

const SignupRedirect = styled.div`
  margin-top: 12px;
  font-size: 14px;
  color: #041A32;
  text-align: center;
  cursor: pointer;
  text-decoration: underline;
  &:hover { color: #0A7FD5; }
`;

const Message = styled.div`
  margin-top: 12px;
  font-size: 14px;
  opacity: 0.95;
`;
