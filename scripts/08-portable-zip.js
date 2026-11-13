// 08-portable-zip.js — build a broadly compatible portable zip with a short root folder
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SRC = 'D:\\aiwork\\DSHarm\\work\\app-arm64';
const STAGE = 'D:\\aiwork\\DSHarm\\work\\pkg2';
const NAME = 'DSH-arm64';                       // short root folder => shorter extracted paths
const OUT = 'D:\\aiwork\\DSHarm\\out\\DSH-0.2.1-fix11-win-arm64-portable-short-root.zip';

const dst = path.join(STAGE, NAME);
fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
console.log('copying app tree ->', dst);
fs.cpSync(SRC, dst, { recursive: true });
let n = 0, bytes = 0;
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { n++; bytes += fs.statSync(p).size; } } })(dst);
console.log(`staged ${n} files, ${(bytes / 1073741824).toFixed(2)} GiB`);

console.log('compressing with .NET ZipFile (standard deflate, no data descriptors) ...');
const ps = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$src = '${dst}'
$out = '${OUT}'
if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory($src, $out, [System.IO.Compression.CompressionLevel]::Optimal, $true)
Write-Output ('zip bytes: ' + (Get-Item -LiteralPath $out).Length)
`;
fs.writeFileSync('D:\\aiwork\\DSHarm\\work\\zip2.ps1', ps);
execFileSync('pwsh', ['-NoProfile', '-File', 'D:\\aiwork\\DSHarm\\work\\zip2.ps1'], { stdio: 'inherit' });

// longest entry
const { execSync } = require('child_process');
const list = execFileSync('tar.exe', ['-tf', OUT], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split(/\r?\n/).filter(Boolean);
let max = '';
for (const l of list) if (l.length > max.length) max = l;
console.log('entries:', list.length, 'longest entry:', max.length, 'chars');
console.log(' ', max);
console.log('zip:', OUT, (fs.statSync(OUT).size / 1048576).toFixed(1), 'MiB');
