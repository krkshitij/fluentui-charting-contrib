import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PLOTLY_TEMPLATE_URI } from "../lib.js";

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
}
