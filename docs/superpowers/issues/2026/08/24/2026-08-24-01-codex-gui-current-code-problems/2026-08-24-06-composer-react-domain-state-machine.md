# Composer React 层混杂领域事务与可访问性适配

日期: 2026-08-24
状态: ✅ 已修复
范围: `codex-gui` Composer pending-input / turn control React boundary
优先级: P2

## 摘要

Composer 中真正属于应用会话的 pending-input 事务和 turn 命令编排已经移出 React；React 现在只保留展示生命周期、HeroUI/Lingui、editor attachment、DOM 焦点与 ARIA 等平台适配职责。

## 问题

修复前，`ComposerPendingInputDrawer` 在 React state/ref 中同时维护 owner、reservation、completion hold、结果分类和焦点时序；`ComposerTurnControl` 也直接维护提交重入、capture 结果解释和 microtask 解锁。应用事务与 React 生命周期因此必须一起推理。

原 issue 还把 `SkillTypeaheadPlugin` 的 Lexical/DOM/ARIA 同步列为“领域混杂”证据。后续设计核对确认：这些职责本来就是平台 adapter，不属于应迁出的领域状态。真正需要修复的是 pending-input 会话与 turn command 临界区仍由 React 拥有。

## 证据

- `codex-gui/src/features/composerTurnControl/composerPendingInputSession.ts:83-155`：`ComposerPendingInputSession` 暴露可渲染 snapshot 和语义 command，统一拥有 open/closing、编辑、管理操作、presence、effect 与 teardown 边界。
- `codex-gui/src/features/composerTurnControl/composerTurnApplication.ts:49-72`：`ComposerTurnApplication` 统一投影 Send/Guide/Recover/Stop，并拥有 submit command 临界区与 teardown。
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx:50-91`：React 创建并订阅两个 Module，只把当前 session/editor facts 投影为 view。
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx:113-139`：React 只负责 adapter 生命周期和转发 submit intent，不再自行解释 command 结果或维护提交锁。
- `codex-gui/src/features/composerTurnControl/ComposerPendingInputDrawer.tsx:68-82`：Drawer 把当前事实交给 session，并将 HeroUI presence end 回报给 Module。
- `codex-gui/src/features/composerTurnControl/ComposerPendingInputDrawer.tsx:99-132`：Module 发出语义 focus effect，React 只负责映射到真实 DOM ref 并消费 effect。
- `codex-gui/src/features/composerTurnControl/__tests__/composerPendingInputSession.test.ts:153-200`：单测覆盖同 owner 跨 revision、owner replacement，以及 projection unavailable 时浏览只读、编辑关闭且不结算 reservation。
- `codex-gui/src/features/composerTurnControl/__tests__/composerTurnApplication.test.ts:280-350`：单测覆盖旧 microtask 不得解锁新 owner generation，以及 teardown 后拒绝旧命令。
- `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx:846-986`：三浏览器纵向测试覆盖 StrictMode replay 后仍可提交/打开 Drawer，以及真实 unmount 只 teardown 一次且不保存或取消 active reservation。

## 判断

该结构性问题已经修复。pending-input 应用会话由 `ComposerPendingInputSession` 拥有，turn 操作编排由 `ComposerTurnApplication` 拥有；React 不再持有原 issue 指出的 reservation、owner、completion、结果分类或 submit latch 状态。

Lexical/DOM/ARIA 同步继续留在 React/Lexical adapter，这是正确边界，不是未修复残留。此次修复也没有引入 Redux mirror、第二套 session identity、兼容双路径或用户可见行为变化。

## 修复记录

- `36a7725d9`：新增 `ComposerTurnApplication`。
- `123eef1ca`：新增 `ComposerPendingInputSession`。
- `7672469ea`：React/HeroUI adapter 切换到两个应用 Module。
- 后续独立修正提交闭环 microtask、session authority、editor attachment/detach、close failure、move status、replay attachment 和真实 unmount 覆盖；最终功能状态为 `dc06b9092081d0d6c070c732a9e6a6f9414b5e08`。

## 验证记录

- `pnpm run ci` 通过：53 个单测文件、780 项测试。
- `pnpm run test:browser:parallel` 通过：Chromium、Firefox、WebKit 共 54 个文件、810 项测试。
- `pnpm run test:browser:sequential` 通过：9 个文件、21 项测试。
- 两次独立代码与边界审计均未发现可操作问题。

## 影响

- pending-input 事务和 turn command 临界区现在可脱离 React 单独验证，owner/revision、旧 callback 和 teardown 失败域更清晰。
- React 仍负责真实 presence、焦点和 ARIA 平台行为，但只消费语义 view/effect，不再复制应用状态机。
- 用户可见的提交、引导、恢复、停止、pending-input 管理和静默拒绝语义保持不变。

## 后续处理

本 issue 已完成，无剩余处理项。后续若调整 Composer 产品行为、Lexical/ARIA adapter 或底层 queue/session 权威语义，应作为新的独立问题处理。
