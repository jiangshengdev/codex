# Composer React 层混杂领域事务与可访问性适配

日期: 2026-08-24
状态: 🔴 仍需处理
范围: `codex-gui` Composer pending-input / turn control React boundary
优先级: P2

## 摘要

Composer 的 React 组件同时承担 pending-input 事务状态机、跨 owner/revision 协调、命令编排、焦点恢复和底层可访问性 DOM 适配，领域操作与展示边界没有清晰分离。

## 问题

`ComposerPendingInputDrawer` 不只是渲染 drawer。它在组件内部保存打开 owner、关闭 session、分页 revision、编辑 reservation、操作完成 hold、失败分类和焦点目标，并直接驱动 save、cancel、delete、move、refresh 等事务。组件因而同时负责领域状态迁移、并发结果解释和用户界面生命周期。

`ComposerTurnControl` 又在 React 层交叉读取 Redux runtime、queue external store、skill catalog 和 editor snapshot，重新组合连接可用性、线程身份、提交资格和 active-turn 行为，再直接发起 submit、steer、recover 与 interrupt 命令。`SkillTypeaheadPlugin` 还直接同步 Lexical root、anchor 与 ARIA 属性，并用 DOM listener 和 `MutationObserver` 维持 combobox 适配。

这些职责各自有存在理由，但现在由 React 组件共同承载并彼此耦合。问题不在文件行数，也没有证据表明 HeroUI 使用错误；问题是 operation/session 领域状态、React 展示生命周期和可访问性适配的责任边界混杂。

## 证据

- `codex-gui/src/features/composerTurnControl/ComposerPendingInputDrawer.tsx:95-114`：组件同时持有 open/close owner、分页、编辑 session、alert、move announcement、revision suppression、completion hold、editor validity 与多组焦点 ref。
- `codex-gui/src/features/composerTurnControl/ComposerPendingInputDrawer.tsx:152-183`：渲染过程中派生外部关闭状态，并在组件内维护 management completion 临界区。
- `codex-gui/src/features/composerTurnControl/ComposerPendingInputDrawer.tsx:233-280`：组件直接解释 edit reservation 的 save/cancel 结果，分类 owner gone、target invalidated、session invalidated 与 invalid input，并决定刷新、关闭和焦点恢复。
- `codex-gui/src/features/composerTurnControl/ComposerPendingInputDrawer.tsx:296-350`：drawer presence 回调和 controller subscription 同时清理 session 状态、追踪 owner 身份与 pending-input 结果，并安排关闭及焦点迁移。
- `codex-gui/src/features/composerTurnControl/ComposerPendingInputDrawer.tsx:383-439`：组件拥有 edit 的 preparing/active phase 转换，建立 reservation，并处理 stale、not manageable、invalid draft 与 owner gone。
- `codex-gui/src/features/composerTurnControl/ComposerPendingInputDrawer.tsx:450-488`：delete 操作在组件内组合 revision、结果分类、分页刷新、completion hold 与删除后的焦点恢复。
- `codex-gui/src/features/composerTurnControl/ComposerPendingInputDrawer.tsx:517-559`：move 操作在组件内组合事务执行、revision refresh、fallback、刷新抑制和失败提示状态。
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx:83-123`：同一组件交叉订阅 queue、skill catalog、editor snapshot 与 Redux runtime，并据此重新计算 connection、thread match、skill validity 和 send eligibility。
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx:153-214`：submit 路径再次计算资格，区分 ordinary/guide，直接调用 queue controller，并用 React state/ref 与 microtask 管理提交临界区。
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx:323-381`：组件内的 focus-visible hook 直接监听 pointer、keyboard 与 focus 事件，维护输入模态和展示状态。
- `codex-gui/src/features/composerEditor/SkillTypeaheadPlugin.tsx:84-100`：plugin 直接注册 Lexical root listener、维护 composition DOM listener，并切换 combobox root 属性。
- `codex-gui/src/features/composerEditor/SkillTypeaheadPlugin.tsx:240-289`：菜单通过 DOM 属性同步和 `MutationObserver` 维持 `aria-controls`、`aria-activedescendant` 与 menu id。
- `codex-gui/src/features/composerEditor/SkillTypeaheadPlugin.tsx:480-505`：plugin 直接设置 `aria-expanded`、`role` 和 `aria-haspopup`，说明可访问性适配也由组件层自行拥有。
- 本轮未运行测试；以上结论来自当前源码静态核对。

## 判断

该结构性问题当前仍成立，适合作为独立重构边界，但现有证据不能推出“整个 Composer 应重写”，也不能把文件长度或 HeroUI 组件选择当作根因。需要先界定哪些 operation/session 状态属于可独立验证的领域 owner，哪些焦点和 ARIA 行为必须继续留在 React/Lexical 适配层。

## 影响

- pending-input 的事务正确性、revision 并发、owner 生命周期和焦点行为被绑定在同一组件状态图中，局部修改容易产生跨职责回归。
- submit/guide/recover/stop 的可用性依赖多个状态来源在 render 时重新组合，增加证明一致性和失败恢复行为的难度。
- 领域状态迁移与 DOM/可访问性副作用交织，使测试必须跨越 controller、React 生命周期和浏览器行为，降低问题定位与复用能力。
- 如果仅按文件行数机械拆分，可能把同一状态机分散到更多组件，隐藏而不是消除责任边界问题。

## 后续处理

需要单独进入设计阶段，先追踪 pending-input 与 turn-control 的 operation/session 生命周期、权威状态和失败恢复边界，再确定 React 展示层与 Lexical/ARIA 适配层应保留的职责。本 issue 不包含重构设计、实施计划或代码改动。
