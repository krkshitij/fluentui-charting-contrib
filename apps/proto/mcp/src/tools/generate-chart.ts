import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  PLOTLY_TEMPLATE_URI,
  SYSTEM_PROMPT,
  createLogger,
  getErrorMessage,
  runPythonChart,
} from "../lib.js";

function extractPythonCode(text: string): string {
  const match = text.match(/```python\s*\n([\s\S]*?)```/);
  return match ? match[1].trim() : text.trim();
}

export function registerGenerateChartTool(server: McpServer) {
  server.registerTool(
    "generate_chart",
    {
      title: "Generate chart",
      description:
        "Generates a chart from a natural language description and returns the chart image and data.",
      inputSchema: {
        query: z
          .string()
          .describe(
            "Natural language description of the chart to generate, e.g. 'bar chart of top 5 fruits by sales'",
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
    async ({ query }) => {
      const log = createLogger("generate_chart");

      log(`Starting — query: "${query}"`);

      // 1. Ask client LLM to generate Python code via MCP sampling
      log("Requesting code from LLM via sampling...");
      const samplingResponse = await server.server.createMessage({
        messages: [
          {
            role: "user",
            content: { type: "text", text: query },
          },
        ],
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: 4096,
      });
      log("LLM response received");

      const responseText =
        samplingResponse.content.type === "text"
          ? samplingResponse.content.text
          : "";

      if (!responseText) {
        log("No response text — aborting");
        return {
          content: [
            {
              type: "text",
              text: "Failed to generate chart: no response received.",
            },
          ],
        };
      }

      const pythonCode = extractPythonCode(responseText);
      log(`Extracted Python code (${pythonCode.length} chars)`);

      // 2. Execute Python code and read outputs
      try {
        const { chartPng, chartJson } = await runPythonChart(pythonCode, log);

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
