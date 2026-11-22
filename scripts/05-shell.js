// 05-shell.js (0.2.2-rc.2) — assemble the arm64 app directory from the extracted payload
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const PAYLOAD = 'D:/aiwork/DSHarm022/work/payload';
const ELECTRON = 'D:/aiwork/DSHarm022/work/electron-arm64';
const ELECTRON_ZIP = 'D:/aiwork/DSHarm022/work/dl/electron-v44.7.0-win32-arm64.zip';
const ASAR_OUT = 'D:/aiwork/DSHarm022/work/out';
const RUNTIME = 'D:/aiwork/DSHarm022/work/runtime-arm64';
const OUT = 'D:/aiwork/DSHarm022/work/app-arm64';
const ICON = 'D:/aiwork/DSHarm022/work/app-icon.ico';
const RCEDIT = 'D:/aiwork/DSHarm022/work/dl/rcedit-x64.exe';
const log = (...a) => console.log(...a);

function extractZip(zipPath, dest) {
  const buf = fs.readFileSync(zipPath);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('no EOCD');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  let n = 0;
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.subarray(off + 46, off + 46 + nameLen).toString('utf8');
    off += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) { fs.mkdirSync(path.join(dest, name), { recursive: true }); continue; }
    const lnameLen = buf.readUInt16LE(localOff + 26);
    const lextraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lnameLen + lextraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    const data = method === 0 ? raw : zlib.inflateRawSync(raw);
    const out = path.join(dest, name);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, data);
    n++;
  }
  return n;
}

// 1. electron arm64 dist
if (!fs.existsSync(path.join(ELECTRON, 'electron.exe'))) {
  fs.rmSync(ELECTRON, { recursive: true, force: true });
  fs.mkdirSync(ELECTRON, { recursive: true });
  log('electron zip extracted files:', extractZip(ELECTRON_ZIP, ELECTRON));
}

// 2. payload -> app dir (keeps plugins-bundled, desktop.cordis.patch.yml, elevate.exe, icons ...)
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
log('copying payload ...');
fs.cpSync(PAYLOAD, OUT, { recursive: true });

// 3. overlay the arm64 shell over it
let overlaid = 0;
for (const e of fs.readdirSync(ELECTRON, { withFileTypes: true })) {
  if (e.name === 'electron.exe') continue;
  if (e.name === 'LICENSE') { fs.copyFileSync(path.join(ELECTRON, 'LICENSE'), path.join(OUT, 'LICENSE.electron.txt')); overlaid++; continue; }
  if (e.name === 'resources') {
    for (const r of fs.readdirSync(path.join(ELECTRON, 'resources'), { withFileTypes: true })) {
      const src = path.join(ELECTRON, 'resources', r.name);
      const dst = path.join(OUT, 'resources', r.name);
      fs.rmSync(dst, { recursive: true, force: true });
      fs.cpSync(src, dst, { recursive: true });
      overlaid++;
    }
    continue;
  }
  const dst = path.join(OUT, e.name);
  fs.rmSync(dst, { recursive: true, force: true });
  fs.cpSync(path.join(ELECTRON, e.name), dst, { recursive: true });
  overlaid++;
}
log('overlaid shell entries:', overlaid);

// 4. our repacked asar + runtime payload
fs.rmSync(path.join(OUT, 'resources/app.asar'), { force: true });
fs.copyFileSync(path.join(ASAR_OUT, 'app.asar'), path.join(OUT, 'resources/app.asar'));
fs.rmSync(path.join(OUT, 'resources/app.asar.unpacked'), { recursive: true, force: true });
fs.cpSync(path.join(ASAR_OUT, 'app.asar.unpacked'), path.join(OUT, 'resources/app.asar.unpacked'), { recursive: true });
fs.rmSync(path.join(OUT, 'resources/runtime'), { recursive: true, force: true });
if (!fs.existsSync(RUNTIME)) throw new Error('runtime payload missing: run 04-runtime.js first');
fs.cpSync(RUNTIME, path.join(OUT, 'resources/runtime'), { recursive: true });
log('resources now:', fs.readdirSync(path.join(OUT, 'resources')).join(', '));

// 5. launcher exe: rename + version resources + original icon
const exeOut = path.join(OUT, 'DeepSeek Harness.exe');
fs.copyFileSync(path.join(ELECTRON, 'electron.exe'), exeOut);
const args = [
  exeOut,
  '--set-version-string', 'ProductName', 'DeepSeek Harness',
  '--set-version-string', 'FileDescription', 'Electron desktop shell for a bundled dsh runtime and external plugins',
  '--set-version-string', 'LegalCopyright', 'Copyright © 2026 DeepSeek Harness',
  '--set-version-string', 'CompanyName', 'Hangzhou DeepSeek Artificial Intelligence Co., Ltd.',
  '--set-file-version', '0.2.2.2',
  '--set-product-version', '0.2.2.2',
];
if (fs.existsSync(ICON)) args.push('--set-icon', ICON);
try {
  execFileSync(RCEDIT, args, { stdio: 'inherit' });
  log('rcedit patched version info' + (fs.existsSync(ICON) ? ' + icon' : ''));
} catch (e) {
  log('rcedit FAILED:', e.message);
}

// 6. stale x64 shell files (present in payload, absent from the arm64 dist) are reported, not deleted
const distNames = new Set(fs.readdirSync(ELECTRON));
const stale = fs.readdirSync(OUT).filter(n => {
  if (distNames.has(n)) return false;
  const st = fs.statSync(path.join(OUT, n));
  return st.isFile() && /\.(exe|dll|pak|dat|bin|json)$/i.test(n);
});
log('payload-only shell files kept:', stale.length ? stale.join(', ') : 'none');
log('assembled', OUT);
