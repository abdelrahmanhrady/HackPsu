// Auth.js
import { auth } from './Firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  fetchSignInMethodsForEmail,
} from 'firebase/auth';

/**
 * Create account with email/password.
 * Returns: { user, error }
 */
export async function signUpWithEmail(email, password) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    console.log('[Auth] signUpWithEmail ok:', cred.user?.uid);
    return { user: cred.user, error: null };
  } catch (error) {
    console.warn('[Auth] signUpWithEmail error:', error?.code || error);
    return { user: null, error };
  }
}

/**
 * Sign in with email/password.
 * Returns: { user, error }
 */
export async function signInWithEmail(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    console.log('[Auth] signInWithEmail ok:', cred.user?.uid);
    return { user: cred.user, error: null };
  } catch (error) {
    console.warn('[Auth] signInWithEmail error:', error?.code || error);
    return { user: null, error };
  }
}

/**
 * Check which providers exist for an email (e.g., ['password', 'google.com']).
 * Returns: { methods, error }
 */
export async function checkEmailProviders(email) {
  try {
    const methods = await fetchSignInMethodsForEmail(auth, email);
    console.log('[Auth] checkEmailProviders:', methods);
    return { methods, error: null };
  } catch (error) {
    console.warn('[Auth] checkEmailProviders error:', error?.code || error);
    return { methods: [], error };
  }
}

// Optional default export if you prefer default importing
const AuthAPI = { signUpWithEmail, signInWithEmail, checkEmailProviders };
export default AuthAPI;