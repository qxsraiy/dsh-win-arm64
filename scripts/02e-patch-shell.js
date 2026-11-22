// 02e-patch-shell.js — 0.2.2 desktop shell hard-codes "win32 => x64 only" in its mandatory-update
// identity check, which throws before the window opens on arm64. Widen it to x64/arm64.
const fs = require('fs');

const F = 'D:/aiwork/DSHarm022/work/tree/lib/main.js';
const FROM = 'identity.platform === "win32" && identity.arch !== "x64"';
const TO = 'identity.platform === "win32" && !["x64", "arm64"].includes(identity.arch)';

let src = fs.readFileSync(F, 'utf8');
if (src.includes(TO)) {
  console.log('shell arch gate: already patched');
} else if (src.includes(FROM)) {
  src = src.split(FROM).join(TO);
  fs.writeFileSync(F, src);
  console.log('shell arch gate: patched (win32 now accepts x64 and arm64)');
} else {
  console.log('shell arch gate: MARKER NOT FOUND — inspect manually');
}
const now = fs.readFileSync(F, 'utf8');
console.log('verify:', now.includes(TO) ? 'ok' : 'FAILED');
