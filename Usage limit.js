// usage-limit.js
// Shared daily cap on Gemini calls per user, stored on their user doc.
// Keeps you from burning through the free tier if someone spams requests.

import {
  getFirestore, doc, getDoc, setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const db = getFirestore();

const DAILY_LIMIT = 3; // total Gemini calls per user per day, across chat/quiz/flashcards/exam prediction

function todayString() {
  return new Date().toISOString().slice(0, 10); // "2026-07-11"
}

/**
 * Checks whether the user is under today's limit. If yes, increments the count
 * and returns { allowed: true }. If not, returns { allowed: false }.
 * Call this BEFORE making a Gemini request.
 */
export async function checkAndConsumeDailyLimit(uid) {
  const usageRef = doc(db, "usage", uid);
  const snap = await getDoc(usageRef);
  const today = todayString();

  let count = 0;
  if (snap.exists() && snap.data().date === today) {
    count = snap.data().count;
  }

  if (count >= DAILY_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  await setDoc(usageRef, { date: today, count: count + 1 });
  return { allowed: true, remaining: DAILY_LIMIT - (count + 1) };
}

export { DAILY_LIMIT };
