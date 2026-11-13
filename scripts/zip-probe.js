// zip-probe.js — inspect central-directory metadata of the portable zip
const fs = require('fs');
const p = 'D:/aiwork/DSHarm/out/DSH-0.2.1-fix11-win-arm64-portable.zip';
const buf = fs.readFileSync(p);
let eocd = -1;
for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
  if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
}
const count = buf.readUInt16LE(eocd + 10);
let off = buf.readUInt32LE(eocd + 16);
console.log('entries:', count);
const modes = new Map();
const interesting = [];
for (let i = 0; i < count; i++) {
  const madeBy = buf.readUInt16LE(off + 4);
  const extAttr = buf.readUInt32LE(off + 38);
  const nameLen = buf.readUInt16LE(off + 28);
  const extraLen = buf.readUInt16LE(off + 30);
  const commentLen = buf.readUInt16LE(off + 32);
  const flags = buf.readUInt16LE(off + 8);
  const method = buf.readUInt16LE(off + 10);
  const name = buf.subarray(off + 46, off + 46 + nameLen).toString('utf8');
  off += 46 + nameLen + extraLen + commentLen;
  const host = madeBy >> 8;
  const unixMode = (extAttr >>> 16) & 0xffff;
  const kind = (unixMode & 0xF000) === 0xA000 ? 'SYMLINK' : (unixMode & 0xF000) === 0x4000 ? 'dir' : (unixMode & 0xF000) === 0x8000 ? 'file' : 'mode0';
  const key = `host=${host} kind=${kind} method=${method} flags=0x${flags.toString(16)}`;
  modes.set(key, (modes.get(key) || 0) + 1);
  if (kind === 'SYMLINK' || (kind === 'mode0' && i < 25) || /\.(exe|dll|node)$/i.test(name) === false && i < 3) {
    if (interesting.length < 12) interesting.push({ i, name, host, kind, unixMode: '0o' + unixMode.toString(8), extAttr: '0x' + extAttr.toString(16), method, flags });
  }
}
console.log('\nentry classes:');
for (const [k, v] of [...modes].sort((a, b) => b[1] - a[1])) console.log('  ', k, '->', v);
console.log('\nsamples:');
for (const s of interesting) console.log('  ', JSON.stringify(s));
