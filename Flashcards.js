// flashcards.js
// Generates flip-style flashcards from a note's fullText using Gemini.

import { GEMINI_API_KEY } from "./config.js";

// ---- Imports (add to your flashcards.html <script type="module">) ----
// import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const db = getFirestore();

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

let cards = []; // [{front, back}]
let currentIndex = 0;

// ---------------------------------------------------------------------------
// 1. Load note + generate flashcards on page load
// ---------------------------------------------------------------------------
async function loadAndGenerateFlashcards(noteId, numCards = 10) {
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
      "Couldn't generate flashcards. Try again.";
  }
}

// Call on page load, e.g.:
// const noteId = new URLSearchParams(window.location.search).get("noteId");
// loadAndGenerateFlashcards(noteId);

// ---------------------------------------------------------------------------
// 2. Call Gemini, ask for strict JSON output
// ---------------------------------------------------------------------------
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

  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!response.ok) throw new Error(`Gemini request failed: ${response.status}`);

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("Empty response from Gemini");

  const parsed = JSON.parse(rawText);
  return parsed.cards;
}

// ---------------------------------------------------------------------------
// 3. Render current card (flip on click) + nav buttons
// ---------------------------------------------------------------------------
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
