// notes-processing.js
// Client-side PDF upload + text extraction + Gemini-ready storage.
// No Cloud Functions, no Storage bucket — everything runs in the browser.

// ---- Imports (add these to your dashboard.html <script type="module">) ----
// import { getFirestore, doc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
// import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
// pdf.js loaded via CDN script tag (see note at bottom of file)

const db = getFirestore();
const auth = getAuth();

// ---------------------------------------------------------------------------
// 1. Wire the "Upload your first notes" button to a hidden file input
// ---------------------------------------------------------------------------
const uploadBtn = document.querySelector(".btn"); // your existing button
const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.accept = ".pdf";
fileInput.style.display = "none";
document.body.appendChild(fileInput);

uploadBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await processNoteClientSide(file);
  fileInput.value = ""; // reset so the same file can be re-selected later
});

// ---------------------------------------------------------------------------
// 2. Main processing function
// ---------------------------------------------------------------------------
async function processNoteClientSide(file) {
  const user = auth.currentUser;
  if (!user) {
    alert("You need to be signed in to upload notes.");
    return;
  }

  // Create the Firestore doc immediately so the dashboard shows "processing"
  const noteRef = doc(collection(db, "notes")); // auto-generated ID
  const noteId = noteRef.id;

  await setDoc(noteRef, {
    uid: user.uid,
    title: file.name.replace(/\.pdf$/i, ""),
    status: "processing",
    fullText: "",
    pageCount: 0,
    createdAt: serverTimestamp(),
  });

  try {
    // Extract text with pdf.js
    const { text, pageCount } = await extractTextFromPdf(file);

    if (!text || text.trim().length === 0) {
      await updateDoc(noteRef, {
        status: "failed",
        error: "No text found — this PDF may be a scanned image. Try a text-based PDF.",
      });
      return;
    }

    // Write extracted text + mark ready
    await updateDoc(noteRef, {
      fullText: text,
      pageCount,
      status: "ready",
    });
  } catch (err) {
    console.error("Note processing failed:", err);
    await updateDoc(noteRef, {
      status: "failed",
      error: "Something went wrong reading this PDF. Try again.",
    });
  }
}

// ---------------------------------------------------------------------------
// 3. PDF text extraction using pdf.js
// ---------------------------------------------------------------------------
async function extractTextFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(" ");
    fullText += pageText + "\n\n";
  }

  return { text: fullText.trim(), pageCount: pdf.numPages };
}

// ---------------------------------------------------------------------------
// 4. Real-time dashboard listener — replaces the static empty state
// ---------------------------------------------------------------------------
function listenToNotes(uid, onNotesChange) {
  const notesQuery = query(collection(db, "notes"), where("uid", "==", uid));
  return onSnapshot(notesQuery, (snapshot) => {
    const notes = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    onNotesChange(notes);
  });
}

// Call this once the user is confirmed signed in (e.g. inside onAuthStateChanged):
// listenToNotes(user.uid, (notes) => renderNoteList(notes));

function renderNoteList(notes) {
  const main = document.querySelector("main");

  if (notes.length === 0) {
    // keep your existing empty-state markup here
    return;
  }

  main.innerHTML = notes
    .map((note) => {
      const statusLabel = {
        processing: "Reading your notes…",
        ready: "Ready",
        failed: note.error || "Failed — try again",
        uploading: "Uploading…",
      }[note.status];

      return `
        <div class="note-card" data-note-id="${note.id}" data-status="${note.status}"
             style="cursor: ${note.status === "ready" ? "pointer" : "default"};">
          <p class="note-title">${note.title}</p>
          <p class="note-status">${statusLabel}</p>
        </div>
      `;
    })
    .join("");

  // Wire click navigation — only for notes that are ready
  main.querySelectorAll(".note-card").forEach((card) => {
    if (card.dataset.status !== "ready") return;
    card.addEventListener("click", () => {
      window.location.href = `chat.html?noteId=${card.dataset.noteId}`;
    });
  });
}

// ---------------------------------------------------------------------------
// NOTE: add pdf.js to your dashboard.html <head>, before this script:
// <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.js"></script>
// <script>
//   pdfjsLib.GlobalWorkerOptions.workerSrc =
//     "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js";
// </script>
// ---------------------------------------------------------------------------
