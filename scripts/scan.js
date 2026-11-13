const fs = require('fs');
const path = process.argv[2];
const size = fs.statSync(path).size;
const sigs = {
  '7z-1C': Buffer.from([0x37,0x7A,0xBC,0xAF,0x27,0x1C]),
  'MSCF': Buffer.from('MSCF'),
  'PK0304': Buffer.from([0x50,0x4B,0x03,0x04]),
  'PK0506-eocd': Buffer.from([0x50,0x4B,0x05,0x06]),
  'Nullsoft': Buffer.from('Nullsoft'),
  'app.asar': Buffer.from('app.asar'),
  'NODE_SEA_BLOB': Buffer.from('NODE_SEA_BLOB'),
  'electron.exe': Buffer.from('electron.exe'),
  'dsh.asar': Buffer.from('dsh'),
  'nsis': Buffer.from([0xEF,0xBE,0xAD,0xDE]),
  'NSIS-Inst': Buffer.from('NullsoftInst'),
  'squirrel': Buffer.from('Squirrel'),
  'resources\\app': Buffer.from('resources\\app'),
  'app.asar.unpacked': Buffer.from('app.asar.unpacked'),
  'snapshot_blob': Buffer.from('snapshot_blob'),
  'v8_context_snapshot': Buffer.from('v8_context_snapshot'),
  'ffmpeg.dll': Buffer.from('ffmpeg.dll'),
  'electron.asar': Buffer.from('electron.asar'),
  '7zSD': Buffer.from('7zSD'),
  '7zS.sfx': Buffer.from('7zS.sfx'),
};
const results = {};
for (const k of Object.keys(sigs)) results[k] = [];
const CH = 8 * 1024 * 1024;
const fd = fs.openSync(path, 'r');
const buf = Buffer.allocUnsafe(CH + 64);
let pos = 0;
let prev = Buffer.alloc(0);
const t0 = Date.now();
while (pos < size) {
  const n = fs.readSync(fd, buf, prev.length, CH, pos);
  if (n <= 0) break;
  const chunk = buf.subarray(0, prev.length + n);
  const base = pos - prev.length;
  for (const [k, sig] of Object.entries(sigs)) {
    if (results[k].length >= 8) continue;
    let i = chunk.indexOf(sig, 0);
    while (i !== -1 && results[k].length < 8) {
      results[k].push(base + i);
      i = chunk.indexOf(sig, i + 1);
    }
  }
  prev = Buffer.from(chunk.subarray(chunk.length - 64));
  pos += n;
}
fs.closeSync(fd);
console.log('size', size, 'secs', ((Date.now() - t0) / 1000).toFixed(1));
for (const [k, v] of Object.entries(results)) {
  console.log(k.padEnd(20), v.map(x => '0x' + x.toString(16)).join(', ') || '-');
}
