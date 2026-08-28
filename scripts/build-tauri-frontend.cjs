const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
const excluded = new Set([
  ".git", ".vscode", "node_modules", "dist", "src-tauri", "tests", "scripts",
  ".cursorrules", ".gitignore", "package.json", "package-lock.json", "run.py",
  "start-md-viewer-server.cmd", "extension_history.db"
]);

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (excluded.has(entry.name)) continue;
  fs.cpSync(path.join(root, entry.name), path.join(output, entry.name), {
    recursive: true,
    force: true
  });
}

if (!fs.existsSync(path.join(output, "index.html"))) {
  throw new Error("index.html was not copied to dist");
}

console.log(`MDproViewer frontend prepared at ${output}`);
