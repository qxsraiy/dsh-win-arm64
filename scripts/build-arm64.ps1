#!/usr/bin/env pwsh
# build-arm64.ps1 — rebuild the Windows-on-ARM64 DSH package from the x64 installer.
# Requires: Node.js 20+, network access to npm/nodejs.org/python.org mirrors.
# Sequence mirrors the numbered scripts in this folder.

$ErrorActionPreference = 'Stop'
$root = 'D:\aiwork\DSHarm'
Set-Location $root

Write-Host '--- 01 extract merged source tree (asar + asar.unpacked) ---'
node 01-tree.js

Write-Host '--- download arm64 artifacts ---'
node download-all.js

Write-Host '--- 02 swap x64 platform payload for arm64 ---'
node 02-transform.js

Write-Host '--- 02b compute asar-unpacked list ---'
node 02b-unpacked.js

Write-Host '--- 02c arm64 enablement patches + descriptor refresh ---'
node 02c-patch.js

Write-Host '--- 03 pack app.asar ---'
New-Item -ItemType Directory -Force -Path "$root\work\out" | Out-Null
node 03-asar.js "$root\work\tree" "$root\work\out\app.asar" "$root\work\out\app.asar.unpacked" "$root\work\unpacked-arm64.json" 4194304

Write-Host '--- 04 build arm64 runtime payload (node + python + wheels) ---'
node 04-runtime.js

Write-Host '--- 05 assemble app directory ---'
node 05-shell.js

Write-Host '--- 06 structural verification ---'
node 06-verify.js "$root\work\app-arm64"

Write-Host '--- 07 build NSIS installer ---'
node 07-installer.js

Write-Host 'done. See out\ for the installer and work\app-arm64 for the portable tree.'
