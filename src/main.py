"""K8sWhisperer entry point.

Run directly to start the FastAPI server with the background observation loop:

    python -m src.main
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid

import uvicorn

from src.api.server import app  # noqa: F401 — re-exported for uvicorn

logger = logging.getLogger(__name__)

# ── Standalone observation loop ─────────────────────────────────────────────

_DEDUP_CACHE_MAX_AGE = 600  # 10 minutes


def _clear_stale_dedup_entries() -> None:
    """Remove entries older than 10 minutes from the detect node dedup cache."""
    try:
        from src.graph.nodes.detect import _seen, _DEDUP_WINDOW_SECONDS

        now = time.time()
        stale_keys = [
            key for key, ts in _seen.items()
            if (now - ts) >= _DEDUP_WINDOW_SECONDS
        ]
        for key in stale_keys:
            del _seen[key]
        if stale_keys:
            logger.info("Cleared %d stale dedup cache entries", len(stale_keys))
    except Exception:
        logger.exception("Failed to clear dedup cache")


async def observation_loop(interval_seconds: int = 30) -> None:
    """Periodically invoke the LangGraph pipeline to scan the cluster.

    Designed to run as an ``asyncio.Task``.  Catches all exceptions so that
    a single failed run never kills the loop.

    Each cycle:
    1. Clears stale dedup cache entries (older than 10 minutes).
    2. Creates a fresh thread_id and invokes the full pipeline.
    3. If anomalies are found, the pipeline runs through all 7 stages.
    4. If no anomalies, just logs and waits for the next cycle.
    5. On any error, logs the traceback and continues.

    Parameters
    ----------
    interval_seconds:
        Pause between pipeline invocations (default 30 s).
    """
    from src.graph.builder import run_pipeline

    logger.info(
        "observation_loop: started (interval=%ds)", interval_seconds
    )

    while True:
        thread_id = f"obs-{uuid.uuid4().hex[:8]}"
        try:
            # Housekeeping: clear stale dedup entries each cycle
            _clear_stale_dedup_entries()

            logger.info("observation_loop: starting pipeline (thread=%s)", thread_id)
            result = run_pipeline(thread_id=thread_id)

            anomalies = result.get("anomalies", []) if isinstance(result, dict) else []
            if anomalies:
                logger.info(
                    "observation_loop: pipeline complete — %d anomalies processed (thread=%s)",
                    len(anomalies),
                    thread_id,
                )
            else:
                logger.info("observation_loop: No anomalies detected (thread=%s)", thread_id)
        except Exception:
            logger.exception("observation_loop: pipeline run failed (thread=%s)", thread_id)
        await asyncio.sleep(interval_seconds)


# ── Main ────────────────────────────────────────────────────────────────────


def main() -> None:
    """Start the Uvicorn server on port 8000.

    The observation loop is started automatically via the FastAPI lifespan
    defined in ``src.api.server``.
    """
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
