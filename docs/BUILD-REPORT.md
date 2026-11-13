# DSH 0.2.1-fix11 → Windows on ARM64 移植报告

**源包**：`D:\aiwork\DSHarm\DSH-0.2.1-fix11-win-x64.exe`（NSIS 安装包，474.2 MiB，Electron 44.0.0 + 内置 dsh 运行时）
**产物**：`D:\aiwork\DSHarm\out\DSH-0.2.1-fix11-win-arm64.exe`（NSIS 安装包，394.5 MiB，x64 之外的完整 arm64 版）
**结论**：可以改。整机意义上的「原地换壳」在这里不够用（原包里的原生依赖、Python 运行时、外部 CLI 全是 x64），本报告给出的是**按 arm64 重新组装**的完整发行版，并附全部构建脚本与校验证据。

---

## 1. 为什么不是简单的「改个字段」

原包结构（安装后目录 `%LOCALAPPDATA%\Programs\DeepSeek Harness`）：

```
DeepSeek Harness.exe            Electron 44.0.0 主程序（x64，233 MiB）
*.dll / *.pak / icudtl.dat      Chromium 运行时（x64）
resources/app.asar              应用 + dsh 运行时 JS（211 MiB，197.7 MiB 数据）
resources/app.asar.unpacked/    asar 之外的原生负载（834 MiB）
resources/runtime/              内置 Node.js + Python + pnpm 负载（302 MiB）
```

其中**必须**按目标架构重做的部分，以及本包的处置：

| 组件 | 原状态 | arm64 处置 | 说明 |
|---|---|---|---|
| Electron 主程序 + Chromium DLL | x64 | 官方 `electron-v44.0.0-win32-arm64` | 原 exe 仅做了图标/版本资源改写，本次同样处理 |
| `@koromix/koffi-win32-x64` | koffi 3.1.1 / 3.3.3 | 换 `koffi-win32-arm64` 1 **两处**（顶层 3.1.1、`dsh-desktop-host` 内嵌 3.3.3） | 版本必须与各自的 `koffi` 包一致，否则运行期报 `Mismatched native Koffi modules` |
| `@img/sharp-win32-x64` | 0.35.5 | `@img/sharp-win32-arm64` 0.35.5 | 含 libvips DLL |
| `node-pty` 预编译 | `prebuilds/win32-x64` + `build/Release` | `prebuilds/win32-arm64`（含 conpty/OpenConsole） | 上游 tarball 自带 arm64 预编译；删除 x64 的 `build/` 目录 |
| `node-addon-require-builtin-win32-x64-msvc` | 0.1.9 | `-win32-arm64-msvc` 0.1.9 | Loader 按 `process.arch` 选包 |
| `@vscode/ripgrep-win32-x64` | 1.18.0 | `@vscode/ripgrep-win32-arm64` 1.18.0 | Loader 用 `@vscode/ripgrep-${platform}-${arch}` |
| `sherpa-onnx-win-x64` | 1.13.8 | `sherpa-onnx-win-arm64` 1.13.8 | 语音识别/ONNX Runtime |
| `@anthropic-ai/claude-agent-sdk-win32-x64` | 0.3.263 | `...-win32-arm64` 0.3.263 | Claude Code 子代理载荷 |
| `@openai/codex-win32-x64` | 0.153.4 | `@openai/codex@0.153.4-win32-arm64` | Codex 子代理载荷（`vendor/aarch64-pc-windows-msvc/`） |
| `@deepseek-ai/libreoffice-kit-win32-x64` | 0.1.5 | `...-win32-arm64` 0.1.5 | Office 技能引擎 |
| `runtime/…/node/bin/node.exe` | Node 24.21.0 x64 | Node 24.21.0 **win-arm64** | dsh CLI / pnpm 用的独立 Node |
| `runtime/…/python/**` | CPython 3.12.14 x64 + 13 个 x64 轮子 | CPython **3.12.16 arm64**（python-build-standalone install_only）+ 13 个 `win_arm64`/`none-any` 轮子 | numpy/pandas/lxml/Pillow 全部换成 cp312-win_arm64 |
| `runtime/…/runtime.json` | `arch: "x64"` | `arch: "arm64"`、`python: 3.12.16`、`node: 24.21.0`、去掉 `payloadDigest` | dsh 的 `compatibleManifest()` 会硬比对 `process.arch` |
| `dsh/desktop-runtime.json` | `arch: "x64"`、15 251 条文件清单 | `arch: "arm64"`、清单**重算** 15 256 条（path/bytes/sha256） | 描述符；清单仅做形状校验，重算以保持自洽 |
| 语音 Provider 白名单 | 只列 `win32-x64` | 追加 `win32-arm64`（1 处 JS 补丁） | `dsh-experimental-speech-to-text-sensevoice/lib/index.js` |
| `resources/app.asar` | 原生条目 x64 | **重新打包**（16 730 条目，1 760 条 unpacked） | 新增 arm64 平台包必须写进 asar 头，否则 Node 解析不到 |

保留 x64（**均不在 Electron 进程内加载**，在 ARM64 Windows 上由系统模拟执行，或根本不会被执行）：

`resources/elevate.exe`（electron-builder 提权助手）、pnpm 的 `fastlist-*.exe` 与 `@reflink/reflink-win32-x64-msvc`（pnpm 运行期按架构二选一，arm64 版本同时存在）、pip 自带的 `distlib` 启动器桩、node-pty `third_party` 里上游附带的 win10-x64 目录副本。

---

## 2. 产物与校验

**安装包**：`D:\aiwork\DSHarm\out\DSH-0.2.1-fix11-win-arm64.exe`
- 大小 413 635 706 字节（394.5 MiB），SHA-256 `5818652C8E3BBB22D0373EC2698E7F859C280FD423C5D3F6ED8968DF6962F8A2`
- NSIS 3.11 / LZMA solid，**按用户安装**到 `%LOCALAPPDATA%\Programs\DeepSeek Harness`，桌面 + 开始菜单快捷方式、卸载项 `HKCU\...\Uninstall\DeepSeekHarness`
- 安装器 stub 是 32 位 x86（NSIS 默认），在 ARM64 Windows 上由系统模拟运行；**装进去的程序本体是 arm64**

**可运行目录**（免安装）：`D:\aiwork\DSHarm\work\app-arm64`（1.64 GiB / 10 152 文件）
**免安装压缩包**：`D:\aiwork\DSHarm\out\DSH-0.2.1-fix11-win-arm64-portable.zip`
- 623.9 MiB，解压得到 `DSH-0.2.1-fix11-win-arm64\` 目录（11 357 个条目），里面直接运行 `DeepSeek Harness.exe`
- SHA-256 `5D55F54634AEF18BB24E94711AEC1583AC7EA00E28786C7B180E699D74D6B58F`

**免安装压缩包（短根目录版，解压工具兼容性更好）**：`D:\aiwork\DSHarm\out\DSH-0.2.1-fix11-win-arm64-portable-short-root.zip`
- 622.7 MiB，根目录名只有 `DSH-arm64\`，最深条目从 199 字符降到 **183** 字符（解压到 `C:\Users\xxx\Downloads\` 这类目录也不会碰到 260 的 MAX_PATH 界线）
- 由 .NET `ZipFile.CreateFromDirectory` 生成：标准 deflate、无 data descriptor 标志，7-Zip / Explorer / Bandizip 都能正常处理
- 解压辅助脚本：`extract-portable.ps1`（自动选 7-Zip 或 bsdtar，落到短路径并校验文件数与最长路径）

**结构校验（`06-verify.js`）**：

```
PE 二进制：arm64 166 个，x64 8 个（全部在允许清单内），x86 5 个（允许清单）
主程序 DeepSeek Harness.exe      215.0 MiB  arm64
codex.exe                       238.7 MiB  arm64（…/aarch64-pc-windows-msvc/bin）
claude.exe                      200.1 MiB  arm64
libreoffice-kit.exe             159.9 MiB  arm64
node.exe                         78.1 MiB  arm64
python312.dll / *.pyd            arm64（arm64 81 个，x64 0 个）
runtime.json  platform/arch       win32 / arm64，python 3.12.16，node 24.21.0
asar 头                          16 730 条目、1 760 unpacked、201.9 MiB，可解析
残留 x64 命名的条目              0
判定                             PASS
```

**asar 可用性交叉验证**：用原版 x64 Electron 的 asar 层直接读新包（`ELECTRON_RUN_AS_NODE=1`），8/8 通过——包括读取 asar 内 `package.json`、读取 unpacked 的 `koffi.node` / `claude.exe`、`require()` asar 内的 JS 模块、目录枚举。

**版本资源**：`ProductName=DeepSeek Harness`、`FileVersion=0.2.1.1`、`FileDescription` 与原包一致，图标取自原包。

---

## 3. 构建流水线（可复现）

全部脚本在 `D:\aiwork\DSHarm\`，一键入口 `build-arm64.ps1`：

| 脚本 | 作用 |
|---|---|
| `01-tree.js` | 解 asar（修正了 Chromium Pickle 头部偏移：`dataOffset = 8 + headerSize`）并把 `app.asar.unpacked` 合回逻辑源树 |
| `download-all.js` / `dl.js` | 拉取全部 arm64 制品（npm / nodejs.org / python-build-standalone / PyPI 轮子 / rcedit）；国内可走 npmmirror |
| `02-transform.js` | 删 x64 平台包、装 arm64 平台包、替换 node-pty 预编译、改两个描述符、重算文件清单 |
| `02b-unpacked.js` | 计算新的 asar-unpacked 集合（原有 ∩ 现状 + 新 arm64 包） |
| `02c-patch.js` | 语音白名单补丁 + 描述符清单刷新 |
| `03-asar.js` | 按 asar 格式重新打包（含 Pickle 头部、4 MiB 分块 SHA-256 integrity、unpacked 落盘） |
| `04-runtime.js` | arm64 Node + CPython 3.12.16 + 全部 win_arm64 轮子装进 `resources/runtime` |
| `05-shell.js` | 用 arm64 Electron 发行版组装应用目录、改 exe 版本资源与图标 |
| `06-verify.js` | PE 机器类型普查 + 描述符/asar 一致性校验 + PASS/FAIL 判定 |
| `07-installer.js` | 生成并编译 NSIS 安装器 |

重跑一次的耗时主要在下载（~1 GB）与 makensis LZMA 压缩（~7 分钟）。

---

## 4. 已知限制 / 需要你在真机确认的点

1. **没有 ARM64 硬件可实测**。本机是 Intel x64，无法运行 arm64 二进制，所以验证是结构级（PE 机器类型、模块解析路径、描述符、asar 可读性）+ 用 x64 Electron 的 asar 层做的交叉验证，**没有做真机启动冒烟**。
2. **Python 由 3.12.14 升到 3.12.16**：python.org 的 3.12.14 只发布了源码包（无 arm64 安装器），因此用 python-build-standalone 的 3.12.16 arm64 全量布局；`runtime.json` 已如实声明。ABI 同为 cp312，13 个库版本完全对齐原包。
3. **上游 python-build-standalone 的 `vcruntime140_1.dll` 是 x64**，已删除该文件（CPython 是 C 实现不需要它），让系统 arm64 运行库接管。若你的机器缺 VC++ 运行库，请装 `VC_redist.arm64.exe`。
4. **安装器脚本是新写的 NSIS**（非 electron-builder 原脚本）：安装位置/快捷方式/卸载项对齐原包，但 `7zip-installer-COPYING.txt`、`Uninstall DeepSeek Harness.exe` 的名称细节与原包可能略有差异。
5. **未签名**：与原包一致（原包 `NotSigned`），ARM64 Windows 上首次运行可能触发 SmartScreen 提示。
6. 若你只想要「不装」，直接用上面的 portable zip（或把 `work\app-arm64` 整个目录复制过去）运行 `DeepSeek Harness.exe` 亦可（目录名可随意改）。

---

## 5. 在 ARM64 机器上怎么验收（一条命令）

把 `check-on-arm64.ps1` 和产物一起拷到目标机，然后：

```powershell
pwsh -File .\check-on-arm64.ps1 -AppDir "D:\DSH-0.2.1-fix11-win-arm64"
```

它会依次打印：宿主架构 / 主程序与 6 个关键原生模块的 PE 机器类型（应为 arm64）/ 内置 Node 与 Python 的实际运行结果（含 numpy、pandas、lxml、Pillow、openpyxl、python-docx、python-pptx 导入）/ 启动应用并确认进程存活。

期望输出要点：

```
PROCESSOR_ARCHITECTURE = ARM64
OSArchitecture         = Arm64
arm64        DeepSeek Harness.exe
arm64        resources\runtime\primary-runtime\dependencies\node\bin\node.exe
arm64        ...\python\python.exe
arm64        ...\sharp-win32-arm64-0.35.5.node
arm64        ...\node-pty\prebuilds\win32-arm64\conpty.node
arm64        ...\koffi-win32-arm64\win32_arm64\koffi.node
v24.21.0 arm64
3.12.16 ARM64
libs ok: 2.3.5 3.0.1 6.1.3
running: pid=… path=…\DeepSeek Harness.exe
```

若某一行不是 arm64、或 Python 导入失败、或进程秒退，把输出贴回来，我按那一项继续修。

---

## 6. 附：压缩包完整性自检结果（用户反馈「解压报错」后补做）

对 `DSH-0.2.1-fix11-win-arm64-portable.zip` 做了三重验证，结论是**包没坏**：

| 验证 | 方法 | 结果 |
|---|---|---|
| 中央目录 | .NET `ZipFile.OpenRead` | 11 357 条目全部可读，无加密、无 symlink、method=8(deflate) |
| 全量解开 | `tar.exe -xf`（Windows 自带 bsdtar） | exit 0，9 秒，10 152 个文件 |
| 逐文件比对 | 10 152 个 sha256 与源目录比对 | 0 差异 |
| 深目录解压 | `Expand-Archive` 到 271 字符的目标（超过 MAX_PATH 260） | 成功（本机 `LongPathsEnabled=1`；未开启长路径的机器就可能在这里报错） |

因此「解压到一半报错」最可能是**解压工具 / 长路径限制**，而不是数据问题。可用的绕法：

1. 用 `extract-portable.ps1`（自动用 7-Zip 或 bsdtar，默认落到 `D:\DSH-arm64`）。
2. 换短根目录版 zip（`...-portable-short-root.zip`）。
3. 解压到盘根目录，例如 `D:\`，让总路径尽量短。
4. 干脆用安装包 `DSH-0.2.1-fix11-win-arm64.exe`（NSIS 自己按需创建目录，不走 zip 解压器）。
