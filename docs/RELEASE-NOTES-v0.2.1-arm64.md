# DSH 0.2.1 (fix11) — Windows on ARM64

把上游 x64 安装包重新组装成 Windows on ARM64 发行版：Electron 外壳、内置 Node、CPython、以及全部平台专有原生模块都换成了 arm64 原生版本，另有 1 处源码级平台白名单补丁。**应用进程内不再有任何 x64 代码靠模拟运行。**

## 资产

| 文件 | 说明 |
|---|---|
| `DSH-0.2.1-fix11-win-arm64.exe` | NSIS 安装包（394.5 MiB），装到 `%LOCALAPPDATA%\Programs\DeepSeek Harness`，带桌面/开始菜单快捷方式与卸载项 |
| `DSH-0.2.1-fix11-win-arm64-portable-short-root.zip` | 免安装包（622.7 MiB），短根目录 `DSH-arm64\`，最深路径 183 字符，标准 .NET zip，解压工具兼容性最好 |
| `SHA256SUMS.txt` | 校验和，先核对再解压 |

安装器 stub 为 32 位 x86（NSIS 默认），在 ARM64 Windows 上由系统模拟执行；**装进去的程序本体是 arm64**。包未签名。

## 这次换掉了什么

- **Electron 44.0.0**：官方 `electron-v44.0.0-win32-arm64`，改写图标与版本资源
- **原生模块**：koffi（两级副本 3.1.1 / 3.3.3）、sharp+libvips 0.35.5、node-pty `prebuilds/win32-arm64`、ripgrep 1.18.0、sherpa-onnx 1.13.8、claude-agent-sdk 0.3.263、codex 0.153.4、libreoffice-kit 0.1.5 —— 全部 arm64
- **运行时负载**：Node 24.21.0 win-arm64；CPython 3.12.16 arm64 + 13 个 `win_arm64` / `none-any` 轮子（numpy 2.3.5、pandas 3.0.1、lxml 6.1.3、Pillow 12.3.0 …）
- **打包层**：`app.asar` 按 asar 格式重新打包（Pickle 头、4 MiB 分块 SHA-256 integrity、unpacked 落盘）；`runtime.json` / `desktop-runtime.json` 的 `arch` 改 arm64，文件哈希清单重算
- **1 处 JS 补丁**：`dsh-experimental-speech-to-text-sensevoice` 的平台白名单补上 `win32-arm64`

保留 x64/x86 的只有：`elevate.exe`、pnpm 的 `fastlist` / `reflink` 备用项、pip 自带的 `distlib` 启动器、node-pty `third_party` 目录副本 —— 都不在 Electron 进程内加载。

## 校验

`scripts/06-verify.js` 全量 PE 普查：

```
arm64 166 个；x64 8 个（全部在允许清单内）；x86 5 个（允许清单）
主程序 / codex.exe / claude.exe / libreoffice-kit.exe / node.exe / python312.dll / 81 个 .pyd 全为 arm64
runtime.json: platform=win32 arch=arm64 python=3.12.16 node=24.21.0
asar: 16 730 条目, 1 760 unpacked, 201.9 MiB, 可解析；unpacked 缺失 0；残留 x64 命名条目 0
判定 PASS
```

另用原版 x64 Electron 的 asar 层做交叉验证（8/8 通过），并对便携包做了「中央目录 + 全量解开 + 10 152 个文件逐字节 sha256 比对」，0 差异。

## 已知限制

- 构建在 x64 机器上完成，**真机启动冒烟由使用者执行**：`pwsh -File tools/check-on-arm64.ps1 -AppDir <解压目录>`
- Python 由 3.12.14 升到 3.12.16（python.org 未发布 3.12.14 的 arm64 安装器；用 python-build-standalone 全量布局，ABI 同为 cp312）
- 上游 `vcruntime140_1.dll` 是 x64，已移除，由系统 arm64 运行库接管；目标机若缺 VC++ 运行库请装 `VC_redist.arm64.exe`
- 安装器脚本为新编写（非 electron-builder 原脚本），安装位置/快捷方式/卸载项对齐原包
- 未做数字签名，首次运行可能触发 SmartScreen

## 许可

发行产物是对上游安装包内容的重新组装，不含上游源码；其中各第三方组件保留其原始许可（Electron/Chromium、Node.js、CPython、LibreOffice、ripgrep、sharp/libvips、koffi、sherpa-onnx/onnxruntime 及 DSH 相关包）。构建脚本见仓库 `scripts/`，MIT 授权。
