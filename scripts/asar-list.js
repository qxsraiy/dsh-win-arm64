// asar reader (corrected) + inventory
const fs = require('fs');

function readAsarHeader(file) {
  const fd = fs.openSync(file, 'r');
  const pre = Buffer.alloc(8);
  fs.readSync(fd, pre, 0, 8, 0);
  const first = pre.readUInt32LE(0);       // should be 4
  const pickleSize = pre.readUInt32LE(4);  // size of the header pickle
  const hb = Buffer.alloc(pickleSize);
  fs.readSync(fd, hb, 0, pickleSize, 8);
  fs.closeSync(fd);
  const jsonLen = hb.readUInt32LE(0);
  if (jsonLen < 4 || jsonLen > pickleSize) throw new Error(`bad json len ${jsonLen} pickle ${pickleSize} first ${first}`);
  return JSON.parse(hb.subarray(4, 4 + jsonLen).toString('utf8'));
}

function walk(node, prefix, out) {
  for (const [name, v] of Object.entries(node.files || {})) {
    const p = prefix ? prefix + '/' + name : name;
    if (v.files) walk(v, p, out);
    else out.push({ path: p, size: v.size || 0, unpacked: !!v.unpacked, link: v.link || null, executable: !!v.executable });
  }
}

const asar = process.argv[2];
const tree = readAsarHeader(asar);
const files = [];
walk(tree, '', files);
console.log('total files in asar:', files.length);
const tops = new Map();
for (const f of files) {
  const top = f.path.split('/').slice(0, 2).join('/');
  const e = tops.get(top) || { n: 0, size: 0 };
  e.n++; e.size += f.size; tops.set(top, e);
}
console.log('\n== top level ==');
for (const [k, v] of [...tops].sort((a, b) => b[1].size - a[1].size).slice(0, 40)) {
  console.log(`${k.padEnd(45)} files=${String(v.n).padEnd(7)} ${(v.size / 1048576).toFixed(1)} MB`);
}
const natives = files.filter(f => /\.(node|exe|dll|so|dylib|pyd)$/i.test(f.path));
console.log('\n== native files in asar ==', natives.length);
for (const f of natives) console.log(`${f.path}  ${f.size}${f.unpacked ? ' [unpacked]' : ''}`);
console.log('\n== unpacked files ==', files.filter(f => f.unpacked).length);
if (process.argv[3]) { fs.writeFileSync(process.argv[3], JSON.stringify({ header: tree, files }, null, 1)); console.log('\nwrote', process.argv[3]); }
