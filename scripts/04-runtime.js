// 04-runtime.js — build resources/runtime with arm64 node + python payload
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const APP = 'C:/Users/87059/AppData/Local/Programs/DeepSeek Harness';
const SRC = path.join(APP, 'resources/runtime');
const DL = 'D:/aiwork/DSHarm/work/dl';
const OUT = process.argv[2] || 'D:/aiwork/DSHarm/work/runtime-arm64';
const log = (...a) => console.log(...a);

// ---------- tar ----------
function readTar(buf) {
  const entries = [];
  let off = 0;
  while (off + 512 <= buf.length) {
    const name = buf.subarray(off, off + 100).toString('utf8').replace(/\0.*$/, '');
    if (!name) break;
    const size = parseInt(buf.subarray(off + 124, off + 136).toString('utf8').replace(/\0.*$/, '').trim(), 8) || 0;
    const type = String.fromCharCode(buf[off + 156] || 48);
    const prefix = buf.subarray(off + 345, off + 500).toString('utf8').replace(/\0.*$/, '');
    const full = prefix ? prefix + '/' + name : name;
    const mode = parseInt(buf.subarray(off + 100, off + 108).toString('utf8').replace(/\0.*$/, '').trim() || '0', 8);
    entries.push({ name: full, size, type, mode, dataOff: off + 512 });
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}
function extractTarGz(tgz, dest, stripPrefix) {
  const tar = zlib.gunzipSync(fs.readFileSync(tgz));
  const entries = readTar(tar);
  let n = 0;
  for (const e of entries) {
    let rel = e.name;
    if (stripPrefix) rel = rel.replace(new RegExp('^' + stripPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), '');
    if (!rel) continue;
    const out = path.join(dest, rel);
    if (e.type === '5') { fs.mkdirSync(out, { recursive: true }); continue; }
    if (e.type !== '0' && e.type !== '\0' && e.type !== '48') continue;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, tar.subarray(e.dataOff, e.dataOff + e.size));
    n++;
  }
  return n;
}
// ---------- zip (stored/deflate) ----------
function extractZip(zipPath, dest) {
  const buf = fs.readFileSync(zipPath);
  // find EOCD
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('no EOCD in ' + zipPath);
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  let n = 0;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('bad central header');
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
    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error('unsupported zip method ' + method + ' for ' + name);
    const out = path.join(dest, name);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, data);
    n++;
  }
  return n;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
log('copying base runtime from installed app ...');
fs.cpSync(SRC, OUT, { recursive: true });

const DEP = path.join(OUT, 'primary-runtime/dependencies');

// ---------- node ----------
log('== node arm64 ==');
fs.copyFileSync(path.join(DL, 'node-arm64.exe'), path.join(DEP, 'node/bin/node.exe'));
if (fs.existsSync(path.join(DL, 'node-LICENSE'))) fs.copyFileSync(path.join(DL, 'node-LICENSE'), path.join(DEP, 'node/LICENSE'));

// ---------- python ----------
log('== python 3.12.16 arm64 ==');
const pyRoot = path.join(DEP, 'python');
fs.rmSync(pyRoot, { recursive: true, force: true });
fs.mkdirSync(pyRoot, { recursive: true });
const tmpPy = path.join(DL, '_py');
fs.rmSync(tmpPy, { recursive: true, force: true });
const nPy = extractTarGz(path.join(DL, 'cpython-3.12.16-arm64.tar.gz'), tmpPy, 'python/');
log('  extracted', nPy, 'files from python-build-standalone');
// copy tree
fs.cpSync(tmpPy, pyRoot, { recursive: true });
fs.rmSync(tmpPy, { recursive: true, force: true });
// top-level layout check
log('  python root entries:', fs.readdirSync(pyRoot).join(', '));

// site-packages from wheels
const site = path.join(pyRoot, 'Lib/site-packages');
fs.mkdirSync(site, { recursive: true });
const wheelFiles = fs.readdirSync(DL).filter(f => f.endsWith('.whl'));
log('  installing', wheelFiles.length, 'wheels');
for (const w of wheelFiles) {
  const tmp = path.join(DL, '_whl');
  fs.rmSync(tmp, { recursive: true, force: true });
  extractZip(path.join(DL, w), tmp);
  // move *.data/purelib|platlib -> site-packages, plain dirs -> site-packages
  for (const e of fs.readdirSync(tmp, { withFileTypes: true })) {
    const abs = path.join(tmp, e.name);
    if (e.isDirectory() && e.name.endsWith('.data')) {
      for (const sub of fs.readdirSync(abs, { withFileTypes: true })) {
        if (sub.name === 'scripts' || sub.name === 'headers') continue;
        const target = path.join(site, sub.name === 'purelib' || sub.name === 'platlib' ? '' : sub.name);
        const srcDir = path.join(abs, sub.name);
        if (sub.name === 'purelib' || sub.name === 'platlib') {
          for (const f of fs.readdirSync(srcDir, { withFileTypes: true })) {
            fs.cpSync(path.join(srcDir, f.name), path.join(site, f.name), { recursive: true, force: true });
          }
        } else {
          fs.cpSync(srcDir, target, { recursive: true, force: true });
        }
      }
      continue;
    }
    fs.cpSync(abs, path.join(site, e.name), { recursive: true, force: true });
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  log('   ', w);
}

// ---------- descriptors ----------
log('== runtime descriptors ==');
const rj = path.join(OUT, 'primary-runtime/runtime.json');
const manifest = JSON.parse(fs.readFileSync(rj, 'utf8'));
log('  old:', JSON.stringify({ platform: manifest.platform, arch: manifest.arch, python: manifest.python, node: manifest.node }));
manifest.arch = 'arm64';
manifest.python = '3.12.16';
manifest.node = '24.21.0';
manifest.platform = 'win32';
delete manifest.payloadDigest;
fs.writeFileSync(rj, JSON.stringify(manifest, null, 2) + '\n');
log('  new:', JSON.stringify({ platform: manifest.platform, arch: manifest.arch, python: manifest.python, node: manifest.node }));

const vj = path.join(OUT, 'versions.json');
const v = JSON.parse(fs.readFileSync(vj, 'utf8'));
v.node = '24.21.0';
fs.writeFileSync(vj, JSON.stringify(v, null, 2) + '\n');
log('  versions.json:', JSON.stringify(v));
log('done 04');
