# `unknown` error 文本转换重复实现

日期: 2026-09-04
状态: ✅ 已修复
范围: `codex-gui/src/features/threadHistory`, `codex-gui/src/features/appShell`
优先级: P3

## 摘要

四个生产文件已统一调用 `codex-gui/src/text/errorText.ts`，保留原有错误文本、诊断拼接和重试行为。

## 问题

修复前，同一个低语义转换规则散落在 history detail、continue-task failure alert、GUI Host connection bridge 和 history list。虽然单处实现很小，但已形成真实的跨 feature 重复。

该重复只能证明一个窄 helper 候选，不能证明需要扩大 `utils/**` 为万能库，也不能统一不同错误 UI、分类或重试行为。

## 证据

- `codex-gui/src/text/errorText.ts:1`: 唯一共享转换函数，原样保留 `error instanceof Error ? error.message : String(error)`。
- `codex-gui/src/features/threadHistory/ThreadHistoryDetailContent.tsx:12`、`ContinueTaskFailureAlert.tsx:5`、`ThreadHistoryListPage.tsx:14` 与 `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:15`: 四个文件直接导入共享函数，原有局部及内联实现已移除。

以下为原研究基线的历史证据，行号不代表修复后的代码：

- 研究基线：`f5647bb6aec9641c2346b170d9247a26d915e46e`（`docs/superpowers/research/2026/09/04/2026-09-04-codex-gui-shared-infrastructure-analysis.md`）。
- `codex-gui/src/features/threadHistory/ThreadHistoryDetailContent.tsx:127-129`: 定义局部 `errorText(error: unknown)`。
- `codex-gui/src/features/threadHistory/ContinueTaskFailureAlert.tsx:276-278`: 定义完全相同的局部 `errorText`。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:204-206`: 定义完全相同的局部 `errorText`。
- `codex-gui/src/features/threadHistory/ThreadHistoryListPage.tsx:219-223`: 在 JSX 中内联相同的 `Error.message` / `String(error)` 分支。

## 判断

该重复问题已修复。共享函数沿用现有 `src/text/` 目录，不依赖 feature、React 或协议；不同调用方继续拥有各自错误 UI、领域分类和重试逻辑。公共 API 的全局治理仍由对应独立 issue 跟踪。

## 修复记录

- 2026-09-05，代码提交：`1ed8d8388`（`refactor(gui): share unknown error text conversion`）。
- 新增一个共享函数，接入四个生产文件；空 message、非 `Error` 值的转换和诊断拼接均保持原样。

## 验证记录

- `pnpm run type-check`、`pnpm run lint`、`pnpm run format:oxfmt` 与 `git diff --check` 均通过；前端命令通过 fnm 管理的 Node/pnpm 执行。
- Level 1：`test:browser:parallel --run` 定向运行 `ThreadHistoryDetailRead.browser.test.tsx`、`ThreadHistoryDetailContinuation.browser.test.tsx`、`ThreadHistoryListPage.browser.test.tsx`；Chromium、Firefox、WebKit 共 9 个测试文件实例、141 项测试全部通过，无类型错误。
- Level 2、Level 3：本次为保持行为的内部文本转换抽取，不涉及真实运行时集成或可见桌面状态变化，不适用且未执行。

## 影响

四个文件的文本转换已只有一个维护入口，消除了未来修改时遗漏部分重复实现的风险；现有用户可见行为保持不变。

## 后续处理

本 issue 已关闭。若未来需要改变非 `Error` 值、空 message 或错误脱敏规则，应另行明确行为需求；不属于本次修复范围。
