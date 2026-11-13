// Fetch every arm64 artifact needed for the win32-arm64 build.
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const OUT = 'D:/aiwork/DSHarm/work/dl';
fs.mkdirSync(OUT, { recursive: true });

const get = (url, headers = {}) => new Promise((resolve, reject) => {
  const u = new URL(url);
  const mod = u.protocol === 'https:' ? https : http;
  const req = mod.get(u, { headers: { 'user-agent': 'dsh-arm64-build/1.0', ...headers } }, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.resume();
      return resolve(get(new URL(res.headers.location, url).toString(), headers));
    }
    if (res.statusCode !== 200) { res.resume(); reject(new Error('HTTP ' + res.statusCode + ' ' + url)); return; }
    const chunks = [];
    res.on('data', c => chunks.push(c));
    res.on('end', () => resolve(Buffer.concat(chunks)));
    res.on('error', reject);
  });
  req.on('error', reject);
  req.setTimeout(180000, () => req.destroy(new Error('timeout ' + url)));
});

function write(name, buf) {
  const p = path.join(OUT, name);
  fs.writeFileSync(p, buf);
  console.log('  saved', name, (buf.length / 1048576).toFixed(1) + 'MiB');
}

async function npmTarball(pkg, version) {
  const meta = await get('https://registry.npmjs.org/' + pkg.replace('/', '%2F') + (version ? '/' + version : ''));
  const j = JSON.parse(meta.toString('utf8'));
  const v = version || (j['dist-tags'] && j['dist-tags'].latest);
  const info = j.versions ? j.versions[v] : j;
  const url = info.dist.tarball;
  const file = path.basename(new URL(url).pathname);
  console.log('npm', pkg + '@' + v, '->', file);
  write(file, await get(url));
}

async function wheel(pkg, version, match) {
  const meta = JSON.parse((await get(`https://pypi.org/pypi/${pkg}/${version}/json`)).toString('utf8'));
  const cands = meta.urls.filter(u => u.packagetype === 'bdist_wheel' && match(u.filename));
  if (!cands.length) { console.log('  !! no matching wheel', pkg, version); return; }
  const w = cands[0];
  console.log('wheel', w.filename);
  write(w.filename, await get(w.url));
}

const tasks = [];
tasks.push(['electron-arm64', async () => write('electron-v44.0.0-win32-arm64.zip', await get('https://npmmirror.com/mirrors/electron/44.0.0/electron-v44.0.0-win32-arm64.zip'))]);
tasks.push(['node-arm64', async () => {
  write('node-arm64.exe', await get('https://nodejs.org/dist/v24.21.0/win-arm64/node.exe'));
  write('node-LICENSE', await get('https://nodejs.org/dist/v24.21.0/LICENSE'));
}]);
tasks.push(['alpha', async () => write('cpython-3.12.16-arm64.tar.gz', await get('https://github.com/astral-sh/python-build-standalone/releases/download/20261110/cpython-3.12.16%2B20261110-aarch64-pc-windows-msvc-install_only.tar.gz'))]);
tasks.push(['rcedit', async () => write('rcedit-x64.exe', await get('https://github.com/electron/rcedit/releases/download/v2.0.0/rcedit-x64.exe'))]);

const npms = [
  ['@koromix/koffi-win32-arm64', '3.1.1'],
  ['@img/sharp-win32-arm64', '0.35.5'],
  ['node-addon-require-builtin-win32-arm64-msvc', '0.1.9'],
  ['@vscode/ripgrep-win32-arm64', '1.18.0'],
  ['@anthropic-ai/claude-agent-sdk-win32-arm64', '0.3.263'],
  ['@openai/codex', '0.153.4-win32-arm64'],
  ['@deepseek-ai/libreoffice-kit-win32-arm64', '0.1.5'],
  ['sherpa-onnx-win-arm64', '1.13.8'],
];
for (const [p, v] of npms) tasks.push([p, () => npmTarball(p, v)]);

const wheels = [
  ['numpy', '2.3.5', f => f.includes('cp312') && f.includes('win_arm64')],
  ['pandas', '3.0.1', f => f.includes('cp312') && f.includes('win_arm64')],
  ['lxml', '6.1.3', f => f.includes('cp312') && f.includes('win_arm64')],
  ['pillow', '12.3.0', f => f.includes('cp312') && f.includes('win_arm64')],
  ['openpyxl', '3.1.5', f => f.includes('none-any')],
  ['xlsxwriter', '3.2.9', f => f.includes('none-any')],
  ['python-docx', '1.2.0', f => f.includes('none-any')],
  ['python-pptx', '1.0.2', f => f.includes('none-any')],
  ['python-dateutil', '2.9.0.post0', f => f.includes('none-any')],
  ['six', '1.17.0', f => f.includes('none-any')],
  ['tzdata', '2025.2', f => f.includes('none-any')],
  ['typing_extensions', '4.16.0', f => f.includes('none-any')],
  ['et_xmlfile', '2.0.0', f => f.includes('none-any')],
];
for (const [p, v, m] of wheels) tasks.push([p, () => wheel(p, v, m)]);

(async () => {
  const started = Date.now();
  const CONC = 4;
  let i = 0;
  const results = [];
  const worker = async () => {
    while (i < tasks.length) {
      const [label, fn] = tasks[i++];
      for (let attempt = 1; attempt <= 3; attempt++) {
        try { await fn(); results.push([label, 'ok']); break; }
        catch (e) { if (attempt === 3) { console.log('FAIL', label, e.message); results.push([label, 'FAIL ' + e.message]); } else await new Promise(r => setTimeout(r, 1500)); }
      }
    }
  };
  await Promise.all(Array.from({ length: CONC }, worker));
  console.log('done in', ((Date.now() - started) / 1000).toFixed(0), 's');
  const bad = results.filter(r => r[1] !== 'ok');
  console.log(bad.length ? 'FAILURES:\n' + bad.map(b => '  ' + b.join(': ')).join('\n') : 'ALL OK');
  fs.writeFileSync(path.join(OUT, '_manifest.json'), JSON.stringify(results, null, 1));
})();
