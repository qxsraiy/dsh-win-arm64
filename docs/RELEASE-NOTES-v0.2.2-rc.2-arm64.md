# DSH 0.2.2-rc.2 — Windows on ARM64

把上游 x64 安装包重新组装成 Windows on ARM64 发行版：Electron 外壳（**44.7.0**）、内置 Node、CPython、以及全部平台专有原生模块都换成 arm64 原生版本，另有 1 处源码级平台白名单补丁。**应用进程内不再有任何 x64 代码靠模拟运行。**

## 资产

| 文件 | 说明 |
|---|---|
| `DSH-0.2.2-rc.2-win-arm64.exe` | NSIS 安装包（242.5 MiB），装到 `%LOCALAPPDATA%\Programs\DeepSeek Harness`，带桌面/开始菜单快捷方式与卸载项 |
| `DSH-0.2.2-rc.2-win-arm64-portable-short-root.zip` | 免安装包（402.6 MiB），短根目录 `DSH-arm64\`，最深路径 183 字符，解压直接运行 `DeepSeek Harness.exe` |
| `SHA256SUMS.txt` | 校验和，先核对再解压 |

```
b1ab63c90cf47dcb681063cecc9f6445375e65736cb5aaf180dfe79b7489bc8a  DSH-0.2.2-rc.2-win-arm64.exe
8118a0fc0e713070ecf41ab0311a3c26732e058957497826bb12bcccf8d53dde  DSH-0.2.2-rc.2-win-arm64-portable-short-root.zip
```

安装器 stub 为 32 位 x86（NSIS 默认），在 ARM64 Windows 上由系统模拟执行；**装进去的程序本体是 arm64**。包未签名。

## 这次换掉了什么

- **Electron 44.7.0**：官方 `electron-v44.7.0-win32-arm64`，覆盖全部 DLL/pak/snapshot/locales，版本资源与图标改回原包样式（图标用 `pe-icon.js` 从原包主程序重建，16→256 七个尺寸）
- **原生模块**：koffi 3.1.1、sharp+libvips 0.35.5、node-pty `prebuilds/win32-arm64`、ripgrep 1.18.0、sherpa-onnx 1.13.8、libreoffice-kit 0.2.3（`bin/dsoffice.exe`）、node-addon-require-builtin 0.1.9 —— 全部 arm64
- **运行时负载**：Node 24.21.0 win-arm64；CPython 3.12.16 arm64 + 13 个 `win_arm64`/`none-any` 轮子；pnpm 11.28.5 并补齐 **`@reflink/reflink-win32-arm64-msvc`**（否则 pnpm 会静默降级为普通复制）
- **打包层**：`app.asar` 重新打包（20 184 条目 / 1 696 unpacked / 205.3 MiB，含 4 MiB 分块 SHA-256 integrity）；`runtime.json` 与 `desktop-runtime.json` 的 `arch` 改 arm64，文件清单重算（18 997 条）
- **1 处 JS 补丁**：`dsh-experimental-speech-to-text-sensevoice` 平台白名单补 `win32-arm64`

与 0.2.1-fix11 相比：本版**不再捆绑** `claude.exe` / `codex.exe`（省掉 439 MiB），新增 `resources/plugins-bundled/` 与 `resources/desktop.cordis.patch.yml` gate 层（原样保留，未改动）。

保留 x64/x86 的只有 `elevate.exe`、pip 的 `distlib` 启动器、pnpm 的 `fastlist`/`reflink` x64 备用项、node-pty 的 `third_party` 目录副本、libreoffice-kit 基础包里的 `frame-forwarding/prebuilds/win32-x64` 目录 —— 都不在 Electron 进程内加载。

## 校验

```
arm64 159 个；x64 7 个（全部在允许清单内）；x86 4 个（允许清单）
主程序 216.1 MiB / dsoffice.exe 166.0 MiB / node.exe 78.1 MiB 均 arm64；python 原生模块 arm64 81 / x64 0
runtime.json: platform=win32 arch=arm64 python=3.12.16 node=24.21.0
asar: 20 184 条目, 1 696 unpacked, 205.3 MiB；x64 命名残留 0；unpacked 缺失 0
判定 PASS
```

另做了两项交叉验证：用 x64 Electron 的 asar 层直接读新包（9/9 通过）；便携包 `tar -xf` 全量解开后用 10 570 个文件逐字节 sha256 比对（0 差异）。

## 已知限制

- 构建在 x64 机器上完成，**真机启动冒烟由使用者执行**：`pwsh -File tools/check-on-arm64.ps1 -AppDir <解压目录>`
- Python 由 3.12.14 升到 3.12.16（python.org 未发布 3.12.14 的 arm64 安装器；用 python-build-standalone 全量布局，ABI 同为 cp312）
- 上游 `vcruntime140_1.dll` 是 x64，已移除，由系统 arm64 运行库接管
- 安装器脚本为新编写（非 electron-builder 原脚本），安装位置/快捷方式/卸载项对齐原包
- 未做数字签名，首次运行可能触发 SmartScreen
