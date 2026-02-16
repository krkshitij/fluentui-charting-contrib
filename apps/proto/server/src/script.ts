import path, { dirname } from "path";
import { fileURLToPath } from "url";

console.log(
  path.join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "web",
    "dist",
    "assets",
  ),
);
