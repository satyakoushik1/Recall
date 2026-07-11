// exam-prediction.js
// Ranks likely exam topics from one or more notes, based on emphasis/frequency
// in the uploaded material. No real past-exam data — purely content-derived.

import { checkAndConsumeDailyLimit, DAILY_LIMIT } from "./usage-limit.js";
import { app } from "./firebase-init.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const db = getFirestore(app);

const GENERATE_PROXY_URL = "/.netlify/functions/generate";

// ---------------------------------------------------------------------------
// 1. Load one or more notes and generate the prediction
// ---------------------------------------------------------------------------
async function loadAndPredict(noteIds) {
  const uid = getAuth().currentUser?.uid;
  const usage = await checkAndConsumeDailyLimit(uid);
  if (!usage.allowed) {
    document.querySelector(".predict-status").textContent =
      `Your daily limit is over. You get ${DAILY_LIMIT} AI requests per day — come back tomorrow.`;
    return;
  }

  document.querySelector(".predict-status").textContent = "Analyzing your notes…";

  try {
    const texts = await Promise.all(
      noteIds.map(async (id) => {
        const snap = await getDoc(doc(db, "notes", id));
        return snap.exists() ? snap.data().fullText : "";
      })
    );

    const combinedText = texts.filter(Boolean).join("\n\n---\n\n");
    if (!combinedText) {
      document.querySelector(".predict-status").textContent =
        "No ready notes found to analyze.";
      return;
    }

    const result = await predictExamTopics(combinedText);
    renderPrediction(result);
  } catch (err) {
    console.error("Exam prediction failed:", err);
    document.querySelector(".predict-status").textContent =
      "Couldn't generate a prediction. Try again.";
  }
}

// Call on page load, e.g.:
// const noteIds = new URLSearchParams(window.location.search).get("noteIds").split(",");
// loadAndPredict(noteIds);

// ---------------------------------------------------------------------------
// 2. Call Gemini, ask for a ranked topic list as JSON
// ---------------------------------------------------------------------------
async function predictExamTopics(combinedText) {
  const prompt = `You are a study assistant. Based ONLY on the notes below, identify the topics most likely to appear on an exam, ranked by how much emphasis they receive in the material (repetition, depth of explanation, worked examples, highlighted definitions).

Be clear this is derived only from the uploaded notes, not from real past exam papers.

Respond with ONLY valid JSON, no markdown fences, no preamble, in exactly this shape:
{
  "topics": [
    { "topic": "...", "likelihood": "high" | "medium" | "low", "reason": "one sentence why" }
  ]
}

--- NOTES ---
${combinedText}
--- END NOTES ---`;

  const response = await fetch(GENERATE_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) throw new Error(`Request failed: ${response.status}`);

  const data = await response.json();
  const rawText = data.text;
  if (!rawText) throw new Error("Empty response");

  return JSON.parse(rawText);
}

// ---------------------------------------------------------------------------
// 3. Render the ranked list
// ---------------------------------------------------------------------------
function renderPrediction(result) {
  document.querySelector(".predict-status").textContent =
    "Based only on your uploaded notes — not real past exams.";

  const container = document.querySelector(".predict-container");
  const likelihoodColor = { high: "red", medium: "orange", low: "gray" };

  container.innerHTML = result.topics
    .map(
      (t) => `
      <div class="topic-card">
        <div class="topic-header">
          <span class="topic-name">${escapeHtml(t.topic)}</span>
          <span class="topic-likelihood" style="color: ${likelihoodColor[t.likelihood] || "gray"};">
            ${t.likelihood}
          </span>
        </div>
        <p class="topic-reason">${escapeHtml(t.reason)}</p>
      </div>
    `
    )
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
