// flashcards.js
// Generates flip-style flashcards from a note's fullText using Gemini.

import { checkAndConsumeDailyLimit, DAILY_LIMIT } from "./usage-limit.js";
import { app } from "./firebase-init.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const db = getFirestore(app);

const GENERATE_PROXY_URL = "/api/generate";

let cards = []; // [{front, back}]
let currentIndex = 0;

const noteId = new URLSearchParams(window.location.search).get("noteId");

onAuthStateChanged(getAuth(app), (user) => {
  if (!user) {
    window.location.href = "auth.html";
    return;
  }
  if (!noteId) {
    alert("No note selected.");
    window.location.href = "dashboard.html";
    return;
  }
  loadAndGenerateFlashcards(noteId);
});

async function loadAndGenerateFlashcards(noteId, numCards = 10) {
  const uid = getAuth(app).currentUser?.uid;
  const usage = await checkAndConsumeDailyLimit(uid);
  if (!usage.allowed) {
    document.querySelector(".flashcard-status").textContent =
      `Your daily limit is over. You get ${DAILY_LIMIT} AI requests per day — come back tomorrow.`;
    return;
  }

  const noteRef = doc(db, "notes", noteId);
  const snap = await getDoc(noteRef);

  if (!snap.exists() || snap.data().status !== "ready") {
    alert("This note isn't ready yet.");
    return;
  }

  const fullText = snap.data().fullText;
  document.querySelector(".flashcard-status").textContent = "Generating flashcards…";

  try {
    cards = await generateFlashcards(fullText, numCards);
    currentIndex = 0;
    renderCard();
  } catch (err) {
    console.error("Flashcard generation failed:", err);
    document.querySelector(".flashcard-status").textContent =
      (err.status === 429 || err.status === 503 || err.status === 500)
        ? "Servers are busy right now. Please wait a few minutes and try again."
        : "Couldn't generate flashcards. Try again.";
  }
}

async function generateFlashcards(fullText, numCards) {
  const prompt = `You are a study assistant. Based ONLY on the notes below, create ${numCards} flashcards covering the key concepts.

Respond with ONLY valid JSON, no markdown fences, no preamble, in exactly this shape:
{
  "cards": [
    { "front": "term or question", "back": "definition or answer" }
  ]
}

--- NOTES ---
${fullText}
--- END NOTES ---`;

  const response = await fetch(GENERATE_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, jsonMode: true }),
  });

  if (!response.ok) {
    const err = new Error(`Request failed: ${response.status}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  const rawText = data.text;
  if (!rawText) throw new Error("Empty response");

  const parsed = JSON.parse(rawText);
  return parsed.cards;
}

function renderCard() {
  document.querySelector(".flashcard-status").textContent =
    `${currentIndex + 1} / ${cards.length}`;

  const card = cards[currentIndex];
  const cardEl = document.querySelector(".flashcard");
  cardEl.dataset.flipped = "false";
  cardEl.querySelector(".card-front").textContent = card.front;
  cardEl.querySelector(".card-back").textContent = card.back;
  cardEl.querySelector(".card-front").style.display = "block";
  cardEl.querySelector(".card-back").style.display = "none";
}

document.querySelector(".flashcard")?.addEventListener("click", (e) => {
  const cardEl = e.currentTarget;
  const flipped = cardEl.dataset.flipped === "true";
  cardEl.dataset.flipped = String(!flipped);
  cardEl.querySelector(".card-front").style.display = flipped ? "block" : "none";
  cardEl.querySelector(".card-back").style.display = flipped ? "none" : "block";
});

document.querySelector(".next-btn")?.addEventListener("click", () => {
  if (currentIndex < cards.length - 1) {
    currentIndex++;
    renderCard();
  }
});

document.querySelector(".prev-btn")?.addEventListener("click", () => {
  if (currentIndex > 0) {
    currentIndex--;
    renderCard();
  }
});
