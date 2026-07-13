// api/generate.js
// Vercel serverless function — proxies Gemini requests. Key never leaves the server.
// Env var required in Vercel dashboard: GEMINI_API_KEY
// Send { prompt, jsonMode: true } for structured JSON output (quiz/flashcards/exam prediction),
// or { prompt } / { prompt, jsonMode: false } for plain text output (chat).

const GEMINI_MODEL = "gemini-flash-latest";
const MAX_RETRIES = 2;
const RETRYABLE_STATUSES = new Set([429, 500, 503]);

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt, jsonMode = false } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ error: "Missing prompt" });
  }

  const requestBody = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };
  if (jsonMode) {
    requestBody.generationConfig = { responseMimeType: "application/json" };
  }

  // jsonMode responses (quiz/flashcards/exam-prediction) must be a single
  // complete JSON blob, so those still use the buffered non-streaming call.
  if (jsonMode) {
    return handleBuffered(res, requestBody);
  }

  // Chat responses are streamed straight through to the browser as plain text.
  // Previously we waited for Gemini to finish the ENTIRE answer (full note
  // text + history + retry backoff could take well past the function's
  // maxDuration), which is what caused the 504s. Streaming means bytes start
  // flowing within a second or two and the function is never sitting idle.
  return handleStreamed(res, requestBody);
};

async function handleBuffered(res, requestBody) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const geminiResponse = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!geminiResponse.ok) {
        const errText = await geminiResponse.text();

        if (RETRYABLE_STATUSES.has(geminiResponse.status) && attempt < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }

        return res.status(geminiResponse.status).json({ error: errText });
      }

      const data = await geminiResponse.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      return res.status(200).json({ text: rawText });
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      return res.status(500).json({ error: err.message });
    }
  }
}

async function handleStreamed(res, requestBody) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${process.env.GEMINI_API_KEY}`;

  let geminiResponse;
  try {
    // Only retry the CONNECTION itself (before any headers are sent to the
    // client). Once streaming has started we can't safely restart it.
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      geminiResponse = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (geminiResponse.ok) break;

      if (RETRYABLE_STATUSES.has(geminiResponse.status) && attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }

      const errText = await geminiResponse.text();
      return res.status(geminiResponse.status).json({ error: errText });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no", // disable proxy buffering so chunks flush immediately
  });

  const reader = geminiResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        try {
          const parsed = JSON.parse(jsonStr);
          const textChunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (textChunk) res.write(textChunk);
        } catch {
          // Ignore partial/non-JSON SSE lines
        }
      }
    }
  } catch (err) {
    // Stream broke mid-flight; end what we have rather than hanging.
  }

  res.end();
}
