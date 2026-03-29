"""Detect node — classifies raw events into structured anomalies via LLM."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, timezone

from src.graph.state import ClusterState
from src.llm.client import llm_call_json_sync
from src.llm.prompts import CLASSIFIER_SYSTEM_PROMPT
from src.models import Anomaly

logger = logging.getLogger(__name__)

# Deduplication cache: (anomaly_type, resource) -> last_seen_epoch
_seen: dict[tuple[str, str], float] = {}
_DEDUP_WINDOW_SECONDS = 600  # 10 minutes


def _is_duplicate(anomaly_type: str, resource: str) -> bool:
    """Return True if this (type, resource) pair was seen in the last 10 min."""
    key = (anomaly_type, resource)
    now = time.time()
    if key in _seen and (now - _seen[key]) < _DEDUP_WINDOW_SECONDS:
        return True
    _seen[key] = now
    return False


def _validate_anomaly(anomaly: dict, events: list[dict]) -> bool:
    """Apply additional validation rules beyond LLM classification.

    Returns True if the anomaly passes validation.
    """
    atype = anomaly.get("type", "")
    resource = anomaly.get("affected_resource", "")

    if atype == "CrashLoopBackOff":
        # Verify restartCount > 3 from the raw event data
        for ev in events:
            if ev.get("kind") == "Pod" and ev.get("name") == resource:
                total_restarts = sum(
                    cs.get("restart_count", 0)
                    for cs in ev.get("container_statuses", [])
                )
                if total_restarts <= 3:
                    logger.info(
                        "Skipping CrashLoopBackOff for %s: restartCount=%d <= 3",
                        resource, total_restarts,
                    )
                    return False
                return True
        # If we can't find the pod in events, let the anomaly through
        return True

    if atype == "CPUThrottling":
        # Verify from HPA or pod resource data that CPU is near limits
        for ev in events:
            if ev.get("kind") == "HPA" and ev.get("name") == resource:
                current_cpu = ev.get("current_cpu_utilization_percentage")
                target_cpu = ev.get("target_cpu_utilization_percentage")
                if current_cpu is not None and target_cpu is not None:
                    if current_cpu < target_cpu * 0.8:
                        logger.info(
                            "Skipping CPUThrottling for %s: CPU utilization %d%% "
                            "well below target %d%%",
                            resource, current_cpu, target_cpu,
                        )
                        return False
                return True
            # Also accept pod-level CPU evidence
            if ev.get("kind") == "Pod" and ev.get("name") == resource:
                return True
        return True

    if atype == "Pending":
        # Verify pod has been Pending for > 5 minutes
        for ev in events:
            if ev.get("kind") == "Pod" and ev.get("name") == resource:
                ts_str = ev.get("timestamp")
                if ts_str:
                    try:
                        created = datetime.fromisoformat(ts_str)
                        if created.tzinfo is None:
                            created = created.replace(tzinfo=timezone.utc)
                        age = (datetime.now(timezone.utc) - created).total_seconds()
                        if age < 300:  # less than 5 minutes
                            logger.info(
                                "Skipping Pending for %s: age=%.0fs < 300s",
                                resource, age,
                            )
                            return False
                    except (ValueError, TypeError):
                        pass
                return True
        return True

    return True


def detect_node(state: ClusterState) -> dict:
    """Classify events into anomalies using the LLM classifier.

    Returns ``{"anomalies": [...], "current_anomaly_index": 0}``.
    """
    # Skip detection if anomalies are already pre-populated (multi-anomaly processing)
    existing = state.get("anomalies", [])
    if existing:
        logger.info("detect_node: skipping — %d anomalies already populated", len(existing))
        return {"anomalies": [], "current_anomaly_index": 0}

    events = state.get("events", [])
    if not events:
        logger.info("detect_node: no events to classify")
        return {"anomalies": [], "current_anomaly_index": 0}

    # Build user prompt from events
    user_message = json.dumps(events, indent=2, default=str)

    # Call classifier LLM
    messages = [
        {"role": "system", "content": CLASSIFIER_SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]

    raw_anomalies = llm_call_json_sync(messages)

    if not isinstance(raw_anomalies, list):
        logger.warning("Classifier returned non-list: %s", type(raw_anomalies))
        raw_anomalies = []

    # Validate, deduplicate, and normalise
    anomalies: list[Anomaly] = []
    for raw in raw_anomalies:
        if not isinstance(raw, dict):
            continue

        atype = raw.get("type", "Unknown")
        resource = raw.get("affected_resource", "unknown")

        if _is_duplicate(atype, resource):
            logger.info("Skipping duplicate anomaly: %s on %s", atype, resource)
            continue

        if not _validate_anomaly(raw, events):
            continue

        anomaly: Anomaly = {
            "type": atype,
            "severity": raw.get("severity", "MED"),
            "affected_resource": resource,
            "namespace": raw.get("namespace", ""),
            "confidence": float(raw.get("confidence", 0.5)),
            "raw_signal": raw.get("raw_signal", ""),
            "timestamp": raw.get("timestamp", datetime.now(timezone.utc).isoformat()),
        }
        anomalies.append(anomaly)

    # Only mark the first anomaly as "seen" (pipeline processes index 0).
    # Other anomalies will be re-detected and processed in subsequent cycles.
    if len(anomalies) > 1:
        for extra in anomalies[1:]:
            key = (extra["type"], extra["affected_resource"])
            _seen.pop(key, None)
            logger.info("Un-marking dedup for queued anomaly: %s on %s", extra["type"], extra["affected_resource"])

    logger.info("detect_node found %d anomalies", len(anomalies))
    return {"anomalies": anomalies, "current_anomaly_index": 0}
