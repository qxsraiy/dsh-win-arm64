// 02d-reflink.js — add the arm64 pnpm reflink addon next to its x64 twin
// (pnpm picks the binding by process.arch; without the arm64 twin it silently falls back to plain copies)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const TGZ = 'D:/aiwork/DSHarm022/work/dl/reflink-win32-arm64-msvc-0.1.19.tgz';
const TARGETS = [
  'D:/aiwork/DSHarm022/work/runtime-arm64/primary-runtime/dependencies/pnpm/dist/node_modules/@reflink',
  'D:/aiwork/DSHarm022/work/app-arm64/resources/runtime/primary-runtime/dependencies/pnpm/dist/node_modules/@reflink',
];

function readTar(buf) {
  const out = [];
  let off = 0;
  while (off + 512 <= buf.length) {
    const name = buf.subarray(off, off + 100).toString('utf8').replace(/\0.*$/, '');
    if (!name) break;
    const size = parseInt(buf.subarray(off + 124, off + 136).toString('utf8').replace(/\0.*$/, '').trim(), 8) || 0;
    const type = String.fromCharCode(buf[off + 156] || 48);
    out.push({ name, size, type, dataOff: off + 512 });
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

const tar = zlib.gunzipSync(fs.readFileSync(TGZ));
const entries = readTar(tar);
if (!fs.existsSync(TGZ)) throw new Error('missing ' + TGZ);

for (const base of TARGETS) {
  if (!fs.existsSync(base)) { console.log('skip (no reflink dir):', base); continue; }
  const dest = path.join(base, 'reflink-win32-arm64-msvc');
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  let n = 0;
  for (const e of entries) {
    const rel = e.name.replace(/^package\//, '');
    if (!rel || rel === 'package') continue;
    const out = path.join(dest, rel);
    if (e.type === '5') { fs.mkdirSync(out, { recursive: true }); continue; }
    if (e.type !== '0' && e.type !== '\0' && e.type !== '48') continue;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, tar.subarray(e.dataOff, e.dataOff + e.size));
    n++;
  }
  console.log('installed', n, 'files ->', dest);
}

// sanity: report both bindings
for (const base of TARGETS) {
  if (!fs.existsSync(base)) continue;
  console.log(' ', base.split('/work/')[1], '->', fs.readdirSync(base).join(', '));
}
