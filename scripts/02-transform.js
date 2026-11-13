// 02-transform.js — swap x64 platform payload for arm64 equivalents inside work/tree
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const TREE = 'D:/aiwork/DSHarm/work/tree';
const NM = path.join(TREE, 'dsh/node_modules');
const DL = 'D:/aiwork/DSHarm/work/dl';

const log = (...a) => console.log(...a);

// ---------- tar helpers ----------
function readTar(buf) {
  const entries = [];
  let off = 0;
  while (off + 512 <= buf.length) {
    const name = buf.subarray(off, off + 100).toString('utf8').replace(/\0.*$/, '');
    if (!name) break;
    const sizeStr = buf.subarray(off + 124, off + 136).toString('utf8').replace(/\0.*$/, '').trim();
    const size = parseInt(sizeStr, 8) || 0;
    const type = String.fromCharCode(buf[off + 156] || 48);
    const prefix = buf.subarray(off + 345, off + 500).toString('utf8').replace(/\0.*$/, '');
    const mode = parseInt(buf.subarray(off + 100, off + 108).toString('utf8').replace(/\0.*$/, '').trim() || '0', 8);
    const full = prefix ? prefix + '/' + name : name;
    entries.push({ name: full, size, type, mode, dataOff: off + 512 });
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

function extractTgz(tgzPath) {
  const tar = zlib.gunzipSync(fs.readFileSync(tgzPath));
  return { tar, entries: readTar(tar) };
}

function extractPackageTo(tgzPath, destDir) {
  const { tar, entries } = extractTgz(tgzPath);
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  let count = 0;
  for (const e of entries) {
    const rel = e.name.replace(/^package\//, '');
    if (rel === '' || rel === 'package') continue;
    const out = path.join(destDir, rel);
    if (e.type === '5') { fs.mkdirSync(out, { recursive: true }); continue; }
    if (e.type !== '0' && e.type !== '\0' && e.type !== '48') continue;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, tar.subarray(e.dataOff, e.dataOff + e.size));
    count++;
  }
  return count;
}

function pkgNameOf(dir) {
  const pj = path.join(dir, 'package.json');
  if (!fs.existsSync(pj)) return null;
  return JSON.parse(fs.readFileSync(pj, 'utf8')).name;
}

function rm(p) { if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); log('  removed', path.relative(TREE, p)); } }

// ---------- 1. remove x64 platform payload ----------
log('== removing x64 platform packages ==');
const x64Targets = [
  path.join(NM, '@anthropic-ai/claude-agent-sdk-win32-x64'),
  path.join(NM, '@openai/codex-win32-x64'),
  path.join(NM, '@deepseek-ai/libreoffice-kit-win32-x64'),
  path.join(NM, '@vscode/ripgrep-win32-x64'),
  path.join(NM, '@img/sharp-win32-x64'),
  path.join(NM, '@koromix/koffi-win32-x64'),
  path.join(NM, 'node-addon-require-builtin-win32-x64-msvc'),
  path.join(NM, 'sherpa-onnx-win-x64'),
  path.join(NM, '@deepseek-ai/dsh-desktop-host/node_modules/@koromix/koffi-win32-x64'),
  path.join(NM, 'node-pty/prebuilds/win32-x64'),
  path.join(NM, 'node-pty/build'),
];
for (const t of x64Targets) rm(t);

// ---------- 2. install arm64 platform packages ----------
log('== installing arm64 platform packages ==');
const installed = [];
function installTgz(tgzName, targetDirs) {
  const tgz = path.join(DL, tgzName);
  if (!fs.existsSync(tgz)) { log('  MISSING download', tgzName); return null; }
  const tmp = path.join(DL, '_tmp_pkg');
  const n = extractPackageTo(tgz, tmp);
  const name = pkgNameOf(tmp);
  const version = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8')).version;
  log(`  ${name}@${version} (${n} files) -> ${targetDirs.map(d => path.relative(TREE, d)).join(', ')}`);
  for (const d of targetDirs) {
    fs.mkdirSync(path.dirname(d), { recursive: true });
    fs.rmSync(d, { recursive: true, force: true });
    fs.cpSync(tmp, d, { recursive: true });
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  installed.push({ name, version, dirs: targetDirs.map(d => path.relative(TREE, d).replace(/\\/g, '/')) });
  return name;
}

installTgz('koffi-win32-arm64-3.1.1.tgz', [
  path.join(NM, '@koromix/koffi-win32-arm64'),
]);
// the copy nested under dsh-desktop-host is koffi 3.3.3 and needs the matching platform package
installTgz('koffi-win32-arm64-3.3.3.tgz', [
  path.join(NM, '@deepseek-ai/dsh-desktop-host/node_modules/@koromix/koffi-win32-arm64'),
]);
installTgz('sharp-win32-arm64-0.35.5.tgz', [path.join(NM, '@img/sharp-win32-arm64')]);
installTgz('node-addon-require-builtin-win32-arm64-msvc-0.1.9.tgz', [path.join(NM, 'node-addon-require-builtin-win32-arm64-msvc')]);
installTgz('ripgrep-win32-arm64-1.18.0.tgz', [path.join(NM, '@vscode/ripgrep-win32-arm64')]);
installTgz('claude-agent-sdk-win32-arm64-0.3.263.tgz', [path.join(NM, '@anthropic-ai/claude-agent-sdk-win32-arm64')]);
installTgz('codex-0.153.4-win32-arm64.tgz', [path.join(NM, '@openai/codex-win32-arm64')]);
installTgz('libreoffice-kit-win32-arm64-0.1.5.tgz', [path.join(NM, '@deepseek-ai/libreoffice-kit-win32-arm64')]);
installTgz('sherpa-onnx-win-arm64-1.13.8.tgz', [path.join(NM, 'sherpa-onnx-win-arm64')]);

// ---------- 3. node-pty arm64 prebuilds ----------
log('== node-pty arm64 prebuilds ==');
{
  const { tar, entries } = extractTgz(path.join(DL, 'node-pty-1.2.0-beta.15.tgz'));
  const pre = path.join(NM, 'node-pty/prebuilds/win32-arm64');
  fs.rmSync(pre, { recursive: true, force: true });
  let n = 0;
  for (const e of entries) {
    const rel = e.name.replace(/^package\//, '');
    if (!rel.startsWith('prebuilds/win32-arm64/')) continue;
    const out = path.join(NM, 'node-pty', rel);
    if (e.type === '5') { fs.mkdirSync(out, { recursive: true }); continue; }
    if (e.type !== '0' && e.type !== '\0' && e.type !== '48') continue;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, tar.subarray(e.dataOff, e.dataOff + e.size));
    n++;
  }
  log('  node-pty prebuilds/win32-arm64 files:', n);
  // refresh third_party conpty (same upstream tarball ships latest)
  for (const e of entries) {
    const rel = e.name.replace(/^package\//, '');
    if (!rel.startsWith('third_party/')) continue;
    const out = path.join(NM, 'node-pty', rel);
    if (e.type === '5') { fs.mkdirSync(out, { recursive: true }); continue; }
    if (e.type !== '0' && e.type !== '\0' && e.type !== '48') continue;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, tar.subarray(e.dataOff, e.dataOff + e.size));
  }
  installed.push({ name: 'node-pty', version: '1.2.0-beta.15', dirs: ['dsh/node_modules/node-pty/prebuilds/win32-arm64', 'dsh/node_modules/node-pty/third_party'] });
}

// ---------- 4. patch runtime descriptors ----------
log('== patching descriptors ==');
const drPath = path.join(TREE, 'dsh/desktop-runtime.json');
const dr = JSON.parse(fs.readFileSync(drPath, 'utf8'));
log('  desktop-runtime.json arch:', dr.arch, '-> arm64');
dr.arch = 'arm64';

// regenerate the file manifest for the new dsh tree
const sampleKeys = Object.keys(dr.files[0]);
log('  file entry keys:', sampleKeys.join(','));
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const files = [];
(function walkFiles(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = path.join(dir, e.name);
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { walkFiles(abs, r); continue; }
    if (!e.isFile()) continue;
    files.push({ path: r.replace(/\\/g, '/'), bytes: fs.statSync(abs).size, sha256: sha(abs), executable: false });
  }
})(path.join(TREE, 'dsh'), '');
files.sort((a, b) => a.path.localeCompare(b.path));
log('  regenerated files manifest entries:', files.length, '(was', dr.files.length + ')');
dr.files = files;
fs.writeFileSync(drPath, JSON.stringify(dr, null, 2) + '\n');

// package.json of dsh may pin platform packages? report optional deps mentioning x64
const dshPkg = JSON.parse(fs.readFileSync(path.join(TREE, 'dsh/package.json'), 'utf8'));
if (dshPkg.optionalDependencies) log('  dsh optionalDependencies:', JSON.stringify(dshPkg.optionalDependencies));
fs.writeFileSync('D:/aiwork/DSHarm/work/installed-arm64.json', JSON.stringify(installed, null, 1));
log('done');
