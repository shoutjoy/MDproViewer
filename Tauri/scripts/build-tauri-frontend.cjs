const fs = require("node:fs");
const path = require("node:path");

const tauriRoot = path.resolve(__dirname, "..");
const configuredSource = String(process.env.MDPRO_VIEWER_SOURCE || "").trim();
const siblingSource = path.resolve(tauriRoot, "..", "MDproViewer");
const projectRoot = configuredSource
  ? path.resolve(configuredSource)
  : (fs.existsSync(path.join(siblingSource, "index.html")) ? siblingSource : path.resolve(tauriRoot, ".."));
const buildManagerRoot = path.resolve(tauriRoot, "..", "..", "TauriBuildManager", "mdpro-viewer");
const output = String(process.env.MDPRO_TAURI_DIST || "").trim()
  ? path.resolve(process.env.MDPRO_TAURI_DIST)
  : path.join(buildManagerRoot, "dist");
const excluded = new Set([
  ".git", ".vscode", "Tauri", "tests",
  ".cursorrules", ".gitignore", "run.py",
  "start-md-viewer-server.cmd", "extension_history.db"
]);

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const entry of fs.readdirSync(projectRoot, { withFileTypes: true })) {
  if (excluded.has(entry.name)) continue;
  fs.cpSync(path.join(projectRoot, entry.name), path.join(output, entry.name), {
    recursive: true,
    force: true
  });
}

if (!fs.existsSync(path.join(output, "index.html"))) {
  throw new Error("index.html was not copied to dist");
}

console.log(`MDproViewer frontend prepared at ${output}`);
console.log(`Source: ${projectRoot}`);
