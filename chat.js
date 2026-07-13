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

  const modelMessage = { role: "model", text: "" };
  messages.push(modelMessage);
  renderMessages();

  const prompt = buildPrompt(noteFullText, messages);

  // Client-side safety net: abort after 45s instead of hanging on "Thinking…" forever.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(CHAT_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, jsonMode: false }),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    if (!response.body) throw new Error("Streaming not supported in this browser");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      modelMessage.text += decoder.decode(value, { stream: true });
      renderMessages();
    }

    if (!modelMessage.text) {
      modelMessage.text = "No response received.";
      renderMessages();
    }
  } catch (err) {
    console.error("Chat error:", err);
    modelMessage.text =
      err.name === "AbortError"
        ? "That took too long to respond. Try again."
        : "Something went wrong getting a response. Try again.";
    renderMessages();
  } finally {
    clearTimeout(timeoutId);
    inputBox.disabled = false;
    inputBox.focus();
  }
}
