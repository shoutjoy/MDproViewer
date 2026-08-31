const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const tauriRoot = path.resolve(__dirname, "..");
const configuredSource = String(process.env.MDPRO_VIEWER_SOURCE || "").trim();
const projectRoot = configuredSource
  ? path.resolve(configuredSource)
  : path.resolve(tauriRoot, "..");
const buildManagerRoot = path.resolve(tauriRoot, "..", "..", "TauriBuildManager", "mdpro-viewer");
const output = String(process.env.MDPRO_TAURI_DIST || "").trim()
  ? path.resolve(process.env.MDPRO_TAURI_DIST)
  : path.join(buildManagerRoot, "dist");
const excluded = new Set([
  ".git", ".vscode", ".agents", ".codex", "Tauri", "tests", "node_modules", "scripts", "LocalSave_sqlite",
  ".cursorrules", ".gitignore", "run.py",
  "start-md-viewer-server.cmd", "extension_history.db"
]);

if (output !== path.join(buildManagerRoot, "dist")) {
  throw new Error("Refusing to clean an unexpected build output directory: " + output);
}
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

// Packaged updates must not reuse an earlier service worker's script URLs.
const indexPath = path.join(output, 'index.html');
const html = fs.readFileSync(indexPath, 'utf8').replace(/((?:src|href)=")([^"\s]+\.(?:js|css)(?:\?[^"\s]*)?)"/g, (match, prefix, url) => {
  if (/^(?:https?:|\/\/)/i.test(url)) return match;
  const asset = path.resolve(output, url.split('?')[0]);
  if (!asset.startsWith(output + path.sep) || !fs.existsSync(asset)) return match;
  const hash = crypto.createHash('sha256').update(fs.readFileSync(asset)).digest('hex').slice(0, 16);
  return prefix + url + (url.includes('?') ? '&amp;' : '?') + 'desktopBuild=' + hash + '"';
});
fs.writeFileSync(indexPath, html);

console.log(`MDproViewer frontend prepared at ${output}`);
console.log(`Source: ${projectRoot}`);
