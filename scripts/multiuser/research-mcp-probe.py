"""Disposable integration test client; official SDK, no mock connector responses."""
import asyncio
import json
import os
import sys
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def main():
    parameters = StdioServerParameters(command=sys.executable, args=["-m", "bnr.mcp_server", "--config", os.environ["BM_TEST_CONNECTOR_CONFIG"]], env=dict(os.environ))
    async with stdio_client(parameters) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            names = {t.name for t in (await session.list_tools()).tools}
            assert {"bibliomap_connections", "bibliomap_read", "bibliomap_submit", "bibliomap_job"} <= names
            async def call(name, args):
                result = await session.call_tool(name, args)
                return result.structuredContent or json.loads(result.content[0].text)
            connections = await call("bibliomap_connections", {})
            assert connections["connections"][0]["id"] == "disposable"
            page = await call("bibliomap_read", {"connection_id": "disposable", "operation": "evidence_page", "request": {"evidence_id": os.environ["BM_TEST_EVIDENCE"], "limit": 2}})
            assert page["total"] == 4 and page["records"][0]["display_name"] == "μ original"
            rejected = await call("bibliomap_read", {"connection_id": "disposable", "operation": "evidence_page", "request": {"url": "http://attacker.invalid"}})
            assert rejected["code"] == "invalid_spec"
            status = await call("bibliomap_job", {"connection_id": "disposable", "job_id": os.environ["BM_TEST_JOB"]})
            assert status["status"] == "succeeded"
            summary = await call("bibliomap_read", {"connection_id": "disposable", "operation": "result_page", "request": {"result_id": status["resultId"]}})
            assert summary["nodes"] == 4 and summary["edges"] == 1
            artifacts = await call("bibliomap_read", {"connection_id": "disposable", "operation": "result_page", "request": {"result_id": status["resultId"], "section": "artifacts"}})
            artifact = await call("bibliomap_read", {"connection_id": "disposable", "operation": "artifact_text", "request": {"result_id": status["resultId"], "artifact_index": 0, "max_bytes": 1000}})
            assert artifact["text"] and artifact["sha256"] == artifacts["values"][0]["sha256"]
            saved = await call("bibliomap_finding", {"connection_id": "disposable", "result_id": status["resultId"], "name": "Test interpretation", "text": "Descriptive fixture only."})
            findings = await call("bibliomap_read", {"connection_id": "disposable", "operation": "findings", "request": {"limit": 1}})
            assert saved["id"] == findings["findings"][0]["id"] and findings["findings"][0]["text"] == "Descriptive fixture only."
            print(json.dumps({"official_sdk": True, "tools_discovered": len(names), "checks": 8, "finding_id": saved["id"]}))


if __name__ == "__main__": asyncio.run(main())
