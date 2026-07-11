// netlify/edge-functions/chat-stream.js
// Proxies streaming Gemini chat requests so the key stays server-side.
// Env var required in Netlify dashboard: GEMINI_API_KEY

export default async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { prompt } = await request.json();
  if (!prompt) {
    return new Response(JSON.stringify({ error: "Missing prompt" }), { status: 400 });
  }

  const GEMINI_MODEL = "gemini-2.5-flash";
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const geminiResponse = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
  });

  // Pipe Gemini's SSE stream straight back to the browser
  return new Response(geminiResponse.body, {
    status: geminiResponse.status,
    headers: { "Content-Type": "text/event-stream" },
  });
};

export const config = { path: "/api/chat-stream" };
