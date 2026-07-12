// firebase-init.js
// Single shared Firebase init — import { app } from this file wherever
// getFirestore()/getAuth() is needed, instead of calling initializeApp() again.

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

// Injected at build time from Vercel environment variables — see build.js
const firebaseConfig = {
  apiKey: "__FIREBASE_API_KEY__",
  authDomain: "__FIREBASE_AUTH_DOMAIN__",
  projectId: "__FIREBASE_PROJECT_ID__",
  storageBucket: "__FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
  appId: "__FIREBASE_APP_ID__",
  measurementId: "__FIREBASE_MEASUREMENT_ID__",
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
