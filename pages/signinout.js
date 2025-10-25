import { signUpWithEmail, signInWithEmail, checkEmailProviders } from './Auth';

async function doSignup(email, password) {
  const { user, error } = await signUpWithEmail(email, password);
  if (error) {
    // handle error.code like 'auth/email-already-in-use'
    console.error(error);
  } else {
    console.log('Signed up as:', user.email);
  }
}