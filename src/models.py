"""Core data models used across K8sWhisperer."""

from __future__ import annotations

from typing import Literal, TypedDict


# ── Anomaly ─────────────────────────────────────────────────────────────

class Anomaly(TypedDict):
    """A detected cluster anomaly."""

    type: str
    severity: Literal["LOW", "MED", "HIGH", "CRITICAL"]
    affected_resource: str
    namespace: str
    confidence: float  # 0.0 – 1.0
    raw_signal: str
    timestamp: str  # ISO-8601


# ── Remediation ─────────────────────────────────────────────────────────

class RemediationPlan(TypedDict):
    """A proposed remediation action with risk metadata."""

    action: str
    target: str
    namespace: str
    params: dict
    confidence: float  # 0.0 – 1.0
    blast_radius: Literal["low", "medium", "high"]
    is_destructive: bool
    reasoning: str


# ── Audit / Logging ─────────────────────────────────────────────────────

class LogEntry(TypedDict):
    """A single entry in the incident audit trail."""

    incident_id: str
    timestamp: str  # ISO-8601
    stage: str
    summary: str
    details: dict
    decision: str
    outcome: str


# ── Constants ───────────────────────────────────────────────────────────

DESTRUCTIVE_ACTIONS: frozenset[str] = frozenset(
    {
        "rollback_deployment",
        "drain_node",
        "delete_namespace",
        "scale_down",
        "force_delete_pod",
        "cordon_node",
    }
)

ANOMALY_TYPES: dict[str, str] = {
    "CrashLoopBackOff": "Pod restart count > 3 within 10 minutes",
    "OOMKilled": "Container terminated with OOMKilled reason",
    "HighLatency": "P99 latency exceeds SLO threshold (>500ms)",
    "NodeNotReady": "Node condition Ready=False for >60 seconds",
    "PVCPending": "PersistentVolumeClaim stuck in Pending state >5 minutes",
    "ImagePullBackOff": "Container image pull failures for >2 minutes",
    "ResourceQuotaExhausted": "Namespace resource quota utilization >90%",
    "CertificateExpiry": "TLS certificate expires within 7 days",
}
