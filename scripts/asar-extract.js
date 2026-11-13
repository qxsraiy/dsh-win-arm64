// asar extract: node asar-extract.js <app.asar> <outdir>
const fs = require('fs');
const path = require('path');

function readAsarHeader(file) {
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(64);
  const n = fs.readSync(fd, head, 0, 64, 0);
  const pickleSize = head.readUInt32LE(4); // size of the header pickle following byte 8
  const brace = head.indexOf(0x7b, 0);
  if (brace < 4) throw new Error('no json start');
  const jsonLen = head.readUInt32LE(brace - 4);
  const hb = Buffer.alloc(jsonLen);
  fs.readSync(fd, hb, 0, jsonLen, brace);
  fs.closeSync(fd);
  return { header: JSON.parse(hb.toString('utf8')), dataOffset: 8 + pickleSize };
}

const asarPath = process.argv[2];
const outDir = process.argv[3];
const { header, dataOffset } = readAsarHeader(asarPath);
const fd = fs.openSync(asarPath, 'r');
const BUF = Buffer.allocUnsafe(8 * 1024 * 1024);
let totalFiles = 0, totalBytes = 0, skippedLinks = 0;

function walk(node, prefix) {
  for (const [name, v] of Object.entries(node.files || {})) {
    const p = prefix ? prefix + '/' + name : name;
    const target = path.join(outDir, p);
    if (v.files) { fs.mkdirSync(target, { recursive: true }); walk(v, p); continue; }
    if (v.link) { skippedLinks++; continue; }
    if (v.unpacked) continue; // lives in app.asar.unpacked
    fs.mkdirSync(path.dirname(target), { recursive: true });
    let offset = dataOffset + Number(v.offset);
    let left = v.size;
    const out = fs.openSync(target, 'w');
    while (left > 0) {
      const chunk = Math.min(left, BUF.length);
      const read = fs.readSync(fd, BUF, 0, chunk, offset);
      if (read <= 0) throw new Error('unexpected EOF at ' + p);
      fs.writeSync(out, BUF, 0, read);
      offset += read; left -= read;
    }
    fs.closeSync(out);
    totalFiles++; totalBytes += v.size;
  }
}
walk(header, '');
fs.closeSync(fd);
console.log(`extracted ${totalFiles} files, ${(totalBytes / 1048576).toFixed(1)} MiB, links skipped ${skippedLinks}, dataOffset ${dataOffset}`);
