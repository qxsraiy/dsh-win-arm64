const fs = require('fs');
const p = 'C:/Users/87059/AppData/Local/Programs/DeepSeek Harness/resources/app.asar';
const fd = fs.openSync(p, 'r');
const head = Buffer.alloc(64); fs.readSync(fd, head, 0, 64, 0);
const pickle = head.readUInt32LE(4);
const brace = head.indexOf(0x7b, 0);
const len = head.readUInt32LE(brace - 4);
const hb = Buffer.alloc(len); fs.readSync(fd, hb, 0, len, brace); fs.closeSync(fd);
const j = JSON.parse(hb.toString('utf8'));
const root = j.files;
console.log('root keys:', Object.keys(root).slice(0, 6));
console.log('package.json entry:', JSON.stringify(root['package.json']));
console.log('lib entry keys:', Object.keys(root['lib'].files).slice(0, 5));
console.log('lib/main.js:', JSON.stringify(root['lib'].files['main.js']));
const dsh = root['dsh'].files;
console.log('dsh keys:', Object.keys(dsh).slice(0, 30).join(', '));
const nm = dsh['node_modules'].files;
console.log('nm sample entries:', Object.keys(nm).slice(0, 8));
const koffi = nm['koffi'];
console.log('koffi node:', JSON.stringify(koffi).slice(0, 300));
if (koffi.files) { const f0 = Object.keys(koffi.files)[0]; console.log('koffi first child', f0, JSON.stringify(koffi.files[f0]).slice(0, 300)); }
// find one unpacked leaf
let found = 0;
const walk = (node, prefix) => {
  for (const [k, v] of Object.entries(node.files || {})) {
    if (found > 6) return;
    const p2 = prefix + '/' + k;
    if (v.files) { walk(v, p2); continue; }
    if (v.unpacked) { console.log('UNPACKED', p2, JSON.stringify(v)); found++; }
  }
};
walk(j, '');
