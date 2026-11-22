# DSH 0.2.2-rc.2 → Windows on ARM64 移植报告

**源包**：`D:\aiwork\DSHarm022\DSH-0.2.2-rc.2-win-x64.exe`（NSIS，322 740 919 字节 / 307.8 MiB，Electron **44.7.0**）
**产物**：`out\DSH-0.2.2-rc.2-win-arm64.exe`（242.5 MiB）+ `out\DSH-0.2.2-rc.2-win-arm64-portable-short-root.zip`（402.6 MiB）
**结论**：与 0.2.1-fix11 同一套流程，全部通过；校验判定 **PASS**。

---

## 1. 与上一版的差异（这次少了不少活）

| 项 | 0.2.1-fix11 | 0.2.2-rc.2 |
|---|---|---|
| Electron | 44.0.0 | **44.7.0** |
| 解包后负载 | 1.64 GiB / 10 152 文件（安装后目录） | **1.14 GiB / 8 824 文件**（7za 解出的原始负载） |
| asar 内容 | 14 992 条目 / 197.7 MiB | **18 504 条目 / 200.3 MiB** |
| 捆绑的外部 CLI | `claude.exe`(200 MiB) + `codex.exe`(239 MiB) + rg 等 | **不再捆绑**（`@anthropic-ai/claude-agent-sdk-*`、`@openai/codex-*` 消失） |
| 新增资源 | — | `resources/plugins-bundled/`、`resources/desktop.cordis.patch.yml`（第三方 gate 层） |
| libreoffice-kit | 0.1.5（`bin/libreoffice-kit.exe`） | **0.2.3**（`bin/dsoffice.exe`，内含 `frame-forwarding` 预编译，已自带 arm64） |
| pnpm 负载 | 11.7.0，且有两份 pnpm 副本 | **11.28.5**，只有一份（`primary-runtime/dependencies/pnpm`） |
| koffi | 两级副本 3.1.1 / 3.3.3 | **只有一份 3.1.1** |
| 安装包体积 | 394.5 MiB | **242.5 MiB** |

因为 claude/codex 不再随包分发，本次只需要换 7 个原生组件，比上次轻。

---

## 2. arm64 替换清单

| 组件 | 原状态 | 处置 |
|---|---|---|
| Electron 外壳 | 44.7.0 x64 | 官方 `electron-v44.7.0-win32-arm64`，覆盖全部 DLL/pak/snapshot/locales，改写版本资源与图标 |
| `koffi` | `@koromix/koffi-win32-x64` 3.1.1 | `@koromix/koffi-win32-arm64` **3.1.1**（版本必须一致，否则运行期报 `Mismatched native Koffi modules`） |
| `sharp` + libvips | `@img/sharp-win32-x64` 0.35.5 | `@img/sharp-win32-arm64` 0.35.5 |
| `node-pty` | `prebuilds/win32-x64` + `build/Release` | 上游 `prebuilds/win32-arm64`（conpty + OpenConsole），删除 x64 `build/` |
| `ripgrep` | `@vscode/ripgrep-win32-x64` 1.18.0 | `@vscode/ripgrep-win32-arm64` 1.18.0 |
| `sherpa-onnx` | `sherpa-onnx-win-x64` 1.13.8 | `sherpa-onnx-win-arm64` 1.13.8 |
| `node-addon-require-builtin` | `-win32-x64-msvc` 0.1.9 | `-win32-arm64-msvc` 0.1.9 |
| LibreOffice 引擎 | `libreoffice-kit-win32-x64` 0.2.3 | `libreoffice-kit-win32-arm64` 0.2.3（`bin/dsoffice.exe` 166 MiB） |
| 内置 Node | 24.21.0 x64 | 24.21.0 **win-arm64** |
| 内置 Python | CPython 3.12.14 x64 + 13 个 x64 轮子 | CPython **3.12.16 arm64**（python-build-standalone）+ 13 个 `win_arm64`/`none-any` 轮子 |
| pnpm 的 reflink 加速 | 只有 `reflink-win32-x64-msvc` | **补上 `reflink-win32-arm64-msvc` 0.1.19**（否则 pnpm 静默降级为普通复制） |
| `app.asar` | 含 x64 原生条目 | **重新打包**：20 184 条目 / 1 696 unpacked / 205.3 MiB |
| `runtime.json` | `arch: x64`, python 3.12.14, pnpm 11.28.5 | `arch: arm64`, python 3.12.16, node 24.21.0（pnpm 保持 11.28.5） |
| `desktop-runtime.json` | `arch: x64`，18 994 条文件清单 | `arch: arm64`，清单重算 **18 997** 条 |
| 语音 Provider 白名单 | 只列 `win32-x64` | 追加 `win32-arm64`（JS 补丁 ①，同上次） |
| 桌面壳的强制更新身份校验 | `win32 && arch !== "x64"` 直接抛错 | 放开为 `win32 && !["x64","arm64"].includes(arch)`（JS 补丁 ②，**0.2.2 新增的硬闸**，不改则应用启动即报 `desktop policy: invalid installed client identity`） |

允许保留的非 arm64（都不在 Electron 进程内加载）：

- `elevate.exe`（x86）、pip 自带 `distlib` 启动器（x64/x86）、pnpm 的 `fastlist-*.exe`（x64/x86）与 `reflink-win32-x64-msvc.node`
- `node-pty/third_party/.../win10-x64/`（上游附带的构建目录副本；运行期加载的是 `prebuilds/win32-arm64`）
- `libreoffice-kit/frame-forwarding/prebuilds/win32-x64/`（上游基础包自带的四平台目录，运行期按 arch 选 `win32-arm64`）

---

## 3. 校验

> **0.2.2 的新坑**：`lib/main.js` 的 `DesktopMandatoryUpdatePolicy` 构造函数里有一条
> `identity.platform === "win32" && identity.arch !== "x64"` → `throw "desktop policy: invalid installed client identity"`。
> arm64 上窗口还没开就会抛，属于必须改的语义闸（`02e-patch-shell.js` 已放开为 x64/arm64 都接受）。
> 全库只此一处，`@deepseek-ai/*` 里没有同类判断。

**`06-verify.js`（全量 PE 普查）**

```
arm64 159 个；x64 7 个（全部在允许清单内）；x86 4 个（允许清单）
主程序 216.1 MiB / dsoffice.exe 166.0 MiB / node.exe 78.1 MiB 均为 arm64
python 原生模块：arm64 81，x64 0
runtime.json: platform=win32 arch=arm64 python=3.12.16 node=24.21.0
asar: 20 184 条目, 1 696 unpacked, 205.3 MiB；x64 命名残留 0；unpacked 缺失 0
判定 PASS
```

**asar 交叉验证**（用本机 0.2.1 的 x64 Electron 走 asar 层直接读新包）：9/9 通过 —— 读 asar 内 `package.json`、读 unpacked 的 `koffi.node` 与 `dsoffice.exe`、`require()` asar 内 JS、枚举 `resources/plugins-bundled`。

**便携包完整性**：`tar.exe -xf` 全量解开 10 570 个文件，与源目录逐文件 sha256 比对 **0 差异**。

**产物哈希**

```
b0cb85bec90ad7afd44a64c99381e649c890a0029dd18fc4081975dd5da90ae3  DSH-0.2.2-rc.2-win-arm64.exe                    242.5 MiB
eb4a8beb4c2315bdb7742a3e98ddc8e9d30611b9125ea8bb0024203cae06888c  DSH-0.2.2-rc.2-win-arm64-portable-short-root.zip  402.6 MiB
```

---

## 4. 这次新增的两个工具

- `pe-icon.js`：从 PE 的 `RT_GROUP_ICON`/`RT_ICON` 资源重建**完整多尺寸 .ico**（16/24/32/48/64/128/256），用于给 arm64 主程序打回原图标。上一版是借用了已安装目录里的 `uninstallerIcon.ico`，这次改为直接从原包主程序里取，可复现。
- `unzip.js`：纯 node ZIP 解包（下载的 7za、NSIS 便携包都用它解）。
- `02d-reflink.js`：给 pnpm 补 arm64 reflink 绑定。
- `08-portable-zip.js` 改为**纯 node 写 zip**（CRC32 + deflate + 中央目录），不再依赖 pwsh/.NET 子进程。

另外：源包是 7z SFX/NSIS，用 `7za.exe` 直接 `x` 出来即可拿到完整负载（8 824 文件），无需先安装一份再抄目录——这次就是这么做的。

---

## 5. 已知限制

1. **没有 ARM64 硬件实测**：本机 x64，验证是结构级 + asar 交叉读取 + 便携包逐字节比对。真机冒烟请用 `tools/check-on-arm64.ps1`。
2. **Python 由 3.12.14 升到 3.12.16**：python.org 的 3.12.14 只发布源码包（无 arm64 安装器），故用 python-build-standalone 的 arm64 全量布局；ABI 同为 cp312，13 个库版本与原包完全对齐。
3. 上游 python-build-standalone 的 `vcruntime140_1.dll` 是 x64，已删除（CPython 为 C 实现不需要）。
4. 安装器为自写 NSIS 脚本（非 electron-builder 原脚本），安装位置/快捷方式/卸载项对齐原包；`7zip-installer-COPYING.txt` 之类构建附带文件不再存在。
5. 未做数字签名。
6. `desktop.cordis.patch.yml`（danger-full-access / user-approval=ask 等 gate 层）随原包原样保留，未做改动。
