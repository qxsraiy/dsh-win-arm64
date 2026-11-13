const fs = require('fs');
const U = 'C:/Users/87059/AppData/Local/Programs/DeepSeek Harness/resources/app.asar.unpacked/dsh/node_modules';
const paths = [
  ['top koffi', U + '/koffi'],
  ['top @koromix', U + '/@koromix/koffi-win32-x64'],
  ['nested koffi', U + '/@deepseek-ai/dsh-desktop-host/node_modules/koffi'],
  ['nested @koromix', U + '/@deepseek-ai/dsh-desktop-host/node_modules/@koromix/koffi-win32-x64'],
  ['top sherpa', U + '/sherpa-onnx-win-x64'],
  ['sharp', U + '/@img/sharp-win32-x64'],
];
for (const [n, p] of paths) {
  const f = p + '/package.json';
  if (!fs.existsSync(f)) { console.log(n.padEnd(18), 'MISSING'); continue; }
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  console.log(n.padEnd(18), j.name, j.version);
}
