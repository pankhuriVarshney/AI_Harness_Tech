# UI Connector Contract

This backend is UI-agnostic. Every connector point below is a stable REST
endpoint; when your Figma design is ready, export/build the frontend
separately and point it at these. Nothing in the harness logic needs to
change when the UI changes.

## POST /api/session
Call once when the app/chat screen mounts.
- Request: none
- Response: `{ "session_id": "uuid" }`
- Store `session_id` client-side (state var, not localStorage if this becomes
  a Claude artifact — for a real app, a cookie or app state is fine) and send
  it with every `/api/chat` call so the harness keeps conversation memory.

## POST /api/chat
The main connector. Bind your chat input's send button/enter-key here.
- Request:
  ```json
  { "session_id": "uuid", "message": "customer text", "lat": 18.62, "lng": 73.79 }
  ```
  `lat`/`lng` are optional — omit them if your UI doesn't have geolocation
  yet; the Locator Agent will just skip distributor matching until it does.
- Response:
  ```json
  {
    "reply": "customer-facing text, already in their language",
    "escalate_to_human": false,
    "escalation_reasons": [],
    "deal": { "proposed_sku_ids": [...], "discount_pct": 5, "total_after_discount_inr": 23180, "disclaimer": "..." },
    "distributors": [ { "name": "...", "distance_km": 3.2, "phone": "...", "has_requested_stock": true } ],
    "trace": [ { "agent": "intake", "output": {...} }, { "agent": "catalog_match", "output": {...} }, ... ]
  }
  ```
- UI notes:
  - Show `reply` as the assistant's chat bubble.
  - If `escalate_to_human` is `true`, style that bubble differently and show
    a "talk to a person" affordance — don't just render it as a normal answer.
  - `deal` and `distributors` are `null` on turns where no quote was reached
    yet (e.g. still gathering info) — only render a deal/distributor card
    when they're present.
  - `trace` is for the hackathon demo panel — keep it visible during judging
    even if you hide it behind a toggle in a "real" product.

## GET /api/catalog
Returns the full tyre catalog JSON. Optional connector — only needed if you
build a browsable "our range" grid.

## GET /api/distributors
Returns all distributor locations. Optional connector — only needed for a
standalone "find a distributor" map view outside the chat flow.

## Error behavior
`/api/chat` never returns a raw 500 to the frontend — internal errors come
back as a normal 200 response with `escalate_to_human: true` and a generic
`reply`, so the UI doesn't need special-case error handling beyond what it
already does for `escalate_to_human`.
