import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ASSETS_DIR, PLOTLY_TEMPLATE_URI } from "../lib.js";

const MIME_TYPE = "text/html+skybridge";

const chartPlotlyOaiHtml = readFileSync(
  path.join(ASSETS_DIR, "chart-plotly-oai.html"),
  "utf8",
);

export function registerChartPlotlyResourceOai(server: McpServer) {
  server.registerResource(
    "chart-plotly",
    PLOTLY_TEMPLATE_URI,
    {},
    async () => ({
      contents: [
        {
          uri: PLOTLY_TEMPLATE_URI,
          text: chartPlotlyOaiHtml,
          mimeType: MIME_TYPE,
          _meta: {
            "openai/widgetPrefersBorder": true,
          },
        },
      ],
    }),
  );
}
