# bench-arm64.ps1 — measure how this ARM64 device actually performs for DSH-style work.
# Usage:
#   pwsh -File .\bench-arm64.ps1 -AppDir "D:\DSH-arm64"
# Every number is produced by the SAME arm64 binaries the app ships, so it is the
# performance you will feel inside DSH, not a synthetic x86-emulated benchmark.

param(
  [string]$AppDir = 'D:\DSH-arm64',
  [string]$Out    = "$PSScriptRoot\bench-result.txt"
)

$ErrorActionPreference = 'Continue'
$rt   = Join-Path $AppDir 'resources\runtime\primary-runtime\dependencies'
$node = Join-Path $rt 'node\bin\node.exe'
$py   = Join-Path $rt 'python\python.exe'
$rg   = Join-Path $AppDir 'resources\app.asar.unpacked\dsh\node_modules\@vscode\ripgrep-win32-arm64\bin\rg.exe'
$tmp  = Join-Path $env:TEMP ('dsh-bench-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

$rows = @()
function Row($name, $value, $note = '') {
  $script:rows += [pscustomobject]@{ 项目 = $name; 结果 = $value; 备注 = $note }
  Write-Host ("{0,-34} {1,>12}  {2}" -f $name, $value, $note)
}

function TimeIt([scriptblock]$block) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  try { & $block | Out-Null } catch { Write-Host "  (failed: $($_.Exception.Message))" }
  $sw.Stop()
  return [math]::Round($sw.Elapsed.TotalMilliseconds)
}

Write-Host "== host =="
"CPU: " + (Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }) | Write-Host
Row 'CPU 逻辑核数' ([Environment]::ProcessorCount)
$memGB = [math]::Round((Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue).TotalPhysicalMemory / 1GB, 1)
Row '物理内存' "$memGB GiB"
Row '系统架构' ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture)
Write-Host ''

# ---- 1. CPU: single-thread integer/float loop ----
$jsCpu = @'
const t = process.hrtime.bigint();
let x = 0;
for (let i = 0; i < 8e7; i++) { x = (x * 1103515245 + 12345) % 2147483647; }
const ms = Number(process.hrtime.bigint() - t) / 1e6;
console.log(ms.toFixed(0) + ' ' + x);
'@
$sw = [Diagnostics.Stopwatch]::StartNew()
$cpuOut = & $node -e $jsCpu
$sw.Stop()
Row '单核整数循环 8e7 次' ((0 + ($cpuOut -split ' ')[0])) 'ms（越小越好，参考：x64 i7-12700K ≈ 220ms）'

# ---- 2. memory bandwidth (buffer XOR pass) ----
$jsMem = @'
const N = 256 * 1024 * 1024;
const b = Buffer.allocUnsafe(N);
for (let i = 0; i < N; i += 4096) b[i] = i & 255;
const t = process.hrtime.bigint();
let s = 0;
const u = new Uint32Array(b.buffer, b.byteOffset, N / 4);
for (let i = 0; i < u.length; i++) s = (s + u[i]) | 0;
const ms = Number(process.hrtime.bigint() - t) / 1e6;
console.log(ms.toFixed(1) + ' ' + (N / 1048576 / (ms / 1000)).toFixed(0));
'@
$memOut = ($node -e $jsMem) -split ' '
Row '内存扫描 256 MiB' ($memOut[1] + ' MiB/s') ('耗时 ' + $memOut[0] + ' ms')

# ---- 3. disk ----
$jsDisk = @'
const fs = require('fs');
const p = process.argv[1];
const b = Buffer.allocUnsafe(64 * 1024 * 1024);
for (let i = 0; i < b.length; i += 4096) b[i] = i & 255;
let t = process.hrtime.bigint();
const fd = fs.openSync(p, 'w');
for (let i = 0; i < 8; i++) fs.writeSync(fd, b);
fs.fsyncSync(fd); fs.closeSync(fd);
const wms = Number(process.hrtime.bigint() - t) / 1e6;
t = process.hrtime.bigint();
const fd2 = fs.openSync(p, 'r');
const buf = Buffer.allocUnsafe(64 * 1024 * 1024);
let read = 0;
while (true) { const n = fs.readSync(fd2, buf, 0, buf.length, null); if (!n) break; read += n; }
fs.closeSync(fd2);
const rms = Number(process.hrtime.bigint() - t) / 1e6;
console.log((512 / (wms / 1000)).toFixed(0), (512 / (rms / 1000)).toFixed(0));
'@
$diskOut = ($node -e $jsDisk (Join-Path $tmp 'io.bin')) -split ' '
Row '顺序写 512 MiB' ($diskOut[0] + ' MiB/s')
Row '顺序读 512 MiB' ($diskOut[1] + ' MiB/s')

# ---- 4. python import + pandas ----
if (Test-Path $py) {
  $t = TimeIt { & $py -c "import numpy,pandas,lxml,PIL,openpyxl,docx,pptx" }
  Row 'Python 导入 7 个库' "$t ms" 'DSH 每个 Office 任务的首包开销'
  $csv = Join-Path $tmp 'data.csv'
  $gen = @'
import csv, random, sys
with open(sys.argv[1], 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['id', 'grp', 'value', 'label'])
    for i in range(200000):
        w.writerow([i, 'g' + str(i % 50), random.random() * 1000, 'L' + str(i % 7)])
'@
  $genFile = Join-Path $tmp 'gen.py'
  Set-Content -Path $genFile -Value $gen -Encoding utf8
  & $py $genFile $csv
  $ana = @'
import pandas as pd, sys
df = pd.read_csv(sys.argv[1])
r = df.groupby('grp')['value'].agg(['mean', 'sum', 'count'])
r.to_csv(sys.argv[1] + '.out.csv')
print(len(df))
'@
  $anaFile = Join-Path $tmp 'ana.py'
  Set-Content -Path $anaFile -Value $ana -Encoding utf8
  $t = TimeIt { & $py $anaFile $csv }
  Row 'pandas 读 20 万行 + groupby' "$t ms" '含进程启动'
}

# ---- 5. ripgrep over the app tree ----
if (Test-Path $rg) {
  $t = TimeIt { & $rg -c --no-messages 'electron' (Join-Path $AppDir 'resources') }
  Row 'ripgrep 搜索 resources/' "$t ms" 'DSH 的 grep/glob 工具走的就是它'
}

# ---- 6. node startup ----
$t = TimeIt { & $node -e "0" }
Row 'node 冷启动' "$t ms" 'DSH 起子进程/命令的开销'

# ---- 7. Electron cold start (process alive after N ms) ----
$exe = Join-Path $AppDir 'DeepSeek Harness.exe'
if (Test-Path -LiteralPath $exe) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $proc = Start-Process -FilePath $exe -PassThru
  while (-not $proc.HasExited -and $sw.Elapsed.TotalSeconds -lt 40) {
    Start-Sleep -Milliseconds 200
    if ((Get-Process -Id $proc.Id -ErrorAction SilentlyContinue).WorkingSet64 -gt 250MB) { break }
  }
  $sw.Stop()
  Row 'DSH 启动到主进程就绪' ([math]::Round($sw.Elapsed.TotalSeconds, 1).ToString() + ' s') '首次启动含首屏加载'
  Start-Sleep -Seconds 3
  $cpu = [math]::Round((Get-Process -Id $proc.Id -ErrorAction SilentlyContinue).CPU, 1)
  Row '空载 3 秒 CPU 累计' ("$cpu s") '看空闲占用'
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}

Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
$rows | Format-Table -AutoSize | Out-String -Width 200 | Tee-Object -FilePath $Out
Write-Host "`n结果已写入 $Out"
