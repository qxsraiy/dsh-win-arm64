// scan tgz packages for native binaries
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const dir = process.argv[2];
const out = [];
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.tgz')) continue;
  const buf = fs.readFileSync(path.join(dir, f));
  let tar;
  try { tar = zlib.gunzipSync(buf); } catch (e) { out.push({ f, err: e.message }); continue; }
  // minimal tar walker
  let off = 0;
  const natives = [];
  let pkgJson = null;
  while (off + 512 <= tar.length) {
    const name = tar.subarray(off, off + 100).toString('utf8').replace(/\0.*$/, '');
    if (!name) break;
    const sizeStr = tar.subarray(off + 124, off + 136).toString('utf8').replace(/\0.*$/, '').trim();
    const size = parseInt(sizeStr, 8) || 0;
    const type = String.fromCharCode(tar[off + 156] || 48);
    if (name.endsWith('.node') || /\.(exe|dll)$/i.test(name)) natives.push(name + '  ' + size);
    if (name === 'package/package.json') { pkgJson = JSON.parse(tar.subarray(off + 512, off + 512 + size).toString('utf8')); }
    off += 512 + Math.ceil(size / 512) * 512;
  }
  if (natives.length) out.push({ f, natives, deps: pkgJson && { name: pkgJson.name, optionalDependencies: pkgJson.optionalDependencies, dependencies: pkgJson.dependencies } });
}
console.log(JSON.stringify(out, null, 1));
