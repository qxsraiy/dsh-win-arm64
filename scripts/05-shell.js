// 05-shell.js — assemble the arm64 app directory (electron shell + resources)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const DL = 'D:/aiwork/DSHarm/work/dl';
const INST = 'C:/Users/87059/AppData/Local/Programs/DeepSeek Harness';
const OUT = 'D:/aiwork/DSHarm/work/app-arm64';
const ELECTRON = 'D:/aiwork/DSHarm/work/electron-arm64';
const ASAR_OUT = 'D:/aiwork/DSHarm/work/out';
const log = (...a) => console.log(...a);

// ---------- zip extractor ----------
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

if (!fs.existsSync(path.join(ELECTRON, 'electron.exe'))) {
  fs.rmSync(ELECTRON, { recursive: true, force: true });
  fs.mkdirSync(ELECTRON, { recursive: true });
  const n = extractZip(path.join(DL, 'electron-v44.0.0-win32-arm64.zip'), ELECTRON);
  log('electron zip extracted files:', n);
}
log('electron dir:', fs.readdirSync(ELECTRON).join(', '));

// ---------- assemble ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const e of fs.readdirSync(ELECTRON, { withFileTypes: true })) {
  if (e.name === 'resources') { fs.mkdirSync(path.join(OUT, 'resources'), { recursive: true }); continue; }
  if (e.name === 'electron.exe') continue;
  fs.cpSync(path.join(ELECTRON, e.name), path.join(OUT, e.name), { recursive: true });
}
// resources from electron dist (default_app.asar etc.)
for (const e of fs.readdirSync(path.join(ELECTRON, 'resources'), { withFileTypes: true })) {
  fs.cpSync(path.join(ELECTRON, 'resources', e.name), path.join(OUT, 'resources', e.name), { recursive: true });
}
// app.asar + unpacked produced by the packer
fs.copyFileSync(path.join(ASAR_OUT, 'app.asar'), path.join(OUT, 'resources/app.asar'));
fs.cpSync(path.join(ASAR_OUT, 'app.asar.unpacked'), path.join(OUT, 'resources/app.asar.unpacked'), { recursive: true });
// extra resources carried by the original build
for (const f of ['icon.png', 'tray.ico', 'elevate.exe']) {
  const src = path.join(INST, 'resources', f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT, 'resources', f));
}
// app icon used by the NSIS stage / window icon
const iconSrc = path.join(INST, 'uninstallerIcon.ico');
if (fs.existsSync(iconSrc)) fs.copyFileSync(iconSrc, path.join(OUT, 'resources/app-icon.ico'));

// arm64 runtime payload prepared by 04-runtime.js
const RUNTIME = 'D:/aiwork/DSHarm/work/runtime-arm64';
if (!fs.existsSync(RUNTIME)) throw new Error('runtime payload missing: run 04-runtime.js first');
fs.cpSync(RUNTIME, path.join(OUT, 'resources/runtime'), { recursive: true });
log('runtime payload copied:', fs.readdirSync(path.join(OUT, 'resources/runtime')).join(', '));

// ---------- exe ----------
const exeSrc = path.join(ELECTRON, 'electron.exe');
const exeOut = path.join(OUT, 'DeepSeek Harness.exe');
fs.copyFileSync(exeSrc, exeOut);
const rcedit = path.join(DL, 'rcedit-x64.exe');
const icon = fs.existsSync(path.join(INST, 'uninstallerIcon.ico')) ? path.join(INST, 'uninstallerIcon.ico') : null;
const args = [
  exeOut,
  '--set-version-string', 'ProductName', 'DeepSeek Harness',
  '--set-version-string', 'FileDescription', 'Electron desktop shell for a bundled dsh runtime and external plugins',
  '--set-version-string', 'LegalCopyright', 'Copyright © 2026 DeepSeek Harness',
  '--set-version-string', 'CompanyName', '',
  '--set-file-version', '0.2.1.1',
  '--set-product-version', '0.2.1.1',
];
if (icon) args.push('--set-icon', icon);
try {
  execFileSync(rcedit, args, { stdio: 'inherit' });
  log('rcedit patched version info' + (icon ? ' + icon' : ''));
} catch (e) {
  log('rcedit FAILED:', e.message);
}
// electron-builder naming parity: electron LICENSE becomes LICENSE.electron.txt
{
  const lic = path.join(OUT, 'LICENSE');
  if (fs.existsSync(lic)) fs.renameSync(lic, path.join(OUT, 'LICENSE.electron.txt'));
}
log('assembled', OUT);
