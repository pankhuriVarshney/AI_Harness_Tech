// Michelin Converge - minimal demo dashboard.
// This file is the reference implementation of how ANY frontend (including a
// future Figma-built UI) should call the backend. See UI_CONNECTORS.md.

const API_BASE = ""; // same-origin. Point this at your Flask host if split.

let sessionId = null;
let leadsCache = [];
let selectedLeadId = null;
const results = {}; // lead_id -> last /api/leads/process response (state)

async function api(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function init() {
  const session = await api("/api/sessions", { method: "POST" });
  sessionId = session.session_id;
  document.getElementById("session-info").textContent = `Session: ${sessionId}`;

  leadsCache = await api("/api/leads");
  renderLeadList();

  document.getElementById("process-lead-btn").addEventListener("click", onProcessNewLead);
  document.getElementById("simulate-btn").addEventListener("click", onSimulate);
}

function renderLeadList() {
  const ul = document.getElementById("lead-list");
  ul.innerHTML = "";
  leadsCache.forEach((lead) => {
    const li = document.createElement("li");
    li.textContent = `${lead.lead_id} — ${lead.raw_text.slice(0, 40)}...`;
    li.dataset.leadId = lead.lead_id;
    li.addEventListener("click", () => processLead(lead.lead_id, lead.raw_text, lead.customer_lat, lead.customer_lng));
    ul.appendChild(li);
  });
}

async function onProcessNewLead() {
  const text = document.getElementById("raw-lead-input").value.trim();
  if (!text) return;
  await processLead(null, text, null, null);
}

async function processLead(leadId, rawText, lat, lng) {
  setDecisionLoading();
  try {
    const state = await api("/api/leads/process", {
      method: "POST",
      body: JSON.stringify({
        lead_id: leadId,
        raw_text: rawText,
        customer_lat: lat,
        customer_lng: lng,
        session_id: sessionId,
      }),
    });
    results[state.lead_id] = state;
    selectedLeadId = state.lead_id;
    markActiveLead(state.lead_id);
    renderDecision(state);
    renderTrace(state.lead_id);
    updatePipelineStats();
  } catch (err) {
    renderError(err.message);
  }
}

function markActiveLead(leadId) {
  document.querySelectorAll("#lead-list li").forEach((li) => {
    li.classList.toggle("active", li.dataset.leadId === leadId);
  });
}

function setDecisionLoading() {
  document.getElementById("decision-panel").innerHTML = `<div class="empty-state">Running agentic pipeline…</div>`;
}

function renderError(message) {
  document.getElementById("decision-panel").innerHTML = `<div class="empty-state">⚠ ${message}</div>`;
}

function renderDecision(state) {
  const panel = document.getElementById("decision-panel");
  const action = state.recommended_action || "N/A";
  const rec = state.recommendation || {};
  const deal = state.deal || {};
  const dealer = state.dealer || {};

  panel.innerHTML = `
    <div class="decision-header">
      <h2>${state.lead_id}</h2>
      <span class="badge ${state.priority || ''}">${state.priority || 'PENDING'}</span>
    </div>
    <p class="muted">Status: ${state.status}</p>

    <div class="decision-grid">
      <div class="decision-card">
        <div class="label">Lead Score</div>
        <div class="value">${state.lead_score ?? "—"} / 100</div>
      </div>
      <div class="decision-card">
        <div class="label">Recommended Product</div>
        <div class="value">${rec.recommended_sku || "None"}</div>
      </div>
      <div class="decision-card">
        <div class="label">Optimized Offer</div>
        <div class="value">${deal.recommended_discount_pct != null ? deal.recommended_discount_pct + "% OFF" : "—"}</div>
      </div>
      <div class="decision-card">
        <div class="label">Recommended Dealer</div>
        <div class="value">${dealer.recommended_dealer || "None available"}</div>
      </div>
    </div>

    <div class="decision-header" style="margin-top:20px;">
      <h2>AI Sales Action</h2>
      <span class="badge ${action}">${action.replace(/_/g, " ")}</span>
    </div>
    ${state.sales_note ? `<div class="sales-note">${state.sales_note}</div>` : ""}

    <div class="action-buttons">
      <button onclick="viewTraceFor('${state.lead_id}')">View Agent Trace</button>
      <button onclick="alert('Assigned to sales (demo only).')">Assign to Sales</button>
    </div>
  `;
}

function viewTraceFor(leadId) {
  renderTrace(leadId);
}

async function renderTrace(leadId) {
  try {
    const data = await api(`/api/leads/${leadId}/trace`);
    const view = document.getElementById("trace-view");
    view.innerHTML = data.trace.map((step) => `
      <div class="trace-step">
        <span class="${step.ok ? 'ok' : 'fail'}">${step.ok ? '✓' : '✗'}</span>
        <span class="agent-name">${step.agent}</span> — ${step.duration_ms}ms
        ${step.note ? `<div class="muted">${step.note}</div>` : ""}
      </div>
    `).join("");
  } catch (err) {
    document.getElementById("trace-view").innerHTML = `<p class="muted">${err.message}</p>`;
  }
}

function updatePipelineStats() {
  const counts = { HIGH: 0, MEDIUM: 0, LOW: 0, REVIEW: 0 };
  Object.values(results).forEach((state) => {
    if (state.escalate_to_human) counts.REVIEW++;
    else if (state.priority === "HIGH") counts.HIGH++;
    else if (state.priority === "MEDIUM") counts.MEDIUM++;
    else if (state.priority === "LOW") counts.LOW++;
  });
  document.getElementById("stat-high").textContent = counts.HIGH;
  document.getElementById("stat-medium").textContent = counts.MEDIUM;
  document.getElementById("stat-low").textContent = counts.LOW;
  document.getElementById("stat-review").textContent = counts.REVIEW;
}

async function onSimulate() {
  if (!selectedLeadId) return;
  const budget = document.getElementById("sim-budget").value;
  const discount = document.getElementById("sim-discount").value;
  try {
    const sim = await api("/api/simulate", {
      method: "POST",
      body: JSON.stringify({
        lead_id: selectedLeadId,
        budget: budget ? Number(budget) : undefined,
        requested_discount_pct: discount ? Number(discount) : undefined,
      }),
    });
    document.getElementById("simulate-result").innerHTML = `
      <p><b>Current:</b> ${sim.current.deal.recommended_discount_pct}% → ₹${sim.current.deal.final_total}</p>
      <p><b>Simulated:</b> ${sim.simulated.deal.recommended_discount_pct}% → ₹${sim.simulated.deal.final_total}</p>
      <p class="muted">Policy respected: ${!sim.simulated.deal.exceeds_policy}</p>
    `;
  } catch (err) {
    document.getElementById("simulate-result").innerHTML = `<p class="muted">${err.message}</p>`;
  }
}

init();
