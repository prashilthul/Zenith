"""K8sWhisperer entry point.

Run directly to start the FastAPI server with the background observation loop:

    python -m src.main
"""

from __future__ import annotations

import asyncio
import logging
import uuid

import uvicorn

from src.api.server import app  # noqa: F401 — re-exported for uvicorn

logger = logging.getLogger(__name__)

# ── Standalone observation loop ─────────────────────────────────────────────


async def observation_loop(interval_seconds: int = 30) -> None:
    """Periodically invoke the LangGraph pipeline to scan the cluster.

    Designed to run as an ``asyncio.Task``.  Catches all exceptions so that
    a single failed run never kills the loop.

    Parameters
    ----------
    interval_seconds:
        Pause between pipeline invocations (default 30 s).
    """
    from src.graph.builder import run_pipeline

    while True:
        thread_id = f"obs-{uuid.uuid4().hex[:8]}"
        try:
            logger.info("observation_loop: starting pipeline (thread=%s)", thread_id)
            run_pipeline(thread_id=thread_id)
            logger.info("observation_loop: pipeline complete (thread=%s)", thread_id)
        except Exception:
            logger.exception("observation_loop: pipeline run failed (thread=%s)", thread_id)
        await asyncio.sleep(interval_seconds)


# ── Main ────────────────────────────────────────────────────────────────────


def main() -> None:
    """Start the Uvicorn server on port 8000."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    )
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()
