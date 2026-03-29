"""API routes for K8sWhisperer dashboard and war room."""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from src.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["api"])

# ── Pydantic request / response models ──────────────────────────────────────


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    response: str


class ChaosRequest(BaseModel):
    count: int = 3


# ── Audit log path ──────────────────────────────────────────────────────────

_AUDIT_LOG_PATH = Path("data/audit_log.json")


def _read_audit_log() -> list[dict[str, Any]]:
    """Read and return the audit log entries, or an empty list on failure."""
    if not _AUDIT_LOG_PATH.exists():
        return []
    try:
        return json.loads(_AUDIT_LOG_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        logger.warning("Failed to read audit log at %s", _AUDIT_LOG_PATH, exc_info=True)
        return []


# ── WebSocket connection manager ────────────────────────────────────────────


class _ConnectionManager:
    """Manages active WebSocket connections for real-time broadcasts."""

    def __init__(self) -> None:
        self._connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self._connections.remove(ws)

    async def broadcast(self, data: dict[str, Any]) -> None:
        dead: list[WebSocket] = []
        for ws in self._connections:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._connections.remove(ws)


ws_manager = _ConnectionManager()


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.get("/incidents")
async def list_incidents() -> list[dict[str, Any]]:
    """Return a list of incidents derived from the audit log.

    Each unique ``incident_id`` in the audit trail is treated as one incident,
    with the latest entry's summary used as the incident summary.
    """
    entries = _read_audit_log()
    incidents: dict[str, dict[str, Any]] = {}
    for entry in entries:
        iid = entry.get("incident_id", "unknown")
        if iid not in incidents:
            incidents[iid] = {
                "incident_id": iid,
                "first_seen": entry.get("timestamp"),
                "stages": [],
                "summary": entry.get("summary", ""),
                "outcome": entry.get("outcome", ""),
                "anomaly_type": None,
                "severity": None,
                "affected_resource": None,
                "namespace": None,
                "confidence": None,
                "action": None,
                "blast_radius": None,
            }
        incidents[iid]["stages"].append(entry.get("stage"))
        incidents[iid]["summary"] = entry.get("summary", incidents[iid]["summary"])
        incidents[iid]["outcome"] = entry.get("outcome", incidents[iid]["outcome"])
        incidents[iid]["last_seen"] = entry.get("timestamp")
        # Extract anomaly and plan details from entry details
        details = entry.get("details", {})
        anomaly = details.get("anomaly", {})
        plan = details.get("plan", {})
        if anomaly.get("type"):
            incidents[iid]["anomaly_type"] = anomaly["type"]
            incidents[iid]["severity"] = anomaly.get("severity")
            incidents[iid]["affected_resource"] = anomaly.get("affected_resource")
            incidents[iid]["namespace"] = anomaly.get("namespace")
            incidents[iid]["confidence"] = anomaly.get("confidence")
        if plan.get("action"):
            incidents[iid]["action"] = plan["action"]
            incidents[iid]["blast_radius"] = plan.get("blast_radius")
            if plan.get("confidence"):
                incidents[iid]["confidence"] = plan["confidence"]

    return list(incidents.values())


@router.get("/audit-log")
async def get_audit_log() -> list[dict[str, Any]]:
    """Return the full audit trail."""
    return _read_audit_log()


@router.post("/chat", response_model=ChatResponse)
async def war_room_chat(body: ChatRequest) -> ChatResponse:
    """War room: send a message to the LLM with current cluster context.

    Gathers a lightweight cluster state snapshot and uses it as context for
    a conversational LLM call.
    """
    from src.llm.client import llm_call

    # Build cluster context
    cluster_context = ""
    try:
        from src.utils.k8s_client import get_core_v1

        core = get_core_v1()
        pods = core.list_namespaced_pod(namespace=settings.NAMESPACE)
        pod_summaries = []
        for pod in pods.items:
            phase = pod.status.phase
            restarts = sum(
                (cs.restart_count or 0)
                for cs in (pod.status.container_statuses or [])
            )
            pod_summaries.append(f"  - {pod.metadata.name}: {phase} (restarts={restarts})")
        cluster_context = "Current pods:\n" + "\n".join(pod_summaries)
    except Exception:
        cluster_context = "(Unable to fetch cluster state)"
        logger.warning("war_room_chat: failed to fetch cluster state", exc_info=True)

    messages = [
        {
            "role": "system",
            "content": (
                "You are K8sWhisperer, an AI Kubernetes SRE assistant. "
                "Answer questions about the cluster using the provided context. "
                "Be concise and actionable.\n\n"
                f"Cluster state:\n{cluster_context}"
            ),
        },
        {"role": "user", "content": body.message},
    ]

    response_text = await llm_call(messages)
    return ChatResponse(response=response_text)


@router.get("/cluster-state")
async def get_cluster_state() -> dict[str, Any]:
    """Return current cluster state: pods and nodes."""
    result: dict[str, Any] = {"pods": [], "nodes": []}

    try:
        from src.utils.k8s_client import get_core_v1

        core = get_core_v1()

        # Pods
        pods = core.list_namespaced_pod(namespace=settings.NAMESPACE)
        for pod in pods.items:
            containers = []
            for cs in (pod.status.container_statuses or []):
                state_str = "unknown"
                reason = None
                if cs.state.running:
                    state_str = "running"
                elif cs.state.waiting:
                    state_str = "waiting"
                    reason = cs.state.waiting.reason
                elif cs.state.terminated:
                    state_str = "terminated"
                    reason = cs.state.terminated.reason
                containers.append({
                    "name": cs.name,
                    "ready": cs.ready,
                    "restart_count": cs.restart_count,
                    "state": state_str,
                    "reason": reason,
                })

            result["pods"].append({
                "name": pod.metadata.name,
                "namespace": pod.metadata.namespace,
                "phase": pod.status.phase,
                "node": pod.spec.node_name,
                "containers": containers,
            })

        # Nodes
        nodes = core.list_node()
        for node in nodes.items:
            conditions = {
                c.type: c.status for c in (node.status.conditions or [])
            }
            result["nodes"].append({
                "name": node.metadata.name,
                "ready": conditions.get("Ready", "Unknown"),
                "cpu": node.status.allocatable.get("cpu", "N/A") if node.status.allocatable else "N/A",
                "memory": node.status.allocatable.get("memory", "N/A") if node.status.allocatable else "N/A",
            })

    except Exception:
        logger.warning("get_cluster_state: failed to fetch state", exc_info=True)

    return result


@router.post("/chaos")
async def inject_chaos(count: int = 3) -> dict[str, Any]:
    """Inject chaos scenarios into the cluster for demo purposes."""
    from src.chaos.injector import inject_chaos as do_inject

    results = await do_inject(count=count)
    return {"injected": len(results), "scenarios": results}


@router.post("/chaos/inject")
async def inject_specific_chaos(scenario: str) -> dict[str, Any]:
    """Inject a specific chaos scenario by name."""
    from src.chaos.injector import inject_specific

    return await inject_specific(scenario)


@router.post("/chaos/cleanup")
async def cleanup_chaos() -> dict[str, Any]:
    """Delete all demo pods and deployments."""
    from src.chaos.injector import cleanup_demos

    return await cleanup_demos()


@router.get("/chaos/scenarios")
async def list_chaos_scenarios() -> list[dict[str, Any]]:
    """List all available chaos scenarios."""
    from src.chaos.injector import list_scenarios

    return list_scenarios()


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    """WebSocket for real-time incident update broadcasts."""
    await ws_manager.connect(ws)
    try:
        while True:
            # Keep the connection alive; clients only receive broadcasts
            await ws.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)
