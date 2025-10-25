import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCUj2iyW25K8QrTTMQf60dhvrKUHUKqTzU",
  authDomain: "hackpsu-63bc0.firebaseapp.com",
  projectId: "hackpsu-63bc0",
  storageBucket: "hackpsu-63bc0.firebasestorage.app",
  messagingSenderId: "86714705883",
  appId: "1:86714705883:web:fe7e79e0d16e7a37c529fe",
  measurementId: "G-PX5CMM7ND9"
};

// // Initialize Firebase
const app = initializeApp(firebaseConfig);
// export const auth = getAuth(app);
// export const database = getFirestore(app);
export const analytics = () => getAnalytics(app);

export default app