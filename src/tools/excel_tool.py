from functools import partial
from pathlib import Path

import langchain_mcp_adapters.sessions as mcp_sessions
from langchain_mcp_adapters.client import MultiServerMCPClient
from mcp.client.stdio import stdio_client


# Excel MCP can access only this folder.
excel_dir = Path("excel_files").resolve()
excel_dir.mkdir(exist_ok=True)

# Windows Jupyter stderr has no fileno(). Send MCP server logs to a file.
mcp_log = open("mcp_excel_stderr.log", "a", encoding="utf-8")
mcp_sessions.stdio_client = partial(stdio_client, errlog=mcp_log)

mcp_client = MultiServerMCPClient(
    {
        "excel": {
            "command": r"C:\Users\VICTUS\.local\bin\uvx.exe",
            "args": [
                "excel-mcp-server",
                "stdio",
                "--allow-dir",
                str(excel_dir),
            ],
            "transport": "stdio",
        }
        
    }
)

excel_tools = mcp_client.get_tools(server_name="excel")
