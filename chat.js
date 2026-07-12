// chat.js
// Client-side chat: sends the note's fullText + user question to Gemini,
// streams the answer back. No Firestore persistence — in-memory per session.

import { checkAndConsumeDailyLimit, DAILY_LIMIT } from "./usage-limit.js";
import { app } from "./firebase-init.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const db = getFirestore(app);
const auth = getAuth(app);

const CHAT_PROXY_URL = "/api/generate";

let noteFullText = "";
let noteTitle = "";
let messages = []; // in-memory only: [{role: "user"|"model", text: "..."}]

// ---------------------------------------------------------------------------
// 1. Load the note when the chat screen opens
// ---------------------------------------------------------------------------
async function loadNote(noteId) {
  const noteRef = doc(db, "notes", noteId);
  const snap = await getDoc(noteRef);

  if (!snap.exists() || snap.data().status !== "ready") {
    alert("This note isn't ready yet.");
    return;
  }

  const data = snap.data();
  noteFullText = data.fullText;
  noteTitle = data.title;
  document.querySelector(".chat-title").textContent = noteTitle;
}

const noteId = new URLSearchParams(window.location.search).get("noteId");

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "auth.html";
    return;
  }
  if (!noteId) {
    alert("No note selected.");
    window.location.href = "dashboard.html";
    return;
  }
  loadNote(noteId);
});

// ---------------------------------------------------------------------------
// 2. Send a question, stream the answer
// ---------------------------------------------------------------------------
async function sendMessage(question) {
  if (!question.trim()) return;

  const uid = getAuth(app).currentUser?.uid;
  const usage = await checkAndConsumeDailyLimit(uid);
  if (!usage.allowed) {
    messages.push({ role: "user", text: question });
    messages.push({
      role: "model",
      text: `Your daily limit is over. You get ${DAILY_LIMIT} AI requests per day — come back tomorrow.`,
    });
    renderMessages();
    return;
  }

  messages.push({ role: "user", text: question });
  renderMessages();

  const inputBox = document.querySelector(".chat-input");
  inputBox.value = "";
  inputBox.disabled = true;

  // Add an empty placeholder message we'll fill in as chunks arrive
  const modelMessage = { role: "model", text: "" };
  messages.push(modelMessage);
  renderMessages();

  const prompt = buildPrompt(noteFullText, messages);

  try {
    const response = await fetch(CHAT_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, jsonMode: false }),
    });

    if (!response.ok) throw new Error(`Request failed: ${response.status}`);

    const data = await response.json();
    modelMessage.text = data.text || "No response received.";
    renderMessages();
  } catch (err) {
    console.error("Chat error:", err);
    modelMessage.text = "Something went wrong getting a response. Try again.";
    renderMessages();
  } finally {
    inputBox.disabled = false;
    inputBox.focus();
  }
}

// ---------------------------------------------------------------------------
// 3. Build the prompt — full note text + recent conversation
// ---------------------------------------------------------------------------
function buildPrompt(fullText, messageHistory) {
  const recentHistory = messageHistory
    .slice(0, -1) // exclude the empty placeholder we just added
    .map((m) => `${m.role === "user" ? "Student" : "Assistant"}: ${m.text}`)
    .join("\n");

  return `You are a study assistant. Answer the student's question using ONLY the notes below. If the answer isn't in the notes, say so clearly.

--- NOTES ---
${fullText}
--- END NOTES ---

${recentHistory}`;
}

// ---------------------------------------------------------------------------
// 4. Render messages to the page
// ---------------------------------------------------------------------------
function renderMessages() {
  const container = document.querySelector(".chat-messages");
  container.innerHTML = messages
    .map((m, i) => {
      const isLastModelMsg = m.role === "model" && i === messages.length - 1;
      const isPending = isLastModelMsg && m.text === "";
      const displayText = isPending ? "Thinking…" : escapeHtml(m.text);
      return `
        <div class="message ${m.role}">
          <p${isPending ? ' style="color: var(--muted);"' : ""}>${displayText}</p>
        </div>
      `;
    })
    .join("");
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// 5. Wire the input form
// ---------------------------------------------------------------------------
document.querySelector(".chat-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.querySelector(".chat-input");
  sendMessage(input.value);
});
