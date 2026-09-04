# Composer 快捷键平台模型重复维护

日期: 2026-09-04
状态: 🔴 未修复
范围: `codex-gui/src/features/composerEditor`, `codex-gui/src/features/composerTurnControl`
优先级: P2

## 摘要

Composer 的实际提交按键与可见/ARIA 提示分别读取平台并维护同一 Mac 与非 Mac 判定，存在行为和提示漂移窗口。

## 问题

Editor 用平台判定选择 `meta` 或 `control`，再据此解析 Enter submit intent；turn control 独立执行同一平台判定并生成快捷键提示。它们表达同一个 Composer 产品快捷键，却没有一个同时拥有 event semantics 与 presentation 的领域模型。

这不构成建设全局 platform util 的充分理由。只共享 `isMac` 仍会让行为和提示分别编码，无法关闭漂移风险。

## 证据

- 研究基线：`f5647bb6aec9641c2346b170d9247a26d915e46e`（`docs/superpowers/research/2026/09/04/2026-09-04-codex-gui-shared-infrastructure-analysis.md`）。
- `codex-gui/src/features/composerEditor/ComposerEditor.tsx:74-89`: editor 在渲染时通过 `primaryModifierForPlatform(navigator.platform)` 取得提交修饰键。
- `codex-gui/src/features/composerEditor/ComposerEditor.tsx:181-194`: 文件内定义 Mac → `meta`、其他平台 → `control`，并维护对应 `Meta+Enter` / `Control+Enter` 字符串和 event 判定输入。
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx:95-101`: turn control 独立读取 `navigator.platform`。
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx:257-261`: 独立生成 Mac 与非 Mac 的 ARIA 和可见快捷键提示。

## 判断

问题仍成立，是同一领域语义在两个 feature 文件中的高置信重复。合适边界应保持 Composer 领域含义，而不是降级为全局平台布尔工具。

## 影响

修改提交快捷键时可能只更新 editor 行为或 turn control 提示，导致用户看到的指导与实际按键不一致；ARIA 与可见文本还可能彼此漂移，形成可访问性回归。

## 后续处理

需要进入设计阶段定义单一 Composer shortcut model 的行为和 presentation 责任，再编写计划覆盖 editor event 判定、可见提示、ARIA 文本及相应验证。
