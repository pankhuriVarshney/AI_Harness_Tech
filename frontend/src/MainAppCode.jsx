import React, {
  useState, useEffect, useMemo, useCallback, createContext, useContext,
} from "react";
import {
  Home, Inbox, SlidersHorizontal, Bot, User, Search, RefreshCw,
  ChevronRight, ChevronDown, ChevronUp, ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2,
  Clock, MapPin, Zap, Lock, Activity, Cpu, GitBranch, ArrowRight,
  KeyRound, LogIn, Gauge, Plus, X, Loader2, Wifi, WifiOff, Send, PlayCircle, XCircle,
  Wrench, Info,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

/* ============================================================================
   THEME (light)
============================================================================ */

const T = {
  font: "'Plus Jakarta Sans','Inter',-apple-system,'Segoe UI',Roboto,sans-serif",
  mono: "'JetBrains Mono','SFMono-Regular',Menlo,monospace",
  bg: "radial-gradient(120% 120% at 12% 0%, #EEF3FB 0%, #F7F9FC 45%, #FFFFFF 100%)",
  panelBorder: "1px solid #E4E9F2",
  blue: "linear-gradient(135deg,#0057D9 0%,#2F8DFF 55%,#21B8FD 100%)",
  blueSolid: "#0F62D6",
  cyan: "#0EA5B7",
  teal: "#0D9488",
  tealBg: "rgba(13,148,136,0.10)",
  text: "#101828",
  sub: "#5B6B85",
  faint: "#8B96AA",
  green: "#0E9F6E",
  greenBg: "rgba(14,159,110,0.10)",
  red: "#E33F5E",
  redBg: "rgba(227,63,94,0.10)",
  amber: "#D98C11",
  amberBg: "rgba(217,140,17,0.12)",
  purple: "#7C5CFC",
  purpleBg: "rgba(124,92,252,0.10)",
};

const badgeStyle = (color, bg) => ({
  color, background: bg, border: `1px solid ${color}33`,
  padding: "3px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 600,
  display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
});

const inputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 10, background: "#fff",
  border: T.panelBorder, color: T.text, fontFamily: T.font, fontSize: 13, outline: "none",
};
const textAreaStyle = { ...inputStyle, resize: "vertical", lineHeight: 1.5 };
const primaryBtnStyle = {
  background: T.blue, border: "none", color: "#fff", padding: "11px 16px",
  borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: T.font,
};
const secondaryBtnStyle = {
  background: "#fff", border: T.panelBorder, color: T.text, padding: "11px 16px",
  borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: T.font,
};
const iconBtnStyle = {
  background: "#F3F6FB", border: "none", width: 32, height: 32, borderRadius: 10,
  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: T.sub,
};
const errorBoxStyle = {
  display: "flex", gap: 8, alignItems: "flex-start", background: T.redBg,
  border: `1px solid ${T.red}33`, borderRadius: 10, padding: 12, fontSize: 12.5, color: T.red,
};

/* ============================================================================
   SMALL HELPERS
============================================================================ */

function pick(obj, keys, fallback) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return fallback;
}

function prettyKey(k) {
  return String(k).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? v.toLocaleString("en-IN") : v.toFixed(2);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) {
    if (!v.length) return "—";
    return v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ");
  }
  return String(v);
}

function normalizeStatus(s) {
  if (!s) return "QUEUED";
  return String(s).toUpperCase().replace(/\s+/g, "_");
}

function normalizeLead(raw) {
  const id = pick(raw, ["id", "lead_id"], `LEAD-${Math.random().toString(36).slice(2, 7).toUpperCase()}`);
  const customer = pick(raw, ["customer", "customer_name", "name"], "Unknown customer");
  const vehicle = pick(raw, ["vehicle", "car", "model"], "");
  const location = pick(raw, ["location", "city"], "");
  const meta = pick(raw, ["meta"], [location, vehicle].filter(Boolean).join(" · "));
  const rawText = pick(raw, ["raw", "raw_text", "text", "message"], "");
  const score = pick(raw, ["score", "lead_score"], null);
  const status = normalizeStatus(pick(raw, ["status", "state"], "QUEUED"));
  const priority = pick(
    raw, ["priority"],
    score != null ? (score >= 70 ? "High" : score >= 45 ? "Medium" : "Low") : "Medium"
  );
  return { id, customer, meta, raw: rawText, score: score ?? 0, priority, status };
}

function normalizeLeadList(list) {
  if (Array.isArray(list)) return list.map(normalizeLead);
  if (list && Array.isArray(list.leads)) return list.leads.map(normalizeLead);
  return [];
}

function mergeLeadFromState(state) {
  const profile = state.profile || {};
  return normalizeLead({
    id: state.lead_id,
    customer: profile.customer_name || profile.name,
    vehicle: profile.vehicle,
    location: profile.location,
    raw_text: profile.raw_text || state.raw_text,
    score: state.score ?? profile.lead_score,
    status: state.status,
  });
}

function normalizeSecurityEntry(sec) {
  if (typeof sec === "string") return { tag: sec, detail: "", level: "amber" };
  const tag = pick(sec, ["tag", "flag", "status", "verdict"], "FLAGGED");
  const detail = pick(sec, ["detail", "reason", "message"], "");
  const levelRaw = pick(sec, ["level", "severity"], null);
  const level = levelRaw
    ? String(levelRaw).toLowerCase()
    : (String(tag).toUpperCase().includes("BLOCK") ? "red" : "amber");
  return { tag: String(tag), detail: String(detail || ""), level };
}

async function apiRequest(base, path, opts = {}) {
  const res = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!res.ok) {
    const msg = (data && data.error) || `Request failed — ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

/* ============================================================================
   DEMO / FALLBACK DATA (used only when the backend can't be reached)
============================================================================ */

const RAW_FALLBACK_LEADS = [
  { id: "LEAD-101", customer: "Rahul Sen", meta: "Pune · Hyundai Creta", raw: "Need 4 new tyres for Creta, prefers high comfort & wet grip.", score: 82, priority: "High", status: "Ready" },
  { id: "LEAD-102", customer: "Priya Sharma", meta: "Mumbai · Maruti Swift", raw: "Swift tyre burst on highway, looking for durable tubeless ASAP.", score: 74, priority: "High", status: "Ready" },
  { id: "LEAD-103", customer: "Amit Patel", meta: "Mumbai · Honda City", raw: "Enquired about fuel-efficient Primacy 4ST options for Honda City.", score: 68, priority: "Medium", status: "Processing" },
  { id: "LEAD-104", customer: "Rohan Joshi", meta: "Pune · Tata Harrier", raw: "Need immediate replacement of front tyres for Harrier. All-terrain preferred.", score: 78, priority: "High", status: "Ready" },
  { id: "LEAD-105", customer: "Vikram Malhotra", meta: "Mumbai · Mahindra Bolero", raw: "Pricing request for bulk purchase of commercial van tyres.", score: 35, priority: "Low", status: "Escalated" },
  { id: "LEAD-106", customer: "Anjali Gupta", meta: "Mumbai · Audi A4", raw: "Looking for premium high-performance Michelin Pilot Sport 4S options.", score: 91, priority: "High", status: "Ready" },
  { id: "LEAD-107", customer: "Kunal Shah", meta: "Pune · Skoda Rapid", raw: "Fitted Rapid with XM2 earlier, looking for latest stock matching that spec.", score: 55, priority: "Medium", status: "Processing" },
];
const FALLBACK_LEADS = RAW_FALLBACK_LEADS.map(normalizeLead);

const CONVERSION_TREND_DEMO = [
  { day: "Mon", rate: 61 }, { day: "Tue", rate: 64 }, { day: "Wed", rate: 58 },
  { day: "Thu", rate: 70 }, { day: "Fri", rate: 63 }, { day: "Sat", rate: 69 }, { day: "Today", rate: 68 },
];

const PROCESSING_TIME_DEMO = [
  { name: "Lead Intelligence", ms: 182, max: 350 },
  { name: "Lead Scoring", ms: 145, max: 350 },
  { name: "Product Match", ms: 230, max: 350 },
  { name: "Deal Optimization", ms: 310, max: 350 },
  { name: "Dealer Allocation", ms: 95, max: 350 },
];

const PIPELINE_STAGES_DEMO = [
  { name: "Raw Lead", ms: 12, state: "done" },
  { name: "Lead Intelligence", ms: 182, state: "done" },
  { name: "Lead Scoring", ms: 145, state: "done" },
  { name: "Product Match", ms: 230, state: "done" },
  { name: "Deal Optimization", ms: 310, state: "active" },
  { name: "Dealer Allocation", ms: null, state: "pending" },
  { name: "Compliance Agent", ms: null, state: "pending" },
];

const MANIFEST_DEMO = [
  { name: "Lead Intelligence", tier: "fast", role: "Extraction & out-of-scope detection", tools_description: "pii.redact, security.scan_input" },
  { name: "Lead Scoring", tier: "fast", role: "Phrases reasons for a code-computed score", tools_description: "lead.compute_score" },
  { name: "Product Matching", tier: "fast", role: "Matches catalogue SKUs to the request", tools_description: "catalog.search, catalog.validate_skus" },
  { name: "Deal Optimization", tier: "fast", role: "Proposes the smallest sufficient incentive", tools_description: "policy.effective_max_discount, policy.clamp_discount · spawns Negotiation Simulator" },
  { name: "Dealer Allocation", tier: "tool-only", role: "Ranks dealers by stock, distance, conversion", tools_description: "dealer.rank, geo.haversine" },
  { name: "Compliance & Sales Critic", tier: "reasoning", role: "Judgment on ambiguity, escalation bias, revise_deal handoff", tools_description: "quote.finalize" },
  { name: "Negotiation Simulator", tier: "fast · subagent", role: "Role-plays the customer against the proposed discount", tools_description: "no tools · max depth 1" },
  { name: "Security Sentinel", tier: "reasoning", role: "PASS / SUSPICIOUS / BLOCKED — escalate-only precedence", tools_description: "runs inside guarded_call() on every model call" },
];

const SECURITY_FEED_DEMO = [
  { id: "LEAD-606", tag: "SECURITY_BLOCK", detail: "Prompt injection detected", when: "5 min ago", level: "red" },
  { id: "LEAD-707", tag: "PII_REDACTION", detail: "2 tokens redacted (phone, email)", when: "12 min ago", level: "amber" },
  { id: "LEAD-104", tag: "COMPLIANCE_PASS", detail: "All checks cleared", when: "18 min ago", level: "green" },
  { id: "LEAD-201", tag: "POLICY_CLAMP", detail: "Discount clamped from 30% to 8%", when: "25 min ago", level: "amber" },
];

const AUDIT_LOG_DEMO = [
  { text: "Processed LEAD-104 — CONTACT NOW", when: "2 hrs ago", level: "green" },
  { text: "Ran what-if simulation on LEAD-201", when: "4 hrs ago", level: "blue" },
  { text: "Escalated LEAD-403 to human review", when: "Yesterday", level: "red" },
  { text: "Updated discount policy threshold", when: "2 days ago", level: "amber" },
  { text: "Approved LEAD-302 dealer allocation", when: "3 days ago", level: "green" },
];

const STATUS_META = {
  READY: [T.green, T.greenBg, "Ready"],
  COMPLETE: [T.green, T.greenBg, "Complete"],
  PROCESSING: [T.blueSolid, "rgba(15,98,214,0.10)", "Processing"],
  QUEUED: [T.faint, "#F1F4F9", "Queued"],
  ESCALATED: [T.red, T.redBg, "Escalated"],
  SECURITY_BLOCK: [T.red, T.redBg, "Security Block"],
  NEEDS_CLARIFICATION: [T.amber, T.amberBg, "Needs Clarification"],
  OUT_OF_SCOPE: [T.faint, "#F1F4F9", "Out of Scope"],
  NO_PRODUCT_MATCH: [T.amber, T.amberBg, "No Match"],
};
const PRIORITY_META = {
  HIGH: [T.red, T.redBg, "High"],
  MEDIUM: [T.amber, T.amberBg, "Medium"],
  LOW: [T.faint, "#F1F4F9", "Low"],
};

function StatusBadge({ status }) {
  const key = normalizeStatus(status);
  const [c, b, label] = STATUS_META[key] || [T.sub, "#F1F4F9", prettyKey(key || "Unknown")];
  return <span style={badgeStyle(c, b)}>{label}</span>;
}
function PriorityBadge({ priority }) {
  const key = String(priority || "Medium").toUpperCase();
  const [c, b, label] = PRIORITY_META[key] || PRIORITY_META.MEDIUM;
  return <span style={badgeStyle(c, b)}>{label}</span>;
}

const NAV = [
  { key: "dashboard", label: "Dashboard", sub: "Overview & Analytics", icon: Home },
  { key: "queue", label: "Lead Queue", sub: "Triage & Operations", icon: Inbox },
  { key: "simulator", label: "What-If Simulator", sub: "Predictive Models", icon: SlidersHorizontal },
  { key: "agents", label: "AI Agents", sub: "Orchestration Control", icon: Bot },
  { key: "profile", label: "Profile", sub: "Harness Settings", icon: User },
];

const TITLES = {
  dashboard: "Sales Operations Dashboard",
  queue: "Lead Queue",
  simulator: "What-If Simulator",
  agents: "AI Agents Processing",
  profile: "Profile",
};
const SUBTITLES = {
  dashboard: "Real-time lead pipeline overview & agentic status",
  queue: "All inbound leads — triage, run the harness, inspect the full trace",
  simulator: "Recompute a deal or dealer match against policy in real time",
  agents: "Live manifest, router stats, and per-lead agent execution",
  profile: "Account settings and preferences",
};

/* ============================================================================
   API CONTEXT
============================================================================ */

const ApiContext = createContext(null);
function useApi() { return useContext(ApiContext); }
const DEFAULT_BASE = "http://localhost:5000";

function ApiProvider({ children }) {
  const [base, setBase] = useState(DEFAULT_BASE);
  const [status, setStatus] = useState("checking"); // checking | online | offline
  const [sessionId, setSessionId] = useState(null);
  const [leads, setLeads] = useState(FALLBACK_LEADS);
  const [usingFallback, setUsingFallback] = useState(true);
  const [catalog, setCatalog] = useState([]);
  const [distributors, setDistributors] = useState([]);
  const [manifest, setManifest] = useState(null);
  const [routerStats, setRouterStats] = useState(null);
  const [leadStates, setLeadStates] = useState({});
  const [leadTraces, setLeadTraces] = useState({});
  const [toast, setToast] = useState(null);

  const notify = useCallback((message, kind = "info") => {
    setToast({ message, kind, id: Date.now() });
  }, []);

  const request = useCallback(async (path, opts) => {
    try {
      return await apiRequest(base, path, opts);
    } catch (err) {
      setStatus("offline");
      throw err;
    }
  }, [base]);

  const bootstrap = useCallback(async () => {
    setStatus("checking");
    try {
      const [leadsRes, catalogRes, distRes] = await Promise.all([
        apiRequest(base, "/api/leads"),
        apiRequest(base, "/api/catalog"),
        apiRequest(base, "/api/distributors"),
      ]);
      setLeads(normalizeLeadList(leadsRes));
      setCatalog(Array.isArray(catalogRes) ? catalogRes : []);
      setDistributors(Array.isArray(distRes) ? distRes : []);
      setUsingFallback(false);
      setStatus("online");
      try {
        const sess = await apiRequest(base, "/api/sessions", { method: "POST" });
        setSessionId(sess.session_id);
      } catch (e) { /* session creation is best-effort */ }
      apiRequest(base, "/api/harness/manifest").then((m) => setManifest(m)).catch(() => {});
    } catch (err) {
      setUsingFallback(true);
      setLeads(FALLBACK_LEADS);
      setManifest(null);
      setStatus("offline");
    }
  }, [base]);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  useEffect(() => {
    if (status !== "online") return undefined;
    let cancelled = false;
    const poll = () => apiRequest(base, "/api/harness/router-stats")
      .then((d) => { if (!cancelled) setRouterStats(d); })
      .catch(() => {});
    poll();
    const id = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [base, status]);

  const processLead = useCallback(async (payload) => {
    const body = { ...payload, session_id: sessionId };
    const state = await request("/api/leads/process", { method: "POST", body: JSON.stringify(body) });
    const leadId = state.lead_id;
    setLeadStates((s) => ({ ...s, [leadId]: state }));
    setLeads((prev) => {
      const merged = mergeLeadFromState(state);
      const exists = prev.some((l) => l.id === leadId);
      return exists ? prev.map((l) => (l.id === leadId ? { ...l, ...merged } : l)) : [merged, ...prev];
    });
    return state;
  }, [request, sessionId]);

  const fetchTrace = useCallback(async (leadId) => {
    const data = await request(`/api/leads/${leadId}/trace`);
    setLeadTraces((s) => ({ ...s, [leadId]: data }));
    return data;
  }, [request]);

  const simulate = useCallback((payload) => (
    request("/api/simulate", { method: "POST", body: JSON.stringify(payload) })
  ), [request]);

  const value = {
    base, setBase, status, sessionId, leads, usingFallback,
    catalog, distributors, manifest, routerStats, leadStates, leadTraces,
    processLead, fetchTrace, simulate, bootstrap, notify, toast, setToast,
  };

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

/* ============================================================================
   SHARED UI PRIMITIVES
============================================================================ */

function Card({ children, style, ...rest }) {
  return (
    <div
      style={{
        background: "#fff", border: T.panelBorder, borderRadius: 18,
        padding: 22, boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

function SectionHead({ title, subtitle, right }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 12 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12.5, color: T.sub, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

function MiniLabel({ text, icon: Icon }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: T.faint, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6, fontWeight: 700 }}>
      {Icon && <Icon size={11} />} {text}
    </div>
  );
}

function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick} style={{ width: 40, height: 22, borderRadius: 999, border: "none", cursor: "pointer", background: on ? T.blue : "#E4E9F2", position: "relative", flexShrink: 0 }}>
      <span style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: 999, background: "#fff", transition: "left .15s" }} />
    </button>
  );
}

function Row({ icon: Icon, k, v, good }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.faint }}><Icon size={14} />{k}</span>
      <span style={{ fontWeight: 700, fontSize: 12.5, color: good ? T.green : T.text }}>{v}</span>
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, accent }) {
  return (
    <Card style={{ flex: "1 1 200px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 11.5, color: T.sub, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8 }}>{value}</div>
          {sub && <div style={{ fontSize: 11.5, color: accent || T.green, marginTop: 6, fontWeight: 600 }}>{sub}</div>}
        </div>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: T.blue, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={18} color="#fff" />
        </div>
      </div>
    </Card>
  );
}

function KeyValueList({ data, exclude = [] }) {
  if (!data || typeof data !== "object") return <div style={{ fontSize: 12, color: T.faint }}>No data yet.</div>;
  const entries = Object.entries(data).filter(([k]) => !exclude.includes(k));
  if (!entries.length) return <div style={{ fontSize: 12, color: T.faint }}>No data yet.</div>;
  return (
    <div>
      {entries.map(([k, v]) => {
        const isObj = v && typeof v === "object" && !Array.isArray(v);
        return (
          <div key={k} style={{ padding: "8px 0", borderBottom: "1px solid #EEF1F6" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 11.5, color: T.faint }}>{prettyKey(k)}</span>
              {!isObj && <span style={{ fontSize: 12.5, fontWeight: 600, textAlign: "right" }}>{formatValue(v)}</span>}
            </div>
            {isObj && (
              <div style={{ marginTop: 4, paddingLeft: 10, borderLeft: "2px solid #EEF1F6" }}>
                <KeyValueList data={v} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ExpandableJson({ label, data }) {
  const [open, setOpen] = useState(false);
  if (data == null || (typeof data === "object" && Object.keys(data).length === 0)) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={() => setOpen(!open)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: T.blueSolid, fontSize: 11, fontWeight: 700, padding: 0 }}>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {label}
      </button>
      {open && (
        <pre style={{ marginTop: 6, background: "#0F172A", color: "#D6E4FF", fontFamily: T.mono, fontSize: 11, padding: 10, borderRadius: 8, overflowX: "auto", maxHeight: 220 }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function TraceSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 52 }} />)}
    </div>
  );
}

/* ---------------------------------- Full agent trace ---------------------------------- */

function TraceTimeline({ trace, revealCount }) {
  const steps = trace.trace || [];
  const toolCalls = trace.tool_calls || [];
  const shown = revealCount != null ? steps.slice(0, revealCount) : steps;
  const toolsVisible = revealCount == null || revealCount >= steps.length;

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {shown.map((s, i) => (
          <div
            key={i}
            className="trace-step"
            style={{
              animationDelay: `${i * 20}ms`, display: "flex", gap: 12, padding: "12px 14px",
              borderRadius: 12, border: T.panelBorder, background: s.ok === false ? T.redBg : "#FAFCFF",
            }}
          >
            <div style={{
              width: 26, height: 26, borderRadius: 999, flexShrink: 0,
              background: s.ok === false ? T.red : T.blueSolid, color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800,
            }}
            >
              {i + 1}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{s.agent}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: T.faint }}>{s.duration_ms != null ? `${s.duration_ms}ms` : ""}</span>
                  {s.ok === false ? <XCircle size={14} color={T.red} /> : <CheckCircle2 size={14} color={T.green} />}
                </div>
              </div>
              {s.note && <div style={{ fontSize: 12, color: T.sub, marginTop: 3 }}>{s.note}</div>}
              {Array.isArray(s.hook_events) && s.hook_events.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {s.hook_events.map((h, hi) => {
                    const emphasize = h.event === "subagent_spawn" || h.event === "handoff";
                    return (
                      <span key={hi} style={badgeStyle(emphasize ? T.purple : T.faint, emphasize ? T.purpleBg : "#F1F4F9")}>
                        {h.stage ? `${h.stage} · ` : ""}{h.event}{h.tokens != null ? ` · ${h.tokens}tok` : ""}
                      </span>
                    );
                  })}
                </div>
              )}
              {s.output && <ExpandableJson label="Output" data={s.output} />}
            </div>
          </div>
        ))}
        {revealCount != null && revealCount < steps.length && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.faint, fontSize: 12 }}>
            <Loader2 size={13} style={{ animation: "spin .8s linear infinite" }} /> Replaying next agent step…
          </div>
        )}
      </div>

      {toolCalls.length > 0 && toolsVisible && (
        <div style={{ marginTop: 18 }}>
          <MiniLabel text="Tool calls" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {toolCalls.map((tc, i) => (
              <div key={i} className="trace-step" style={{ animationDelay: `${i * 30}ms`, display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10, background: "#FAFCFF", border: T.panelBorder }}>
                <Wrench size={14} color={T.teal} style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700 }}>{tc.tool}</span>
                    {tc.result_ok === false ? <XCircle size={13} color={T.red} /> : <CheckCircle2 size={13} color={T.green} />}
                  </div>
                  <div style={{ fontSize: 11, color: T.faint }}>invoked by {tc.invoked_by}</div>
                  {(tc.args || tc.result) && <ExpandableJson label="Args / Result" data={{ args: tc.args, result: tc.result }} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!steps.length && <div style={{ fontSize: 12.5, color: T.faint, padding: "14px 0", textAlign: "center" }}>No trace steps recorded for this run.</div>}
    </div>
  );
}

/* ---------------------------------- Toast ---------------------------------- */

function ToastHost() {
  const api = useApi();
  useEffect(() => {
    if (!api.toast) return undefined;
    const t = setTimeout(() => api.setToast(null), 4000);
    return () => clearTimeout(t);
  }, [api.toast]);
  if (!api.toast) return null;
  const { message, kind } = api.toast;
  const color = kind === "error" ? T.red : kind === "success" ? T.green : T.blueSolid;
  const Icon = kind === "error" ? XCircle : kind === "success" ? CheckCircle2 : Info;
  return (
    <div className="toast-in" style={{ position: "fixed", top: 20, right: 20, zIndex: 100, display: "flex", alignItems: "center", gap: 10, background: "#fff", border: `1px solid ${color}44`, boxShadow: "0 10px 30px rgba(16,24,40,0.15)", borderRadius: 12, padding: "12px 16px", maxWidth: 360 }}>
      <Icon size={16} color={color} />
      <span style={{ fontSize: 12.5, color: T.text }}>{message}</span>
      <button onClick={() => api.setToast(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: T.faint }}><X size={14} /></button>
    </div>
  );
}

function OfflineBanner() {
  const api = useApi();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: T.amberBg, border: `1px solid ${T.amber}33`, borderRadius: 12, padding: "10px 16px", marginBottom: 20, fontSize: 12.5, color: "#8A5A00" }}>
      <WifiOff size={15} />
      <span style={{ flex: 1 }}>Showing demo data — couldn't reach <b>{api.base}</b>. Start the Flask backend and check CORS, then retry.</span>
      <button onClick={api.bootstrap} style={{ background: "#fff", border: `1px solid ${T.amber}55`, color: "#8A5A00", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
        <RefreshCw size={12} /> Retry
      </button>
    </div>
  );
}

/* ============================================================================
   NEW LEAD PORTAL (modal)
============================================================================ */

function NewLeadModal({ open, onClose, onProcessed }) {
  const api = useApi();
  const [rawText, setRawText] = useState("");
  const [leadId, setLeadId] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [trace, setTrace] = useState(null);
  const [revealCount, setRevealCount] = useState(0);

  useEffect(() => {
    if (!open) {
      setRawText(""); setLeadId(""); setLat(""); setLng("");
      setSubmitting(false); setResult(null); setError(null); setTrace(null); setRevealCount(0);
    }
  }, [open]);

  useEffect(() => {
    if (!trace || !trace.trace || !trace.trace.length) return undefined;
    setRevealCount(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setRevealCount(i);
      if (i >= trace.trace.length) clearInterval(id);
    }, 420);
    return () => clearInterval(id);
  }, [trace]);

  if (!open) return null;

  const submit = async () => {
    if (!rawText.trim()) { setError("Describe the lead before submitting."); return; }
    setSubmitting(true); setError(null); setResult(null); setTrace(null);
    try {
      const payload = { raw_text: rawText.trim() };
      if (leadId.trim()) payload.lead_id = leadId.trim();
      if (lat) payload.customer_lat = Number(lat);
      if (lng) payload.customer_lng = Number(lng);
      const state = await api.processLead(payload);
      setResult(state);
      api.notify(`${state.lead_id} processed — status ${prettyKey(normalizeStatus(state.status || "unknown"))}`, "success");
      try {
        const tr = await api.fetchTrace(state.lead_id);
        setTrace(tr);
      } catch (e) { /* trace is optional */ }
    } catch (e) {
      setError(e.message || "Something went wrong while processing this lead.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,0.35)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 20px", zIndex: 80, overflowY: "auto" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-pop" style={{ width: "min(760px, 100%)", background: "#fff", borderRadius: 20, border: T.panelBorder, boxShadow: "0 24px 60px rgba(16,24,40,0.22)", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: T.panelBorder }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: T.blue, display: "flex", alignItems: "center", justifyContent: "center" }}><Plus size={18} color="#fff" /></div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>New Lead Intake</div>
              <div style={{ fontSize: 11.5, color: T.sub }}>POST /api/leads/process — runs the live agent harness</div>
            </div>
          </div>
          <button onClick={onClose} style={iconBtnStyle}><X size={18} /></button>
        </div>

        <div style={{ padding: 24 }}>
          {!result && (
            <>
              <MiniLabel text="Raw lead text" />
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={4}
                placeholder="e.g. Need 4 new tyres for a Hyundai Creta, prefers high comfort and wet grip."
                style={{ ...textAreaStyle, marginBottom: 16 }}
              />
              <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 160px" }}>
                  <MiniLabel text="Lead ID (optional)" />
                  <input value={leadId} onChange={(e) => setLeadId(e.target.value)} placeholder="auto-generated if blank" style={inputStyle} />
                </div>
                <div style={{ flex: "1 1 140px" }}>
                  <MiniLabel text="Customer latitude" />
                  <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="18.5204" style={inputStyle} />
                </div>
                <div style={{ flex: "1 1 140px" }}>
                  <MiniLabel text="Customer longitude" />
                  <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="73.8567" style={inputStyle} />
                </div>
              </div>

              {error && <div style={{ ...errorBoxStyle, marginBottom: 16 }}><AlertTriangle size={15} /> {error}</div>}

              <button onClick={submit} disabled={submitting} style={{ ...primaryBtnStyle, width: "100%", opacity: submitting ? 0.75 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {submitting ? <><Loader2 size={16} style={{ animation: "spin 0.8s linear infinite" }} /> Running the harness…</> : <><Send size={15} /> Process lead</>}
              </button>
            </>
          )}

          {result && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{result.lead_id}</div>
                  <div style={{ fontSize: 12, color: T.sub }}>Harness run complete</div>
                </div>
                <StatusBadge status={result.status} />
              </div>
              {trace ? (
                <TraceTimeline trace={trace} revealCount={revealCount} />
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.sub, fontSize: 12.5 }}>
                  <Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> Loading trace…
                </div>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                <button onClick={() => { setResult(null); setTrace(null); setRawText(""); }} style={{ ...secondaryBtnStyle, flex: 1 }}>Process another lead</button>
                <button onClick={() => { onProcessed(result.lead_id); onClose(); }} style={{ ...primaryBtnStyle, flex: 1 }}>Done — view in queue</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   SIDEBAR / TOPBAR
============================================================================ */

function Sidebar({ tab, setTab }) {
  return (
    <div style={{ width: 250, flexShrink: 0, borderRight: "1px solid #E9EDF4", padding: "26px 18px", display: "flex", flexDirection: "column", background: "#fff" }}>
      <div style={{ padding: "0 8px 26px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 800, letterSpacing: 0.2, color: T.text }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: T.blue, boxShadow: `0 0 12px ${T.blueSolid}66` }} />
          MICHELIN CONVERGE
        </div>
        <div style={{ fontSize: 10.5, color: T.faint, letterSpacing: 1.2, marginTop: 4, marginLeft: 16 }}>AGENTIC AI HARNESS</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {NAV.map((n) => {
          const Icon = n.icon;
          const isActive = tab === n.key;
          return (
            <button
              key={n.key}
              onClick={() => setTab(n.key)}
              style={{
                display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                padding: "11px 12px", borderRadius: 12, border: "none", cursor: "pointer",
                background: isActive ? T.blue : "transparent",
                color: isActive ? "#fff" : T.sub,
                fontFamily: T.font, transition: "background .15s",
              }}
            >
              <Icon size={17} strokeWidth={2} />
              <span>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: isActive ? "#fff" : T.text }}>{n.label}</div>
                <div style={{ fontSize: 10.5, color: isActive ? "rgba(255,255,255,0.8)" : T.faint }}>{n.sub}</div>
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", fontSize: 10.5, color: T.faint, padding: "0 8px" }}>
        <span>System Version</span>
        <span style={{ ...badgeStyle(T.blueSolid, "rgba(15,98,214,0.10)"), padding: "1px 8px" }}>v3.0.0</span>
      </div>
    </div>
  );
}

function TopBar({ active, onNewLead }) {
  const api = useApi();
  const [showSettings, setShowSettings] = useState(false);
  const [draftBase, setDraftBase] = useState(api.base);
  useEffect(() => { setDraftBase(api.base); }, [api.base]);

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 26, position: "relative", flexWrap: "wrap", gap: 14 }}>
      <div>
        <div style={{ fontSize: 21, fontWeight: 800 }}>{TITLES[active.key] || active.label}</div>
        <div style={{ fontSize: 12.5, color: T.sub, marginTop: 3 }}>{SUBTITLES[active.key]}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onNewLead} style={{ ...primaryBtnStyle, display: "flex", alignItems: "center", gap: 7 }}>
          <Plus size={15} /> New Lead
        </button>
        <div style={{ position: "relative" }}>
          <button onClick={() => setShowSettings((s) => !s)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 13px", borderRadius: 12, background: "#fff", border: T.panelBorder, fontSize: 12, color: T.sub, cursor: "pointer" }}>
            {api.status === "online" ? <Wifi size={14} color={T.green} /> : api.status === "checking" ? <Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> : <WifiOff size={14} color={T.red} />}
            {api.status === "online" ? "Connected" : api.status === "checking" ? "Checking…" : "Offline"}
          </button>
          {showSettings && (
            <div className="modal-pop" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 300, background: "#fff", border: T.panelBorder, borderRadius: 14, boxShadow: "0 16px 40px rgba(16,24,40,0.16)", padding: 16, zIndex: 60 }}>
              <MiniLabel text="API base URL" />
              <input value={draftBase} onChange={(e) => setDraftBase(e.target.value)} style={inputStyle} />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={() => api.setBase(draftBase)} style={{ ...primaryBtnStyle, flex: 1, padding: "8px 12px", fontSize: 12 }}>Save & reconnect</button>
                <button onClick={api.bootstrap} style={{ ...secondaryBtnStyle, padding: "8px 12px", fontSize: 12 }}><RefreshCw size={13} /></button>
              </div>
              {api.sessionId && <div style={{ fontSize: 10.5, color: T.faint, marginTop: 10 }}>Session: {api.sessionId}</div>}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, paddingLeft: 6 }}>
          <div style={{ width: 34, height: 34, borderRadius: 999, background: T.blue, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12.5, color: "#fff" }}>SO</div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.2 }}>Michelin Lead Harness</div>
            <div style={{ fontSize: 10.5, color: T.faint }}>Administrator</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   DASHBOARD
============================================================================ */

function DashboardView({ setTab, onSelectLead }) {
  const api = useApi();
  const leads = api.leads;
  const total = leads.length;
  const highPriority = leads.filter((l) => l.priority === "High").length;
  const inReview = leads.filter((l) => ["ESCALATED", "SECURITY_BLOCK", "NEEDS_CLARIFICATION"].includes(l.status)).length;
  const avgScore = total ? Math.round(leads.reduce((s, l) => s + (l.score || 0), 0) / total) : 0;

  const latestTrace = useMemo(() => {
    const entries = Object.values(api.leadTraces);
    return entries.length ? entries[entries.length - 1] : null;
  }, [api.leadTraces]);

  const processingRows = latestTrace
    ? (latestTrace.trace || []).map((t) => ({
      name: t.agent,
      ms: t.duration_ms || 0,
      max: Math.max(...(latestTrace.trace || []).map((x) => x.duration_ms || 0), 100),
    }))
    : PROCESSING_TIME_DEMO;

  return (
    <>
      <Card style={{ marginBottom: 20, background: "linear-gradient(120deg, rgba(15,98,214,0.08), rgba(13,148,136,0.05))" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>Welcome back, Sales Team</div>
            <div style={{ fontSize: 12.5, color: T.sub, marginTop: 4 }}>
              {total} lead{total === 1 ? "" : "s"} in the pipeline. {highPriority} high-priority lead{highPriority === 1 ? "" : "s"} need attention.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: api.status === "online" ? T.green : T.amber }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: api.status === "online" ? T.green : T.amber, animation: "pulseDot 1.6s infinite" }} />
              {api.status === "online" ? "Harness online" : "Demo mode"}
            </span>
            <button onClick={() => setTab("queue")} style={primaryBtnStyle}>Open Lead Queue</button>
          </div>
        </div>
      </Card>

      <div style={{ display: "flex", gap: 18, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard label="Total Leads" value={total} sub={api.usingFallback ? "Demo data" : "Live from harness"} icon={Inbox} />
        <StatCard label="High Priority" value={highPriority} sub={`${highPriority} waiting`} icon={AlertTriangle} accent={T.red} />
        <StatCard label="In Review" value={inReview} sub={`${inReview} need review`} icon={ShieldAlert} accent={T.amber} />
        <StatCard label="Avg Lead Score" value={`${avgScore}/100`} sub={avgScore >= 60 ? "Strong leads" : "Mixed quality"} icon={Gauge} />
      </div>

      <div style={{ display: "flex", gap: 18, marginBottom: 20, flexWrap: "wrap" }}>
        <Card style={{ flex: "1.3 1 380px" }}>
          <SectionHead title="Lead Conversion Rate" subtitle="7-day trend (demo series)" right={<div style={{ fontSize: 20, fontWeight: 800, color: T.green }}>68% <span style={{ fontSize: 11.5 }}>↑ 4.2%</span></div>} />
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={CONVERSION_TREND_DEMO}>
              <CartesianGrid stroke="#EEF1F6" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: T.faint, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis hide domain={[40, 90]} />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #E4E9F2", borderRadius: 10, fontSize: 12 }} labelStyle={{ color: T.text }} />
              <Line type="monotone" dataKey="rate" stroke={T.cyan} strokeWidth={2.5} dot={{ r: 3, fill: T.cyan }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card style={{ flex: "1 1 300px" }}>
          <SectionHead title="Agent Processing Time" subtitle={latestTrace ? "Most recently processed lead" : "Demo latency per node (ms)"} right={<StatusBadge status={latestTrace ? "COMPLETE" : "QUEUED"} />} />
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {processingRows.map((p) => (
              <div key={p.name}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.sub, marginBottom: 6 }}>
                  <span>{p.name}</span><span style={{ color: T.text, fontWeight: 600 }}>{p.ms}ms</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: "#EEF1F6" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, (p.ms / p.max) * 100)}%`, borderRadius: 999, background: T.blue, transition: "width .5s ease" }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <SectionHead
          title="Active Lead Pipeline"
          subtitle={`${Math.min(5, total)} of ${total} leads listed below`}
          right={<button onClick={() => setTab("queue")} style={{ background: "none", border: "none", color: T.blueSolid, fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: T.font }}>View all <ChevronRight size={14} /></button>}
        />
        <LeadTable leads={leads.slice(0, 5)} compact onSelect={onSelectLead} />
      </Card>
    </>
  );
}

/* ---------------------------------- Shared lead table ---------------------------------- */

function LeadTable({ leads, onSelect, selectedId, compact }) {
  if (!leads.length) {
    return <div style={{ padding: "30px 0", textAlign: "center", color: T.faint, fontSize: 12.5 }}>No leads yet — use New Lead to run the harness.</div>;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table>
        <thead>
          <tr style={{ borderBottom: "1px solid #EEF1F6" }}>
            {["ID", "Customer", "Raw Input", "Score", "Priority", "Status", ""].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "0 10px 10px", fontSize: 11, color: T.faint, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr
              key={l.id}
              onClick={() => onSelect && onSelect(l.id)}
              style={{ borderBottom: "1px solid #F3F5F9", cursor: onSelect ? "pointer" : "default", background: selectedId === l.id ? "rgba(15,98,214,0.05)" : "transparent", transition: "background .15s" }}
            >
              <td style={{ padding: "12px 10px", fontSize: 12.5, fontWeight: 700, color: T.blueSolid }}>{l.id}</td>
              <td style={{ padding: "12px 10px" }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{l.customer}</div>
                <div style={{ fontSize: 11, color: T.faint }}>{l.meta || "—"}</div>
              </td>
              <td style={{ padding: "12px 10px", fontSize: 12, color: T.sub, maxWidth: compact ? 260 : 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: compact ? "nowrap" : "normal" }}>{l.raw || "—"}</td>
              <td style={{ padding: "12px 10px" }}>
                <div style={{ width: 34, height: 34, borderRadius: 999, border: `2px solid ${l.score >= 70 ? T.green : l.score >= 50 ? T.amber : T.red}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 700 }}>{l.score}</div>
              </td>
              <td style={{ padding: "12px 10px" }}><PriorityBadge priority={l.priority} /></td>
              <td style={{ padding: "12px 10px" }}><StatusBadge status={l.status} /></td>
              <td style={{ padding: "12px 10px" }}>{!compact && <ChevronRight size={16} color={T.faint} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ============================================================================
   LEAD QUEUE
============================================================================ */

function FilterDropdown({ label, value, options, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: "9px 12px", borderRadius: 12, background: "#F7F9FC", border: T.panelBorder, fontSize: 12, color: T.sub, fontFamily: T.font }}>
      {options.map((o) => <option key={o} value={o}>{label}: {o}</option>)}
    </select>
  );
}

function QueueView({ selectedLeadId, setSelectedLeadId, onNewLead }) {
  const api = useApi();
  const leads = api.leads;
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [running, setRunning] = useState(false);
  const [showTrace, setShowTrace] = useState(false);

  useEffect(() => {
    if (!selectedLeadId && leads.length) setSelectedLeadId(leads[0].id);
  }, [leads, selectedLeadId, setSelectedLeadId]);

  const filtered = leads.filter((l) => {
    if (statusFilter !== "All" && l.status !== statusFilter) return false;
    if (priorityFilter !== "All" && l.priority !== priorityFilter) return false;
    if (query && !(`${l.id} ${l.customer} ${l.raw}`.toLowerCase().includes(query.toLowerCase()))) return false;
    return true;
  });

  const lead = leads.find((l) => l.id === selectedLeadId) || leads[0];
  const state = lead ? api.leadStates[lead.id] : null;
  const trace = lead ? api.leadTraces[lead.id] : null;

  const runPipeline = async () => {
    if (!lead) return;
    setRunning(true);
    try {
      await api.processLead({ raw_text: lead.raw, lead_id: lead.id });
      api.notify(`${lead.id} run through the harness`, "success");
    } catch (e) {
      api.notify(e.message || "Couldn't process this lead", "error");
    } finally {
      setRunning(false);
    }
  };

  const loadTrace = async () => {
    if (!lead) return;
    setShowTrace((v) => !v);
    if (api.leadTraces[lead.id]) return;
    try { await api.fetchTrace(lead.id); } catch (e) { api.notify(e.message || "No trace available yet — run the pipeline first.", "error"); }
  };

  const statusOptions = ["All", ...Array.from(new Set(leads.map((l) => l.status)))];
  const priorityOptions = ["All", "High", "Medium", "Low"];

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
      <Card style={{ flex: "1.6 1 480px" }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 180px", display: "flex", alignItems: "center", gap: 8, background: "#F7F9FC", border: T.panelBorder, borderRadius: 12, padding: "9px 14px" }}>
            <Search size={15} color={T.faint} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search leads..." style={{ background: "none", border: "none", outline: "none", color: T.text, fontSize: 13, width: "100%", fontFamily: T.font }} />
          </div>
          <FilterDropdown label="Status" value={statusFilter} options={statusOptions} onChange={setStatusFilter} />
          <FilterDropdown label="Priority" value={priorityFilter} options={priorityOptions} onChange={setPriorityFilter} />
          <button onClick={onNewLead} style={{ ...primaryBtnStyle, display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", fontSize: 12.5 }}><Plus size={14} /> New Lead</button>
        </div>
        <LeadTable leads={filtered} onSelect={setSelectedLeadId} selectedId={lead?.id} />
        <div style={{ fontSize: 11.5, color: T.faint, marginTop: 12 }}>Showing {filtered.length} of {leads.length} entries</div>
      </Card>

      <Card style={{ flex: "1 1 320px", minWidth: 300 }}>
        {!lead ? (
          <div style={{ fontSize: 12.5, color: T.faint, padding: "20px 0", textAlign: "center" }}>No lead selected.</div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Lead Details</div>
                <div style={{ fontSize: 11.5, color: T.faint }}>{lead.id} · {lead.customer}</div>
              </div>
              <div style={{ width: 40, height: 40, borderRadius: 999, border: `2px solid ${T.green}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{lead.score}</div>
            </div>
            <div style={{ display: "flex", gap: 6, margin: "14px 0 18px" }}>
              <PriorityBadge priority={lead.priority} />
              <StatusBadge status={lead.status} />
            </div>

            <MiniLabel text="Raw Input" />
            <div style={{ fontSize: 12.5, color: T.sub, background: "#F7F9FC", border: T.panelBorder, borderRadius: 10, padding: 12, marginBottom: 16, lineHeight: 1.5 }}>
              {lead.raw ? `“${lead.raw}”` : "No raw text on file for this lead."}
            </div>

            {state ? (
              <>
                {state.recommendation && (
                  <div style={{ border: T.panelBorder, borderRadius: 12, padding: 14, marginBottom: 14, background: "rgba(15,98,214,0.05)" }}>
                    <MiniLabel text="Product Recommendation" />
                    <KeyValueList data={state.recommendation} />
                  </div>
                )}
                {state.deal && (
                  <div style={{ marginBottom: 14 }}>
                    <MiniLabel text="Deal" />
                    <KeyValueList data={state.deal} />
                  </div>
                )}
                {state.dealer && (
                  <div style={{ marginBottom: 14 }}>
                    <MiniLabel text="Dealer Allocation" icon={MapPin} />
                    <KeyValueList data={state.dealer} />
                  </div>
                )}
                {state.security && (
                  <div style={{ marginBottom: 14 }}>
                    <MiniLabel text="Security" icon={ShieldCheck} />
                    <KeyValueList data={state.security} />
                  </div>
                )}

                <button onClick={loadTrace} style={{ ...secondaryBtnStyle, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 }}>
                  <Activity size={15} /> {showTrace ? "Hide" : "View"} full agent trace
                </button>

                {showTrace && (
                  <div style={{ marginTop: 14 }}>
                    {trace ? <TraceTimeline trace={trace} /> : <TraceSkeleton />}
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "12px 0" }}>
                <div style={{ fontSize: 12.5, color: T.faint, marginBottom: 12 }}>This lead hasn't been run through the agent harness in this session yet.</div>
                <button onClick={runPipeline} disabled={running} style={{ ...primaryBtnStyle, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: running ? 0.75 : 1 }}>
                  {running ? <><Loader2 size={15} style={{ animation: "spin .8s linear infinite" }} /> Running…</> : <><PlayCircle size={15} /> Run agent pipeline</>}
                </button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

/* ============================================================================
   AI AGENTS
============================================================================ */

function AgentsView() {
  const api = useApi();
  const [openManifest, setOpenManifest] = useState(true);
  const manifestRows = (api.manifest && api.manifest.agents) || MANIFEST_DEMO;
  const usingLiveManifest = !!api.manifest;

  const latestTraceEntry = useMemo(() => {
    const ids = Object.keys(api.leadTraces);
    if (!ids.length) return null;
    const id = ids[ids.length - 1];
    return { id, data: api.leadTraces[id] };
  }, [api.leadTraces]);

  const pipelineSteps = latestTraceEntry
    ? (latestTraceEntry.data.trace || []).map((t) => ({ name: t.agent, ms: t.duration_ms, ok: t.ok }))
    : null;

  const processingQueue = api.leads.filter((l) => l.status === "PROCESSING");

  const securityFeed = useMemo(() => {
    const items = [];
    Object.entries(api.leadStates).forEach(([id, st]) => {
      if (st.security) items.push({ id, ...normalizeSecurityEntry(st.security) });
    });
    return items.length ? items.reverse() : null;
  }, [api.leadStates]);

  const displaySteps = pipelineSteps || PIPELINE_STAGES_DEMO;

  return (
    <>
      <Card style={{ marginBottom: 20 }}>
        <SectionHead
          title="Live Agent Pipeline Execution"
          subtitle={latestTraceEntry ? `Most recent run — ${latestTraceEntry.id}` : "No lead processed yet in this session — showing a demo sequence"}
          right={<StatusBadge status={latestTraceEntry ? "COMPLETE" : "QUEUED"} />}
        />
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
          {displaySteps.map((s, i, arr) => {
            const done = pipelineSteps ? true : s.state === "done";
            const active = pipelineSteps ? false : s.state === "active";
            const ok = pipelineSteps ? s.ok !== false : true;
            const color = !ok ? T.red : done ? T.green : active ? T.blueSolid : T.faint;
            const bg = !ok ? T.redBg : done ? T.greenBg : active ? "rgba(15,98,214,0.08)" : "#F7F9FC";
            return (
              <React.Fragment key={`${s.name}-${i}`}>
                <div style={{ flex: "1 1 108px", minWidth: 108, border: `1px solid ${color}44`, background: bg, borderRadius: 12, padding: "12px 10px", textAlign: "left" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    {ok ? <CheckCircle2 size={14} color={color} /> : <XCircle size={14} color={color} />}
                    {active && <span style={{ width: 6, height: 6, borderRadius: 999, background: T.blueSolid, animation: "pulseDot 1.2s infinite" }} />}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.25 }}>{s.name}</div>
                  <div style={{ fontSize: 10.5, color: T.faint, marginTop: 4 }}>{s.ms != null ? `${s.ms}ms` : "queued"}</div>
                </div>
                {i < arr.length - 1 && <ArrowRight size={14} color={T.faint} style={{ margin: "0 6px", flexShrink: 0 }} />}
              </React.Fragment>
            );
          })}
        </div>
      </Card>

      <div style={{ display: "flex", gap: 20, marginBottom: 20, flexWrap: "wrap" }}>
        <Card style={{ flex: "1.4 1 400px" }}>
          <SectionHead title="Active Processing Queue" subtitle={api.usingFallback ? "Demo data" : "Leads currently mid-pipeline"} />
          {processingQueue.length ? (
            <table>
              <thead>
                <tr style={{ borderBottom: "1px solid #EEF1F6" }}>
                  {["Lead ID", "Customer", "Status", "Score"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "0 8px 10px", fontSize: 10.5, color: T.faint, textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {processingQueue.map((q) => (
                  <tr key={q.id} style={{ borderBottom: "1px solid #F3F5F9" }}>
                    <td style={{ padding: "11px 8px", color: T.blueSolid, fontWeight: 700, fontSize: 12.5 }}>{q.id}</td>
                    <td style={{ padding: "11px 8px", fontSize: 12.5 }}>{q.customer}</td>
                    <td style={{ padding: "11px 8px" }}><StatusBadge status={q.status} /></td>
                    <td style={{ padding: "11px 8px", fontSize: 12.5, color: T.sub }}>{q.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ fontSize: 12.5, color: T.faint, padding: "20px 0", textAlign: "center" }}>No leads currently mid-pipeline. Process a lead to see it here.</div>
          )}
        </Card>

        <Card style={{ flex: "1 1 300px" }}>
          <SectionHead title="Security & Compliance Monitor" right={<span style={{ fontSize: 11, color: T.green, display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: T.green }} /> Circuit: CLOSED</span>} />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {(securityFeed || SECURITY_FEED_DEMO).map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 10 }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: s.level === "red" ? T.red : s.level === "amber" ? T.amber : T.green, marginTop: 6, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{s.id}: <span style={{ color: s.level === "red" ? T.red : s.level === "amber" ? T.amber : T.green }}>{s.tag}</span></div>
                  <div style={{ fontSize: 11.5, color: T.sub }}>{s.detail}</div>
                  {s.when && <div style={{ fontSize: 10.5, color: T.faint }}>{s.when}</div>}
                </div>
              </div>
            ))}
          </div>
          {api.routerStats && (
            <div style={{ fontSize: 11, color: T.faint, marginTop: 14, borderTop: "1px solid #EEF1F6", paddingTop: 12 }}>
              <KeyValueList data={api.routerStats} />
            </div>
          )}
        </Card>
      </div>

      <Card>
        <SectionHead
          title="Harness Manifest"
          subtitle={usingLiveManifest ? "Live — GET /api/harness/manifest" : "Demo manifest — couldn't reach the harness"}
          right={
            <button onClick={() => setOpenManifest(!openManifest)} style={{ background: "none", border: "none", color: T.sub, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: T.font, fontSize: 12 }}>
              {openManifest ? "Collapse" : "Expand"} <ChevronDown size={14} style={{ transform: openManifest ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
            </button>
          }
        />
        {openManifest && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {manifestRows.map((m, i) => (
              <div key={m.name || i} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10, background: "#F7F9FC" }}>
                <Cpu size={15} color={T.faint} style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{m.name}</span>
                    {m.tier && <span style={{ ...badgeStyle(String(m.tier).includes("reasoning") ? T.purple : T.blueSolid, "#F1F4F9"), padding: "1px 8px", fontSize: 10 }}>{m.tier}</span>}
                  </div>
                  {m.role && <div style={{ fontSize: 12, color: T.sub, marginTop: 3 }}>{m.role}</div>}
                  {(m.tools_description || m.tools) && <div style={{ fontSize: 11, color: T.faint, marginTop: 3 }}>{m.tools_description || m.tools}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

/* ============================================================================
   WHAT-IF SIMULATOR
============================================================================ */

function SimulatorView() {
  const api = useApi();
  const leads = api.leads;
  const [leadId, setLeadId] = useState("");
  useEffect(() => { if (!leadId && leads.length) setLeadId(leads[0].id); }, [leads, leadId]);
  const [sku, setSku] = useState("");
  const [budget, setBudget] = useState(30000);
  const [discount, setDiscount] = useState(6);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const run = async () => {
    if (!leadId) { setError("Process at least one lead first."); return; }
    setLoading(true); setError(null);
    try {
      const payload = { lead_id: leadId, budget: Number(budget), requested_discount_pct: Number(discount) };
      if (sku) payload.recommended_sku = sku;
      if (lat) payload.customer_lat = Number(lat);
      if (lng) payload.customer_lng = Number(lng);
      const res = await api.simulate(payload);
      setResult(res);
    } catch (e) {
      setError(e.message || "Simulation failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
      <Card style={{ flex: "1 1 340px" }}>
        <SectionHead title="Simulation Inputs" subtitle="Recomputes the deal and dealer match without touching the live queue" />
        <MiniLabel text="Lead" />
        <select value={leadId} onChange={(e) => setLeadId(e.target.value)} style={{ ...inputStyle, marginBottom: 18 }}>
          {leads.map((l) => <option key={l.id} value={l.id}>{l.id} — {l.customer}</option>)}
        </select>

        <MiniLabel text="Recommended SKU (optional)" />
        <select value={sku} onChange={(e) => setSku(e.target.value)} style={{ ...inputStyle, marginBottom: 18 }}>
          <option value="">Use current recommendation</option>
          {api.catalog.map((c, i) => {
            const id = pick(c, ["id", "sku"], `SKU-${i}`);
            const name = pick(c, ["name", "title"], id);
            return <option key={id} value={id}>{name}</option>;
          })}
        </select>

        <MiniLabel text={`Budget — ₹${Number(budget).toLocaleString("en-IN")}`} />
        <input type="range" min={5000} max={80000} step={500} value={budget} onChange={(e) => setBudget(e.target.value)} style={{ width: "100%", accentColor: T.blueSolid, marginBottom: 18 }} />

        <MiniLabel text={`Requested Discount — ${discount}%`} />
        <input type="range" min={0} max={30} value={discount} onChange={(e) => setDiscount(e.target.value)} style={{ width: "100%", accentColor: T.blueSolid, marginBottom: 18 }} />

        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1 }}><MiniLabel text="Customer lat" /><input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="optional" style={inputStyle} /></div>
          <div style={{ flex: 1 }}><MiniLabel text="Customer lng" /><input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="optional" style={inputStyle} /></div>
        </div>

        {error && <div style={{ ...errorBoxStyle, marginBottom: 14 }}><AlertTriangle size={15} /> {error}</div>}

        <button onClick={run} disabled={loading} style={{ ...primaryBtnStyle, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: loading ? 0.75 : 1 }}>
          {loading ? <><Loader2 size={15} style={{ animation: "spin .8s linear infinite" }} /> Recomputing…</> : <><Zap size={15} /> Run simulation</>}
        </button>
      </Card>

      <Card style={{ flex: "1 1 340px" }}>
        <SectionHead title="Recomputed Outcome" subtitle="POST /api/simulate" />
        {!result ? (
          <div style={{ fontSize: 12.5, color: T.faint, padding: "24px 0", textAlign: "center" }}>Run a simulation to see the recomputed deal and dealer match.</div>
        ) : (
          <div key={JSON.stringify(result).length} className="view-enter">
            <div style={{ display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 140px" }}>
                <MiniLabel text="Current Deal" />
                <KeyValueList data={result.current && result.current.deal} />
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <MiniLabel text="Simulated Deal" />
                <KeyValueList data={result.simulated && result.simulated.deal} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 140px" }}>
                <MiniLabel text="Current Dealer" />
                <KeyValueList data={result.current && result.current.dealer} />
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <MiniLabel text="Simulated Dealer" />
                <KeyValueList data={result.simulated && result.simulated.dealer} />
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ============================================================================
   PROFILE
============================================================================ */

function ProfileView() {
  const api = useApi();
  const [prefs, setPrefs] = useState({ email: true, sms: true, digest: false, escalation: true });
  const toggle = (k) => setPrefs((p) => ({ ...p, [k]: !p[k] }));

  return (
    <>
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <div style={{ width: 58, height: 58, borderRadius: 999, background: T.blue, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, color: "#fff" }}>SO</div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800 }}>Sales Operator</div>
              <div style={{ fontSize: 12.5, color: T.blueSolid, fontWeight: 600 }}>Senior Sales Manager — Michelin India</div>
              <div style={{ fontSize: 11.5, color: T.faint }}>sales.ops@michelin.com · Member since Jan 2024</div>
            </div>
          </div>
          <button style={{ ...primaryBtnStyle }}>Edit Profile</button>
        </div>
      </Card>

      <div style={{ display: "flex", gap: 20, marginBottom: 20, flexWrap: "wrap" }}>
        <Card style={{ flex: "1.3 1 380px" }}>
          <SectionHead title="Personal Information" />
          {[["Full Name", "Sales Operator"], ["Email Address", "sales.ops@michelin.com"], ["Phone Number", "+91 98765 43210"], ["Department", "Sales Operations"], ["Assigned Region", "India — West"], ["System Timezone", "IST (UTC+5:30)"]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #F1F4F9", fontSize: 12.5 }}>
              <span style={{ color: T.faint }}>{k}</span><span style={{ fontWeight: 600 }}>{v}</span>
            </div>
          ))}

          <div style={{ marginTop: 22 }}>
            <SectionHead title="Notification Preferences" />
            {[["email", "Email Notifications", "Primary communications & reports"], ["sms", "SMS Alerts for High Priority", "Critical pipeline triggers"], ["digest", "Daily Digest Report", "Summary dispatch statistics"], ["escalation", "System Escalation Alerts", "Human-in-the-loop triggers"]].map(([key, title, sub]) => (
              <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #F1F4F9" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
                  <div style={{ fontSize: 11, color: T.faint }}>{sub}</div>
                </div>
                <Toggle on={prefs[key]} onClick={() => toggle(key)} />
              </div>
            ))}
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 20, flex: "1 1 280px" }}>
          <Card>
            <SectionHead title="Performance (30D)" />
            {[["Leads Processed", "47", GitBranch], ["Conversion Rate", "72%", Activity], ["Avg Response Time", "2.4 hrs", Clock], ["Customer CSAT", "4.6 / 5.0", CheckCircle2]].map(([k, v, Icon]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: T.sub }}><Icon size={14} color={T.blueSolid} />{k}</span>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{v}</span>
              </div>
            ))}
          </Card>

          <Card>
            <SectionHead title="Backend Connection" />
            <Row icon={api.status === "online" ? Wifi : WifiOff} k="Harness Status" v={api.status === "online" ? "Connected" : api.status === "checking" ? "Checking…" : "Offline (demo data)"} good={api.status === "online"} />
            <Row icon={LogIn} k="API Base" v={api.base} />
            <Row icon={KeyRound} k="Session ID" v={api.sessionId || "—"} />
          </Card>

          <Card>
            <SectionHead title="Security & Access" />
            <Row icon={LogIn} k="Last System Login" v="Today, 09:15 AM IST" />
            <Row icon={ShieldCheck} k="Two-Factor Authentication" v="Enabled & Verified" good />
            <Row icon={KeyRound} k="API Key Authority" v="Active — Standard" good />
            <Row icon={Lock} k="Assigned Privileges" v="Full Sales Ops Access" />
          </Card>
        </div>
      </div>

      <Card>
        <SectionHead title="Audit Log & Activity" />
        {AUDIT_LOG_DEMO.map((a, i) => {
          const color = a.level === "green" ? T.green : a.level === "red" ? T.red : a.level === "amber" ? T.amber : T.blueSolid;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i < AUDIT_LOG_DEMO.length - 1 ? "1px solid #F1F4F9" : "none" }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, flex: 1 }}>{a.text}</span>
              <span style={{ fontSize: 11, color: T.faint }}>{a.when}</span>
            </div>
          );
        })}
      </Card>
    </>
  );
}

/* ============================================================================
   SHELL / EXPORT
============================================================================ */

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
      * { box-sizing: border-box; }
      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-thumb { background: #D7DEEA; border-radius: 8px; }
      table { border-collapse: collapse; width: 100%; }
      button { font-family: inherit; }
      input, select, textarea { font-family: inherit; }
      @keyframes pulseDot { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes fadeSlideUp { from { opacity:0; transform:translateY(10px);} to {opacity:1; transform:translateY(0);} }
      @keyframes popIn { from {opacity:0; transform:scale(.96) translateY(6px);} to {opacity:1; transform:scale(1) translateY(0);} }
      @keyframes shimmer { 0% {background-position: -400px 0;} 100% {background-position: 400px 0;} }
      @keyframes slideInRight { from {opacity:0; transform:translateX(16px);} to {opacity:1; transform:translateX(0);} }
      .view-enter { animation: fadeSlideUp .35s ease both; }
      .trace-step { animation: fadeSlideUp .32s ease both; }
      .modal-pop { animation: popIn .22s ease both; }
      .toast-in { animation: slideInRight .25s ease both; }
      .skeleton { background: linear-gradient(90deg, #EEF1F6 0px, #F8FAFC 40px, #EEF1F6 80px); background-size: 600px; animation: shimmer 1.4s infinite linear; border-radius: 8px; }
      @media (prefers-reduced-motion: reduce) {
        * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; }
      }
    `}</style>
  );
}

function Shell() {
  const api = useApi();
  const [tab, setTab] = useState("dashboard");
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const active = NAV.find((n) => n.key === tab);

  const goToLead = (id) => { setSelectedLeadId(id); setTab("queue"); };

  return (
    <div style={{ fontFamily: T.font, background: T.bg, minHeight: "100vh", color: T.text, display: "flex" }}>
      <GlobalStyle />
      <Sidebar tab={tab} setTab={setTab} />
      <div style={{ flex: 1, minWidth: 0, padding: "28px 34px 40px" }}>
        <TopBar active={active} onNewLead={() => setModalOpen(true)} />
        {api.usingFallback && <OfflineBanner />}
        <div key={tab} className="view-enter">
          {tab === "dashboard" && <DashboardView setTab={setTab} onSelectLead={goToLead} />}
          {tab === "queue" && <QueueView selectedLeadId={selectedLeadId} setSelectedLeadId={setSelectedLeadId} onNewLead={() => setModalOpen(true)} />}
          {tab === "simulator" && <SimulatorView />}
          {tab === "agents" && <AgentsView />}
          {tab === "profile" && <ProfileView />}
        </div>
      </div>
      <NewLeadModal open={modalOpen} onClose={() => setModalOpen(false)} onProcessed={goToLead} />
      <ToastHost />
    </div>
  );
}

export default function MichelinConvergeDashboard() {
  return (
    <ApiProvider>
      <Shell />
    </ApiProvider>
  );
}
