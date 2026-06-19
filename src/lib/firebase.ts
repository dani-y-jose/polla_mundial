import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

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

// Firestore init:
//  - experimentalAutoDetectLongPolling: use WebChannel when it works, fall back
//    to HTTP long-polling when the streaming transport is blocked (corporate
//    proxies, some networks, sandboxed iframes).
//  - persistentLocalCache (browser only): keeps an IndexedDB cache so returning
//    users get instant cache reads + offline resilience, and onSnapshot emits
//    from cache before the server. Guarded by `window` because there is no
//    IndexedDB during SSR.
// Wrapped in try/catch because Firestore can only be initialized once — on
// HMR/re-import we reuse the existing instance.
let db: Firestore;
try {
  db = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
    ...(typeof window !== "undefined"
      ? { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }
      : {}),
  });
} catch {
  db = getFirestore(app);
}

export { app, auth, db };
