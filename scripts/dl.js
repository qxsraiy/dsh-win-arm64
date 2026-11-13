// download helper: node dl.js <url> <outfile>
const fs = require('fs');
const https = require('https');
const http = require('http');

async function download(url, out) {
  const tmp = out + '.part';
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  const file = fs.createWriteStream(tmp);
  const follow = (u, depth) => {
    if (depth > 10) throw new Error('too many redirects');
    const mod = u.startsWith('https') ? https : http;
    return new Promise((resolve, reject) => {
      const req = mod.get(u, { headers: { 'user-agent': 'dsh-arm64-build/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return follow(new URL(res.headers.location, u).toString(), depth + 1).then(resolve, reject);
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let got = 0, lastLog = Date.now();
        res.on('data', (c) => {
          got += c.length;
          if (Date.now() - lastLog > 5000) {
            lastLog = Date.now();
            const pct = total ? (got / total * 100).toFixed(1) + '%' : '';
            process.stdout.write(`  ${(got / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MiB ${pct}\n`);
          }
        });
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve({ bytes: got, status: res.statusCode })));
        res.on('error', reject);
        req.on('error', reject);
      });
      req.setTimeout(90000, () => req.destroy(new Error('timeout')));
      req.on('error', reject);
    });
  };
  const r = await follow(url, 0);
  fs.renameSync(tmp, out);
  return r;
}

(async () => {
  const [url, out] = process.argv.slice(2);
  if (!url || !out) { console.error('usage: node dl.js <url> <out>'); process.exit(2); }
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { const r = await download(url, out); console.log('OK', out, (r.bytes / 1048576).toFixed(1), 'MiB'); return; }
    catch (e) { lastErr = e; console.error('attempt', attempt, 'failed:', e.message); await new Promise(r => setTimeout(r, 2000)); }
  }
  console.error('FAIL', url, lastErr && lastErr.message);
  process.exit(1);
})();
