// inspect interop packages: names, versions, optionalDependencies, loader hints
const fs = require('fs');
const path = require('path');
const root = 'D:/aiwork/DSHarm/work/asar/dsh/node_modules';
const pkgs = ['koffi', 'sharp', 'node-pty', 'sherpa-onnx-node', 'node-addon-require-builtin',
  '@vscode/ripgrep', '@openai/codex', '@anthropic-ai/claude-agent-sdk', '@deepseek-ai/libreoffice-kit',
  '@img/sharp-win32-x64', '@koromix/koffi-win32-x64', 'sherpa-onnx-win-x64', 'node-addon-require-builtin-win32-x64-msvc'];
for (const p of pkgs) {
  const dir = path.join(root, p);
  const pj = path.join(dir, 'package.json');
  if (!fs.existsSync(pj)) { console.log(`\n### ${p}: MISSING`); continue; }
  const j = JSON.parse(fs.readFileSync(pj, 'utf8'));
  console.log(`\n### ${p} @ ${j.version}`);
  if (j.os || j.cpu) console.log('  os/cpu:', JSON.stringify(j.os), JSON.stringify(j.cpu));
  if (j.main) console.log('  main:', j.main);
  if (j.dependencies) console.log('  deps:', Object.keys(j.dependencies).join(', '));
  if (j.optionalDependencies) console.log('  optional:', JSON.stringify(j.optionalDependencies));
  if (j.bin) console.log('  bin:', JSON.stringify(j.bin));
  if (j.files) console.log('  files:', JSON.stringify(j.files).slice(0, 400));
  for (const f of fs.readdirSync(dir)) {
    if (/^(index|loader|install|build)\.(js|cjs|mjs)$/.test(f)) console.log('  entry-file:', f);
  }
}
