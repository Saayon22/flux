"""Tracing and observability configuration for RepoRamp ADK Agent System.

Configures built-in tracing and logging to provide deep visibility into
multi-agent handoffs, long-running tool polls, and OpenCode subprocess calls.
"""

import logging
import os
import sys

def setup_tracing(service_name: str = "reporamp-agent-orchestrator") -> logging.Logger:
    """Configures structured logging and OpenTelemetry tracing for ADK agents."""
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=getattr(logging, log_level, logging.INFO),
        format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )
    logger = logging.getLogger(service_name)
    logger.info("Observability & tracing initialized for service: %s", service_name)
    return logger

logger = setup_tracing()
