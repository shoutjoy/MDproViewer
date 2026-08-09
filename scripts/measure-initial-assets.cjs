const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sources = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
  .map((match) => match[1]);

const rows = sources.map((source) => {
  const withoutQuery = source.split('?')[0];
  const external = /^https?:\/\//i.test(withoutQuery);
  const filePath = external ? null : path.join(root, withoutQuery.replace(/^\.\//, '').replaceAll('/', path.sep));
  return {
    source,
    external,
    bytes: filePath && fs.existsSync(filePath) ? fs.statSync(filePath).size : 0
  };
});

const local = rows.filter((row) => !row.external);
const report = {
  generatedAt: new Date().toISOString(),
  scriptRequests: rows.length,
  externalScriptRequests: rows.filter((row) => row.external).length,
  localScriptRequests: local.length,
  localJavaScriptBytes: local.reduce((sum, row) => sum + row.bytes, 0),
  missingLocalSources: local.filter((row) => row.bytes === 0).map((row) => row.source),
  largestLocalScripts: local.slice().sort((a, b) => b.bytes - a.bytes).slice(0, 12)
};

process.stdout.write(JSON.stringify(report, null, 2) + '\n');
