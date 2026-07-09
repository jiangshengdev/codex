# P2 · 非 npm 自更新通道仍指向上游，存在「更新覆盖成上游官方版」风险

日期: 2026-05-30
状态: 📏 待复核
范围: 批次 6(Fork 发布/自更新)
优先级: P2

## 摘要

旧记录指出 brew、standalone 和 homebrew-cask 自更新通道仍指向上游；当前代码状态尚未在本 issue 内复核。

## 问题

旧记录显示，只有 npm/bun 两条自更新通道改成了 fork 包 `@jiangshengdev/codex`，brew / standalone / homebrew-cask 三条通道仍指向上游 OpenAI。

## 证据

- 旧记录中的 Brew 通道：`codex-rs/tui/src/update_action.rs:43`，`BrewUpgrade` → `brew upgrade --cask codex`。
- 旧记录中的 Standalone Unix 通道：`codex-rs/tui/src/update_action.rs:48`，`curl -fsSL https://chatgpt.com/codex/install.sh | ... sh`。
- 旧记录中的 Standalone Windows 通道：`codex-rs/tui/src/update_action.rs:57`，`irm https://chatgpt.com/codex/install.ps1 | iex`。
- 旧记录中的 cask 版本源：`codex-rs/tui/src/updates.rs:66`、`codex-rs/cli/src/doctor/updates.rs:27`，`HOMEBREW_CASK_API_URL = "https://formulae.brew.sh/api/cask/codex.json"`。
- 对照旧记录：`update_action.rs:41-42`、`doctor/updates.rs:139-140` 的 npm/bun 已是 `@jiangshengdev/codex`。

## 判断

待复核。文档保留了明确的历史风险面，但当前代码是否仍保持这些路径和常量，需要重新只读核对后再决定是否标为未修复。

## 影响

如果风险仍成立，安装被 `InstallContext` 判定为 Brew 或 Standalone 的用户可能通过自更新动作拉取上游官方 Codex，从而覆盖 fork 安装。旧记录同时说明当前 fork 仅经 npm 分发，触发概率较低。

## 后续处理

先做只读复核：确认当前 `InstallContext` 分支、brew/standalone 更新动作和 cask 版本源是否仍指向上游。若仍成立，再单独进入设计/计划阶段处理 fork 发布通道策略。
