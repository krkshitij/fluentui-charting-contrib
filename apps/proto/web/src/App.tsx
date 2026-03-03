import { useMemo } from "react";
// import reactLogo from './assets/react.svg'
// import viteLogo from '/vite.svg'
// import './App.css'
import { DeclarativeChart, type Schema } from "@fluentui/react-charts";
import { useMcpToolResult } from "./use-mcp-app";

function App() {
  const { toolResponseMetadata } = useMcpToolResult();

  const inputSchema: Schema = useMemo(
    () => ({
      plotlySchema: toolResponseMetadata?.plotlySchema ?? {},
    }),
    [toolResponseMetadata],
  );

  return <DeclarativeChart chartSchema={inputSchema} />;
}

export default App;
