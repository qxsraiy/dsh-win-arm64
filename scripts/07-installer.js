// 07-installer.js â€?generate and compile the NSIS installer for the arm64 app directory
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const APP = 'D:\\aiwork\\DSHarm\\work\\app-arm64';
const NSIS = 'D:\\aiwork\\DSHarm\\work\\nsis\\nsis-3.11\\makensis.exe';
const WORK = 'D:\\aiwork\\DSHarm\\work\\installer';
const OUTDIR = 'D:\\aiwork\\DSHarm\\out';
const NAME = 'DSH-0.2.1-fix11-win-arm64.exe';
const ICON = APP + '\\resources\\app-icon.ico';

fs.mkdirSync(WORK, { recursive: true });
fs.mkdirSync(OUTDIR, { recursive: true });

let total = 0, files = 0;
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    total += fs.statSync(p).size; files++;
  }
})(APP);
const estKb = Math.round(total / 1024);
console.log(`app payload: ${files} files, ${(total / 1073741824).toFixed(2)} GiB (${estKb} KiB)`);

const L = [
  'Unicode true',
  '!include "MUI2.nsh"',
  '',
  '!define APP_NAME "DeepSeek Harness"',
  '!define APP_VERSION "0.2.1-alpha.1"',
  '!define APP_PUBLISHER "DeepSeek Harness"',
  '!define APP_EXE "DeepSeek Harness.exe"',
  '!define UNINST_KEY "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\DeepSeekHarness"',
  '',
  'Name "${APP_NAME}"',
  'OutFile "' + OUTDIR + '\\' + NAME + '"',
  'InstallDir "$LOCALAPPDATA\\Programs\\DeepSeek Harness"',
  'InstallDirRegKey HKCU "Software\\DeepSeek Harness" "InstallLocation"',
  'RequestExecutionLevel user',
  'SetCompressor /SOLID lzma',
  'SetCompressorDictSize 64',
  'SetDatablockOptimize on',
  'CRCCheck on',
  'XPStyle on',
  '',
  'VIProductVersion "0.2.1.1"',
  'VIAddVersionKey "ProductName" "${APP_NAME}"',
  'VIAddVersionKey "FileDescription" "${APP_NAME} installer (Windows ARM64)"',
  'VIAddVersionKey "FileVersion" "${APP_VERSION}"',
  'VIAddVersionKey "ProductVersion" "${APP_VERSION}"',
  'VIAddVersionKey "LegalCopyright" "Copyright (c) 2026 DeepSeek Harness"',
  '',
  fs.existsSync(ICON) ? '!define MUI_ICON "' + ICON + '"' : '',
  fs.existsSync(ICON) ? '!define MUI_UNICON "' + ICON + '"' : '',
  '!define MUI_ABORTWARNING',
  '!define MUI_FINISHPAGE_RUN "$INSTDIR\\${APP_EXE}"',
  '!define MUI_FINISHPAGE_RUN_TEXT "Launch ${APP_NAME}"',
  '',
  '!insertmacro MUI_PAGE_WELCOME',
  '!insertmacro MUI_PAGE_DIRECTORY',
  '!insertmacro MUI_PAGE_INSTFILES',
  '!insertmacro MUI_PAGE_FINISH',
  '!insertmacro MUI_UNPAGE_CONFIRM',
  '!insertmacro MUI_UNPAGE_INSTFILES',
  '!insertmacro MUI_LANGUAGE "English"',
  '!insertmacro MUI_LANGUAGE "SimpChinese"',
  '',
  'Section "Install"',
  '  SetOutPath "$INSTDIR"',
  '  File /r "' + APP + '\\*.*"',
  '  WriteUninstaller "$INSTDIR\\Uninstall ${APP_NAME}.exe"',
  '  CreateDirectory "$SMPROGRAMS\\${APP_NAME}"',
  '  CreateShortcut "$SMPROGRAMS\\${APP_NAME}\\${APP_NAME}.lnk" "$INSTDIR\\${APP_EXE}"',
  '  CreateShortcut "$SMPROGRAMS\\${APP_NAME}\\Uninstall ${APP_NAME}.lnk" "$INSTDIR\\Uninstall ${APP_NAME}.exe"',
  '  CreateShortcut "$DESKTOP\\${APP_NAME}.lnk" "$INSTDIR\\${APP_EXE}"',
  '  WriteRegStr HKCU "Software\\DeepSeek Harness" "InstallLocation" "$INSTDIR"',
  '  WriteRegStr HKCU "Software\\DeepSeek Harness" "Version" "${APP_VERSION}"',
  '  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APP_NAME}"',
  '  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${APP_VERSION}"',
  '  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${APP_PUBLISHER}"',
  '  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\\${APP_EXE}"',
  '  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"',
  '  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" \'"$INSTDIR\\Uninstall ${APP_NAME}.exe"\'',
  '  WriteRegStr HKCU "${UNINST_KEY}" "QuietUninstallString" \'"$INSTDIR\\Uninstall ${APP_NAME}.exe" /S\'',
  '  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1',
  '  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1',
  '  WriteRegDWORD HKCU "${UNINST_KEY}" "EstimatedSize" ' + estKb,
  'SectionEnd',
  '',
  'Section "Uninstall"',
  '  Delete "$DESKTOP\\${APP_NAME}.lnk"',
  '  Delete "$SMPROGRAMS\\${APP_NAME}\\${APP_NAME}.lnk"',
  '  Delete "$SMPROGRAMS\\${APP_NAME}\\Uninstall ${APP_NAME}.lnk"',
  '  RMDir "$SMPROGRAMS\\${APP_NAME}"',
  '  DeleteRegKey HKCU "${UNINST_KEY}"',
  '  DeleteRegKey HKCU "Software\\DeepSeek Harness"',
  '  RMDir /r "$INSTDIR"',
  'SectionEnd',
  '',
];

const nsi = path.join(WORK, 'installer.nsi');
fs.writeFileSync(nsi, L.join('\r\n'));
console.log('wrote', nsi);
const { spawnSync } = require('child_process');
const run = spawnSync(NSIS, ['/V2', nsi], { stdio: 'inherit' });
const output = '(streamed to console)';
const interesting = output.split(/\r?\n/).filter(l => /error|warning|Total size|Output:|Compress/i.test(l));
console.log('makensis exit:', run.status, run.signal || '');
console.log(interesting.slice(-20).join('\n'));
if (run.status !== 0) {
  console.log('--- last lines ---');
  console.log(output.split(/\r?\n/).slice(-25).join('\n'));
}
const built = path.join(OUTDIR, NAME);
if (fs.existsSync(built)) console.log('installer:', built, (fs.statSync(built).size / 1048576).toFixed(1), 'MiB');
else console.log('installer not produced');
