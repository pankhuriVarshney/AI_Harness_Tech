import os
import json
import time
import uuid
import threading
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

from agents import orchestrator, deal_optimization, dealer_allocation
from agents import model_router, registry
from agents.tools import TOOLS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
STATIC_DIR = os.path.join(BASE_DIR, "static")

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 256 * 1024  # 256 KB request cap
CORS(app)  # Open for local dev / Figma prototypes; restrict in production.

SESSIONS = {}
LEAD_RESULTS = {}

# ---------------------------------------------------------------------------
# Middleware: token-bucket rate limiter (per remote addr)
# ---------------------------------------------------------------------------
RATE_LIMIT = int(os.environ.get("RATE_LIMIT_PER_MINUTE", "30"))
_buckets = {}
_bucket_lock = threading.Lock()


@app.before_request
def rate_limit():
    if request.path.startswith("/api/") and request.method in ("POST",):
        key = request.remote_addr or "unknown"
        now = time.time()
        with _bucket_lock:
            tokens, ts = _buckets.get(key, (RATE_LIMIT, now))
            tokens = min(RATE_LIMIT, tokens + (now - ts) * (RATE_LIMIT / 60.0))
            if tokens < 1:
                return jsonify({"error": "Rate limit exceeded. Slow down."}), 429
            _buckets[key] = (tokens - 1, now)


@app.after_request
def security_headers(resp):
    # Minimal security headers for the demo shell.
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "no-referrer"
    return resp


def _load_json(filename):
    with open(os.path.join(DATA_DIR, filename)) as f:
        return json.load(f)


def _error_response(message, status=400):
    # Deterministic guardrail: shaped errors only, never stack traces.
    return jsonify({"error": message}), status


# ---------------------------------------------------------------------------
# Static dashboard
# ---------------------------------------------------------------------------
@app.route("/")
def serve_index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/<path:path>")
def serve_static(path):
    full = os.path.join(STATIC_DIR, path)
    if os.path.isfile(full):
        return send_from_directory(STATIC_DIR, path)
    return _error_response("Not found", 404)


# ---------------------------------------------------------------------------
# Harness observability endpoints
# ---------------------------------------------------------------------------
@app.route("/api/harness/manifest", methods=["GET"])
def harness_manifest():
    """Everything a judge needs to see the harness at a glance: agents,
    tools (+ descriptions), model routes, and prompt version."""
    from agents import prompts
    return jsonify({
        "prompt_version": prompts.PROMPT_VERSION,
        "agents": registry.manifest(),
        "tools": [{"name": t.name, "description": t.description,
                   "allowed_agents": sorted(t.allowed_agents)} for t in TOOLS.values()],
        "model_routes": {t: model_router.resolve_route(t) for t in model_router.ROUTE_TABLE},
        "call_budget_per_lead": model_router.CALL_BUDGET_PER_LEAD,
    })


@app.route("/api/harness/router-stats", methods=["GET"])
def router_stats():
    return jsonify(model_router.stats())


# ---------------------------------------------------------------------------
# Core API
# ---------------------------------------------------------------------------
@app.route("/api/sessions", methods=["POST"])
def create_session():
    session_id = f"SESSION-{uuid.uuid4().hex[:8]}"
    SESSIONS[session_id] = {"leads": {}}
    return jsonify({"session_id": session_id})


@app.route("/api/leads", methods=["GET"])
def get_leads():
    return jsonify(_load_json("leads.json"))


@app.route("/api/catalog", methods=["GET"])
def get_catalog():
    return jsonify(_load_json("catalog.json"))


@app.route("/api/distributors", methods=["GET"])
def get_distributors():
    return jsonify(_load_json("distributors.json"))


@app.route("/api/leads/process", methods=["POST"])
def process_lead():
    body = request.get_json(force=True, silent=True) or {}
    raw_text = body.get("raw_text")
    if not raw_text:
        return _error_response("raw_text is required")

    try:
        result = orchestrator.process_lead(
            raw_text=raw_text,
            customer_lat=body.get("customer_lat"),
            customer_lng=body.get("customer_lng"),
            catalog=_load_json("catalog.json"),
            policy=_load_json("policy.json"),
            distributors=_load_json("distributors.json"),
            lead_id=body.get("lead_id"),
        )
    except Exception as exc:  # noqa: BLE001
        app.logger.exception("Unhandled orchestrator failure")
        return _error_response(f"Processing failed and was safely halted: {exc}", 500)

    lead_id = result["state"]["lead_id"]
    LEAD_RESULTS[lead_id] = result
    sid = body.get("session_id")
    if sid and sid in SESSIONS:
        SESSIONS[sid]["leads"][lead_id] = result
    return jsonify(result["state"])


@app.route("/api/leads/<lead_id>/trace", methods=["GET"])
def get_trace(lead_id):
    result = LEAD_RESULTS.get(lead_id)
    if not result:
        return _error_response("No trace found for this lead_id.", 404)
    return jsonify({"lead_id": lead_id, "trace": result["trace"],
                    "tool_calls": result.get("tool_calls", []),
                    "final_state": result["state"]})


@app.route("/api/simulate", methods=["POST"])
def simulate():
    body = request.get_json(force=True, silent=True) or {}
    lead_id = body.get("lead_id")
    base = LEAD_RESULTS.get(lead_id)
    if not base:
        return _error_response("Unknown lead_id. Process the lead first.", 404)

    state = base["state"]
    profile = dict(state["profile"] or {})
    profile["budget"] = body.get("budget", profile.get("budget"))
    profile["requested_discount_pct"] = body.get("requested_discount_pct", profile.get("requested_discount_pct"))
    sku_override = body.get("recommended_sku", (state.get("recommendation") or {}).get("recommended_sku"))

    try:
        catalog = _load_json("catalog.json")
        policy = _load_json("policy.json")
        distributors = _load_json("distributors.json")
    except OSError as exc:
        return _error_response(f"Could not load reference data: {exc}", 500)

    matched = next((c for c in catalog if c["id"] == sku_override), None)
    price = matched["price"] if matched else state["deal"]["original_price"]

    simulated_deal = deal_optimization.run(price, profile, policy, ctx={"lead_id": lead_id, "trace": None})
    simulated_dealer = dealer_allocation.run(sku_override, body.get("customer_lat"),
                                             body.get("customer_lng"), distributors)
    return jsonify({
        "lead_id": lead_id,
        "current": {"deal": state["deal"], "dealer": state["dealer"]},
        "simulated": {"deal": simulated_deal, "dealer": simulated_dealer},
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "true").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)