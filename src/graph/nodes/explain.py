"""Explain node — generates a plain-English incident summary and audit log."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from src.config import settings
from src.graph.state import ClusterState
from src.knowledge.fingerprint import compute_fingerprint
from src.knowledge.runbook_store import store_runbook
from src.llm.client import llm_call_sync
from src.llm.prompts import EXPLAINER_SYSTEM_PROMPT
from src.blockchain.stellar_client import store_incident_on_chain
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

    summary = llm_call_sync(messages)

    if not summary:
        summary = (
            f"Incident {incident_id}: {anomaly.get('type', 'Unknown')} on "
            f"{anomaly.get('affected_resource', 'unknown')}. "
            f"Action: {plan.get('action', 'N/A')}. Result: {result}."
        )

    # ── Build audit log entry ────────────────────────────────────────
    now = datetime.now(timezone.utc).isoformat()
    result_str = state.get("result", "")
    if result_str:  # If there's any result, the action was executed
        decision = "human-approved" if state.get("approved") else "auto-executed"
    else:
        decision = "rejected"

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

    # ── Store runbook for future use ────────────────────────────────
    if settings.ENABLE_RUNBOOK_CACHE:
        try:
            if anomaly and result:
                fp = compute_fingerprint(anomaly["type"], anomaly.get("raw_signal", ""), "Pod")
                success = "success" in result.lower() or "deleted" in result.lower()
                store_runbook(fp, state.get("diagnosis", ""), json.dumps(plan) if plan else "", success, 0)
        except Exception as e:
            logger.warning("Failed to store runbook: %s", e)

    # ── Store on blockchain (if enabled) ────────────────────────────
    try:
        import concurrent.futures

        def _store_blockchain() -> None:
            asyncio.run(
                store_incident_on_chain(
                    incident_id=incident_id,
                    anomaly_type=anomaly.get("type", "unknown"),
                    action_taken=plan.get("action", "N/A"),
                    timestamp=int(datetime.now(timezone.utc).timestamp()),
                    confidence_score=int(plan.get("confidence", 0) * 100),
                    was_auto_executed=(decision == "auto-executed"),
                    diagnosis_summary=diagnosis[:256] if diagnosis else "N/A",
                )
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            pool.submit(_store_blockchain).result(timeout=30)
        logger.info("Blockchain record stored for incident %s", incident_id)
    except Exception:
        logger.exception("Failed to store incident on blockchain (non-fatal)")

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
