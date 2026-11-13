const log = (...a) => console.log(...a);
(async () => {
  const r = await fetch('https://www.python.org/ftp/python/3.12.14/');
  const t = await r.text();
  log('3.12.14 page bytes', t.length);
  log(t.replace(/\s+/g, ' ').slice(0, 1200));

  log('\n== python-build-standalone (windows arm64) ==');
  try {
    const api = await fetch('https://api.github.com/repos/astral-sh/python-build-standalone/releases?per_page=3', { headers: { 'user-agent': 'p' } });
    log('api status', api.status);
    if (api.status === 200) {
      const rel = await api.json();
      for (const rel1 of rel) {
        const arm = rel1.assets.filter(a => /aarch64-pc-windows-msvc.*install_only\.tar\.gz$/.test(a.name));
        log('release', rel1.tag_name, 'arm64 win assets:', arm.length);
        for (const a of arm.slice(0, 12)) log('   ', a.name, (a.size / 1048576).toFixed(0) + 'MiB');
      }
    }
  } catch (e) { log('ERR', e.message); }
})();
