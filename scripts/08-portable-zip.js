// 08-portable-zip.js (0.2.2-rc.2) — build a portable zip in pure node (no child processes, no pwoershell)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SRC = 'D:\\aiwork\\DSHarm022\\work\\app-arm64';
const ROOT_NAME = 'DSH-arm64';                                  // short root folder inside the archive
const OUT = 'D:\\aiwork\\DSHarm022\\out\\DSH-0.2.2-rc.2-win-arm64-portable-short-root.zip';

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf, crc = 0) {
  let c = ~crc;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c;
}

function dosDateTime(d) {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

// collect
const files = [];
(function walk(dirAbs, dirRel) {
  for (const e of fs.readdirSync(dirAbs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = path.join(dirAbs, e.name);
    const rel = dirRel ? dirRel + '/' + e.name : e.name;
    if (e.isDirectory()) walk(abs, rel);
    else if (e.isFile()) files.push({ abs, rel, size: fs.statSync(abs).size, mtime: fs.statSync(abs).mtime });
  }
})(SRC, ROOT_NAME);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
if (fs.existsSync(OUT)) fs.unlinkSync(OUT);
const fd = fs.openSync(OUT, 'w');
let offset = 0;
const central = [];
const { time, date } = dosDateTime(new Date());

function push(buf) { fs.writeSync(fd, buf); offset += buf.length; }

for (const f of files) {
  const data = fs.readFileSync(f.abs);
  const comp = zlib.deflateRawSync(data, { level: 6 });
  const nameBuf = Buffer.from(f.rel, 'utf8');
  const crc = crc32(data) >>> 0;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);            // version needed
  local.writeUInt16LE(0x0800, 6);        // utf8 names
  local.writeUInt16LE(8, 8);             // deflate
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(date, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  const headerOffset = offset;
  push(local); push(nameBuf); push(comp);

  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);               // version made by
  cd.writeUInt16LE(20, 6);               // version needed
  cd.writeUInt16LE(0x0800, 8);
  cd.writeUInt16LE(8, 10);
  cd.writeUInt16LE(time, 12);
  cd.writeUInt16LE(date, 14);
  cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(comp.length, 20);
  cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(nameBuf.length, 28);
  cd.writeUInt16LE(0, 30);               // extra
  cd.writeUInt16LE(0, 32);               // comment
  cd.writeUInt16LE(0, 34);               // disk
  cd.writeUInt16LE(0, 36);               // internal attr
  cd.writeUInt32LE(0x81a40000, 38);      // external attr: 0644
  cd.writeUInt32LE(headerOffset, 42);
  central.push(Buffer.concat([cd, nameBuf]));
}

const cdStart = offset;
for (const c of central) push(c);
const cdSize = offset - cdStart;
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(0, 4);
eocd.writeUInt16LE(0, 6);
eocd.writeUInt16LE(central.length, 8);
eocd.writeUInt16LE(central.length, 10);
eocd.writeUInt32LE(cdSize, 12);
eocd.writeUInt32LE(cdStart, 16);
eocd.writeUInt16LE(0, 20);
push(eocd);
fs.closeSync(fd);

const st = fs.statSync(OUT);
console.log(`entries ${files.length}, zip ${(st.size / 1048576).toFixed(1)} MiB, root "${ROOT_NAME}"`);
let longest = '';
for (const f of files) if (f.rel.length > longest.length) longest = f.rel;
console.log('longest entry:', longest.length, 'chars');
console.log('  ', longest);
console.log('zip:', OUT);
