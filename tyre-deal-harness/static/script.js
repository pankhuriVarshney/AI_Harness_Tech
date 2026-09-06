// FIGMA_CONNECTOR reference implementation.
// A Figma-exported frontend should replicate this fetch logic against the
// same three endpoints - see UI_CONNECTORS.md for the full contract.

let sessionId = null;

async function initSession() {
  const res = await fetch("/api/session", { method: "POST" });
  const data = await res.json();
  sessionId = data.session_id;
}

function addMessage(text, cls) {
  const el = document.createElement("div");
  el.className = "msg " + cls;
  el.textContent = text;
  document.getElementById("messages").appendChild(el);
  el.scrollIntoView({ behavior: "smooth" });
}

function renderTrace(trace) {
  const container = document.getElementById("trace-content");
  container.innerHTML = "";
  if (!trace || trace.length === 0) {
    container.innerHTML = '<p class="muted">No agents ran for this turn.</p>';
    return;
  }
  trace.forEach((step) => {
    const div = document.createElement("div");
    div.className = "trace-item";
    div.innerHTML = `<span class="agent-name">${step.agent}</span><pre>${JSON.stringify(step.output, null, 2)}</pre>`;
    container.appendChild(div);
  });
}

async function sendMessage(message) {
  addMessage(message, "customer");
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, message }),
  });
  const data = await res.json();
  addMessage(data.reply, data.escalate_to_human ? "assistant escalate" : "assistant");
  renderTrace(data.trace);
}

document.getElementById("chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("chat-input");
  const message = input.value.trim();
  if (!message) return;
  input.value = "";
  sendMessage(message);
});

initSession();
