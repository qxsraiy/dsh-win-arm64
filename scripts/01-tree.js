// 01-tree.js — build the logical source tree from installed app (asar + asar.unpacked merged)
const fs = require('fs');
const path = require('path');

const APP = 'C:/Users/87059/AppData/Local/Programs/DeepSeek Harness';
const ASAR = path.join(APP, 'resources/app.asar');
const UNPACKED = path.join(APP, 'resources/app.asar.unpacked');
const OUT = 'D:/aiwork/DSHarm/work/tree';

function readHeader(file) {
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(64); fs.readSync(fd, head, 0, 64, 0);
  const pickleSize = head.readUInt32LE(4);
  const brace = head.indexOf(0x7b, 0);
  const len = head.readUInt32LE(brace - 4);
  const hb = Buffer.alloc(len); fs.readSync(fd, hb, 0, len, brace); fs.closeSync(fd);
  return { header: JSON.parse(hb.toString('utf8')), dataOffset: 8 + pickleSize };
}

const { header, dataOffset } = readHeader(ASAR);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const fd = fs.openSync(ASAR, 'r');
const BUF = Buffer.allocUnsafe(8 * 1024 * 1024);
const unpackedSet = new Set();
let files = 0, bytes = 0, unpackedFiles = 0;

function walk(node, prefix) {
  for (const [name, v] of Object.entries(node.files || {})) {
    const rel = prefix ? prefix + '/' + name : name;
    const target = path.join(OUT, rel);
    if (v.files) { fs.mkdirSync(target, { recursive: true }); walk(v, rel); continue; }
    if (v.link) { console.log('LINK skipped', rel, v.link); continue; }
    if (v.unpacked) { unpackedSet.add(rel); unpackedFiles++; continue; }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    let offset = dataOffset + Number(v.offset);
    let left = v.size;
    const out = fs.openSync(target, 'w');
    while (left > 0) {
      const chunk = Math.min(left, BUF.length);
      const got = fs.readSync(fd, BUF, 0, chunk, offset);
      if (got <= 0) throw new Error('EOF at ' + rel);
      fs.writeSync(out, BUF, 0, got);
      offset += got; left -= got;
    }
    fs.closeSync(out);
    files++; bytes += v.size;
  }
}
walk(header, '');
fs.closeSync(fd);
console.log(`asar files: ${files}, ${(bytes / 1048576).toFixed(1)} MiB; unpacked entries: ${unpackedFiles}`);

// merge unpacked payload into the tree
let copied = 0, copiedBytes = 0;
function copyUnpacked(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const src = path.join(dir, e.name);
    const relChild = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { fs.mkdirSync(path.join(OUT, relChild), { recursive: true }); copyUnpacked(src, relChild); continue; }
    const dst = path.join(OUT, relChild);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    copied++; copiedBytes += fs.statSync(dst).size;
    if (!unpackedSet.has(relChild)) console.log('WARN unpacked file not in asar header:', relChild);
  }
}
copyUnpacked(path.join(UNPACKED, 'dsh'), 'dsh');
console.log(`merged unpacked files: ${copied}, ${(copiedBytes / 1048576).toFixed(1)} MiB`);
fs.writeFileSync('D:/aiwork/DSHarm/work/orig-unpacked.json', JSON.stringify([...unpackedSet].sort(), null, 0));
console.log('wrote work/orig-unpacked.json');
