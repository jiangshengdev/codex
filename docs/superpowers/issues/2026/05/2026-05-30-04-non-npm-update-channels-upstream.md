# P2 · 非 npm 自更新通道仍指向上游，存在「更新覆盖成上游官方版」风险

日期: 2026-05-30
状态: 🟡 部分过期，非 npm 通道仍有上游边界
范围: 批次 6(Fork 发布/自更新)
优先级: P2

## 摘要

npm/bun 更新动作和 doctor GitHub release 探测已指向 fork；但 Brew 更新动作、Homebrew cask 版本源和 standalone installer 仍指向上游 OpenAI / ChatGPT 分发入口。

## 问题

旧记录中的“非 npm 自更新通道仍指向上游”现在需要拆开看：npm/bun 已指向 fork 包，doctor 的通用 GitHub release 探测也已指向 fork 仓库；但 Brew 分支仍执行 upstream cask 名称，Homebrew cask 最新版本仍读取 upstream formulae API，standalone 分支仍重新运行 `chatgpt.com/codex` installer。

## 证据

- 2026-07-09 只读复核：npm/bun 更新动作仍是 fork 包 `@jiangshengdev/codex`：`codex-rs/tui/src/update_action.rs:41-42`。
- `InstallMethod::Brew` 仍映射到 `BrewUpgrade`，命令为 `brew upgrade --cask codex`：`codex-rs/tui/src/update_action.rs:25-33`、`codex-rs/tui/src/update_action.rs:38-44`。
- TUI update-check 的 Homebrew cask latest version URL 仍是 upstream cask API `https://formulae.brew.sh/api/cask/codex.json`，且 `BrewUpgrade` 分支会读取该 URL 的 `version`：`codex-rs/tui/src/updates.rs:57`、`codex-rs/tui/src/updates.rs:72-80`。
- standalone Unix/Windows 更新动作仍重新运行 `https://chatgpt.com/codex/install.sh` / `https://chatgpt.com/codex/install.ps1`：`codex-rs/tui/src/update_action.rs:44-58`。
- doctor 的 GitHub latest release URL 已是 fork 仓库 `https://api.github.com/repos/jiangshengdev/codex/releases/latest`：`codex-rs/cli/src/doctor/updates.rs:26-27`。
- doctor 的 Homebrew cask latest version URL 仍是 upstream cask API `https://formulae.brew.sh/api/cask/codex.json`：`codex-rs/cli/src/doctor/updates.rs:28`、`codex-rs/cli/src/doctor/updates.rs:171-177`。
- doctor 对 Brew 安装读取 Homebrew cask 版本；npm/bun/standalone/other 读取 GitHub release：`codex-rs/cli/src/doctor/updates.rs:148-155`。
- doctor 更新动作标签也显示 npm/bun 为 fork 包、Brew 为 `brew upgrade --cask codex`、standalone 为 `standalone installer`：`codex-rs/cli/src/doctor/updates.rs:138-145`。

## 判断

部分过期但仍需处理。旧判断中“doctor GitHub release 仍指向上游”的边界已经不成立；npm/bun 和通用 GitHub release 探测已是 fork。剩余风险集中在 Brew/Homebrew cask 与 standalone installer：这些路径仍可能把用户带回上游 OpenAI / ChatGPT 分发入口。

## 影响

安装被 `InstallContext` 判定为 Brew 的用户仍可能通过 `brew upgrade --cask codex` 获取 upstream cask；doctor 对 Brew 最新版本的判断也来自 upstream cask API。Standalone 用户触发更新动作时仍会重新运行 upstream ChatGPT installer。npm/bun 用户的更新动作当前不在此风险范围内。

## 后续处理

进入单独设计/计划阶段，明确 fork 对 Brew cask、standalone installer 和 doctor latest-version source 的发布策略；不要在本 issue 内写实现计划。

## 验证记录

- 2026-07-09：只读复核上述代码路径；未运行测试、未联网验证 release/cask 实际内容、未修改实现。

## 历史记录

- 2026-05-30 旧记录：brew、standalone 和 homebrew-cask 自更新通道指向上游；npm/bun 已改成 fork 包 `@jiangshengdev/codex`。本次复核后，doctor GitHub release 探测已确认指向 fork，但 Brew/Homebrew cask 与 standalone installer 残留风险仍成立。
