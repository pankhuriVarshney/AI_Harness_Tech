# Tyre Deal Harness — Sales Console (frontend)

Corporate frontend for the Tyre Deal Harness backend, wired to the three
connectors documented in `UI_CONNECTORS.md`: `POST /api/session`,
`POST /api/chat`, and (available but not required for the chat flow)
`GET /api/catalog` / `GET /api/distributors`.

Built with React + Vite and [@chatscope/chat-ui-kit-react](https://github.com/chatscope/chat-ui-kit-react),
a maintained open-source chat UI toolkit, retinted to an industrial /
automotive-parts palette instead of its default look.

## Layout

- **Header** — brand mark, a "Share location" toggle (fills `lat`/`lng` on
  `/api/chat` once granted; the Locator Agent works without it too), and
  "New conversation" (opens a fresh `/api/session`).
- **Chat pane** (left) — the conversation itself.
- **Side panel** (right), two tabs:
  - **Deal & distributor** — renders `deal` and `distributors` from the
    latest `/api/chat` response as cards; empty until the harness has
    enough information to quote.
  - **Agent trace** — the `trace` array from the latest turn, one
    expandable step per agent, for the hackathon demo panel.
- Messages where `escalate_to_human` is `true` get a distinct "Escalated to
  a human specialist" tag rather than rendering as a normal answer.

## Run it

```bash
npm install
cp .env.example .env      # point VITE_API_BASE_URL at your Flask API if not localhost:5000
npm run dev
```

## Files

```
src/api.js                 — fetch wrapper for the three connectors
src/App.jsx                — app shell, session + chat state, connector wiring
src/components/DealCard.jsx
src/components/DistributorList.jsx
src/components/TracePanel.jsx
src/index.css              — design tokens (colors, type)
src/app.css                — layout + chatscope theme overrides
```

## Swapping in real branding later

Colors and type live entirely in `src/index.css` (`:root` custom
properties) and the chatscope overrides at the bottom of `src/app.css` —
change those two blocks to reskin without touching component logic.
