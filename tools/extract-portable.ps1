# extract-portable.ps1 — robust extraction of the DSH arm64 portable archive on Windows.
#
# Why this exists: the archive contains very deep paths (up to ~174 characters below its
# root folder, matching the original x64 install). Windows Explorer's built-in ZIP handler
# and some archivers fail on such paths with a generic error, while the data is fine.
#
# Usage:
#   pwsh -File .\extract-portable.ps1 -Zip .\DSH-0.2.1-fix11-win-arm64-portable.zip -Destination D:\DSH-arm64
# Options:
#   -VerifyOnly   only check the archive (list + per-entry CRC) without extracting
#
param(
  [Parameter(Mandatory = $false)][string]$Zip = '.\DSH-0.2.1-fix11-win-arm64-portable.zip',
  [Parameter(Mandatory = $false)][string]$Destination = 'D:\DSH-arm64',
  [Parameter(Mandatory = $false)][switch]$VerifyOnly
)

$ErrorActionPreference = 'Stop'
$Zip = (Resolve-Path -LiteralPath $Zip).Path
Write-Host "archive : $Zip"
Write-Host ("size    : {0:N1} MiB" -f ((Get-Item -LiteralPath $Zip).Length / 1MB))

# pick a tool that handles long paths
$sevenZip = @(
  'C:\Program Files\7-Zip\7z.exe',
  'C:\Program Files (x86)\7-Zip\7z.exe',
  'C:\Program Files\7-Zip-Zstandard\7z.exe'
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $sevenZip) {
  $cmd = Get-Command 7z.exe -ErrorAction SilentlyContinue
  if ($cmd) { $sevenZip = $cmd.Source }
}
$tar = (Get-Command tar.exe -ErrorAction SilentlyContinue).Source
if (-not $sevenZip -and -not $tar) { throw 'neither 7z.exe nor tar.exe is available' }
Write-Host ("tool    : {0}" -f $(if ($sevenZip) { "7-Zip ($sevenZip)" } else { "bsdtar ($tar)" }))

if ($VerifyOnly) {
  Write-Host '`n== archive test =='
  if ($sevenZip) { & $sevenZip t $Zip | Select-Object -Last 15 }
  else {
    $entries = & $tar -tf $Zip
    Write-Host ("entries: {0}" -f $entries.Count)
  }
  return
}

# extract
if (Test-Path -LiteralPath $Destination) {
  Write-Host "clearing existing $Destination"
  Remove-Item -LiteralPath $Destination -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
Write-Host "`n== extracting to $Destination =="
$destLen = $Destination.Length
$sw = [Diagnostics.Stopwatch]::StartNew()

if ($sevenZip) {
  & $sevenZip x $Zip "-o$Destination" -y -bso0 -bsp0
  if ($LASTEXITCODE -ne 0) { throw "7-Zip failed with exit code $LASTEXITCODE" }
} else {
  # bsdtar: extract into the destination, then flatten the single root folder if present
  & $tar -xf $Zip -C $Destination
  if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }
  $roots = Get-ChildItem -LiteralPath $Destination -Directory
  if ($roots.Count -eq 1 -and -not (Get-ChildItem -LiteralPath $Destination -File)) {
    # keep the layout as produced by the archive, only report it
    Write-Host ("single root folder: {0}" -f $roots[0].Name)
  }
}
$sw.Stop()
Write-Host ("extracted in {0:N0} s" -f $sw.Elapsed.TotalSeconds)

# verify
$files = Get-ChildItem -LiteralPath $Destination -Recurse -File -ErrorAction SilentlyContinue
Write-Host ("files   : {0}" -f $files.Count)
$totalMB = [math]::Round((($files | Measure-Object -Sum Length).Sum) / 1MB, 1)
Write-Host ("bytes   : {0:N1} MiB" -f $totalMB)

$longest = $files | Sort-Object { $_.FullName.Length } -Descending | Select-Object -First 3
Write-Host "`nlongest extracted paths:"
foreach ($f in $longest) { Write-Host ("  {0,4}  {1}" -f $f.FullName.Length, $f.FullName) }

# locate the launcher
$exe = Get-ChildItem -LiteralPath $Destination -Recurse -Filter 'DeepSeek Harness.exe' -File -ErrorAction SilentlyContinue | Select-Object -First 1
if ($exe) {
  Write-Host "`nlauncher: $($exe.FullName)"
  Write-Host 'run it directly, or copy this folder to the ARM64 machine and run it there.'
} else {
  Write-Warning 'launcher not found - extraction is incomplete.'
  exit 1
}
