"""Human-in-the-loop node — sends Slack approval request and pauses the graph."""

from __future__ import annotations

import json
import logging

from langgraph.types import interrupt

from src.config import settings
from src.graph.state import ClusterState
from src.mcp_server.slack_tools import send_approval_request

logger = logging.getLogger(__name__)


def hitl_node(state: ClusterState) -> dict:
    """Send an approval request to Slack and pause execution.

    The ``interrupt()`` call suspends the LangGraph thread.  When the
    Slack interaction webhook receives an Approve/Reject button click,
    it resumes the thread with ``{"approved": True/False}``.

    Returns ``{"approved": bool}``.
    """
    plan = state.get("plan")
    incident_id = state.get("incident_id", "unknown")

    if plan is None:
        logger.warning("hitl_node: no plan in state")
        return {"approved": False}

    plan_summary = (
        f"Action: {plan.get('action', 'N/A')}\n"
        f"Target: {plan.get('target', 'N/A')}\n"
        f"Namespace: {plan.get('namespace', 'N/A')}\n"
        f"Confidence: {plan.get('confidence', 0):.0%}\n"
        f"Blast radius: {plan.get('blast_radius', 'N/A')}\n"
        f"Destructive: {plan.get('is_destructive', False)}\n"
        f"Reasoning: {plan.get('reasoning', 'N/A')}"
    )

    # Send Slack approval request
    channel = settings.SLACK_CHANNEL_ID
    if channel:
        try:
            slack_result = send_approval_request(
                channel=channel,
                incident_id=incident_id,
                plan_summary=plan_summary,
                thread_id="",  # top-level message
            )
            logger.info("Slack approval request sent: %s", slack_result)
        except Exception:
            logger.exception("Failed to send Slack approval request")
    else:
        logger.warning("SLACK_CHANNEL_ID not configured; skipping Slack notification")

    # Pause the graph and wait for human decision
    logger.info("hitl_node: pausing graph for approval (incident_id=%s)", incident_id)
    response = interrupt(
        {
            "type": "approval_required",
            "incident_id": incident_id,
            "plan": json.loads(json.dumps(plan, default=str)),
            "plan_summary": plan_summary,
        }
    )

    approved = response.get("approved", False) if isinstance(response, dict) else False
    logger.info("hitl_node: received response approved=%s", approved)
    return {"approved": approved}
