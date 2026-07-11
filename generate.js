// netlify/functions/generate.js
// Proxies Gemini requests. Key never leaves the server.
// Env var required in Netlify dashboard: GEMINI_API_KEY
// Send { prompt, jsonMode: true } for structured JSON output (quiz/flashcards/exam prediction),
// or { prompt } / { prompt, jsonMode: false } for plain text output (chat).

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const { prompt, jsonMode = false } = JSON.parse(event.body || "{}");
  if (!prompt) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing prompt" }) };
  }

  const GEMINI_MODEL = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const requestBody = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };
  if (jsonMode) {
    requestBody.generationConfig = { responseMimeType: "application/json" };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { statusCode: response.status, body: JSON.stringify({ error: errText }) };
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: rawText }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
