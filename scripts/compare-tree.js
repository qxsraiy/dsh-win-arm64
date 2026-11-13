// compare-tree.js — byte-level comparison of two trees
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const A = process.argv[2];
const B = process.argv[3];

function list(root, rel, out) {
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) list(root, r, out);
    else if (e.isFile()) out.set(r, fs.statSync(path.join(root, r)).size);
    else out.set(r, -1);
  }
  return out;
}
const a = list(A, '', new Map());
const b = list(B, '', new Map());
const onlyA = [...a.keys()].filter(k => !b.has(k));
const onlyB = [...b.keys()].filter(k => !a.has(k));
const sizeDiff = [...a.keys()].filter(k => b.has(k) && a.get(k) !== b.get(k));
console.log(`A files=${a.size} B files=${b.size}`);
console.log('only in A:', onlyA.length, onlyA.slice(0, 5));
console.log('only in B:', onlyB.length, onlyB.slice(0, 5));
console.log('size differs:', sizeDiff.length, sizeDiff.slice(0, 5));
let checked = 0, bad = [];
for (const [rel, size] of a) {
  if (!b.has(rel) || b.get(rel) !== size) continue;
  const ha = crypto.createHash('sha256').update(fs.readFileSync(path.join(A, rel))).digest('hex');
  const hb = crypto.createHash('sha256').update(fs.readFileSync(path.join(B, rel))).digest('hex');
  if (ha !== hb) bad.push(rel);
  checked++;
}
console.log('sha256 compared:', checked, 'mismatches:', bad.length, bad.slice(0, 5));
