# UI Connectors

The backend (`app.py`) is a plain REST API and knows nothing about how the
frontend is built. `static/index.html`/`style.css`/`script.js` are a
throwaway reference dashboard — read `static/script.js` as the canonical
example of "how to call every endpoint," then replace the whole `static/`
folder with your real UI whenever you're ready.

CORS is already open (`CORS(app)` in `app.py`) so any frontend — including
one served from Figma Make, a separate Vite/React app, or a static file
opened locally — can call this API from a different origin during
development. Tighten this before shipping anything public.

---

## 1. API contracts

All requests/responses are JSON. Base URL when running locally:
`http://localhost:5000`.

### `POST /api/sessions`
Creates a session to group leads processed in one sitting (used for the
pipeline-stats counters; optional to use).

Request body: `{}`
Response:
```json
{ "session_id": "SESSION-a1b2c3d4" }
```

### `GET /api/leads`
Returns the demo lead inbox.
```json
[
  { "lead_id": "LEAD-104", "raw_text": "...", "customer_lat": 18.56, "customer_lng": 73.77 }
]
```

### `GET /api/catalog`
Returns the full tyre catalogue (see `data/catalog.json` for the schema).

### `GET /api/distributors`
Returns the dealer list (see `data/distributors.json` for the schema).

### `POST /api/leads/process`
Runs the full agentic pipeline on one lead. This is the core call.

Request body:
```json
{
  "session_id": "SESSION-a1b2c3d4",
  "lead_id": "LEAD-104",
  "raw_text": "Name: Rahul. Vehicle: Hyundai Creta...",
  "customer_lat": 18.5606,
  "customer_lng": 73.7796
}
```
`lead_id` is optional — omit it to auto-generate one for a brand-new lead
typed into the UI.

Response (`state` object — this is what you bind your dashboard to):
```json
{
  "lead_id": "LEAD-104",
  "profile": { "...": "structured lead fields" },
  "lead_score": 92,
  "priority": "HIGH",
  "recommendation": { "recommended_sku": "MIC-P4-205-55", "...": "..." },
  "deal": { "recommended_discount_pct": 6, "final_total": 30080, "...": "..." },
  "dealer": { "recommended_dealer": "Dealer C - Hinjewadi", "...": "..." },
  "compliance": { "approved": true, "escalate_to_human": false, "...": "..." },
  "status": "READY",
  "escalate_to_human": false,
  "recommended_action": "CONTACT_NOW",
  "sales_note": "Human-readable one-liner to show under the action badge"
}
```
Possible `status` values: `PROCESSING`, `NEEDS_CLARIFICATION`,
`OUT_OF_SCOPE`, `NO_PRODUCT_MATCH`, `ESCALATED`, `READY`.
Possible `recommended_action` values: `CONTACT_NOW`, `FOLLOW_UP`,
`NURTURE`, `REQUEST_INFO`, `HUMAN_REVIEW`.

On failure: `{"error": "..."}` with a non-200 status — never a raw
stack trace or a partial/undefined state object.

### `GET /api/leads/<lead_id>/trace`
Returns the full agent-by-agent execution trace for a previously processed
lead (for the "View Agent Trace" panel).
```json
{
  "lead_id": "LEAD-104",
  "trace": [
    { "timestamp": "10:42:11", "agent": "Lead Intelligence", "duration_ms": 182, "ok": true, "note": "", "output": { "...": "..." } }
  ],
  "final_state": { "...": "same shape as /api/leads/process response" }
}
```

### `POST /api/simulate`
Recomputes the deal + dealer allocation for a "what-if" without touching
stored state. Requires the lead to have been processed first.

Request body:
```json
{
  "lead_id": "LEAD-104",
  "budget": 32000,
  "requested_discount_pct": 8,
  "customer_lat": 18.56,
  "customer_lng": 73.77,
  "recommended_sku": "MIC-P4-205-55"
}
```
Response:
```json
{
  "lead_id": "LEAD-104",
  "current": { "deal": { "...": "..." }, "dealer": { "...": "..." } },
  "simulated": { "deal": { "...": "..." }, "dealer": { "...": "..." } }
}
```

---

## 2. Connecting your Figma UI

You have two easy paths depending on how you want to ship the Figma design.

### Path A — Figma design → static HTML/CSS export, served by this same Flask app (fastest)

1. Export or hand-code your Figma frames as HTML/CSS (Figma Dev Mode, or a
   tool like Anima/Figma-to-code, or by hand).
2. Drop the exported files into `static/`, replacing `index.html`,
   `style.css`, and any assets. Keep `script.js` as your starting point —
   don't delete it, adapt it.
3. In your new HTML, keep (or re-map) these element IDs so `script.js`
   keeps working, or rename them and update `script.js` to match:
   - `#lead-list` — the clickable list of leads
   - `#raw-lead-input`, `#process-lead-btn` — the "new lead" form
   - `#decision-panel` — where the AI decision renders (`renderDecision()`)
   - `#trace-view` — where the agent trace renders (`renderTrace()`)
   - `#sim-budget`, `#sim-discount`, `#simulate-btn`, `#simulate-result`
   - `#stat-high`, `#stat-medium`, `#stat-low`, `#stat-review`
4. Run `python app.py` as usual — Flask serves your new files directly from
   `static/`.

### Path B — Figma design → separate frontend app (React/Vite/Next), calling this API remotely

1. Build your UI as its own project (e.g. `npm create vite@latest`).
2. Set an API base URL, e.g. in a `.env` for your frontend:
   ```
   VITE_API_BASE=http://localhost:5000
   ```
3. Recreate the calls from `static/script.js`'s `api()` helper — every
   endpoint above is a plain `fetch()` with JSON in/out, so this ports
   directly to React (`fetch`/`axios`), Vue, or plain JS.
4. Keep CORS enabled on the Flask side (already done via `Flask-Cors`) while
   developing against a different port/origin. For production, restrict
   `CORS(app)` in `app.py` to your real frontend's origin:
   ```python
   CORS(app, origins=["https://your-frontend-domain.com"])
   ```
5. Run the Flask backend (`python app.py`) and your frontend dev server
   side by side. Point the frontend's `fetch` calls at `VITE_API_BASE`
   instead of the relative paths used in `static/script.js`.

### Design data you'll want to bind, straight from the API responses above

- Pipeline counters → count `priority`/`escalate_to_human` across processed
  leads (see `updatePipelineStats()` in `script.js` for the exact logic).
- Lead score gauge → `state.lead_score` (0–100) + `state.priority`.
- Product card → `state.recommendation.recommended_sku` (look up
  name/price/size from `GET /api/catalog`).
- Offer card → `state.deal.recommended_discount_pct`,
  `state.deal.final_total`, `state.deal.disclaimer`.
- Dealer card → `state.dealer.recommended_dealer`,
  `state.dealer.distance_km`, `state.dealer.stock_available`.
- Action badge/CTA → `state.recommended_action` + `state.sales_note`.
- Trace timeline → `GET /api/leads/<id>/trace` → `trace[]` array, one row
  per agent with `agent`, `duration_ms`, `ok`, `note`.

Nothing above requires backend changes — the API is intentionally decoupled
from the placeholder UI so your Figma design is a pure frontend swap.
