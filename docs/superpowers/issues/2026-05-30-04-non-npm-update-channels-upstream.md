# P2 · 非 npm 自更新通道仍指向上游,存在「更新覆盖成上游官方版」风险

日期:2026-05-30
范围:批次 6(Fork 发布/自更新)
优先级:中(潜在,取决于安装方式判定;当前 fork 仅经 npm 分发)

## 问题

只有 npm/bun 两条自更新通道改成了 fork 包(`@jiangshengdev/codex`),brew / standalone / homebrew-cask 三条通道全部未改,仍指向上游 OpenAI。

- `codex-rs/tui/src/update_action.rs:43` BrewUpgrade → `brew upgrade --cask codex`(上游 cask)
- `codex-rs/tui/src/update_action.rs:48` StandaloneUnix → `curl -fsSL https://chatgpt.com/codex/install.sh | ... sh`
- `codex-rs/tui/src/update_action.rs:57` StandaloneWindows → `irm https://chatgpt.com/codex/install.ps1 | iex`
- `codex-rs/tui/src/updates.rs:66`、`codex-rs/cli/src/doctor/updates.rs:27`
  `HOMEBREW_CASK_API_URL = "https://formulae.brew.sh/api/cask/codex.json"`(上游 cask 版本源)

对照已改对的通道:`update_action.rs:41-42`、`doctor/updates.rs:139-140` 的 npm/bun 已是 `@jiangshengdev/codex`。

## 为何是风险

一旦某用户的安装被 `InstallContext` 判定为 Brew 或 Standalone,自更新动作会拉上游官方 codex 覆盖掉 fork 安装。当前 fork 仅经 npm 分发,触发概率低,故定为潜在风险;但属于「把更新引到上游、覆盖 fork」的明确风险面,与 [[2026-05-30-03-doctor-update-url-points-upstream]] 是同一类半改残留的不同落点。
