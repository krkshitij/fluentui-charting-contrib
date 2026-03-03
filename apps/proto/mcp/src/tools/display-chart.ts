import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PLOTLY_TEMPLATE_URI, fetchChartExample, getErrorMessage } from "../lib.js";

export function registerDisplayChartTool(server: McpServer) {
  server.registerTool(
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
        "openai/outputTemplate": PLOTLY_TEMPLATE_URI,
        "openai/toolInvocation/invoking":
          "Fetching chart data and plotting chart...",
        "openai/toolInvocation/invoked": "Chart displayed",
      },
    },
    async ({ id }) => {
      try {
        const plotlySchema = await fetchChartExample(id);

        return {
          structuredContent: { id },
          content: [
            { type: "text", text: `Displaying chart for example ID: ${id}` },
          ],
          _meta: { plotlySchema },
        };
      } catch (error) {
        const message = getErrorMessage(error);
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
