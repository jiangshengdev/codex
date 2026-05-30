# P1 · `codex doctor` 自更新检测仍指向上游 openai/codex,fork 用户拿错版本比对

日期:2026-05-30
范围:批次 6(Fork 发布/自更新)
优先级:高(fork 半改残留,用户可见的错误版本判定)

## 问题

`doctor/updates.rs` 的 GitHub releases URL 仍写死上游官方仓库,而姊妹文件 `tui/updates.rs` 已改成 fork 仓库 —— 同一个「latest release」概念在两处矛盾,是典型的「半改残留」。

- 上游残留:`codex-rs/cli/src/doctor/updates.rs:26`
  `const GITHUB_LATEST_RELEASE_URL = "https://api.github.com/repos/openai/codex/releases/latest"`
- 已改的姊妹文件:`codex-rs/tui/src/updates.rs:67`
  `const LATEST_RELEASE_URL = "https://api.github.com/repos/jiangshengdev/codex/releases/latest"`
- 影响面:`fetch_latest_version`(`doctor/updates.rs:147-155`)对 `Npm | Bun | Standalone | Other` 四种安装方式**全部**走 `fetch_latest_github_release_version()`(`:157-168`),即都打到上游 URL。

## 为何是风险

fork 用户运行 `codex doctor` 时,「latest version」取的是上游 OpenAI 的最新发布(还会按 `strip_prefix("rust-v")` 解析上游 tag),然后拿 fork 自身版本去和上游版本比对。结果是错误的「有新版本可用 / 当前版本不算旧」判断,把用户注意力引向上游版本号,与 fork 的实际发布脱节。这是本批次唯一一处确定的引用残留。
