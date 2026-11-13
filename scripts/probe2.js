const log = (...a) => console.log(...a);
(async () => {
  for (const v of ['3.12.14', '3.12.16', '3.13.18', '3.14.10']) {
    const r = await fetch('https://www.python.org/ftp/python/' + v + '/');
    const t = await r.text();
    const files = [...new Set([...t.matchAll(/href="([^"]*?(?:arm64|embed)[^"]*?)"/g)].map(m => m[1]))];
    log(v, r.status, files.join(' '));
  }
  log('\n== registry detail ==');
  for (const n of ['@koromix/koffi-win32-arm64', 'sherpa-onnx-win-arm64', '@deepseek-ai/libreoffice-kit-win32-arm64']) {
    const url = 'https://registry.npmjs.org/' + n.replace('/', '%2F');
    const r = await fetch(url);
    log(n, 'status', r.status);
    if (r.status === 200) {
      const j = await r.json();
      const vs = Object.keys(j.versions || {});
      log('   versions:', vs.slice(-6).join(', '), ' latest:', j['dist-tags'] && j['dist-tags'].latest);
      const latest = j['dist-tags'] && j['dist-tags'].latest;
      if (latest && j.versions[latest]) log('   latest tarball:', j.versions[latest].dist.tarball);
    }
  }
  log('\n== local state of x64 platform pkgs ==');
  const fs = require('fs');
  const paths = [
    'D:/aiwork/DSHarm/work/asar/dsh/node_modules/@koromix',
    'D:/aiwork/DSHarm/work/asar/dsh/node_modules/@deepseek-ai',
    'D:/aiwork/DSHarm/work/asar/dsh/node_modules/@openai',
    'D:/aiwork/DSHarm/work/asar/dsh/node_modules/@anthropic-ai',
    'D:/aiwork/DSHarm/work/asar/dsh/node_modules/@vscode',
    'D:/aiwork/DSHarm/work/asar/dsh/node_modules/@img',
  ];
  for (const p of paths) {
    if (!fs.existsSync(p)) { log('MISSING DIR', p); continue; }
    log(p.replace('D:/aiwork/DSHarm/work/asar/dsh/node_modules/', ''), '->', fs.readdirSync(p).filter(n => /win32|koffi|libreoffice|codex|claude/.test(n)).join(', '));
  }
  log('\n== koffi / libreoffice search ==');
  const walk = (dir, depth) => {
    if (depth > 4) return;
    let ents = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (!e.isDirectory()) continue;
      if (/^(koffi|@koromix|libreoffice-kit)/.test(e.name) || e.name === 'node_modules') {
        if (e.name === 'node_modules') { walk(dir + '/' + e.name, depth + 1); continue; }
        log('  found', (dir + '/' + e.name).replace('D:/aiwork/DSHarm/work/asar/', ''));
        try { log('     children:', fs.readdirSync(dir + '/' + e.name).slice(0, 12).join(', ')); } catch {}
      }
    }
  };
  walk('D:/aiwork/DSHarm/work/asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host', 0);
  walk('D:/aiwork/DSHarm/work/asar/dsh/node_modules/@deepseek-ai/dsh-skill-office', 0);
})();
