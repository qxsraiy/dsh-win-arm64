// 02b-unpacked.js — compute the asar-unpacked file list for the arm64 tree
const fs = require('fs');
const path = require('path');

const TREE = 'D:/aiwork/DSHarm/work/tree';
const orig = new Set(JSON.parse(fs.readFileSync('D:/aiwork/DSHarm/work/orig-unpacked.json', 'utf8')));

const result = new Set();
let kept = 0, dropped = 0;
for (const rel of orig) {
  if (fs.existsSync(path.join(TREE, rel))) { result.add(rel); kept++; }
  else dropped++;
}
console.log('orig unpacked:', orig.size, 'kept:', kept, 'dropped (x64 removed):', dropped);

// everything inside the arm64 platform packages, plus fresh node-pty prebuilds, stays outside the archive
const armDirs = [
  'dsh/node_modules/@koromix/koffi-win32-arm64',
  'dsh/node_modules/@deepseek-ai/dsh-desktop-host/node_modules/@koromix/koffi-win32-arm64',
  'dsh/node_modules/@img/sharp-win32-arm64',
  'dsh/node_modules/node-addon-require-builtin-win32-arm64-msvc',
  'dsh/node_modules/@vscode/ripgrep-win32-arm64',
  'dsh/node_modules/@anthropic-ai/claude-agent-sdk-win32-arm64',
  'dsh/node_modules/@openai/codex-win32-arm64',
  'dsh/node_modules/@deepseek-ai/libreoffice-kit-win32-arm64',
  'dsh/node_modules/sherpa-onnx-win-arm64',
  'dsh/node_modules/node-pty/prebuilds/win32-arm64',
];
let added = 0;
for (const d of armDirs) {
  const abs = path.join(TREE, d);
  if (!fs.existsSync(abs)) { console.log('WARN missing arm64 dir', d); continue; }
  (function walk(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = dir + '/' + e.name;
      const r = rel + '/' + e.name;
      if (e.isDirectory()) { walk(p, r); continue; }
      if (!result.has(r)) { result.add(r); added++; }
    }
  })(abs, d);
}
console.log('added arm64 files to unpacked set:', added, 'total:', result.size);
fs.writeFileSync('D:/aiwork/DSHarm/work/unpacked-arm64.json', JSON.stringify([...result].sort(), null, 0));
console.log('wrote work/unpacked-arm64.json');
