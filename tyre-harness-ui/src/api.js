// Thin client for the Tyre Deal Harness REST API.
// Every function here maps 1:1 to an endpoint documented in UI_CONNECTORS.md.
// Swap VITE_API_BASE_URL in .env if the Flask API isn't on localhost:5000.

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  // Per UI_CONNECTORS.md, /api/chat never raw-500s. Other endpoints still can,
  // so we guard here rather than assuming every response is JSON-shaped.
  if (!res.ok) {
    throw new Error(`${path} responded with ${res.status}`);
  }
  return res.json();
}

/** POST /api/session — call once when the app mounts. */
export function createSession() {
  return request('/api/session', { method: 'POST' });
}

/**
 * POST /api/chat — the main connector.
 * `coords` is optional ({ lat, lng }); omit it if geolocation isn't available,
 * the Locator Agent will just skip distributor matching.
 */
export function sendMessage(sessionId, message, coords) {
  return request('/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      session_id: sessionId,
      message,
      ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
    }),
  });
}

/** GET /api/catalog — optional, powers the "our range" grid. */
export function getCatalog() {
  return request('/api/catalog');
}

/** GET /api/distributors — optional, powers the standalone distributor map. */
export function getDistributors() {
  return request('/api/distributors');
}
