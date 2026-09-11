"""Automated integration tests for Google ADK Agent in flux.

Verifies:
1. Agent status & capabilities endpoint (/api/agent/status)
2. Opt-in gate verification
3. End-to-end Agent handoff workflow with lazy fork, code resolution, complexity router, and PR/Plan output
4. Interactive Agent chat endpoint (/api/agent/chat)
"""

import asyncio
import sys
from pathlib import Path

# Ensure backend directory is in python search path
sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx
from main import app
from models.database import init_db


async def test_agent_integration():
    print("--- Running Google ADK Agent Integration Tests ---")
    init_db()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # 1. Test GET /api/agent/status
        res = await client.get("/api/agent/status")
        assert res.status_code == 200, f"Status failed: {res.text}"
        status_data = res.json()
        assert status_data["agent"] == "flux_root"
        assert status_data["framework"] == "Google ADK (google-adk)"
        assert status_data["has_api_key"] is True
        assert len(status_data["capabilities"]) >= 5
        print(f"[PASS] Agent status verified: {status_data['agent']} ({status_data['model']})")

        # 2. Test Opt-In Gate: Decline Handoff
        declined_res = await client.post(
            "/api/repos/octocat/Hello-World/issues/1/handoff",
            json={"opt_in": False},
        )
        assert declined_res.status_code == 200
        declined_data = declined_res.json()
        assert declined_data["status"] == "declined"
        assert declined_data["authorized"] is False
        print("[PASS] Human-in-the-Loop Opt-In gate rejection verified")

        # 3. Test Full Agent Handoff Execution
        handoff_res = await client.post(
            "/api/repos/octocat/Hello-World/issues/1/handoff",
            json={"opt_in": True, "user_notes": "Ensure clean unified diff"},
        )
        assert handoff_res.status_code == 200, f"Handoff failed: {handoff_res.text}"
        handoff_data = handoff_res.json()

        assert handoff_data["status"] == "success"
        assert handoff_data["authorized"] is True
        assert handoff_data["fork"]["provisioned"] is True
        assert "diff" in handoff_data
        assert "diff_stats" in handoff_data
        assert handoff_data["decision"] in ("pr", "plan")

        if handoff_data["decision"] == "pr":
            assert handoff_data["pr"] is not None
            assert "pr_url" in handoff_data["pr"]
            print(f"[PASS] Agent Handoff routed to PR: {handoff_data['pr']['pr_url']}")
        else:
            assert handoff_data["plan"] is not None
            assert "title" in handoff_data["plan"]
            print(f"[PASS] Agent Handoff routed to Plan Artifact: {handoff_data['plan']['title']}")

        # 4. Test Interactive Agent Chat
        chat_res = await client.post(
            "/api/agent/chat",
            json={"message": "What subagents do you have?"},
        )
        assert chat_res.status_code == 200, f"Chat failed: {chat_res.text}"
        chat_data = chat_res.json()
        assert chat_data["status"] == "success"
        assert len(chat_data["response"]) > 0
        print(f"[PASS] Agent chat turn succeeded ({len(chat_data['response'])} chars)")

    print("--- All Google ADK Agent Integration Tests Passed Successfully! ---")


if __name__ == "__main__":
    asyncio.run(test_agent_integration())
