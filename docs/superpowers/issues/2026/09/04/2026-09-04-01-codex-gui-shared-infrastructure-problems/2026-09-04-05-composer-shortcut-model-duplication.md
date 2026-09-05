# Composer 快捷键平台模型重复维护

日期: 2026-09-04
状态: ✅ 已修复
范围: `codex-gui/src/features/composerEditor`, `codex-gui/src/features/composerTurnControl`
优先级: P2

## 摘要

Composer 的按键判断、可见提示与 ARIA 提示已共用同一快捷键模型，消除了重复维护的平台规则；验证范围限定为 Mac。

## 问题

修复前，Editor 用平台判定选择 `meta` 或 `control`，再据此解析 Enter submit intent；turn control 独立执行同一平台判定并生成快捷键提示。它们表达同一个 Composer 产品快捷键，却没有一个同时拥有 event semantics 与 presentation 的领域模型。

这不构成建设全局 platform util 的充分理由。只共享 `isMac` 仍会让行为和提示分别编码，无法关闭漂移风险。

## 证据

当前修复证据：

- 修复提交：`fbfa45f29`（2026-09-05）。
- `codex-gui/src/features/composerEditor/composerShortcuts.ts`: 集中平台选择、Enter intent 解析和 Guide 提示，使用同一修饰键定义产生行为与展示。
- `codex-gui/src/features/composerEditor/ComposerEditor.tsx:91`: 使用共享模型；编辑器 ARIA 与 Enter 判定均读取该模型。
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx:101`: Guide 提示读取共享模型；`:230` 通过 Button 的 `render` 接口将 `aria-keyshortcuts` 传到原生按钮，避免底层 React Aria 过滤该属性。
- `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControlPendingInput.browser.test.tsx:329`: Mac 联动测试同时核对编辑器 ARIA、按钮 ARIA、tooltip 与真实键盘触发的 Guide 提交。

以下为修复前研究基线的历史证据，行号不代表当前源码：

- 研究基线：`f5647bb6aec9641c2346b170d9247a26d915e46e`（`docs/superpowers/research/2026/09/04/2026-09-04-codex-gui-shared-infrastructure-analysis.md`）。
- `codex-gui/src/features/composerEditor/ComposerEditor.tsx:74-89`: editor 在渲染时通过 `primaryModifierForPlatform(navigator.platform)` 取得提交修饰键。
- `codex-gui/src/features/composerEditor/ComposerEditor.tsx:181-194`: 文件内定义 Mac → `meta`、其他平台 → `control`，并维护对应 `Meta+Enter` / `Control+Enter` 字符串和 event 判定输入。
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx:95-101`: turn control 独立读取 `navigator.platform`。
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx:257-261`: 独立生成 Mac 与非 Mac 的 ARIA 和可见快捷键提示。

## 判断

重复维护问题已修复。模型保持 Composer 领域含义，未引入全局平台工具；普通 Enter、Shift+Enter、Guide 和输入法保护沿用原有规则。已完成的自动化验证不代表真实应用验收。

## 修复记录

- 2026-09-05：新增 `composerShortcuts.ts`，删除 editor 与 turn control 的重复快捷键判断。
- 修复测试发现的 Guide 按钮 `aria-keyshortcuts` 未进入 DOM 的问题，保留 HeroUI 按钮原有行为和样式。

## 验证记录

- Level 1：Mac 上 Chromium、Firefox、WebKit 的新增联动测试全部通过；最终重跑 `ComposerTurnControlPendingInput.browser.test.tsx`，69 项通过。此前相关 Input 与 EditorLifecycle 测试的 6 个浏览器文件实例通过；执行范围排除了 Win32 参数用例，未删除既有测试。
- 格式检查、oxlint、ESLint、类型检查和 `git diff --check` 通过。
- 测试输出仍有 React `flushSync` 生命周期警告；测试通过不表示控制台无警告。
- Level 2：缺少当前完整 GUI URL，真实应用验收未执行。
- Level 3：不适用，无需可见桌面验收。
- 按本次确认范围，非 Mac 模拟及实机验证未执行，现有非 Mac 规则保留。

## 影响

快捷键行为和提示由单一来源维护，后续修改无需在两个 feature 中分别编码平台规则；Guide 按钮的无障碍快捷键属性实际进入 DOM。

## 后续处理

本问题的代码修复已完成。真实应用验收保留为未执行记录，不据此宣称完整 GUI 验证；后续若需补验收，使用届时的完整 GUI URL。
