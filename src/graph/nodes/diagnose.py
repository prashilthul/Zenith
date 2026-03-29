"""Diagnose node — fetches targeted evidence and runs root-cause analysis."""

from __future__ import annotations

import asyncio
import json
import logging

from src.graph.state import ClusterState
from src.llm.client import llm_call
from src.llm.prompts import DIAGNOSTICIAN_SYSTEM_PROMPT
from src.mcp_server.kubectl_tools import (
    describe_pod,
    get_events,
    get_nodes,
    get_pod_logs,
)
from src.utils.log_chunker import chunk_logs

logger = logging.getLogger(__name__)


def _gather_evidence(anomaly: dict) -> str:
    """Fetch kubectl evidence specific to the anomaly type.

    Returns a formatted string of all evidence for the LLM.
    """
    atype = anomaly.get("type", "Unknown")
    resource = anomaly.get("affected_resource", "")
    namespace = anomaly.get("namespace", "k8swhisperer-demo")
    evidence_parts: list[str] = []

    try:
        if atype == "CrashLoopBackOff":
            # Previous logs + describe + events
            prev_logs = get_pod_logs(name=resource, namespace=namespace, previous=True, tail_lines=150)
            evidence_parts.append(f"=== Previous Container Logs ===\n{chunk_logs(prev_logs)}")

            current_logs = get_pod_logs(name=resource, namespace=namespace, tail_lines=50)
            evidence_parts.append(f"=== Current Container Logs ===\n{chunk_logs(current_logs)}")

            desc = describe_pod(name=resource, namespace=namespace)
            evidence_parts.append(f"=== Pod Describe ===\n{json.dumps(desc, indent=2, default=str)}")

            evts = get_events(namespace=namespace, limit=20)
            evidence_parts.append(f"=== Recent Events ===\n{json.dumps(evts, indent=2, default=str)}")

        elif atype == "OOMKilled":
            # Resource limits + describe
            desc = describe_pod(name=resource, namespace=namespace)
            evidence_parts.append(f"=== Pod Describe (resource limits) ===\n{json.dumps(desc, indent=2, default=str)}")

            prev_logs = get_pod_logs(name=resource, namespace=namespace, previous=True, tail_lines=100)
            evidence_parts.append(f"=== Previous Container Logs ===\n{chunk_logs(prev_logs)}")

        elif atype in ("Pending", "FailedScheduling"):
            # Describe (scheduling) + node capacity
            desc = describe_pod(name=resource, namespace=namespace)
            evidence_parts.append(f"=== Pod Describe ===\n{json.dumps(desc, indent=2, default=str)}")

            nodes = get_nodes()
            evidence_parts.append(f"=== Node Capacity ===\n{json.dumps(nodes, indent=2, default=str)}")

        elif atype == "ImagePullBackOff":
            # Describe (image name)
            desc = describe_pod(name=resource, namespace=namespace)
            evidence_parts.append(f"=== Pod Describe ===\n{json.dumps(desc, indent=2, default=str)}")

        elif atype == "Evicted":
            # Node conditions
            nodes = get_nodes()
            evidence_parts.append(f"=== Node Conditions ===\n{json.dumps(nodes, indent=2, default=str)}")

            desc = describe_pod(name=resource, namespace=namespace)
            evidence_parts.append(f"=== Pod Describe ===\n{json.dumps(desc, indent=2, default=str)}")

        else:
            # Generic: describe + events
            desc = describe_pod(name=resource, namespace=namespace)
            evidence_parts.append(f"=== Pod Describe ===\n{json.dumps(desc, indent=2, default=str)}")

            evts = get_events(namespace=namespace, limit=20)
            evidence_parts.append(f"=== Recent Events ===\n{json.dumps(evts, indent=2, default=str)}")

    except Exception:
        logger.exception("Failed to gather evidence for %s/%s", atype, resource)
        evidence_parts.append("[Error gathering some evidence — partial data below]")

    return "\n\n".join(evidence_parts)


def diagnose_node(state: ClusterState) -> dict:
    """Diagnose the current anomaly using targeted evidence and an LLM.

    Returns ``{"diagnosis": "<root cause string>"}``.
    """
    anomalies = state.get("anomalies", [])
    idx = state.get("current_anomaly_index", 0)

    if not anomalies or idx >= len(anomalies):
        logger.warning("diagnose_node: no anomaly at index %d", idx)
        return {"diagnosis": "No anomaly to diagnose."}

    anomaly = anomalies[idx]
    logger.info(
        "diagnose_node: analysing %s on %s",
        anomaly.get("type"),
        anomaly.get("affected_resource"),
    )

    evidence = _gather_evidence(anomaly)

    user_message = (
        f"Anomaly: {json.dumps(anomaly, default=str)}\n\n"
        f"Evidence:\n{evidence}"
    )

    messages = [
        {"role": "system", "content": DIAGNOSTICIAN_SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]

    try:
        diagnosis = asyncio.get_event_loop().run_until_complete(
            llm_call(messages)
        )
    except RuntimeError:
        diagnosis = asyncio.run(llm_call(messages))

    if not diagnosis:
        diagnosis = (
            f"Unable to determine root cause for {anomaly.get('type')} "
            f"on {anomaly.get('affected_resource')}. Manual investigation required."
        )

    logger.info("diagnose_node result: %s", diagnosis[:200])
    return {"diagnosis": diagnosis}
