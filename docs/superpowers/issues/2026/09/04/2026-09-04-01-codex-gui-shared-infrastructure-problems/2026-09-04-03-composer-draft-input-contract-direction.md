# Composer draft 与 input payload 共同契约方向不清

日期: 2026-09-04
状态: ✅ 已修复
范围: `codex-gui/src/features/composerEditor`, `codex-gui/src/features/composerInput`, `codex-gui/src/features/composerInputQueue`
优先级: P2

## 摘要

已明确草稿契约由 editor 负责，协议派生的 input payload 与复制逻辑由独立 `composerInput` 模块负责；queue 单向引用两者，editor 不再反向依赖 queue。

## 问题

修复前，draft capture 同时保存 editor draft 和 queue input payload；queue contracts 又直接引用 editor draft、capture 与 restore result。两个 feature 对同一提交、恢复和排队边界都有类型所有权，调用方需要跨 feature 内部路径才能表达一个完整操作。

原问题涉及的双向引用均为 type-only，不能把它写成 JavaScript runtime cycle。问题是共同契约 seam 缺失，而不是运行时初始化顺序故障。

## 证据

- 修复前研究基线（以下两条行号对应此基线）：`f5647bb6aec9641c2346b170d9247a26d915e46e`（`docs/superpowers/research/2026/09/04/2026-09-04-codex-gui-shared-infrastructure-analysis.md`）。
- `codex-gui/src/features/composerEditor/composerDraft.ts:11-29`: editor draft 以 type-only 方式引用 queue 的 `ReadonlyComposerInputPayload`，并将 payload 放入 `ComposerDraftCapture`。
- `codex-gui/src/features/composerInputQueue/composerInputQueueContracts.ts:1-8`: queue contracts 以 type-only 方式引用 editor 的 draft、capture 与 restore result，同时引用本 feature 的 preview 和 input payload。

## 判断

已修复。草稿身份、捕获与恢复仍由 editor 唯一管理，外部生产消费者通过显式公开契约入口引用类型；input payload 继续从协议机械派生。共同契约归属和单向依赖已明确，未新增重复类型或旧路径兼容层。

## 修复记录

- 2026-09-05，本地提交 `9d25af926`（`refactor(codex-gui): clarify composer draft and input ownership`）。
- `codex-gui/src/features/composerInput/composerInputPayload.ts`：从 queue 原样迁移，保留协议类型派生和复制逻辑。
- `codex-gui/src/features/composerEditor/composerEditorContracts.ts`：仅导出原有草稿、捕获和恢复结果类型；Lexical 状态与 WeakMap 存储继续留在 editor 内部。
- queue、会话接口、提交控制层及相关测试已切换引用；editor 与公共输入模块均不再引用 queue。测试 fixture 仍直接调用 editor 的捕获实现来构造真实草稿，不属于生产契约依赖。

## 验证记录

以下为实现阶段已执行结果，本次文档更新未重新运行测试：

- 类型检查、lint、格式检查及 `git diff --check` 通过；独立复核未发现行为改动或遗漏的生产消费者。
- Level 1：相关单元测试 35 个文件、379 项通过；4 个浏览器测试文件在 Chromium、Firefox、WebKit 上共 12 个文件实例、132 项通过，覆盖草稿恢复、待发消息编辑、会话与队列中断路径。
- 浏览器测试输出 3 条 React `flushSync` 控制台提示，未导致测试失败；未将其记为已消除。
- Level 2 / Level 3：本次仅调整内部契约与引用，真实运行和可见桌面验收不适用，未执行。

## 影响

已消除 editor 对 queue 输入类型的反向依赖，并收敛外部草稿类型引用入口。现有输入、排队、草稿身份、恢复回滚和提交后清空保护行为保持不变。

## 后续处理

本 issue 已关闭，无剩余修复任务；跨 feature 的通用 public/internal 依赖治理仍由同组独立 issue 维护。
