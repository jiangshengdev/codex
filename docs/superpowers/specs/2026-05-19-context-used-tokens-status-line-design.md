# Context Used Tokens Status Line 设计

## 背景

Codex TUI 现在可以在状态栏显示 `context-used`，例如 `Context 41% used`。这个百分比适合快速判断上下文剩余空间，但它不是直接的 token 数字。用户需要在状态栏里同时看到当前活跃上下文窗口的原始 token 数，用来判断当前请求的上下文规模和潜在成本。

`/status` 卡片已经显示同一类信息：

```text
Context window: 52% left (130K used / 258K)
```

本设计的目标是让状态栏能显示这里的 `130K`，并且与 `/status` 卡片完全一致。

## 目标

新增一个 TUI status line item：

```text
context-used-tokens
```

当用户配置：

```toml
[tui]
status_line = ["model-with-reasoning", "current-dir", "context-used", "context-used-tokens", "fast-mode", "run-state"]
```

状态栏显示类似：

```text
gpt-5.5 high · ~/cnb/codex · Context 41% used · 130K ctx · Fast off · Ready
```

其中 `130K` 必须等于 `/status` 卡片 `Context window` 行里的 `used` 数字。

## 数据语义

`context-used-tokens` 显示当前活跃上下文窗口的原始 token 数，数据源必须与 `/status` 卡片一致：

```text
last_token_usage.tokens_in_context_window()
```

它不使用 `total_token_usage`，不使用 session 累计 token，也不从 `context-used` 百分比反推。

现有 `context-used` 百分比会扣除 `BASELINE_TOKENS` 来表达用户可支配上下文的使用率。`context-used-tokens` 不扣 `BASELINE_TOKENS`，因为它用于展示 raw context token count，更接近成本判断需要的数值。

## 显示规则

显示文本使用现有 compact token formatter：

```text
<format_tokens_compact(value)> ctx
```

示例：

```text
0 ctx
83K ctx
130K ctx
1.26M ctx
12.6M ctx
126M ctx
```

规则：

- 有 token usage 信息时，即使值为 `0`，也显示 `0 ctx`。
- token usage 未知时省略该 segment。
- 颜色和主题样式与 `context-used` 一致，走现有 status line item 样式机制。
- Configure Status Line 中的描述文案为：

```text
Raw context-window tokens for the latest model request
```

## 不改变的行为

本设计不改变：

- `context-used` 的百分比计算和显示。
- `used-tokens` 的 session 累计语义。
- `context-window-size` 的窗口大小显示。
- `/status` 卡片的数据源、文案和格式。
- token usage 数据模型。

## 实现范围

预期改动集中在 TUI status line 表面：

- `StatusLineItem` 增加 `ContextUsedTokens`。
- status line item 描述和配置解析包含 `context-used-tokens`。
- `status_line_value_for_item` 增加渲染分支，读取 `last_token_usage.tokens_in_context_window()` 并格式化为 `<compact> ctx`。
- status line setup/preview 中显示新 item。
- terminal title 不需要新增对应 item，除非后续明确要求。

## 验收标准

- 当 `/status` 显示：

```text
Context window: 52% left (130K used / 258K)
```

并且状态栏启用 `context-used-tokens` 时，状态栏必须显示：

```text
130K ctx
```

- 给定同一份 `TokenUsageInfo`，`/status` 卡片的 `used` 数字和状态栏 `context-used-tokens` 的数字部分必须完全一致。
- `context-used-tokens` 不受 `BASELINE_TOKENS` 影响。
- `context-used-tokens` 不显示 session 累计值，例如不能使用现有 `used-tokens` 的数据源。
- token usage 为 `0` 时显示 `0 ctx`。
- token usage 未知时省略该 segment。

## 测试计划

新增或更新 TUI 测试，覆盖：

- `context-used-tokens` 单独显示 `130K ctx`。
- `context-used` 与 `context-used-tokens` 组合显示，例如 `Context 41% used · 130K ctx`。
- `/status` 卡片和 status line 对同一 `TokenUsageInfo` 产生相同 compact 数字。
- token usage 为 `0` 时显示 `0 ctx`。
- token usage 未知时省略 `context-used-tokens`。
- Configure Status Line 列表包含新 item 和描述文案。
