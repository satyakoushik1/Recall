// quiz.js
// Generates a multiple-choice quiz from a note's fullText using Gemini.

import { checkAndConsumeDailyLimit, DAILY_LIMIT } from "./usage-limit.js";
import { app } from "./firebase-init.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const db = getFirestore(app);

const GENERATE_PROXY_URL = "/api/generate";

let currentQuiz = null;
let userAnswers = [];

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
  loadAndGenerateQuiz(noteId);
});

async function loadAndGenerateQuiz(noteId, numQuestions = 5) {
  const uid = getAuth(app).currentUser?.uid;
  const usage = await checkAndConsumeDailyLimit(uid);
  if (!usage.allowed) {
    document.querySelector(".quiz-status").textContent =
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
  document.querySelector(".quiz-status").textContent = "Generating your quiz…";

  try {
    currentQuiz = await generateQuiz(fullText, numQuestions);
    userAnswers = new Array(currentQuiz.questions.length).fill(null);
    renderQuiz();
  } catch (err) {
    console.error("Quiz generation failed:", err);
    document.querySelector(".quiz-status").textContent =
      (err.status === 429 || err.status === 503 || err.status === 500)
        ? "Servers are busy right now. Please wait a few minutes and try again."
        : "Couldn't generate a quiz. Try again.";
  }
}

async function generateQuiz(fullText, numQuestions) {
  const prompt = `You are a study assistant. Based ONLY on the notes below, create a ${numQuestions}-question multiple choice quiz.

Respond with ONLY valid JSON, no markdown fences, no preamble, in exactly this shape:
{
  "questions": [
    {
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correctIndex": 0,
      "explanation": "..."
    }
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

  return JSON.parse(rawText);
}

function renderQuiz() {
  const container = document.querySelector(".quiz-container");
  document.querySelector(".quiz-status").textContent = "";

  container.innerHTML = currentQuiz.questions
    .map(
      (q, qIndex) => `
      <div class="quiz-question" data-q-index="${qIndex}">
        <p class="question-text">${qIndex + 1}. ${escapeHtml(q.question)}</p>
        <div class="options">
          ${q.options
            .map(
              (opt, oIndex) => `
              <button class="option-btn" data-q-index="${qIndex}" data-o-index="${oIndex}">
                ${escapeHtml(opt)}
              </button>
            `
            )
            .join("")}
        </div>
        <p class="explanation" style="display: none;"></p>
      </div>
    `
    )
    .join("");

  container.querySelectorAll(".option-btn").forEach((btn) => {
    btn.addEventListener("click", handleAnswerClick);
  });
}

function handleAnswerClick(e) {
  const qIndex = Number(e.target.dataset.qIndex);
  const oIndex = Number(e.target.dataset.oIndex);

  if (userAnswers[qIndex] !== null) return;

  userAnswers[qIndex] = oIndex;
  const question = currentQuiz.questions[qIndex];
  const questionEl = document.querySelector(`.quiz-question[data-q-index="${qIndex}"]`);
  const buttons = questionEl.querySelectorAll(".option-btn");

  buttons.forEach((btn, i) => {
    btn.disabled = true;
    if (i === question.correctIndex) {
      btn.classList.add("correct");
    } else if (i === oIndex) {
      btn.classList.add("incorrect");
    }
  });

  const explanationEl = questionEl.querySelector(".explanation");
  explanationEl.textContent = question.explanation;
  explanationEl.style.display = "block";

  checkIfComplete();
}

function checkIfComplete() {
  if (userAnswers.some((a) => a === null)) return;

  const score = userAnswers.filter(
    (answer, i) => answer === currentQuiz.questions[i].correctIndex
  ).length;
  const total = currentQuiz.questions.length;

  document.querySelector(".quiz-status").textContent = `Score: ${score} / ${total}`;

  showCongratulationsPopup(score, total);
}

function showCongratulationsPopup(score, total) {
  const overlay = document.getElementById("popupOverlay");
  const scoreEl = document.getElementById("popupScore");
  const emojiEl = document.querySelector(".popup-emoji");
  const titleEl = document.querySelector(".popup-title");

  const pct = score / total;
  if (pct === 1) {
    emojiEl.textContent = "🏆";
    titleEl.textContent = "Perfect score!";
  } else if (pct >= 0.6) {
    emojiEl.textContent = "🎉";
    titleEl.textContent = "Congratulations!";
  } else {
    emojiEl.textContent = "💪";
    titleEl.textContent = "Quiz complete!";
  }

  scoreEl.textContent = `You scored ${score} out of ${total}`;

  // slight delay so the last answer's feedback is visible before the popup covers it
  setTimeout(() => overlay.classList.add("show"), 400);
}

document.getElementById("popupCloseBtn")?.addEventListener("click", () => {
  document.getElementById("popupOverlay").classList.remove("show");
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
