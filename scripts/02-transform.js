// 02-transform.js (0.2.2-rc.2) — swap the x64 platform payload for arm64 equivalents
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const TREE = 'D:/aiwork/DSHarm022/work/tree';
const NM = path.join(TREE, 'dsh/node_modules');
const DL = 'D:/aiwork/DSHarm022/work/dl';
const log = (...a) => console.log(...a);

// ---------- tar helpers ----------
function readTar(buf) {
  const entries = [];
  let off = 0;
  while (off + 512 <= buf.length) {
    const name = buf.subarray(off, off + 100).toString('utf8').replace(/\0.*$/, '');
    if (!name) break;
    const size = parseInt(buf.subarray(off + 124, off + 136).toString('utf8').replace(/\0.*$/, '').trim(), 8) || 0;
    const type = String.fromCharCode(buf[off + 156] || 48);
    const prefix = buf.subarray(off + 345, off + 500).toString('utf8').replace(/\0.*$/, '');
    entries.push({ name: prefix ? prefix + '/' + name : name, size, type, dataOff: off + 512 });
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
    if (!rel || rel === 'package') continue;
    const out = path.join(destDir, rel);
    if (e.type === '5') { fs.mkdirSync(out, { recursive: true }); continue; }
    if (e.type !== '0' && e.type !== '\0' && e.type !== '48') continue;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, tar.subarray(e.dataOff, e.dataOff + e.size));
    count++;
  }
  return count;
}

function rm(p) { if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); log('  removed', path.relative(TREE, p)); } }

// ---------- 1. remove x64 platform payload ----------
log('== removing x64 platform packages ==');
for (const p of [
  '@deepseek-ai/libreoffice-kit-win32-x64',
  '@vscode/ripgrep-win32-x64',
  '@img/sharp-win32-x64',
  '@koromix/koffi-win32-x64',
  'node-addon-require-builtin-win32-x64-msvc',
  'sherpa-onnx-win-x64',
]) rm(path.join(NM, p));
rm(path.join(NM, 'node-pty/prebuilds/win32-x64'));
rm(path.join(NM, 'node-pty/build'));

// ---------- 2. install arm64 platform packages ----------
log('== installing arm64 platform packages ==');
const installed = [];
function install(tgzName, targetDirs) {
  const tgz = path.join(DL, tgzName);
  if (!fs.existsSync(tgz)) { log('  MISSING download', tgzName); return; }
  const tmp = path.join(DL, '_tmp_pkg');
  const n = extractPackageTo(tgz, tmp);
  const pj = JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
  log(`  ${pj.name}@${pj.version} (${n} files) -> ${targetDirs.map(d => path.relative(TREE, d)).join(', ')}`);
  for (const d of targetDirs) {
    fs.mkdirSync(path.dirname(d), { recursive: true });
    fs.rmSync(d, { recursive: true, force: true });
    fs.cpSync(tmp, d, { recursive: true });
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  installed.push({ name: pj.name, version: pj.version, dirs: targetDirs.map(d => path.relative(TREE, d).replace(/\\/g, '/')) });
}

install('koffi-win32-arm64-3.1.1.tgz', [path.join(NM, '@koromix/koffi-win32-arm64')]);
install('sharp-win32-arm64-0.35.5.tgz', [path.join(NM, '@img/sharp-win32-arm64')]);
install('node-addon-require-builtin-win32-arm64-msvc-0.1.9.tgz', [path.join(NM, 'node-addon-require-builtin-win32-arm64-msvc')]);
install('ripgrep-win32-arm64-1.18.0.tgz', [path.join(NM, '@vscode/ripgrep-win32-arm64')]);
install('sherpa-onnx-win-arm64-1.13.8.tgz', [path.join(NM, 'sherpa-onnx-win-arm64')]);
install('libreoffice-kit-win32-arm64-0.2.3.tgz', [path.join(NM, '@deepseek-ai/libreoffice-kit-win32-arm64')]);

// ---------- 3. node-pty arm64 prebuilds ----------
log('== node-pty arm64 prebuilds ==');
{
  const { tar, entries } = extractTgz(path.join(DL, 'node-pty-1.2.0-beta.15.tgz'));
  for (const prefix of ['prebuilds/win32-arm64/', 'third_party/']) {
    for (const e of entries) {
      const rel = e.name.replace(/^package\//, '');
      if (!rel.startsWith(prefix)) continue;
      const out = path.join(NM, 'node-pty', rel);
      if (e.type === '5') { fs.mkdirSync(out, { recursive: true }); continue; }
      if (e.type !== '0' && e.type !== '\0' && e.type !== '48') continue;
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, tar.subarray(e.dataOff, e.dataOff + e.size));
    }
    log('  extracted', prefix);
  }
  installed.push({ name: 'node-pty', version: '1.2.0-beta.15', dirs: ['dsh/node_modules/node-pty/prebuilds/win32-arm64', 'dsh/node_modules/node-pty/third_party'] });
}

// ---------- 4. source-level platform whitelist ----------
log('== arch-gate patches ==');
{
  const f = path.join(NM, '@deepseek-ai/dsh-experimental-speech-to-text-sensevoice/lib/index.js');
  if (fs.existsSync(f)) {
    const src = fs.readFileSync(f, 'utf8');
    if (src.includes('"win32-arm64"')) log('  speech whitelist: already patched');
    else {
      const idx = src.indexOf('"win32-x64"');
      const after = src.slice(idx, idx + 40);
      if (idx >= 0 && /^"win32-x64"(\s*)\]/.test(after)) {
        fs.writeFileSync(f, src.slice(0, idx) + '"win32-x64",\n\t\t"win32-arm64"' + src.slice(idx + '"win32-x64"'.length));
        log('  speech whitelist: patched (+win32-arm64)');
      } else log('  speech whitelist: marker changed, context =', JSON.stringify(after));
    }
    log('  verify:', /"win32-x64",\s*"win32-arm64"/.test(fs.readFileSync(f, 'utf8')) ? 'ok' : 'FAILED');
  } else log('  sensevoice package absent, nothing to patch');
}

// ---------- 5. descriptors ----------
log('== descriptors ==');
const drPath = path.join(TREE, 'dsh/desktop-runtime.json');
const dr = JSON.parse(fs.readFileSync(drPath, 'utf8'));
log('  desktop-runtime.json arch:', dr.arch, '-> arm64');
dr.arch = 'arm64';
// NOTE: dsh/desktop-runtime.json here carries release metadata + file list; regenerate it from the tree
const crypto = require('crypto');
if (Array.isArray(dr.files)) {
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
  log('  regenerated file manifest entries:', files.length, '(was', dr.files.length + ')');
  dr.files = files;
}
fs.writeFileSync(drPath, JSON.stringify(dr, null, 2) + '\n');
log('  release.version =', dr.release && dr.release.version);

fs.writeFileSync('D:/aiwork/DSHarm022/work/installed-arm64.json', JSON.stringify(installed, null, 1));

// ---------- 6. leftover x64 dirs ----------
log('== leftover x64-named directories ==');
const leftovers = [];
(function walk(dir, depth) {
  if (depth > 6) return;
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (!e.isDirectory()) continue;
    const full = path.join(dir, e.name);
    if (/(win32|win)-(x64|x86|ia32)/.test(e.name)) leftovers.push(path.relative(TREE, full).replace(/\\/g, '/'));
    walk(full, e.name.startsWith('@') ? depth : depth + 1);
  }
})(TREE, 0);
log(leftovers.length ? leftovers.map(l => '  ' + l).join('\n') : '  none');
log('done');
