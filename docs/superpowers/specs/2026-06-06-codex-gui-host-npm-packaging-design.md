# Codex GUI Host NPM Packaging Design

日期：2026-06-06

状态：设计草案。本文补齐 GUI host prod assets 的 npm 打包和发布结构设计，不重新打开 GUI host runtime、app-server bridge、TUI `/gui` 或 frontend handshake 架构。

## 设计来源

本文承接以下已经锁定的 GUI host 设计：

- `docs/superpowers/specs/2026-05-11-codex-gui-host-redesign.md`
- `docs/superpowers/specs/2026-05-30-codex-gui-host-dev-adaptation-design.md`

`2026-05-11-codex-gui-host-redesign.md` 已经锁定 prod runtime contract：

```text
$CODEX_GUI_PACKAGE_ROOT/dist/
```

本文只规定 `CODEX_GUI_PACKAGE_ROOT` 在 npm managed install 下如何获得默认值、GUI frontend build artifact 如何进入 npm package、以及 release packaging 如何验证这些产物。

## 目标

完成 GUI host MVP 的 prod packaging policy，使通过 npm 安装的 `cdx` 在 release build 下可以使用 `/gui` 加载随包发布的 frontend assets。

首版完成时应满足：

- root `@jiangshengdev/codex` npm package 包含 `bin/codex.js` 和 GUI frontend `dist/`。
- `codex-cli/bin/codex.js` 在运行 Rust binary 时为 GUI host 提供默认 `CODEX_GUI_PACKAGE_ROOT`。
- 用户显式设置的 `CODEX_GUI_PACKAGE_ROOT` 保持有效，用于强制指定 GUI frontend resource package root。
- `codex-cli/scripts/build_npm_package.py --package codex` 在 staging root package 时构建并复制 `codex-gui/dist`。
- release CI 在 fresh checkout / fresh install 环境中构建 GUI dist，不依赖本地预存产物。
- npm tarball 级验证能证明 root package 内存在 `dist/index.html`。

## 非目标

本文不设计：

- 新的 GUI runtime mode。
- dev Vite proxy 行为。
- app-server bridge、extra connection 或 projection fanout。
- TUI `/gui` 交互行为。
- frontend handshake、Redux/store 或页面 UI。
- 独立发布 `codex-gui` npm package。
- 将 GUI assets 放入 platform-specific optional dependency package。
- npm 发布权限、dist-tag、版本传播或 registry 策略。

## Package Ownership

GUI prod assets 随 root npm package 发布：

```text
@jiangshengdev/codex
```

不新增独立的 `codex-gui` npm package。也不把 GUI prod assets 放入 platform-specific optional dependency package，例如 `@jiangshengdev/codex-darwin-arm64`。

原因：

- `codex-cli/bin/codex.js` 是所有 npm managed installs 的统一入口。
- root package 已经拥有 Node wrapper，最适合作为 GUI frontend resource package root。
- GUI frontend assets 与平台无关，放入 platform package 会造成重复发布和更复杂的 package root 解析。
- 独立 GUI package 会引入额外版本同步、依赖解析和发布失败面，超出 MVP 需要。

## Package Layout

root `@jiangshengdev/codex` package 的 prod GUI layout 固定为：

```text
package-root/
  bin/
    codex.js
  dist/
    index.html
    assets/
      ...
```

`CODEX_GUI_PACKAGE_ROOT` 指向 `package-root/`，不直接指向 `dist/`。Rust GUI host 仍按既有 contract 读取：

```text
$CODEX_GUI_PACKAGE_ROOT/dist/
```

root package 的 `package.json` `files` 必须包含：

```json
["bin/codex.js", "dist"]
```

## Runtime Environment

`CODEX_GUI_PACKAGE_ROOT` 是运行时强制指定 GUI frontend resource package root 的环境变量。

运行规则：

- 如果用户环境已经设置 `CODEX_GUI_PACKAGE_ROOT`，Node wrapper 必须保留用户值，不覆盖。
- 如果用户环境没有设置 `CODEX_GUI_PACKAGE_ROOT`，Node wrapper 设置默认值为 root `@jiangshengdev/codex` package realpath。
- Node wrapper 不验证 `dist/index.html` 是否存在。
- `CODEX_GUI_PACKAGE_ROOT` 只影响 GUI host prod asset 定位，不参与 frontend build 产物选择。

有效性由 Rust GUI host 负责判断：

- 缺少 `CODEX_GUI_PACKAGE_ROOT` 时，prod `/gui` 报 GUI package root 缺失。
- `CODEX_GUI_PACKAGE_ROOT/dist` 缺失或不可读时，prod `/gui` 报 GUI 构建产物缺失或不可读。
- prod 不 fallback 到 Vite，不依赖 cwd，不从 Rust executable path 推断 GUI assets。

## Build And Staging Responsibility

release CI 负责在 staging 前安装 JavaScript 依赖：

```bash
pnpm install --frozen-lockfile
```

`codex-cli/scripts/build_npm_package.py --package codex` 负责在 staging root package 时构建 GUI frontend：

```bash
pnpm --dir codex-gui run build
```

构建成功后，staging 脚本将 `codex-gui/dist` 复制到 staged root package 的 `dist/`。

`build_npm_package.py` 不自动执行 `pnpm install`。本地直接运行 staging 脚本时，如果依赖未安装或 GUI build 失败，脚本应失败并保留底层命令输出。

`stage_npm_packages.py` 仍作为 release orchestration 脚本使用。它不拥有 GUI frontend build policy；root package 的 GUI build/copy 责任留在 `build_npm_package.py --package codex`，这样直接 staging root package 和 release staging 的行为一致。

## File Responsibilities

后续实现计划应把以下文件纳入 packaging scope：

- `codex-cli/bin/codex.js`：为 Rust binary 设置默认 `CODEX_GUI_PACKAGE_ROOT`，但不覆盖用户显式设置。
- `codex-cli/package.json`：声明 root npm package 包含 `dist`。
- `codex-cli/scripts/build_npm_package.py`：构建 `codex-gui/dist`，复制到 staged root package，并写出包含 `dist` 的 root package `files`。
- `scripts/stage_npm_packages.py`：只在需要 tarball 级验证或 release orchestration 调整时修改。
- `.github/workflows/ci.yml` 和 `.github/workflows/rust-release.yml`：只在需要增加 packaging verification 命令时修改。

不应修改：

- `codex-rs/gui-host/src/**` 的 prod/dev 语义。
- `codex-rs/app-server/**`、`codex-rs/app-server-client/**` 或 `codex-rs/tui/**` 的 GUI runtime path。
- `codex-gui/src/**` 的 frontend behavior。

## Verification

packaging implementation 的最小验证应覆盖三层。

### Staged Package Verification

运行 root package staging 后检查 staged package：

```bash
test -f "$STAGING_DIR/bin/codex.js"
test -f "$STAGING_DIR/dist/index.html"
```

同时检查 staged `package.json` 的 `files` 包含 `bin/codex.js` 和 `dist`。

### Tarball Verification

对 `npm pack` 产物检查 tarball contents，至少确认：

```text
package/bin/codex.js
package/dist/index.html
```

如果 Vite build 生成 fingerprinted assets，还应确认 tarball 中存在至少一个 `package/dist/assets/*` 文件。

### Runtime Wiring Verification

Node wrapper 行为应通过轻量自动化或可审计脚本验证：

- 用户未设置 `CODEX_GUI_PACKAGE_ROOT` 时，spawn env 中包含 root package realpath。
- 用户已设置 `CODEX_GUI_PACKAGE_ROOT` 时，spawn env 保留用户值。
- wrapper 不因为 `dist/index.html` 缺失而阻止普通 CLI 启动。

Rust prod static serving 仍由 `codex-rs/gui-host` 测试覆盖。packaging 计划可以复用真实 `codex-gui/dist` 做 smoke，但不应改变 GUI host 的 prod contract。

## Error Boundaries

packaging layer 只负责把默认 package root 和 frontend dist 放进 npm package。它不吞掉或改写 GUI host 的 prod errors。

错误归属如下：

- JavaScript dependency 未安装导致 GUI build 失败：`build_npm_package.py` 失败。
- Vite build 未生成 `codex-gui/dist/index.html`：`build_npm_package.py` 失败。
- npm tarball 缺少 `package/dist/index.html`：packaging verification 失败。
- 用户 override 的 `CODEX_GUI_PACKAGE_ROOT` 指向坏路径：Rust GUI host prod asset 逻辑报错。
- managed npm package 缺少 `dist/`：Rust GUI host 报错，packaging verification 应在发布前捕获。

## Plan Handoff

后续应更新 GUI host roadmap 和 `08` packaging plan，使 `08` 不再只是 e2e verification，而是明确包含 npm packaging implementation。

`08` plan 至少应覆盖：

- root package `files` 加入 `dist`。
- root package staging 构建并复制 `codex-gui/dist`。
- Node wrapper 默认设置 `CODEX_GUI_PACKAGE_ROOT` 且尊重用户 override。
- staged package / npm tarball contents verification。
- 真实 `codex-gui/dist` 经 GUI host prod mode serving 的 smoke。

如果 implementation 需要改变 GUI host runtime contract，应停止并回到 GUI host runtime 设计，而不是在 packaging plan 中修改。
