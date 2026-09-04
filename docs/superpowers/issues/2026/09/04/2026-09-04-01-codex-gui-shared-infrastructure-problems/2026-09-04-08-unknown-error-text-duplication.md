# `unknown` error 文本转换重复实现

日期: 2026-09-04
状态: 🔴 未修复
范围: `codex-gui/src/features/threadHistory`, `codex-gui/src/features/appShell`
优先级: P3

## 摘要

四个生产使用点重复执行 `error instanceof Error ? error.message : String(error)`，其中三处定义了完全相同的局部 `errorText` 函数。

## 问题

同一个低语义转换规则散落在 history detail、continue-task failure alert、GUI Host connection bridge 和 history list。虽然单处实现很小，但已经形成真实的跨 feature 重复。

该重复只能证明一个窄 helper 候选，不能证明需要扩大 `utils/**` 为万能库，也不能统一不同错误 UI、分类或重试行为。

## 证据

- 研究基线：`f5647bb6aec9641c2346b170d9247a26d915e46e`（`docs/superpowers/research/2026/09/04/2026-09-04-codex-gui-shared-infrastructure-analysis.md`）。
- `codex-gui/src/features/threadHistory/ThreadHistoryDetailContent.tsx:127-129`: 定义局部 `errorText(error: unknown)`。
- `codex-gui/src/features/threadHistory/ContinueTaskFailureAlert.tsx:276-278`: 定义完全相同的局部 `errorText`。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:204-206`: 定义完全相同的局部 `errorText`。
- `codex-gui/src/features/threadHistory/ThreadHistoryListPage.tsx:219-223`: 在 JSX 中内联相同的 `Error.message` / `String(error)` 分支。

## 判断

重复问题仍成立，但优先级低。转换语义目前一致且无已知用户故障；后续是否共享应服从公共 API 准入和命名规则，而不是为消除三行代码单独建设大范围基础层。

## 影响

未来若需要统一处理非 `Error` thrown value、空 message 或错误脱敏，修改可能遗漏部分使用点；但过度抽象也会把错误 presentation、重试和领域分类错误地耦合在一起。

## 后续处理

在公共 API 准入规则明确后复核该转换是否已形成稳定语义；若成立，再进入窄范围设计或计划，只处理文本转换，不合并错误 UI 或领域 failure 模型。
