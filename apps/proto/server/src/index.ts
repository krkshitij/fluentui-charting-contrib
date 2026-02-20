import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { registerDisplayChartTool } from "./tools/display-chart.js";
import { registerGenerateChartToolV2 } from "./tools/generate-chart-v2.js";
import { PLOTLY_TEMPLATE_URI } from "./lib.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, "..", "public");

// const VEGA_TEMPLATE_URI = "ui://widget/chart-vega.html";
const MIME_TYPE = "text/html+skybridge";

function createMcpServer() {
  const server = new McpServer({ name: "chart-app", version: "1.0.0" });

  server.registerResource(
    "chart-plotly",
    PLOTLY_TEMPLATE_URI,
    {},
    async () => ({
      contents: [
        {
          uri: PLOTLY_TEMPLATE_URI,
          text: readFileSync(
            path.join(ASSETS_DIR, "chart-plotly.html"),
            "utf8",
          ),
          mimeType: MIME_TYPE,
          _meta: {
            "openai/widgetPrefersBorder": true,
          },
        },
      ],
    }),
  );

  // server.registerResource("chart-vega", VEGA_TEMPLATE_URI, {}, async () => ({
  //   contents: [
  //     {
  //       uri: VEGA_TEMPLATE_URI,
  //       text: readFileSync(path.join(ASSETS_DIR, "chart-vega.html"), "utf8"),
  //       mimeType: MIME_TYPE,
  //       _meta: {
  //         "openai/widgetPrefersBorder": true,
  //       },
  //     },
  //   ],
  // }));

  registerGenerateChartToolV2(server);

  return server;
}

const port = Number(process.env.PORT ?? 8787);
const MCP_PATH = "/mcp";

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

  const MCP_METHODS = new Set(["POST", "GET", "DELETE"]);
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
