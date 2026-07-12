// api/generate.js
// Vercel serverless function — proxies Gemini requests. Key never leaves the server.
// Env var required in Vercel dashboard: GEMINI_API_KEY
// Send { prompt, jsonMode: true } for structured JSON output (quiz/flashcards/exam prediction),
// or { prompt } / { prompt, jsonMode: false } for plain text output (chat).

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt, jsonMode = false } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ error: "Missing prompt" });
  }

  const GEMINI_MODEL = "gemini-flash-latest";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const requestBody = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };
  if (jsonMode) {
    requestBody.generationConfig = { responseMimeType: "application/json" };
  }

  try {
    const geminiResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      return res.status(geminiResponse.status).json({ error: errText });
    }

    const data = await geminiResponse.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    return res.status(200).json({ text: rawText });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
