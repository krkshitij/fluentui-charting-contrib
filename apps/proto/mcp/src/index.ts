import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerGenerateChartToolV2 } from "./tools/generate-chart-v2.js";
import { registerChartPlotlyResourceOai } from "./resources/chart-plotly-oai.js";

function createMcpServer() {
  const server = new McpServer({ name: "chart-generator", version: "1.0.0" });

  registerChartPlotlyResourceOai(server);
  registerGenerateChartToolV2(server);

  return server;
}

const port = Number(process.env.PORT ?? 8787);
const MCP_PATH = "/mcp";
const MCP_METHODS = new Set(["POST", "GET", "DELETE"]);

const sessions = new Map<
  string,
  { server: McpServer; transport: StreamableHTTPServerTransport }
>();

const httpServer = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS" && url.pathname === MCP_PATH) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain" }).end("MCP server");
    return;
  }

  if (url.pathname === MCP_PATH && req.method && MCP_METHODS.has(req.method)) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    // Reuse existing session
    if (sessionId && sessions.has(sessionId)) {
      const { transport } = sessions.get(sessionId)!;
      try {
        await transport.handleRequest(req, res);
      } catch (error) {
        console.error(`[session ${sessionId}] Error:`, error);
        if (!res.headersSent) {
          res.writeHead(500).end("Internal server error");
        }
      }
      return;
    }

    // New session — create server + transport
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        console.log(`[session ${id}] Initialized`);
        sessions.set(id, { server, transport });
      },
      onsessionclosed: (id) => {
        console.log(`[session ${id}] Closed`);
        sessions.delete(id);
      },
    });

    transport.onclose = () => {
      const id = transport.sessionId;
      if (id) {
        console.log(`[session ${id}] Transport closed`);
        sessions.delete(id);
      }
      server.close();
    };

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.writeHead(500).end("Internal server error");
      }
    }
    return;
  }

  res.writeHead(404).end("Not Found");
});

httpServer.listen(port, () => {
  console.log(`MCP server listening on http://localhost:${port}${MCP_PATH}`);
});
