# DSH for Windows on ARM64

把第三方构建 **DSH 0.2.1-fix11 (win-x64)** 重新组装成 **Windows on ARM64** 可用发行版的构建工程。
产物包含 arm64 的 Electron 外壳、arm64 的 Node / Python / 原生模块负载，以及完整的 NSIS 安装包与免安装包。

> 本仓库只放**构建脚本 + 文档**；二进制在 [Releases](../../releases) 里。

---

## 为什么需要重新组装

上游包是 x64 发行版：Electron 主程序、内置 Node、整份 CPython、以及 8 个平台专有 npm 包（koffi、sharp、node-pty、ripgrep、sherpa-onnx、claude-agent-sdk、codex、libreoffice-kit）全是 x64。
在 Windows ARM64 上靠 Prism 模拟跑 Electron 主进程会持续发热掉电，而且进程内混用 x64 `.node` 直接加载失败，因此必须按 arm64 重做整条链路。

| 组件 | 处置 |
|---|---|
| Electron 44.0.0 外壳 | 官方 `win32-arm64` 发行版，改写图标/版本资源 |
| `koffi` | `@koromix/koffi-win32-arm64`，且**两级副本**分别对 3.1.1 / 3.3.3 |
| `sharp` / libvips | `@img/sharp-win32-arm64` 0.35.5 |
| `node-pty` | 上游 `prebuilds/win32-arm64`（conpty + OpenConsole），删除 x64 `build/` |
| `ripgrep` / `sherpa-onnx` / `claude-agent-sdk` / `codex` / `libreoffice-kit` | 各自 arm64 平台包 |
| 内置 Node | 24.21.0 **win-arm64** |
| 内置 Python | CPython **3.12.16 arm64**（python-build-standalone）+ 13 个 `win_arm64` / `none-any` 轮子 |
| `app.asar` | 按 asar 格式重新打包（含 Pickle 头、4 MiB 分块 SHA-256 integrity、unpacked 落盘） |
| 描述符 | `runtime.json` / `desktop-runtime.json` 的 `arch` 改 arm64、文件哈希清单重算 |
| 语音 Provider | 平台白名单补 `win32-arm64`（1 处 JS 补丁） |

细节与验证证据见 [`docs/BUILD-REPORT.md`](docs/BUILD-REPORT.md)。

---

## 下载

Releases（最新：**[v0.2.1-arm64](https://github.com/qxsraiy/dsh-win-arm64/releases/tag/v0.2.1-arm64)**）里的资产：

| 文件 | 用途 |
|---|---|
| `DSH-0.2.1-fix11-win-arm64.exe` | NSIS 安装包，装到 `%LOCALAPPDATA%\Programs\DeepSeek Harness`，带快捷方式与卸载项 |
| `DSH-0.2.1-fix11-win-arm64-portable-short-root.zip` | 免安装包（**推荐**），短根目录 `DSH-arm64\`，兼容性最好，解压直接运行 `DeepSeek Harness.exe` |
| `DSH-0.2.1-fix11-win-arm64-portable.zip` | 免安装包（另一版本，根目录 `DSH-0.2.1-fix11-win-arm64\`） |
| `SHA256SUMS.txt` | 校验和，先核对再解压 |

已在华为 MateBook E Go 2022 性能版（骁龙 8cx Gen 3 / 16GB / Windows 11 ARM64）上安装验证通过。

安装器 stub 是 32 位 x86（NSIS 默认），在 ARM64 Windows 上由系统模拟执行；**装进去的程序本体是 arm64**。
包未签名，首次运行可能触发 SmartScreen 提示。

### 快速开始

```powershell
# 1) 核对哈希
Get-FileHash .\DSH-0.2.1-fix11-win-arm64-portable-short-root.zip -Algorithm SHA256

# 2) 解压（自动挑 7-Zip / bsdtar，落到短路径并校验）
pwsh -File .\tools\extract-portable.ps1 -Zip .\DSH-0.2.1-fix11-win-arm64-portable-short-root.zip

# 3) 在 ARM64 机器上验收：打印各原生模块的 PE 机器类型、Python 库导入、启动应用
pwsh -File .\tools\check-on-arm64.ps1 -AppDir "D:\DSH-arm64"
```

想量化这台机器跑得怎么样：

```powershell
pwsh -File .\tools\bench-arm64.ps1 -AppDir "D:\DSH-arm64"
```

---

## 自己构建

前置：Windows x64（或任意能跑 Node 的机器）、Node.js 20+、可访问 npm / nodejs.org / GitHub / PyPI 的网络。

```powershell
# 把待改造的原版安装包放到 D:\aiwork\DSHarm\DSH-0.2.1-fix11-win-x64.exe，
# 先用安装包装一次（脚本从已安装目录读取源树），再执行：
pwsh -File .\scripts\build-arm64.ps1
```

流水线（`scripts/` 下按序）：

| 脚本 | 作用 |
|---|---|
| `01-tree.js` | 解 asar（修正 Chromium Pickle 头偏移）并把 `app.asar.unpacked` 合回逻辑源树 |
| `download-all.js` / `dl.js` | 拉取全部 arm64 制品（支持走 npmmirror 镜像） |
| `02-transform.js` | 删 x64 平台包、装 arm64 平台包、替换 node-pty 预编译、改描述符、重算文件清单 |
| `02b-unpacked.js` | 计算新的 asar-unpacked 集合 |
| `02c-patch.js` | 语音白名单补丁 + 描述符刷新 |
| `03-asar.js` | 按 asar 格式重新打包 |
| `04-runtime.js` | arm64 Node + CPython 3.12.16 + win_arm64 轮子 |
| `05-shell.js` | 用 arm64 Electron 组装目录、改 exe 版本资源与图标（rcedit） |
| `06-verify.js` | PE 机器类型普查 + 描述符/asar 一致性校验，输出 PASS/FAIL |
| `07-installer.js` | 生成并编译 NSIS 安装器（makensis） |
| `08-portable-zip.js` | 生成短根目录便携 zip（.NET ZipFile） |

> 脚本顶部的路径常量（`D:/aiwork/DSHarm/...`）是作者机器上的布局，换成你自己的根目录即可；
> `download-all.js` 里 `npmmirror` 与官方源可互换。

`06-verify.js` 的判定口径：**进入 Electron / Node 进程的所有二进制必须是 arm64**；
`elevate.exe`、pnpm 的 `fastlist`/`reflink`、pip 自带 `distlib` 启动器、node-pty 的 `third_party` 目录副本
允许保留 x64/x86 —— 它们不在进程内加载，或根本不会被执行。

---

## 已知限制

- 仓库维护者在 Intel x64 机器上构建，**结构级验证**已通过（PE 机器类型、模块解析路径、描述符、asar 可读性、
  用原版 x64 Electron 的 asar 层交叉读取），**真机启动冒烟由使用者完成**（见 `tools/check-on-arm64.ps1`）。
- Python 由 3.12.14 升到 **3.12.16**：python.org 的 3.12.14 只发布了源码包，因此改用
  python-build-standalone 的 arm64 全量布局；ABI 同为 cp312，13 个库版本与原包完全对齐。
- 上游 python-build-standalone 的 `vcruntime140_1.dll` 是 x64，已删除该文件（CPython 为 C 实现不需要），
  由系统 arm64 运行库接管；若目标机缺 VC++ 运行库，请装 `VC_redist.arm64.exe`。
- 安装器脚本为重新编写（非 electron-builder 原脚本），安装位置/快捷方式/卸载项对齐原包，
  `7zip-installer-COPYING.txt` 之类构建附带文件不再存在。
- 包未做数字签名。

---

## 许可与来源

- 本仓库的构建脚本与文档：**MIT**（见 `LICENSE`）。
- 第三方组件归属说明：见 [`NOTICE`](NOTICE)。
- Releases 中的发行产物是**对上游安装包内容的重新组装**，不包含任何上游源代码；
  其中的第三方组件各自保留其原始许可：Electron / Chromium（MIT + 附带 `LICENSES.chromium.html`）、
  Node.js（MIT）、CPython（PSF）、LibreOffice（MPL-2.0）、ripgrep（MIT）、sharp/libvips（Apache-2.0）、
  koffi（MIT）、sherpa-onnx / onnxruntime（Apache-2.0）、以及 DSH 相关包按上游条款分发。
  使用、再分发前请自行确认上游条款与适用法律。

---

## English summary

Unofficial **Windows on ARM64** build of DeepSeek Harness `0.2.1-alpha.1` (fix11): the x64 Electron shell and the
bundled x64 Node / Python / native modules are replaced with native arm64 counterparts and the `app.asar` is
repacked, so nothing runs under x64 emulation inside the app process. Binaries live in Releases; this repository
holds the reproducible pipeline (`scripts/`) and verification tooling (`tools/`).
Build host was x64, so structural verification is done here and the on-device smoke test is left to
`tools/check-on-arm64.ps1`.
