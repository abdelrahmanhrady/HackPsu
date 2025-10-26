// backend/Firebase.js
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyCUj2iyW25K8QrTTMQf60dhvrKUHUKqTzU",
  authDomain: "hackpsu-63bc0.firebaseapp.com",
  projectId: "hackpsu-63bc0",
  storageBucket: "hackpsu-63bc0.firebasestorage.app",
  messagingSenderId: "86714705883",
  appId: "1:86714705883:web:fe7e79e0d16e7a37c529fe",
  measurementId: "G-PX5CMM7ND9"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const database = getFirestore(app);
export const storage = getStorage(app);
export default app;