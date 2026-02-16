import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, "..", "public");

const PLOTLY_TEMPLATE_URI = "ui://widget/chart-plotly.html";
const VEGA_TEMPLATE_URI = "ui://widget/chart-vega.html";
const MIME_TYPE = "text/html+skybridge";

const displayChartInputSchema = {
  id: z.number().describe("The ID of the chart example to display."),
};

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

  server.registerTool(
    "display_chart",
    {
      title: "Display chart",
      description: "Displays a chart example with the given ID.",
      inputSchema: displayChartInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        "openai/outputTemplate": PLOTLY_TEMPLATE_URI,
        "openai/toolInvocation/invoking":
          "Fetching chart data and plotting chart...",
        "openai/toolInvocation/invoked": "Chart displayed",
      },
    },
    async ({ id }) => {
      try {
        const filename = `data_${id < 100 ? ("00" + id).slice(-3) : id}`;
        const plotlySchema = await fetch(
          `https://raw.githubusercontent.com/microsoft/fluentui-charting-contrib/refs/heads/main/apps/plotly_examples/src/data/${filename}.json`,
        ).then((response) => response.json());

        return {
          structuredContent: { id },
          content: [
            { type: "text", text: `Displaying chart for example ID: ${id}` },
          ],
          _meta: { plotlySchema },
        };
      } catch (error) {
        return {
          structuredContent: { id },
          content: [
            {
              type: "text",
              text: `Failed to load chart data for example ID: ${id}`,
            },
          ],
        };
      }
    },
  );

  return server;
}

const port = Number(process.env.PORT ?? 8787);
const MCP_PATH = "/mcp";

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

    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
      enableJsonResponse: true,
    });

    res.on("close", () => {
      transport.close();
      server.close();
    });

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
