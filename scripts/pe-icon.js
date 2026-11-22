// pe-icon.js <exe> <out.ico> — rebuild the full multi-size icon from a PE's RT_GROUP_ICON/RT_ICON resources
const fs = require('fs');

function parsePe(buf) {
  if (buf.readUInt16LE(0) !== 0x5a4d) throw new Error('not MZ');
  const peOff = buf.readUInt32LE(0x3c);
  if (buf.readUInt32LE(peOff) !== 0x00004550) throw new Error('not PE');
  const numSections = buf.readUInt16LE(peOff + 6);
  const optSize = buf.readUInt16LE(peOff + 20);
  const optOff = peOff + 24;
  const magic = buf.readUInt16LE(optOff);
  const is64 = magic === 0x20b;
  const ddOff = optOff + (is64 ? 112 : 96);
  const rsrcRva = buf.readUInt32LE(ddOff + 2 * 8);
  const rsrcSize = buf.readUInt32LE(ddOff + 2 * 8 + 4);
  const secOff = optOff + optSize;
  const sections = [];
  for (let i = 0; i < numSections; i++) {
    const s = secOff + i * 40;
    sections.push({
      name: buf.subarray(s, s + 8).toString('latin1').replace(/\0.*$/, ''),
      vSize: buf.readUInt32LE(s + 8),
      vAddr: buf.readUInt32LE(s + 12),
      rawSize: buf.readUInt32LE(s + 16),
      rawPtr: buf.readUInt32LE(s + 20),
    });
  }
  const rvaToOff = (rva) => {
    for (const sec of sections) {
      const size = Math.max(sec.vSize, sec.rawSize);
      if (rva >= sec.vAddr && rva < sec.vAddr + size) return rva - sec.vAddr + sec.rawPtr;
    }
    throw new Error('rva not mapped: 0x' + rva.toString(16));
  };
  return { rvaToOff, rsrcRva, rsrcSize, sections };
}

function readDirEntries(buf, dirOff) {
  const named = buf.readUInt16LE(dirOff + 12);
  const ids = buf.readUInt16LE(dirOff + 14);
  const total = named + ids;
  const out = [];
  for (let i = 0; i < total; i++) {
    const e = dirOff + 16 + i * 8;
    const nameOrId = buf.readUInt32LE(e);
    const dataOrDir = buf.readUInt32LE(e + 4);
    out.push({ id: nameOrId & 0x7fffffff, named: !!(nameOrId & 0x80000000), isDir: !!(dataOrDir & 0x80000000), offset: dataOrDir & 0x7fffffff });
  }
  return out;
}

// descend "name -> language -> leaf" until a data entry is reached
function resolveLeaf(buf, root, entry) {
  let cur = entry;
  for (let depth = 0; depth < 3 && cur.isDir; depth++) {
    const kids = readDirEntries(buf, root + cur.offset);
    if (!kids.length) throw new Error('empty resource subdirectory');
    cur = kids.find(k => !k.isDir) || kids[0];
  }
  if (cur.isDir) throw new Error('resource tree too deep');
  return cur;
}


function main() {
  const [exe, out] = process.argv.slice(2);
  const buf = fs.readFileSync(exe);
  const pe = parsePe(buf);
  const rsrcOff = pe.rvaToOff(pe.rsrcRva);
  const root = rsrcOff;

  const types = readDirEntries(buf, root);
  const groupType = types.find(t => t.id === 14 && !t.named); // RT_GROUP_ICON
  const iconType = types.find(t => t.id === 3 && !t.named);   // RT_ICON
  if (!groupType || !iconType) throw new Error('no icon resources');
  if (!groupType.isDir || !iconType.isDir) throw new Error('unexpected resource layout');

  const groups = readDirEntries(buf, root + groupType.offset);
  groups.sort((a, b) => a.id - b.id);
  const icons = readDirEntries(buf, root + iconType.offset);
  const iconData = new Map();
  for (const ic of icons) {
    const leaf = resolveLeaf(buf, root, ic);
    const de = root + leaf.offset;
    const dataRva = buf.readUInt32LE(de);
    const size = buf.readUInt32LE(de + 4);
    const off = pe.rvaToOff(dataRva);
    iconData.set(ic.id, buf.subarray(off, off + size));
  }

  // pick the group with the most entries (usually the app icon)
  let bestGroup = null, bestCount = -1;
  for (const g of groups) {
    const leaf = resolveLeaf(buf, root, g);
    const de = root + leaf.offset;
    const dataRva = buf.readUInt32LE(de);
    const size = buf.readUInt32LE(de + 4);
    const off = pe.rvaToOff(dataRva);
    const grp = buf.subarray(off, off + size);
    const count = grp.readUInt16LE(4);
    if (count > bestCount) { bestCount = count; bestGroup = { grp, count, id: g.id }; }
  }
  if (!bestGroup) throw new Error('no group icon');

  const entries = [];
  for (let i = 0; i < bestGroup.count; i++) {
    const e = 6 + i * 14;
    entries.push({
      width: bestGroup.grp[e],
      height: bestGroup.grp[e + 1],
      colorCount: bestGroup.grp[e + 2],
      reserved: bestGroup.grp[e + 3],
      planes: bestGroup.grp.readUInt16LE(e + 4),
      bitCount: bestGroup.grp.readUInt16LE(e + 6),
      bytesInRes: bestGroup.grp.readUInt32LE(e + 8),
      id: bestGroup.grp.readUInt16LE(e + 12),
    });
  }

  const parts = entries.map(en => {
    const data = iconData.get(en.id);
    if (!data) throw new Error('missing icon image id ' + en.id);
    return { ...en, data };
  });

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(parts.length, 4);
  const dir = Buffer.alloc(16 * parts.length);
  let offset = 6 + 16 * parts.length;
  parts.forEach((p, i) => {
    const o = i * 16;
    dir.writeUInt8(p.width, o);
    dir.writeUInt8(p.height, o + 1);
    dir.writeUInt8(p.colorCount, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(p.planes || 1, o + 4);
    dir.writeUInt16LE(p.bitCount, o + 6);
    dir.writeUInt32LE(p.data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += p.data.length;
  });
  fs.writeFileSync(out, Buffer.concat([header, dir, ...parts.map(p => p.data)]));
  console.log(`icon group ${bestGroup.id}: ${parts.length} images ->`, out);
  for (const p of parts) console.log(`   ${p.width || 256}x${p.height || 256} ${p.bitCount}bpp ${p.data.length}B`);
}

main();
