(async () => {
  for (const v of ['3.12.14', '3.12.16']) {
    const r = await fetch('https://www.python.org/ftp/python/' + v + '/');
    const t = await r.text();
    const files = [...t.matchAll(/href="([^"?]+)"/g)].map(m => m[1]).filter(f => /\.(exe|zip|msi)$/.test(f));
    console.log('==', v);
    for (const f of files) if (/arm64|arm32|embed|amd64|win32/.test(f)) console.log('  ', f);
    if (!files.length) console.log('   (no bin artifacts listed)', t.length);
  }
})();
