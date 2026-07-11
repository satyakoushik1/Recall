// exam-prediction.js
// Ranks likely exam topics from one or more notes, based on emphasis/frequency
// in the uploaded material. No real past-exam data — purely content-derived.

import { GEMINI_API_KEY } from "./config.js";

// ---- Imports (add to your exam-prediction.html <script type="module">) ----
// import { getFirestore, doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const db = getFirestore();

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// ---------------------------------------------------------------------------
// 1. Load one or more notes and generate the prediction
// ---------------------------------------------------------------------------
async function loadAndPredict(noteIds) {
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
