import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VENV_DIR = path.join(__dirname, ".venv");
const REQUIREMENTS = path.join(__dirname, "requirements.txt");

const isWindows = process.platform === "win32";
const binDir = path.join(VENV_DIR, isWindows ? "Scripts" : "bin");
const python = path.join(binDir, isWindows ? "python.exe" : "python");

if (existsSync(VENV_DIR)) {
  console.log(`[python/setup] Virtual environment already exists at ${VENV_DIR}`);
} else {
  console.log("[python/setup] Creating virtual environment...");
  execFileSync("python", ["-m", "venv", VENV_DIR], { stdio: "inherit" });
  console.log("[python/setup] Virtual environment created.");
}

console.log("[python/setup] Installing dependencies...");
execFileSync(python, ["-m", "pip", "install", "-q", "-r", REQUIREMENTS], {
  stdio: "inherit",
});
console.log("[python/setup] Done.");
