# Fork npm Update Channel 设计

## 背景

当前 fork 已经重新发布 npm 包，`codex-cli/package.json` 的主包名也是
`@jiangshengdev/codex`。但 TUI 启动时的更新提示仍显示上游 release notes，并且更新命令仍指向
上游 npm 包：

```text
Release notes: https://github.com/openai/codex/releases/latest
Update now (runs `npm install -g @openai/codex`)
```

这会导致 fork 用户看到错误的更新来源；如果选择更新，也会安装上游包，而不是 fork 包。

## 目标

- npm/bun 安装的 fork build 只根据 fork release channel 判断更新。
- 更新提示中的 release notes 指向 `jiangshengdev/codex`。
- 更新命令安装 `@jiangshengdev/codex`。
- 保留现有双校验语义：先读取 GitHub latest release，再确认 npm `latest` 已经发布并带有可安装的
  dist metadata。
- 只修改影响更新检查、更新提示和 npm/bun 更新执行路径的最小硬编码字符串。

## 非目标

- 不全局替换 `openai`。
- 不改 brew 更新通道；当前 fork 暂不发布 Homebrew cask。
- 不改 standalone installer URL。
- 不改 `codex doctor` 的更新诊断。
- 不改 release workflow、CNB 配置、同步脚本或上游仓库判断。
- 不改普通文档、README、历史说明或不参与更新路径的测试 fixture。
- 不把 package name、repo owner 或 release URL 提取成新常量，也不新增配置项。
- 不从 `codex-cli/package.json` 在运行时读取更新来源。

## 已确认选择

采用直接修改硬编码字符串的最小方案，不做抽象层或统一 identity 模块。

保留现有 npm/bun 更新逻辑：

1. 从 GitHub latest release API 读取 latest tag。
2. 将 `rust-vX.Y.Z` 解析成 `X.Y.Z`。
3. 从 npm registry 读取 package metadata。
4. 要求 npm `dist-tags.latest` 等于 GitHub latest version。
5. 要求该 npm version 带有非空 `dist.tarball` 和 `dist.integrity`。
6. 只有双校验通过，才缓存 latest version 并在后续启动中显示更新提示。

## 设计

### 1. GitHub latest release 来源

`codex-rs/tui/src/updates.rs` 的 latest release API 只在 npm/bun 更新检查路径中使用。将当前 URL：

```text
https://api.github.com/repos/openai/codex/releases/latest
```

直接改为：

```text
https://api.github.com/repos/jiangshengdev/codex/releases/latest
```

不改变 release tag 解析规则。fork 仍应使用 `rust-vX.Y.Z` tag 作为 release version source。

### 2. npm package metadata 来源

`codex-rs/tui/src/npm_registry.rs` 的 package metadata URL 从上游包改为 fork 包：

```text
https://registry.npmjs.org/@jiangshengdev%2fcodex
```

`ensure_version_ready(...)` 的语义保持不变。它仍只检查 `latest` dist-tag、version entry、tarball 和
integrity，不新增 package owner 或 tarball host 检查。

测试 fixture 中如果只用于 npm metadata 示例，可以把 tarball 示例同步改成 fork 包名，避免更新路径测试继续展示上游包名。

### 3. npm/bun update command

`codex-rs/tui/src/update_action.rs` 中仅修改 npm/bun 分支：

```text
npm install -g @jiangshengdev/codex
bun install -g @jiangshengdev/codex
```

brew 和 standalone 分支保持原样：

```text
brew upgrade --cask codex
curl -fsSL https://chatgpt.com/codex/install.sh | sh
irm https://chatgpt.com/codex/install.ps1|iex
```

原因是当前 fork 只维护 npm 发布路径，暂不发布 brew cask，也没有 fork standalone installer。

### 4. TUI release notes URL

只修改更新提示中用户可见的 release notes URL：

```text
https://github.com/jiangshengdev/codex/releases/latest
```

覆盖两个 TUI surface：

- update modal：`codex-rs/tui/src/update_prompt.rs`
- history/update notice：`codex-rs/tui/src/history_cell/notices.rs`

不修改与更新提示无关的 `github.com/openai/codex` 文本。

### 5. 缓存行为

不修改 `version.json` 结构。缓存仍包含：

```text
latest_version
last_checked_at
dismissed_version
```

这个设计接受一个已知行为：已经缓存过上游 latest version 的本机，可能会在缓存刷新前继续显示旧版本。处理方式是运维/本地手动删除 `~/.codex/version.json`，或等待现有 20 小时刷新周期。

不为这次改动新增 cache source id，因为这会扩大 schema 和迁移范围，而目标只是修正 fork 发布通道的硬编码来源。

## 实现范围

预期只修改这些文件：

- `codex-rs/tui/src/updates.rs`
- `codex-rs/tui/src/npm_registry.rs`
- `codex-rs/tui/src/update_action.rs`
- `codex-rs/tui/src/update_prompt.rs`
- `codex-rs/tui/src/history_cell/notices.rs`
- `codex-rs/tui/src/snapshots/codex_tui__update_prompt__tests__update_prompt_modal.snap`
- `codex-rs/tui/src/chatwidget/snapshots/codex_tui__chatwidget__tests__update_popup.snap`

如果 `update_action.rs` 或 `npm_registry.rs` 中已有测试断言包含上游包名，只更新这些直接覆盖更新路径的断言。

## 验收标准

当当前版本低于 fork latest release，且 `@jiangshengdev/codex` npm `latest` 已经等于该 release version 时：

- TUI update modal 显示 fork release notes URL。
- TUI update modal 的 update command 显示 `npm install -g @jiangshengdev/codex` 或
  `bun install -g @jiangshengdev/codex`。
- 选择 update 时执行的命令安装 fork npm 包。
- npm/bun 更新检查不再查询 `@openai/codex` package metadata。
- npm/bun 更新检查不再查询 `openai/codex` latest release API。

当 brew 或 standalone 安装上下文触发更新动作时：

- brew command 保持 `brew upgrade --cask codex`。
- standalone installer URL 保持现状。

## 验证

Rust 代码修改后运行：

```sh
cd /Users/jiangsheng/cnb/codex/codex-rs
just fmt
cargo test -p codex-tui
```

本设计不要求运行完整 workspace test，也不要求发布 npm 包。实际发布前可单独验证
`@jiangshengdev/codex` 的 npm `latest` dist-tag 是否等于 fork GitHub latest release 的版本号。
