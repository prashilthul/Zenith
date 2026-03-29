"""LangGraph shared state definition with annotated reducers."""

from __future__ import annotations

import operator
from typing import Annotated, Optional, TypedDict

from src.models import Anomaly, LogEntry, RemediationPlan


class ClusterState(TypedDict):
    """Shared state that flows through the K8sWhisperer LangGraph."""

    events: Annotated[list[dict], operator.add]
    anomalies: Annotated[list[Anomaly], operator.add]
    diagnosis: str
    plan: Optional[RemediationPlan]
    approved: bool
    result: str
    audit_log: Annotated[list[LogEntry], operator.add]
    current_anomaly_index: int
    retry_count: int
    incident_id: str
