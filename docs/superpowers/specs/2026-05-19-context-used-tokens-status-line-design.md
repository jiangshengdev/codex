# Context Used Tokens Status Line 设计

## 背景

Codex TUI 现在可以在状态栏显示 `context-used`，例如 `Context 41% used`。这个百分比适合快速判断上下文剩余空间，但它不是直接的 token 数字。用户需要在状态栏里同时看到最近一次模型请求的原始 context-window token 数，用来判断下一次请求大致会继承的上下文规模。

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

`context-used-tokens` 显示最近一次模型请求的原始 context-window token 数，数据源必须与 `/status` 卡片 `Context window` 行的 `used` 数字一致：

```text
last_token_usage.tokens_in_context_window()
```

它不使用 `total_token_usage`，不使用 session 累计 token，也不从 `context-used` 百分比反推。实现时应对齐 `/status` 卡片，而不是复制 bottom pane 在 context window percent 未知时的 fallback 逻辑。

现有 `context-used` 百分比会扣除 `BASELINE_TOKENS` 来表达用户可支配上下文的使用率。`context-used-tokens` 不扣 `BASELINE_TOKENS`，因为它用于展示 `/status` 卡片同源的 raw context token count。

因此 `Context 41% used` 与 `130K ctx` 刻意不可直接换算：前者是扣除 baseline 后的百分比，后者是 raw token 数。这个取舍保持 `context-used-tokens` 与 `/status` 卡片的 `used` 数字完全一致。

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

- 只有当 `/status` 卡片会显示 `Context window` 行时，状态栏才显示 `context-used-tokens`。
- 当 `token_info = Some(info)` 时，必须要求 `info.model_context_window` 已知；此时显示 `info.last_token_usage.tokens_in_context_window()`。
- 当 `token_info = None` 但 `config.model_context_window` 已知时，行为与 `/status` 的默认 usage 一致，显示 `0 ctx`。
- 当无法构造 `/status` 的 `Context window` 行时，省略该 segment。
- `0 ctx` 是有效显示值，不按 `used-tokens` 的“0 时省略”规则处理；它表示在已知 context window 下，当前还没有可计入的最近请求 context token。
- 颜色和主题样式与 `context-used` 一致，走现有 status line item 样式机制。
- `ctx` 是刻意选择的短后缀，表示 context tokens；它比 `tokens` 更短，比裸值更容易识别。
- Configure Status Line 中的描述文案为：

```text
Raw context-window tokens for the latest model request
```

## 不改变的行为

本设计不改变：

- `context-used` 的百分比计算和显示。
- `used-tokens` 的 session 累计语义。
- `context-window-size` 的窗口大小显示。
- `/status` 卡片的渲染本身；新 item 只复用其数据源和 compact formatter。
- token usage 数据模型。

## 实现范围

预期改动集中在 TUI status line 表面：

- `StatusLineItem` 增加 `ContextUsedTokens`。
- status line item 描述和配置解析包含 `context-used-tokens`。
- `status_line_value_for_item` 增加渲染分支：先判断 `/status` 是否会显示 `Context window` 行，再读取同源的 raw used token 值并格式化为 `<compact> ctx`。
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
- 当 `/status` 不显示 `Context window` 行时，状态栏也不显示 `context-used-tokens`。
- `context-used-tokens` 不受 `BASELINE_TOKENS` 影响。
- `context-used-tokens` 不显示 session 累计值，例如不能使用现有 `used-tokens` 的数据源。
- 在 context window 已知且 raw used token 为 `0` 时显示 `0 ctx`。
- 在 context window 未知且无法与 `/status` 的 `Context window` 行对齐时省略该 segment。

## 测试计划

新增或更新 TUI 测试，覆盖：

- `context-used-tokens` 单独显示 `130K ctx`。
- `context-used` 与 `context-used-tokens` 组合显示，例如 `Context 41% used · 130K ctx`。
- `/status` 卡片和 status line 对同一 `TokenUsageInfo` 产生相同 compact 数字。
- `token_info = None` 但 `config.model_context_window` 已知时显示 `0 ctx`，与 `/status` 默认 usage 对齐。
- `token_info = Some(info)` 且 `info.model_context_window` 未知时省略 `context-used-tokens`。
- `context-used` 百分比和 `context-used-tokens` raw 数字不可直接换算，但二者可以并排显示。
- Configure Status Line 列表包含新 item 和描述文案。
