# Integration tests for Google ADK Agent status, opt-in gate, handoff, and chat endpoints.

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx
from main import app
from models.database import init_db


# Verifies agent capabilities, human-in-the-loop opt-in, autonomous handoff, and interactive chat.
async def test_agent_integration():
    init_db()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Agent status endpoint verification
        res = await client.get("/api/agent/status")
        assert res.status_code == 200
        status_data = res.json()
        assert status_data["agent"] == "flux_root"
        assert len(status_data["capabilities"]) >= 5

        # Opt-in gate decline test
        declined_res = await client.post("/api/repos/octocat/Hello-World/issues/1/handoff", json={"opt_in": False})
        assert declined_res.status_code == 200
        assert declined_res.json()["status"] == "declined"

        # Full agent handoff execution test
        handoff_res = await client.post(
            "/api/repos/octocat/Hello-World/issues/1/handoff",
            json={"opt_in": True, "user_notes": "Ensure clean unified diff"},
        )
        assert handoff_res.status_code == 200
        handoff_data = handoff_res.json()
        assert handoff_data["status"] == "success"
        assert handoff_data["decision"] in ("pr", "plan")

        # Interactive chat test
        chat_res = await client.post("/api/agent/chat", json={"message": "What subagents do you have?"})
        assert chat_res.status_code == 200
        assert chat_res.json()["status"] == "success"


if __name__ == "__main__":
    asyncio.run(test_agent_integration())
