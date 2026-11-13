# check-on-arm64.ps1 — run this ON the Windows-on-ARM64 machine to smoke-test the build.
# Usage:  pwsh -File check-on-arm64.ps1 -AppDir "C:\Users\<you>\Desktop\DSH-0.2.1-fix11-win-arm64"

param(
  [string]$AppDir = "$PSScriptRoot\DSH-0.2.1-fix11-win-arm64"
)

function MachineOf([string]$path) {
  $fs = [IO.File]::OpenRead($path)
  try {
    $head = New-Object byte[] 64
    $fs.Read($head, 0, 64) | Out-Null
    if ($head[0] -ne 0x4D -or $head[1] -ne 0x5A) { return 'not-PE' }
    $lfanew = [BitConverter]::ToInt32($head, 0x3C)
    $fs.Position = $lfanew
    $pe = New-Object byte[] 8
    $fs.Read($pe, 0, 8) | Out-Null
    switch ([BitConverter]::ToUInt16($pe, 4)) {
      0xAA64 { 'arm64' }
      0x8664 { 'x64' }
      0x014C { 'x86' }
      default { '0x' + ([BitConverter]::ToUInt16($pe, 4)).ToString('x') }
    }
  } finally { $fs.Close() }
}

Write-Host "== host =="
Write-Host ("PROCESSOR_ARCHITECTURE = {0}" -f $env:PROCESSOR_ARCHITECTURE)
Write-Host ("OSArchitecture         = {0}" -f ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture))
Write-Host ("pwsh process arch      = {0}" -f [System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture)
if ($env:PROCESSOR_ARCHITECTURE -ne 'ARM64') {
  Write-Warning 'This machine does not look like an ARM64 host; the arm64 build cannot start here.'
}

Write-Host "`n== payload architecture =="
foreach ($rel in @(
    'DeepSeek Harness.exe',
    'resources\runtime\primary-runtime\dependencies\node\bin\node.exe',
    'resources\runtime\primary-runtime\dependencies\python\python.exe',
    'resources\app.asar.unpacked\dsh\node_modules\@img\sharp-win32-arm64\lib\sharp-win32-arm64-0.35.5.node',
    'resources\app.asar.unpacked\dsh\node_modules\node-pty\prebuilds\win32-arm64\conpty.node',
    'resources\app.asar.unpacked\dsh\node_modules\@koromix\koffi-win32-arm64\win32_arm64\koffi.node'
  )) {
  $full = Join-Path $AppDir $rel
  if (Test-Path -LiteralPath $full) {
    Write-Host ("{0,-12} {1}" -f (MachineOf $full), $rel)
  } else {
    Write-Host ("{0,-12} {1}" -f 'MISSING', $rel)
  }
}

Write-Host "`n== bundled interpreters =="
$node = Join-Path $AppDir 'resources\runtime\primary-runtime\dependencies\node\bin\node.exe'
$py = Join-Path $AppDir 'resources\runtime\primary-runtime\dependencies\python\python.exe'
if (Test-Path $node) { & $node -p "process.version + ' ' + process.arch" }
if (Test-Path $py) {
  & $py -c "import sys, platform; print(sys.version.split()[0], platform.machine()); import numpy, pandas, lxml, PIL, openpyxl, docx, pptx; print('libs ok:', numpy.__version__, pandas.__version__, lxml.__version__)"
}

Write-Host "`n== launch =="
$exe = Join-Path $AppDir 'DeepSeek Harness.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw "missing $exe" }
$proc = Start-Process -FilePath $exe -PassThru
Start-Sleep -Seconds 25
$alive = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
if ($alive) {
  Write-Host ("running: pid={0} path={1}" -f $alive.Id, $alive.Path)
  Write-Host 'Look at the window: if the Harness UI (or its login/update dialog) is up, the port is good.'
  Write-Host 'Leave it running; close it manually when done.'
} else {
  Write-Warning ("process exited early (exit code {0}) - collect %APPDATA%\DeepSeek Harness\logs if present" -f $proc.ExitCode)
}
