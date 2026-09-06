"""
Tyre Deal Harness - API server.

Run:
    pip install -r requirements.txt
    cp .env.example .env   # then fill in GEMINI_API_KEY
    python app.py

This serves:
  - the JSON API (see UI_CONNECTORS.md for every endpoint's contract - this is
    what you wire your Figma-exported frontend to later)
  - a plain placeholder UI at / (static/index.html), marked with
    FIGMA_CONNECTOR comments showing exactly what each block will be replaced by
"""

import os
import uuid
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

from agents import orchestrator

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)  # open CORS so a separately-hosted Figma-exported frontend can call this API


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/session", methods=["POST"])
def new_session():
    """FIGMA_CONNECTOR: call once when the chat UI mounts, store the id client-side."""
    return jsonify({"session_id": str(uuid.uuid4())})


@app.route("/api/chat", methods=["POST"])
def chat():
    """
    FIGMA_CONNECTOR: wire your chat input's "send" action to this endpoint.
    Request: {"session_id": "...", "message": "...", "lat": optional float, "lng": optional float}
    Response shape: see UI_CONNECTORS.md
    """
    body = request.get_json(force=True)
    session_id = body.get("session_id")
    message = body.get("message", "")
    if not session_id or not message:
        return jsonify({"error": "session_id and message are required"}), 400
    try:
        result = orchestrator.handle_message(
            session_id, message, body.get("lat"), body.get("lng")
        )
        return jsonify(result)
    except Exception as e:
        # Harness-level graceful degradation: never let a raw exception reach the UI.
        return jsonify({
            "reply": "Something went wrong on our end - please try again in a moment.",
            "escalate_to_human": True,
            "escalation_reasons": [f"internal_error: {type(e).__name__}"],
            "trace": [],
        }), 200


@app.route("/api/catalog", methods=["GET"])
def catalog():
    """FIGMA_CONNECTOR: feeds a browsable "our range" product grid, if you build one."""
    return jsonify(orchestrator.CATALOG)


@app.route("/api/distributors", methods=["GET"])
def distributors():
    """FIGMA_CONNECTOR: feeds a "find a distributor" map component."""
    return jsonify(orchestrator.DISTRIBUTORS)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=True, port=port)
