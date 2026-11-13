// 02c-patch.js — arm64 enablement patches inside the app tree + descriptor refresh
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TREE = 'D:/aiwork/DSHarm/work/tree';
const NM = path.join(TREE, 'dsh/node_modules');
const log = (...a) => console.log(...a);

// ---- 1. speech-to-text platform whitelist ----
{
  const f = path.join(NM, '@deepseek-ai/dsh-experimental-speech-to-text-sensevoice/lib/index.js');
  const src = fs.readFileSync(f, 'utf8');
  if (src.includes('"win32-arm64"')) log('speech whitelist: already patched');
  else {
    const idx = src.indexOf('"win32-x64"');
    if (idx < 0) log('speech whitelist: MARKER NOT FOUND');
    else {
      const after = src.slice(idx, idx + 40);
      const m = /^"win32-x64"(\s*)\]/.exec(after);
      if (!m) log('speech whitelist: unexpected context:', JSON.stringify(after));
      else {
        const patched = src.slice(0, idx) + '"win32-x64",\n\t\t"win32-arm64"' + src.slice(idx + '"win32-x64"'.length);
        fs.writeFileSync(f, patched);
        log('speech whitelist: patched (+win32-arm64)');
      }
    }
  }
  const check = fs.readFileSync(f, 'utf8');
  log('  verify:', /"win32-x64",\s*"win32-arm64"/.test(check) ? 'ok' : 'FAILED');
}

// ---- 2. regenerate the dsh file manifest in desktop-runtime.json ----
const drPath = path.join(TREE, 'dsh/desktop-runtime.json');
const dr = JSON.parse(fs.readFileSync(drPath, 'utf8'));
dr.arch = 'arm64';
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const files = [];
(function walk(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = path.join(dir, e.name);
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { walk(abs, r); continue; }
    if (!e.isFile()) continue;
    files.push({ path: r.replace(/\\/g, '/'), bytes: fs.statSync(abs).size, sha256: sha(abs), executable: false });
  }
})(path.join(TREE, 'dsh'), '');
files.sort((a, b) => a.path.localeCompare(b.path));
dr.files = files;
fs.writeFileSync(drPath, JSON.stringify(dr, null, 2) + '\n');
log('desktop-runtime.json: arch=' + dr.arch, 'files=' + files.length);
