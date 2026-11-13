const fs = require('fs');
const path = require('path');
const bases = [
  'D:/aiwork/DSHarm/work/asar/dsh/node_modules',
  'D:/aiwork/DSHarm/work/asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/node_modules',
  'D:/aiwork/DSHarm/work/asar/dsh/node_modules/@deepseek-ai/dsh-skill-office/node_modules',
];
const want = ['koffi', '@koromix/koffi-win32-x64', '@coromix/koffi-win32-x64', '@deepseek-ai/libreoffice-kit', '@deepseek-ai/libreoffice-kit-win32-x64',
  'sherpa-onnx-node', 'sherpa-onnx-win-x64', 'node-pty', 'sharp', '@img/sharp-win32-x64', 'node-addon-require-builtin',
  'node-addon-require-builtin-win32-x64-msvc', '@vscode/ripgrep', '@vscode/ripgrep-win32-x64', '@openai/codex', '@openai/codex-win32-x64',
  '@anthropic-ai/claude-agent-sdk', '@anthropic-ai/claude-agent-sdk-win32-x64'];
for (const base of bases) {
  for (const w of want) {
    const pj = path.join(base, w, 'package.json');
    if (!fs.existsSync(pj)) continue;
    const j = JSON.parse(fs.readFileSync(pj, 'utf8'));
    console.log(base.split('node_modules').length > 2 ? '[nested]' : '[top]   ', w, '=>', j.version);
  }
}
