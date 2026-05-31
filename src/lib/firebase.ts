import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  projectId: "polla-mundial-dj-2026",
  appId: "1:561862734550:web:ceef432aeed370466e8f77",
  storageBucket: "polla-mundial-dj-2026.firebasestorage.app",
  apiKey: "AIzaSyAONRvXrhdnRnAXHjgIbw0ZBdEId1btOLM",
  authDomain: "polla-mundial-dj-2026.firebaseapp.com",
  messagingSenderId: "561862734550",
};

// Initialize Firebase only if it hasn't been initialized already (important for Next.js SSR)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
