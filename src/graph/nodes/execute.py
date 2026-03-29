"""Execute node — carries out the remediation plan and verifies the result."""

from __future__ import annotations

import logging
import time

from src.graph.state import ClusterState
from src.mcp_server.kubectl_tools import (
    delete_pod,
    get_pods,
    patch_deployment_resources,
    rollback_deployment,
)

logger = logging.getLogger(__name__)

# Backoff schedule for verification (seconds)
_VERIFY_BACKOFFS = [5, 10, 20, 40, 60]


def _execute_action(plan: dict) -> dict:
    """Map a plan action to the corresponding kubectl tool call."""
    action = plan.get("action", "")
    target = plan.get("target", "")
    # Strip kind prefix like "pod/" or "deployment/" from target name
    if "/" in target:
        target = target.split("/", 1)[-1]
    namespace = plan.get("namespace", "k8swhisperer-demo")
    params = plan.get("params", {})

    if action == "delete_pod":
        return delete_pod(name=target, namespace=namespace)

    if action == "patch_deployment_resources":
        return patch_deployment_resources(
            name=target,
            namespace=namespace,
            container_name=params.get("container_name", ""),
            memory_limit=params.get("memory_limit", ""),
            cpu_limit=params.get("cpu_limit", ""),
        )

    if action == "rollback_deployment":
        return rollback_deployment(name=target, namespace=namespace)

    if action == "no_op":
        return {"status": "no_op", "message": "No action taken per plan."}

    return {"error": f"Unknown action: {action}"}


def _verify_pod_health(pod_name: str, namespace: str) -> str:
    """Check if the target pod is Running and Ready.

    Returns a status string: "success: ..." or "failure: ...".
    """
    pods = get_pods(namespace=namespace)
    if isinstance(pods, list) and pods and "error" in pods[0]:
        return f"failure: unable to list pods — {pods[0].get('error', '')}"

    for pod in pods:
        if pod.get("name") == pod_name:
            phase = pod.get("phase", "")
            ready = pod.get("ready", False)
            if phase == "Running" and ready:
                return f"success: pod {pod_name} is Running and Ready"
            # Report the actual state for diagnosis
            statuses = pod.get("container_statuses", [])
            reasons = [
                cs.get("reason", "") for cs in statuses if cs.get("reason")
            ]
            reason_str = ", ".join(reasons) if reasons else phase
            return f"failure: pod {pod_name} is {reason_str}"

    # Pod not found — if we just deleted it, this is success
    return f"success: pod {pod_name} was removed (not found in namespace)"


def execute_node(state: ClusterState) -> dict:
    """Execute the remediation plan and verify the outcome.

    Returns ``{"result": "success: ..." or "failure: ...", "retry_count": N}``.
    """
    plan = state.get("plan")
    retry_count = state.get("retry_count", 0)

    if plan is None:
        logger.warning("execute_node: no plan to execute")
        return {"result": "failure: no plan provided", "retry_count": retry_count}

    action = plan.get("action", "no_op")
    target = plan.get("target", "")
    # Strip kind prefix like "pod/" or "deployment/"
    if "/" in target:
        target = target.split("/", 1)[-1]
    namespace = plan.get("namespace", "k8swhisperer-demo")

    logger.info("execute_node: executing action=%s on %s/%s", action, namespace, target)

    # ── Execute ──────────────────────────────────────────────────────
    exec_result = _execute_action(plan)

    if "error" in exec_result:
        logger.error("Execution failed: %s", exec_result["error"])
        return {
            "result": f"failure: {exec_result['error']}",
            "retry_count": retry_count + 1,
        }

    if action == "no_op":
        return {"result": "success: no action required", "retry_count": retry_count}

    # ── Verify with backoff ──────────────────────────────────────────
    logger.info("execute_node: entering verification loop for %s", target)
    last_status = "failure: verification not started"

    for delay in _VERIFY_BACKOFFS:
        time.sleep(delay)
        last_status = _verify_pod_health(target, namespace)
        logger.info("Verify after %ds: %s", delay, last_status)
        if last_status.startswith("success"):
            return {"result": last_status, "retry_count": retry_count}

    # All verification attempts exhausted
    logger.warning("Verification failed after all backoffs: %s", last_status)
    return {"result": last_status, "retry_count": retry_count + 1}
