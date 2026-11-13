const fs = require('fs');
const j = JSON.parse(fs.readFileSync('D:/aiwork/DSHarm/work/asar/dsh/desktop-runtime.json', 'utf8'));
const pre = new Map();
for (const f of j.files) {
  const top = f.path.split('/').slice(0, 2).join('/');
  pre.set(top, (pre.get(top) || 0) + 1);
}
console.log('file-list top groups:');
for (const [k, v] of [...pre].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log('  ', k, v);
const has = (p) => !!j.files.find(f => f.path === p);
for (const p of [
  'node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe',
  'node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node',
  'node_modules/node-pty/prebuilds/win32-x64/conpty.node',
  'node_modules/sherpa-onnx-win-x64/sherpa-onnx.node',
  'node_modules/@img/sharp-win32-x64/lib/libvips-42.dll',
  'package.json',
]) console.log('contains', p, has(p));
console.log('total', j.files.length);
console.log('sample entry with executable flag:', JSON.stringify(j.files.find(f => f.executable)));
