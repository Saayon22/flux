"""Terminal Interactive Session for RepoRamp ADK Agent.

Usage:
    python cli.py

Provides an interactive terminal session where you can chat with the
RepoRamp multi-agent system, analyze repositories, investigate issues,
and edit local code.
"""

import asyncio
import os
import sys
import uuid
import warnings
warnings.filterwarnings("ignore")

from google.adk import Runner
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.genai import types

from agent import root_agent
from tracing import logger


class TerminalChatSession:
    """Manages an interactive terminal chat session with the ADK Runner."""

    def __init__(self, user_id: str = "default_user"):
        self.user_id = user_id
        self.session_id = f"sess_{uuid.uuid4().hex[:8]}"
        self.session_service = InMemorySessionService()
        self.runner = Runner(
            app_name="reporamp",
            agent=root_agent,
            session_service=self.session_service,
            auto_create_session=True,
        )

    async def send_message(self, text: str) -> str:
        """Sends a message to the agent and collects the synthesized response."""
        content = types.Content(
            role="user",
            parts=[types.Part.from_text(text=text)],
        )

        response_chunks = []
        try:
            async for event in self.runner.run_async(
                user_id=self.user_id,
                session_id=self.session_id,
                new_message=content,
            ):
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if getattr(part, "text", None):
                            response_chunks.append(part.text)
                elif event.output:
                    response_chunks.append(str(event.output))

            if response_chunks:
                return "".join(response_chunks).strip()
            return "Task completed."

        except Exception as e:
            logger.warning("Agent execution notice: %s", e)
            # If an external DNS or network error occurred during remote model call,
            # provide a graceful local assistance response so the session never crashes.
            err_msg = str(e)
            if "DNS" in err_msg or "Cannot connect" in err_msg or "ClientConnector" in err_msg:
                return (
                    f"[Network Notice: Remote model endpoint temporarily unreachable]\n"
                    f"Local tools are active. Your command: '{text}'.\n"
                    f"To perform local operations directly, you can also inspect local files or run git commands."
                )
            return f"Agent response error: {err_msg}"


async def interactive_loop():
    """Runs the terminal interactive REPL loop."""
    print("=" * 70)
    print("  REPORAMP — TERMINAL INTERACTIVE SESSION")
    print("  Powered by Google ADK (google-adk 2.9.0)")
    print("=" * 70)
    print("Type your message and press Enter. Type 'exit' or 'quit' to end.\n")

    session = TerminalChatSession()

    while True:
        try:
            user_input = input("You > ").strip()
            if not user_input:
                continue
            if user_input.lower() in ("exit", "quit", "q"):
                print("Exiting interactive session. Goodbye!")
                break

            print("\nAgent is thinking...", end="\r")
            response = await session.send_message(user_input)
            print(" " * 30, end="\r")  # Clear thinking indicator
            print(f"\nAgent >\n{response}\n")
            print("-" * 70)

        except (KeyboardInterrupt, EOFError):
            print("\nSession interrupted. Exiting.")
            break


def main():
    asyncio.run(interactive_loop())


if __name__ == "__main__":
    main()
