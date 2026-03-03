import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import {
  PLOTLY_TEMPLATE_URI,
  createLogger,
  fetchChartExample,
  getErrorMessage,
} from "../lib.js";
export function registerDisplayChartToolV2(server: McpServer) {
  registerAppTool(
    server,
    "display_chart",
    {
      title: "Display chart",
      description: "Displays a chart example with the given ID.",
      inputSchema: {
        id: z.number().describe("The ID of the chart example to display."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        ui: {
          resourceUri: PLOTLY_TEMPLATE_URI,
        },
      },
    },
    async ({ id }) => {
      const log = createLogger("display_chart");

      log(`Starting — example ID: ${id}`);

      try {
        const plotlySchema = await fetchChartExample(id);
        log(`Done`);

        return {
          structuredContent: { id },
          content: [
            { type: "text", text: `Displaying chart for example ID: ${id}` },
          ],
          _meta: { plotlySchema },
        };
      } catch (error) {
        const message = getErrorMessage(error);
        log(`Failed: ${message}`);
        return {
          structuredContent: { id },
          content: [
            {
              type: "text",
              text: `Failed to load chart data for example ID: ${id}: ${message}`,
            },
          ],
        };
      }
    },
  );
}
