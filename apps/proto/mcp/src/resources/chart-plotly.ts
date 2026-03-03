import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ASSETS_DIR, PLOTLY_TEMPLATE_URI } from "../lib.js";

const chartPlotlyHtml = readFileSync(
  path.join(ASSETS_DIR, "chart-plotly.html"),
  "utf8",
);

export function registerChartPlotlyResource(server: McpServer) {
  registerAppResource(
    server,
    PLOTLY_TEMPLATE_URI,
    "chart-plotly",
    { mimeType: RESOURCE_MIME_TYPE },
    async () => ({
      contents: [
        {
          uri: PLOTLY_TEMPLATE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: chartPlotlyHtml,
          _meta: {
            ui: { prefersBorder: true },
          },
        },
      ],
    }),
  );
}
