// 06-verify.js â€?structural verification of the arm64 build
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.argv[2] || 'D:/aiwork/DSHarm/work/app-arm64';
// x64 payload that is deliberately kept: it never gets loaded into the arm64 process
const ALLOW_X64 = [
  'resources/elevate.exe',                       // electron-builder helper, spawned as a separate process
  'resources/runtime/pnpm/dist/vendor/fastlist-0.3.0-x64.exe',
  'resources/runtime/primary-runtime/dependencies/pnpm/dist/vendor/fastlist-0.3.0-x64.exe',
  // pnpm's native reflink addon: the package ships every platform and pnpm picks by arch at runtime
  'resources/runtime/pnpm/dist/node_modules/@reflink/reflink-win32-x64-msvc/reflink.win32-x64-msvc.node',
  'resources/runtime/primary-runtime/dependencies/pnpm/dist/node_modules/@reflink/reflink-win32-x64-msvc/reflink.win32-x64-msvc.node',
  // pip's vendored launcher stubs, never executed by this app
  'resources/runtime/primary-runtime/dependencies/python/Lib/site-packages/pip/_vendor/distlib/t64.exe',
  'resources/runtime/primary-runtime/dependencies/python/Lib/site-packages/pip/_vendor/distlib/w64.exe',
  // upstream node-pty ships the conpty build catalogue; the arm64 build in prebuilds/win32-arm64 is what loads
  'resources/app.asar.unpacked/dsh/node_modules/node-pty/third_party/conpty/1.25.260303002/win10-x64/conpty.dll',
  'resources/app.asar.unpacked/dsh/node_modules/node-pty/third_party/conpty/1.25.260303002/win10-x64/OpenConsole.exe',
];
const ALLOW_OTHER = [
  'resources/elevate.exe',
  'resources/runtime/pnpm/dist/vendor/fastlist-0.3.0-x86.exe',
  'resources/runtime/primary-runtime/dependencies/pnpm/dist/vendor/fastlist-0.3.0-x86.exe',
  'resources/runtime/primary-runtime/dependencies/python/Lib/site-packages/pip/_vendor/distlib/t32.exe',
  'resources/runtime/primary-runtime/dependencies/python/Lib/site-packages/pip/_vendor/distlib/w32.exe',
];
const MACHINES = { 0x8664: 'x64', 0xAA64: 'arm64', 0x14c: 'x86', 0x1c4: 'arm', 0x200: 'ia64' };

function peMachine(file) {
  let fd;
  try { fd = fs.openSync(file, 'r'); } catch { return null; }
  try {
    const head = Buffer.alloc(64);
    if (fs.readSync(fd, head, 0, 64, 0) < 64) return null;
    if (head.readUInt16LE(0) !== 0x5a4d) return null;
    const lfanew = head.readUInt32LE(0x3c);
    if (lfanew < 64 || lfanew > 4096) return null;
    const pe = Buffer.alloc(24);
    if (fs.readSync(fd, pe, 0, 24, lfanew) < 24) return null;
    if (pe.readUInt32LE(0) !== 0x00004550) return null;
    return pe.readUInt16LE(4);
  } finally { fs.closeSync(fd); }
}

const stats = { arm64: [], x64: [], other: [], nonPe: 0 };
function walk(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { walk(abs, r); continue; }
    const ext = path.extname(e.name).toLowerCase();
    const isCandidate = ['.exe', '.dll', '.node', '.pyd', '.pdb'].includes(ext) || /^(DeepSeek Harness\.exe)$/.test(e.name) ||
      ['.exe', '.dll', '.node', '.pyd'].includes(ext);
    if (!isCandidate) continue;
    const m = peMachine(abs);
    const size = fs.statSync(abs).size;
    if (m === null) { stats.nonPe++; continue; }
    const rec = { rel: r, size, machine: MACHINES[m] || '0x' + m.toString(16) };
    if (m === 0xaa64) stats.arm64.push(rec);
    else if (m === 0x8664) stats.x64.push(rec);
    else stats.other.push(rec);
  }
}
walk(ROOT, '');

console.log('== PE inventory ==');
console.log('arm64:', stats.arm64.length, 'x64:', stats.x64.length, 'other-arch:', stats.other.length, 'non-PE (skipped):', stats.nonPe);
console.log('\narm64 binaries (top 25 by size):');
for (const r of stats.arm64.sort((a, b) => b.size - a.size).slice(0, 25)) console.log(`  ${(r.size / 1048576).toFixed(1).padStart(8)} MiB  ${r.rel}`);
const unexpected = stats.x64.filter(r => !ALLOW_X64.includes(r.rel));
console.log('\nx64 binaries:', stats.x64.length, '(allow-listed emulated:', stats.x64.length - unexpected.length + ')');
for (const r of stats.x64) console.log(`  ${unexpected.includes(r) ? 'UNEXPECTED' : 'allowed   '}  ${(r.size / 1048576).toFixed(1).padStart(8)} MiB  ${r.rel}`);
const unexpectedOther = stats.other.filter(r => !ALLOW_OTHER.includes(r.rel));
if (stats.other.length) {
  console.log('\nother machine types:', stats.other.length, '(allow-listed:', stats.other.length - unexpectedOther.length + ')');
  for (const r of stats.other) console.log(`  ${unexpectedOther.includes(r) ? 'UNEXPECTED' : 'allowed   '}  ${r.machine}  ${(r.size / 1048576).toFixed(2)} MiB  ${r.rel}`);
}

console.log('\n== descriptor checks ==');
const runtimeJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'resources/runtime/primary-runtime/runtime.json'), 'utf8'));
console.log('runtime.json  platform/arch/python/node:', runtimeJson.platform, runtimeJson.arch, runtimeJson.python, runtimeJson.node, 'payloadDigest:', runtimeJson.payloadDigest ? 'present' : 'absent');
const versions = JSON.parse(fs.readFileSync(path.join(ROOT, 'resources/runtime/versions.json'), 'utf8'));
console.log('versions.json:', JSON.stringify(versions));
const site = path.join(ROOT, 'resources/runtime/primary-runtime/dependencies/python/Lib/site-packages');
console.log('site-packages entries:', fs.readdirSync(site).length);

// python extension modules
let pydArm = 0, pydX64 = 0;
(function scanPyd(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) { scanPyd(abs); continue; }
    if (!/\.(pyd|dll)$/i.test(e.name)) continue;
    const m = peMachine(abs);
    if (m === 0xaa64) pydArm++; else if (m === 0x8664) pydX64++;
  }
})(path.dirname(site));
console.log('python binary modules: arm64', pydArm, ' x64', pydX64);

// node.exe architecture
const nodeExe = path.join(ROOT, 'resources/runtime/primary-runtime/dependencies/node/bin/node.exe');
console.log('bundled node.exe machine:', MACHINES[peMachine(nodeExe)] || 'unknown');

console.log('\n== asar checks ==');
const asar = path.join(ROOT, 'resources/app.asar');
let x64NamedEntries = 0, missingUnpacked = 0;
{
  const fd = fs.openSync(asar, 'r');
  const head = Buffer.alloc(64); fs.readSync(fd, head, 0, 64, 0);
  const pickle = head.readUInt32LE(4);
  const brace = head.indexOf(0x7b, 0);
  const len = head.readUInt32LE(brace - 4);
  const hb = Buffer.alloc(len); fs.readSync(fd, hb, 0, len, brace);
  const j = JSON.parse(hb.toString('utf8'));
  let files = 0, unpacked = 0;
  const x64Names = [];
  (function walkNode(node, prefix) {
    for (const [k, v] of Object.entries(node.files || {})) {
      const p = prefix ? prefix + '/' + k : k;
      if (v.files) { walkNode(v, p); continue; }
      files++; if (v.unpacked) unpacked++;
      if (/win32-x64|win-x64|win32_x64|x86_64-pc-windows/.test(p)) x64Names.push(p);
    }
  })(j, '');
  fs.closeSync(fd);
  console.log(`asar header ok: ${files} files, ${unpacked} unpacked, size ${(fs.statSync(asar).size / 1048576).toFixed(1)} MiB`);
  x64NamedEntries = x64Names.length;
  console.log('x64-named entries remaining:', x64Names.length);
  for (const p of x64Names.slice(0, 20)) console.log('   ', p);
  // spot-check unpacked existence
  let missing = 0;
  const check = (node, prefix) => {
    for (const [k, v] of Object.entries(node.files || {})) {
      const p = prefix ? prefix + '/' + k : k;
      if (v.files) { check(v, p); continue; }
      if (!v.unpacked) continue;
      if (!fs.existsSync(path.join(ROOT, 'resources/app.asar.unpacked', p))) { missing++; if (missing < 10) console.log('   MISSING unpacked', p); }
    }
  };
  check(j, '');
  missingUnpacked = missing;
  console.log('unpacked files missing on disk:', missing);
}
console.log('\n== verdict ==');
const ok = unexpected.length === 0 && unexpectedOther.length === 0 && runtimeJson.arch === 'arm64' && pydX64 === 0 && x64NamedEntries === 0 && missingUnpacked === 0;
console.log(ok ? 'PASS: every in-process binary is arm64; remaining non-arm64 files are explicitly allow-listed and run outside the Electron process' : 'FAIL: see UNEXPECTED entries above');
