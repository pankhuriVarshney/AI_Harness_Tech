import os
import json
import uuid
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

from agents import orchestrator, deal_optimization, dealer_allocation

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
STATIC_DIR = os.path.join(BASE_DIR, "static")

app = Flask(__name__, static_folder=None)
CORS(app)  # Open by default for local dev / Figma prototypes; restrict in production.

# ---- In-memory stores (swap for a DB in production) ----
SESSIONS = {}   # session_id -> {"leads": {lead_id: result}}
LEAD_RESULTS = {}  # lead_id -> latest orchestrator result (state + trace)


def _load_json(filename):
    with open(os.path.join(DATA_DIR, filename), "r") as f:
        return json.load(f)


def _error_response(message, status=400):
    # Deterministic guardrail: never let a raw exception/model failure reach
    # the frontend. Always shape errors the same way.
    return jsonify({"error": message}), status


# ---------------------------------------------------------------------------
# Static dashboard (placeholder UI - see UI_CONNECTORS.md to swap in Figma)
# ---------------------------------------------------------------------------
@app.route("/")
def serve_index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/<path:path>")
def serve_static(path):
    if os.path.exists(os.path.join(STATIC_DIR, path)):
        return send_from_directory(STATIC_DIR, path)
    return _error_response("Not found", 404)


# ---------------------------------------------------------------------------
# API
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
    lead_id = body.get("lead_id")
    customer_lat = body.get("customer_lat")
    customer_lng = body.get("customer_lng")
    session_id = body.get("session_id")

    if not raw_text:
        return _error_response("raw_text is required")

    try:
        catalog = _load_json("catalog.json")
        policy = _load_json("policy.json")
        distributors = _load_json("distributors.json")

        result = orchestrator.process_lead(
            raw_text=raw_text,
            customer_lat=customer_lat,
            customer_lng=customer_lng,
            catalog=catalog,
            policy=policy,
            distributors=distributors,
            lead_id=lead_id,
        )
    except Exception as exc:  # noqa: BLE001
        # Deterministic guardrail: agent/API failure must degrade, not crash.
        app.logger.exception("Unhandled orchestrator failure")
        return _error_response(f"Processing failed and was safely halted: {exc}", 500)

    lead_id = result["state"]["lead_id"]
    LEAD_RESULTS[lead_id] = result

    if session_id and session_id in SESSIONS:
        SESSIONS[session_id]["leads"][lead_id] = result

    return jsonify(result["state"])


@app.route("/api/leads/<lead_id>/trace", methods=["GET"])
def get_trace(lead_id):
    result = LEAD_RESULTS.get(lead_id)
    if not result:
        return _error_response("No trace found for this lead_id. Process it first via /api/leads/process.", 404)
    return jsonify({"lead_id": lead_id, "trace": result["trace"], "final_state": result["state"]})


@app.route("/api/simulate", methods=["POST"])
def simulate():
    """What-If simulator: recompute deal + dealer allocation with modified
    inputs, without re-running the full pipeline or mutating stored state."""
    body = request.get_json(force=True, silent=True) or {}
    lead_id = body.get("lead_id")
    base = LEAD_RESULTS.get(lead_id)
    if not base:
        return _error_response("Unknown lead_id. Process the lead first.", 404)

    state = base["state"]
    profile = dict(state["profile"])
    recommendation = state["recommendation"]

    # Overrides supplied by the sales manager for the "what-if"
    profile["budget"] = body.get("budget", profile.get("budget"))
    profile["requested_discount_pct"] = body.get("requested_discount_pct", profile.get("requested_discount_pct"))
    sku_override = body.get("recommended_sku", recommendation.get("recommended_sku"))

    try:
        catalog = _load_json("catalog.json")
        policy = _load_json("policy.json")
        distributors = _load_json("distributors.json")
    except Exception as exc:  # noqa: BLE001
        return _error_response(f"Could not load reference data: {exc}", 500)

    matched_product = next((c for c in catalog if c["id"] == sku_override), None)
    price = matched_product["price"] if matched_product else state["deal"]["original_price"]

    simulated_deal = deal_optimization.run(price, profile, policy)
    simulated_dealer = dealer_allocation.run(
        sku_override,
        body.get("customer_lat"),
        body.get("customer_lng"),
        distributors,
    )

    return jsonify({
        "lead_id": lead_id,
        "current": {"deal": state["deal"], "dealer": state["dealer"]},
        "simulated": {"deal": simulated_deal, "dealer": simulated_dealer},
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "true").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)
