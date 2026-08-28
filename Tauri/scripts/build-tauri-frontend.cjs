const fs = require("node:fs");
const path = require("node:path");

const tauriRoot = path.resolve(__dirname, "..");
const projectRoot = path.resolve(tauriRoot, "..");
const output = path.join(tauriRoot, "dist");
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
