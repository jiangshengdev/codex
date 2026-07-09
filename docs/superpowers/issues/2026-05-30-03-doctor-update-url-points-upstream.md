# P1 · `codex doctor` 自更新检测仍指向上游 openai/codex，fork 用户拿错版本比对

日期: 2026-05-30
状态: ✅ 已修复
范围: 批次 6(Fork 发布/自更新)
优先级: P1

## 摘要

`codex doctor` 的 latest release URL 曾指向上游 `openai/codex`；已在 commit `ca68bf4e2` 改为 fork 仓库。

## 问题

`doctor/updates.rs` 的 GitHub releases URL 曾写死上游官方仓库，而姊妹文件 `tui/updates.rs` 已改成 fork 仓库。同一个 latest release 概念在两处矛盾，属于 fork 发布路径的半改残留。

## 证据

- 原始上游残留：`codex-rs/cli/src/doctor/updates.rs:26`，`const GITHUB_LATEST_RELEASE_URL = "https://api.github.com/repos/openai/codex/releases/latest"`。
- 当时已改的姊妹文件：`codex-rs/tui/src/updates.rs:67`，`const LATEST_RELEASE_URL = "https://api.github.com/repos/jiangshengdev/codex/releases/latest"`。
- 原始影响面：`fetch_latest_version`(`doctor/updates.rs:147-155`) 对 `Npm | Bun | Standalone | Other` 四种安装方式全部走 `fetch_latest_github_release_version()`(`:157-168`)。
- 修复复核记录：`GITHUB_LATEST_RELEASE_URL` 已改为 `jiangshengdev/codex`(`doctor/updates.rs:26-27`)，已 grep 复核工作区为该值。
- 2026-07-09 当前代码补证：`GITHUB_LATEST_RELEASE_URL` 仍指向 `https://api.github.com/repos/jiangshengdev/codex/releases/latest` (`codex-rs/cli/src/doctor/updates.rs:26`)。
- 2026-07-09 当前代码补证：`fetch_latest_version` 中非 Brew 安装方式仍走 GitHub latest release probe，因而上述常量仍覆盖 `Npm | Bun | Standalone | Other` 路径 (`codex-rs/cli/src/doctor/updates.rs:148`)。

## 判断

已修复。`codex doctor` latest release 比对不再指向上游 OpenAI 仓库。

## 修复记录

- 2026-05-30，commit `ca68bf4e2`：`GITHUB_LATEST_RELEASE_URL` 改为 `jiangshengdev/codex`。
- 记录显示该提交仅改此一行常量。

## 影响

修复前 fork 用户运行 `codex doctor` 时，latest version 取自上游 OpenAI 最新发布，并按上游 tag 解析后与 fork 自身版本比较，可能给出错误的更新判断。

## 后续处理

同类风险仍应在 `2026-05-30-04-non-npm-update-channels-upstream.md` 中复核；该文件仅记录 `codex doctor` GitHub latest release URL 的已修复结论。
