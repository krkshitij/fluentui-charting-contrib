import { execFile } from "node:child_process";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const PYTHON_DIR = path.resolve(__dirname, "..", "python");

const isWindows = process.platform === "win32";

export const VENV_PYTHON = path.join(
  PYTHON_DIR,
  ".venv",
  isWindows ? "Scripts" : "bin",
  isWindows ? "python.exe" : "python",
);

export const WORK_DIR_PREFIX = path.join(PYTHON_DIR, "chart-");

export const PLOTLY_TEMPLATE_URI = "ui://widget/chart-plotly.html";

export const SYSTEM_PROMPT = readFileSync(
  path.resolve(__dirname, "prompts", "plotly-express-prompt.md"),
  "utf8",
);

const execFileAsync = promisify(execFile);

export interface ChartResult {
  chartPng: Buffer;
  chartJson: unknown;
}

/**
 * Writes a Python script to a temporary directory, executes it,
 * and reads the resulting chart.png and chart.json outputs.
 */
export async function runPythonChart(
  code: string,
  log: (message: string) => void,
): Promise<ChartResult> {
  const workDir = await mkdtemp(WORK_DIR_PREFIX);
  const scriptPath = path.join(workDir, "plot.py");
  await writeFile(scriptPath, code, "utf8");

  log(`Executing Python script in ${workDir}...`);
  try {
    const { stderr } = await execFileAsync(VENV_PYTHON, [scriptPath], {
      cwd: workDir,
      timeout: 120_000,
    });
    if (stderr) {
      log(`Python stderr: ${stderr}`);
    }
    log("Python execution complete");

    log("Reading output files...");
    const chartPng = await readFile(path.join(workDir, "chart.png"));
    const chartJson = JSON.parse(
      await readFile(path.join(workDir, "chart.json"), "utf8"),
    );
    log(`Done — PNG: ${chartPng.length} bytes, JSON loaded`);

    return { chartPng, chartJson };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
