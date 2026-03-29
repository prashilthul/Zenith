"""Explain node — generates a plain-English incident summary and audit log."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from src.config import settings
from src.graph.state import ClusterState
from src.llm.client import llm_call
from src.llm.prompts import EXPLAINER_SYSTEM_PROMPT
from src.mcp_server.slack_tools import send_slack_message
from src.models import LogEntry

logger = logging.getLogger(__name__)

_AUDIT_LOG_PATH = Path("data/audit_log.json")


def _write_audit_log(entry: LogEntry) -> None:
    """Append a log entry to the audit log JSON file."""
    _AUDIT_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

    existing: list[dict] = []
    if _AUDIT_LOG_PATH.exists():
        try:
            raw = _AUDIT_LOG_PATH.read_text()
            if raw.strip():
                existing = json.loads(raw)
        except (json.JSONDecodeError, OSError):
            logger.warning("Could not read existing audit log; starting fresh")

    existing.append(dict(entry))

    try:
        _AUDIT_LOG_PATH.write_text(json.dumps(existing, indent=2, default=str))
        logger.info("Audit log entry written to %s", _AUDIT_LOG_PATH)
    except OSError:
        logger.exception("Failed to write audit log")


def explain_node(state: ClusterState) -> dict:
    """Generate incident summary, write audit log, and post to Slack.

    Returns ``{"audit_log": [LogEntry]}``.
    """
    anomalies = state.get("anomalies", [])
    idx = state.get("current_anomaly_index", 0)
    anomaly = anomalies[idx] if anomalies and idx < len(anomalies) else {}
    diagnosis = state.get("diagnosis", "N/A")
    plan = state.get("plan") or {}
    result = state.get("result", "N/A")
    approved = state.get("approved", True)
    incident_id = state.get("incident_id", "unknown")

    # ── Generate explanation via LLM ─────────────────────────────────
    user_message = (
        f"Incident ID: {incident_id}\n"
        f"Anomaly: {json.dumps(anomaly, default=str)}\n"
        f"Diagnosis: {diagnosis}\n"
        f"Plan: {json.dumps(plan, default=str)}\n"
        f"Approved: {approved}\n"
        f"Execution Result: {result}"
    )

    messages = [
        {"role": "system", "content": EXPLAINER_SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]

    try:
        summary = asyncio.get_event_loop().run_until_complete(
            llm_call(messages)
        )
    except RuntimeError:
        summary = asyncio.run(llm_call(messages))

    if not summary:
        summary = (
            f"Incident {incident_id}: {anomaly.get('type', 'Unknown')} on "
            f"{anomaly.get('affected_resource', 'unknown')}. "
            f"Action: {plan.get('action', 'N/A')}. Result: {result}."
        )

    # ── Build audit log entry ────────────────────────────────────────
    now = datetime.now(timezone.utc).isoformat()
    decision = "auto-executed" if approved else "rejected"

    log_entry = LogEntry(
        incident_id=incident_id,
        timestamp=now,
        stage="explain",
        summary=summary,
        details={
            "anomaly": anomaly,
            "diagnosis": diagnosis,
            "plan": plan,
        },
        decision=decision,
        outcome=result,
    )

    _write_audit_log(log_entry)

    # ── Post to Slack ────────────────────────────────────────────────
    channel = settings.SLACK_CHANNEL_ID
    if channel:
        try:
            send_slack_message(channel=channel, text=summary)
            logger.info("Posted incident summary to Slack channel %s", channel)
        except Exception:
            logger.exception("Failed to post summary to Slack")
    else:
        logger.warning("SLACK_CHANNEL_ID not set; skipping Slack post")

    logger.info("explain_node complete for incident %s", incident_id)
    return {"audit_log": [log_entry]}
