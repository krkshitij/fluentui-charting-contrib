import { useMemo } from "react";
// import reactLogo from './assets/react.svg'
// import viteLogo from '/vite.svg'
// import './App.css'
import { DeclarativeChart, type Schema } from "@fluentui/react-charts";
import { useOpenAiGlobal } from "./use-openai-global";

function App() {
  const toolResponseMetadata = useOpenAiGlobal(
    "toolResponseMetadata",
  ) as Record<string, unknown> | null;

  const inputSchema: Schema = useMemo(
    () => ({
      plotlySchema: toolResponseMetadata?.plotlySchema ?? {},
    }),
    [toolResponseMetadata],
  );

  return <DeclarativeChart chartSchema={inputSchema} />;
}

export default App;
