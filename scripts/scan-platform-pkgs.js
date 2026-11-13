const fs = require('fs');
const path = require('path');
const roots = [
  'C:/Users/87059/AppData/Local/Programs/DeepSeek Harness/resources/app.asar.unpacked',
  'D:/aiwork/DSHarm/work/tree',
];
const re = /(@koromix|sherpa-onnx-win|claude-agent-sdk-win|codex-win|ripgrep-win32|require-builtin-win32|libreoffice-kit-win32)/;
function scan(root) {
  const hits = [];
  (function walk(dir, depth) {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (!e.isDirectory()) continue;
      const p = path.join(dir, e.name);
      const rel = p.slice(root.length + 1);
      if (/^(@koromix|sherpa-onnx-win|claude-agent-sdk-win|codex-win|ripgrep-win32|require-builtin-win32|libreoffice-kit-win32)\S*$/.test(e.name) ||
        (e.name.startsWith('@') && depth < 8)) {
        if (!e.name.startsWith('@')) {
          let version = '';
          try { version = JSON.parse(fs.readFileSync(path.join(p, 'package.json'), 'utf8')).version; } catch {}
          hits.push(rel.replace(/\\/g, '/') + '  v' + version);
        }
      }
      if (depth < 10) walk(p, depth + 1);
    }
  })(root, 0);
  return hits;
}
for (const root of roots) {
  if (!fs.existsSync(root)) continue;
  console.log('== ', root);
  for (const h of scan(root)) console.log('   ', h);
}
