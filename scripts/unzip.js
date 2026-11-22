// unzip.js <zip> <dest> — minimal ZIP extractor (stored/deflate)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const [zipPath, dest] = process.argv.slice(2);
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
  console.log('  ', name, data.length);
}
console.log('extracted', n, 'files ->', dest);
