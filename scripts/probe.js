// network probes for arm64 artifacts
const out = [];
const log = (...a) => { out.push(a.join(' ')); console.log(...a); };

async function head(u) {
  try { const r = await fetch(u, { method: 'HEAD', headers: { 'user-agent': 'probe' } }); return r.status + ' ' + (r.headers.get('content-length') || '?'); }
  catch (e) { return 'ERR ' + e.message; }
}
async function npmPkg(name, version) {
  const url = 'https://registry.npmjs.org/' + name.replace('/', '%2f') + (version ? '/' + version : '');
  try { const r = await fetch(url); if (r.status !== 200) return `NO(${r.status})`; const j = await r.json(); return 'YES ' + (j.version || '') + ' tarball=' + (j.dist ? j.dist.tarball : '?'); }
  catch (e) { return 'ERR ' + e.message; }
}

(async () => {
  log('== python.org versions ==');
  try {
    const r = await fetch('https://www.python.org/ftp/python/');
    const t = await r.text();
    const vers = [...new Set([...t.matchAll(/href="(3\.1[0-9]\.[0-9]+)\/"/g)].map(m => m[1]))].sort();
    log('dirs:', vers.join(' '));
    for (const v of vers.slice(-14)) {
      const rr = await fetch('https://www.python.org/ftp/python/' + v + '/');
      const tt = await rr.text();
      const hasArm = /python-[0-9.]+-arm64\.exe/.test(tt);
      const hasEmb = /embed-arm64\.zip/.test(tt);
      log(`  ${v} arm64-installer=${hasArm} embed-arm64=${hasEmb}`);
    }
  } catch (e) { log('python.org ERR ' + e.message); }

  log('\n== npm arm64 packages ==');
  for (const [n, v] of [
    ['@img/sharp-win32-arm64', '0.35.5'],
    ['@koromix/koffi-win32-arm64', null],
    ['node-addon-require-builtin-win32-arm64-msvc', '0.1.9'],
    ['@vscode/ripgrep-win32-arm64', '1.18.0'],
    ['@anthropic-ai/claude-agent-sdk-win32-arm64', '0.3.263'],
    ['@deepseek-ai/libreoffice-kit-win32-arm64', null],
    ['sherpa-onnx-win-arm64', null],
    ['node-pty', '1.2.0-beta.15'],
    ['@openai/codex', '0.153.4-win32-arm64'],
    ['@openai/codex-win32-arm64', '0.153.4'],
  ]) log(`${n}@${v || 'latest'}: ${await npmPkg(n, v)}`);

  log('\n== direct downloads ==');
  for (const u of [
    'https://nodejs.org/dist/v24.21.0/win-arm64/node.exe',
    'https://www.python.org/ftp/python/3.12.14/python-3.12.14-embed-arm64.zip',
  ]) log(u, await head(u));

  require('fs').writeFileSync('D:/aiwork/DSHarm/work/probe.txt', out.join('\n'));
})();
