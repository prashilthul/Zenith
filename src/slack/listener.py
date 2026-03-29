"""Slack Socket Mode listener for conversational agent control."""
import asyncio
import logging
import re
from slack_sdk.web.async_client import AsyncWebClient
from slack_sdk.socket_mode.aiohttp import SocketModeClient
from slack_sdk.socket_mode.request import SocketModeRequest
from slack_sdk.socket_mode.response import SocketModeResponse

from src.config import settings
from src.llm.client import llm_call_sync

logger = logging.getLogger(__name__)

# Quick action patterns
PATTERNS = {
    r"(?i)(status|health|how.*(cluster|pod))": "cluster_status",
    r"(?i)(fix|resolve|heal|remediate)": "fix_request",
    r"(?i)(incident|history|audit|log)": "incident_query",
    r"(?i)(chaos|break|inject)": "chaos_trigger",
}


async def handle_message(client: SocketModeClient, req: SocketModeRequest):
    """Handle incoming Slack messages and app mentions."""
    if req.type == "events_api":
        response = SocketModeResponse(envelope_id=req.envelope_id)
        await client.send_socket_mode_response(response)

        event = req.payload.get("event", {})
        if event.get("type") in ("app_mention", "message") and not event.get("bot_id"):
            text = event.get("text", "")
            channel = event.get("channel", "")
            thread_ts = event.get("ts", "")

            # Remove bot mention
            text = re.sub(r"<@\w+>", "", text).strip()

            if not text:
                return

            # Determine intent
            intent = _classify_intent(text)
            response_text = await _handle_intent(intent, text)

            # Reply in thread
            web_client = AsyncWebClient(token=settings.SLACK_BOT_TOKEN)
            await web_client.chat_postMessage(
                channel=channel,
                thread_ts=thread_ts,
                text=response_text,
            )

    elif req.type == "slash_commands":
        response = SocketModeResponse(envelope_id=req.envelope_id)
        await client.send_socket_mode_response(response)

        command = req.payload.get("command", "")
        text = req.payload.get("text", "")
        channel = req.payload.get("channel_id", "")

        response_text = await _handle_slash_command(command, text)

        web_client = AsyncWebClient(token=settings.SLACK_BOT_TOKEN)
        await web_client.chat_postMessage(channel=channel, text=response_text)


def _classify_intent(text: str) -> str:
    for pattern, intent in PATTERNS.items():
        if re.search(pattern, text):
            return intent
    return "general_query"


async def _handle_intent(intent: str, text: str) -> str:
    if intent == "cluster_status":
        return await _get_cluster_status()
    elif intent == "fix_request":
        return await _handle_fix_request(text)
    elif intent == "incident_query":
        return await _get_recent_incidents()
    elif intent == "chaos_trigger":
        return await _trigger_chaos()
    else:
        return await _general_chat(text)


async def _get_cluster_status() -> str:
    try:
        from src.mcp_server.kubectl_tools import get_pods, get_nodes

        pods = get_pods()
        nodes = get_nodes()

        total = len(pods) if isinstance(pods, list) else 0
        running = (
            sum(1 for p in pods if isinstance(p, dict) and p.get("phase") == "Running")
            if isinstance(pods, list)
            else 0
        )

        return (
            f"*Cluster Status*\n"
            f"  Pods: {running}/{total} running\n"
            f"  Nodes: {len(nodes) if isinstance(nodes, list) else 'unknown'}\n"
            f"  Namespace: {settings.NAMESPACE}"
        )
    except Exception as e:
        return f"Error fetching cluster status: {e}"


async def _handle_fix_request(text: str) -> str:
    try:
        import uuid
        from src.graph.builder import run_pipeline

        thread_id = f"slack-fix-{uuid.uuid4().hex[:8]}"
        result = await asyncio.to_thread(run_pipeline, thread_id=thread_id)
        anomalies = result.get("anomalies", []) if isinstance(result, dict) else []
        if anomalies:
            return f"Scan complete: {len(anomalies)} anomalies detected and processed. Check dashboard for details."
        return "Scan complete: no anomalies detected."
    except Exception as e:
        return f"Error triggering fix: {e}"


async def _get_recent_incidents() -> str:
    try:
        import json
        from pathlib import Path

        audit_path = Path("data/audit_log.json")
        if not audit_path.exists():
            return "No incidents recorded yet."
        entries = json.loads(audit_path.read_text())
        recent = entries[-5:] if len(entries) > 5 else entries
        lines = []
        for e in recent:
            lines.append(
                f"  `{e.get('incident_id', 'unknown')[:12]}` | "
                f"{e.get('stage', '?')} | {e.get('outcome', '?')}"
            )
        return f"*Recent Incidents ({len(entries)} total)*\n" + "\n".join(lines)
    except Exception as e:
        return f"Error: {e}"


async def _trigger_chaos() -> str:
    try:
        from src.chaos.injector import inject_chaos

        results = await inject_chaos(count=2)
        names = (
            [r.get("scenario", "unknown") for r in results]
            if isinstance(results, list)
            else ["chaos injected"]
        )
        return f"Chaos injected: {', '.join(names)}"
    except Exception as e:
        return f"Chaos injection failed: {e}"


async def _general_chat(text: str) -> str:
    try:
        messages = [
            {
                "role": "system",
                "content": (
                    "You are K8sWhisperer, an AI Kubernetes incident response agent. "
                    "Answer questions about cluster health, incidents, and remediation "
                    "strategies. Be concise."
                ),
            },
            {"role": "user", "content": text},
        ]
        response = await asyncio.to_thread(llm_call_sync, messages)
        return response or "I couldn't generate a response. Try asking about cluster status or recent incidents."
    except Exception as e:
        return f"Error: {e}"


async def _handle_slash_command(command: str, text: str) -> str:
    if command == "/k8s":
        if not text:
            return (
                "*K8sWhisperer Commands*\n"
                "  `/k8s status` - Cluster health\n"
                "  `/k8s incidents` - Recent incidents\n"
                "  `/k8s chaos` - Inject failures\n"
                "  `/k8s fix` - Trigger scan & remediation"
            )
        return await _handle_intent(_classify_intent(text), text)
    return "Unknown command"


async def start_socket_mode():
    """Start Slack Socket Mode listener."""
    if not settings.SLACK_APP_TOKEN:
        logger.warning("SLACK_APP_TOKEN not set, skipping Socket Mode listener")
        return

    client = SocketModeClient(
        app_token=settings.SLACK_APP_TOKEN,
        web_client=AsyncWebClient(token=settings.SLACK_BOT_TOKEN),
    )
    client.socket_mode_request_listeners.append(handle_message)

    logger.info("Starting Slack Socket Mode listener...")
    await client.connect()

    # Keep alive
    while True:
        await asyncio.sleep(1)
