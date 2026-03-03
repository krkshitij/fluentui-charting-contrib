import { useApp } from "@modelcontextprotocol/ext-apps/react";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { useMemo, useState } from "react";

export function useMcpToolResult() {
  const [toolResult, setToolResult] = useState<CallToolResult | null>(null);

  const { app, error } = useApp({
    appInfo: { name: "chart-plotly", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (app) => {
      app.ontoolresult = async (result) => {
        setToolResult(result);
      };
    },
  });

  const toolResponseMetadata = useMemo(
    () => (toolResult?._meta as Record<string, unknown>) ?? null,
    [toolResult],
  );

  return { app, error, toolResponseMetadata };
}
