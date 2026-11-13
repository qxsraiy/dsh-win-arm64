// 03-asar.js — pack a directory tree into app.asar (+ app.asar.unpacked)
// usage: node 03-asar.js <treeDir> <outAsar> <outUnpackedDir> <unpackedListJson> [blockSize]
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const [treeDir, outAsar, outUnpacked, unpackedListFile, blockSizeArg] = process.argv.slice(2);
const unpacked = new Set(JSON.parse(fs.readFileSync(unpackedListFile, 'utf8')));
const BLOCK = parseInt(blockSizeArg || '4194304', 10);

function integrityOf(file) {
  const buf = fs.readFileSync(file);
  const blocks = [];
  for (let i = 0; i < buf.length; i += BLOCK) blocks.push(crypto.createHash('sha256').update(buf.subarray(i, Math.min(i + BLOCK, buf.length))).digest('hex'));
  if (blocks.length === 0) blocks.push(crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex'));
  return { algorithm: 'SHA256', hash: crypto.createHash('sha256').update(buf).digest('hex'), blockSize: BLOCK, blocks };
}

// collect entries with deterministic order
const root = { files: {} };
const flat = []; // { rel, abs, size }
function walk(dirAbs, dirRel) {
  const entries = fs.readdirSync(dirAbs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const node = dirRel === '' ? root : ensureNode(dirRel);
  for (const e of entries) {
    const rel = dirRel ? dirRel + '/' + e.name : e.name;
    const abs = path.join(dirAbs, e.name);
    if (e.isDirectory()) {
      node.files[e.name] = { files: {} };
      walk(abs, rel);
    } else if (e.isFile()) {
      const size = fs.statSync(abs).size;
      node.files[e.name] = { size };
      flat.push({ rel, abs, size, node: node.files[e.name] });
    } else {
      console.log('skip special file', rel);
    }
  }
}
const nodeByRel = new Map();
function ensureNode(rel) {
  const parts = rel.split('/');
  let cur = root;
  let acc = '';
  for (const p of parts) {
    acc = acc ? acc + '/' + p : p;
    if (!cur.files[p]) cur.files[p] = { files: {} };
    cur = cur.files[p];
    nodeByRel.set(acc, cur);
  }
  return cur;
}

fs.rmSync(outUnpacked, { recursive: true, force: true });
fs.mkdirSync(outUnpacked, { recursive: true });
walk(treeDir, '');

// assign offsets / unpacked flags
let offset = 0, nUnpacked = 0, nPacked = 0;
const chunks = [];
for (const f of flat) {
  const leaf = f.node;
  if (unpacked.has(f.rel)) {
    leaf.unpacked = true;
    nUnpacked++;
    const dst = path.join(outUnpacked, f.rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(f.abs, dst);
  } else {
    leaf.offset = String(offset);
    offset += f.size;
    nPacked++;
  }
  f.integrity = undefined;
}
// integrity for every file (original header carried it for all leaves)
for (const f of flat) {
  try { f.node.integrity = integrityOf(f.abs); } catch (e) { console.log('integrity failed', f.rel, e.message); }
}

const json = Buffer.from(JSON.stringify(root), 'utf8');
const strLen = json.length;
const pad = (4 - ((4 + strLen) % 4)) % 4;
const innerPayload = 4 + strLen + pad;
const outerPayload = 4 + innerPayload;
const dataOffset = 8 + outerPayload;

const out = fs.openSync(outAsar, 'w');
const pre = Buffer.alloc(16);
pre.writeUInt32LE(4, 0);
pre.writeUInt32LE(outerPayload, 4);
pre.writeUInt32LE(innerPayload, 8);
pre.writeUInt32LE(strLen, 12);
fs.writeSync(out, pre);
fs.writeSync(out, json);
if (pad) fs.writeSync(out, Buffer.alloc(pad));
let written = 0;
const BUF = Buffer.allocUnsafe(8 * 1024 * 1024);
for (const f of flat) {
  if (unpacked.has(f.rel)) continue;
  const fd = fs.openSync(f.abs, 'r');
  let left = f.size;
  while (left > 0) {
    const chunk = Math.min(left, BUF.length);
    const got = fs.readSync(fd, BUF, 0, chunk, 0 + (f.size - left));
    if (got <= 0) throw new Error('read fail ' + f.rel);
    fs.writeSync(out, BUF, 0, got);
    left -= got;
  }
  fs.closeSync(fd);
  written += f.size;
}
fs.closeSync(out);
const stat = fs.statSync(outAsar);
console.log(`packed ${nPacked} files (${(written / 1048576).toFixed(1)} MiB) + ${nUnpacked} unpacked`);
console.log(`asar ${outAsar}: ${(stat.size / 1048576).toFixed(1)} MiB, header ${dataOffset} bytes`);
if (stat.size !== dataOffset + written) console.log('WARN size mismatch', stat.size, dataOffset + written);
