"""Observe node — collects raw cluster state for anomaly detection."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from src.config import settings
from src.graph.state import ClusterState
from src.utils.k8s_client import get_apps_v1, get_core_v1

logger = logging.getLogger(__name__)

_SKIP_NAMESPACES = frozenset({"kube-system", "kube-public", "kube-node-lease"})


def _iso(dt) -> str | None:
    """Safely convert a k8s datetime to ISO string."""
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return dt.isoformat()
    return str(dt)


def observe_node(state: ClusterState) -> dict:
    """Collect pod statuses, recent events, and deployment rollout info.

    Returns ``{"events": [...]}`` where each entry is a normalised dict
    suitable for the classifier LLM.
    """
    namespace = settings.NAMESPACE
    if namespace in _SKIP_NAMESPACES:
        logger.warning("Configured NAMESPACE '%s' is in skip list; observing anyway.", namespace)

    normalised: list[dict] = []

    try:
        core = get_core_v1()

        # ── Pods ─────────────────────────────────────────────────────
        pods = core.list_namespaced_pod(namespace=namespace)
        for pod in pods.items:
            if (pod.metadata.namespace or "") in _SKIP_NAMESPACES:
                continue

            container_statuses = []
            for cs in pod.status.container_statuses or []:
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

                container_statuses.append({
                    "name": cs.name,
                    "ready": cs.ready,
                    "restart_count": cs.restart_count,
                    "state": state_str,
                    "reason": reason,
                    "image": cs.image,
                })

            normalised.append({
                "kind": "Pod",
                "name": pod.metadata.name,
                "namespace": pod.metadata.namespace,
                "phase": pod.status.phase,
                "container_statuses": container_statuses,
                "conditions": [
                    {
                        "type": c.type,
                        "status": c.status,
                        "reason": c.reason,
                        "message": c.message,
                    }
                    for c in (pod.status.conditions or [])
                ],
                "node_name": pod.spec.node_name,
                "timestamp": _iso(pod.metadata.creation_timestamp),
            })

        # ── Events (last 5 minutes) ─────────────────────────────────
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)
        events = core.list_namespaced_event(namespace=namespace)
        for ev in events.items:
            last_ts = ev.last_timestamp or ev.event_time
            if last_ts and last_ts.replace(tzinfo=timezone.utc) < cutoff:
                continue

            normalised.append({
                "kind": "Event",
                "name": ev.involved_object.name if ev.involved_object else None,
                "namespace": ev.metadata.namespace,
                "reason": ev.reason,
                "message": ev.message,
                "type": ev.type,
                "count": ev.count,
                "first_seen": _iso(ev.first_timestamp),
                "last_seen": _iso(last_ts),
                "involved_kind": ev.involved_object.kind if ev.involved_object else None,
            })

        # ── Deployment rollout status ────────────────────────────────
        try:
            apps = get_apps_v1()
            deployments = apps.list_namespaced_deployment(namespace=namespace)
            for dep in deployments.items:
                desired = dep.spec.replicas or 0
                updated = dep.status.updated_replicas or 0
                available = dep.status.available_replicas or 0
                if updated < desired or available < desired:
                    normalised.append({
                        "kind": "DeploymentRollout",
                        "name": dep.metadata.name,
                        "namespace": dep.metadata.namespace,
                        "desired_replicas": desired,
                        "updated_replicas": updated,
                        "available_replicas": available,
                        "conditions": [
                            {
                                "type": c.type,
                                "status": c.status,
                                "reason": c.reason,
                                "message": c.message,
                            }
                            for c in (dep.status.conditions or [])
                        ],
                        "timestamp": _iso(dep.metadata.creation_timestamp),
                    })
        except Exception:
            logger.exception("Failed to check deployment rollout status")

    except Exception:
        logger.exception("observe_node failed to collect cluster state")

    logger.info("observe_node collected %d events/signals", len(normalised))
    return {"events": normalised}
