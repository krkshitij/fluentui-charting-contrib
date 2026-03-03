import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  PLOTLY_TEMPLATE_URI,
  SYSTEM_PROMPT,
  createLogger,
  getErrorMessage,
  runPythonChart,
} from "../lib.js";
export function registerGenerateChartToolV2(server: McpServer) {
  server.registerPrompt(
    "plotly-express",
    {
      title: "Plotly Express chart code",
      description:
        "Instructions for generating Python code that creates a chart using Plotly Express.",
    },
    async () => ({
      messages: [
        {
          role: "user",
          content: { type: "text", text: SYSTEM_PROMPT },
        },
      ],
    }),
  );

  server.registerTool(
    "generate_chart",
    {
      title: "Chart",
      description:
        "Creates a chart or data visualization from Python code and returns the rendered image and structured data.",
      inputSchema: {
        code: z
          .string()
          .describe(
            "Self-contained Python script using Plotly Express (import plotly.express as px) that prepares data, creates a figure, and saves it as chart.png (fig.write_image('chart.png')) and chart.json (fig.write_json('chart.json')). Never call fig.show().",
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        "openai/outputTemplate": PLOTLY_TEMPLATE_URI,
        "openai/toolInvocation/invoking": "Generating chart...",
        "openai/toolInvocation/invoked": "Chart generated",
      },
    },
    async ({ code }) => {
      const log = createLogger("generate_chart");

      log(`Starting — code length: ${code.length} chars`);

      try {
        const { chartPng, chartJson } = await runPythonChart(code, log);

        return {
          content: [
            { type: "text", text: "Chart generated successfully." },
            {
              type: "image",
              data: chartPng.toString("base64"),
              mimeType: "image/png",
            },
          ],
          _meta: { plotlySchema: chartJson },
        };
      } catch (error) {
        const message = getErrorMessage(error);
        log(`Failed: ${message}`);
        return {
          content: [
            {
              type: "text",
              text: `Failed to generate chart: ${message}`,
            },
          ],
        };
      }
    },
  );
}
