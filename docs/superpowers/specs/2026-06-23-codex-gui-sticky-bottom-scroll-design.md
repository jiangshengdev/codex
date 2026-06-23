# codex-gui 聊天贴底滚动设计

## 目标

在 `codex-gui` 聊天过程中实现贴底滚动：如果用户已经在页面底部，初始 attach 内容加载或后续新消息出现后，页面继续保持在底部；如果用户已经向上滚动查看历史，不强制跳回底部。

本设计只处理滚动行为。不改变 transcript reducer、projection 数据模型、消息 materialization 规则或 composer 交互。

## 已确认决策

- 滚动范围使用页面级滚动，即 `document.scrollingElement`。
- 贴底状态使用底部 sentinel / `IntersectionObserver` 思路维护。
- 触发范围覆盖初始 attach snapshot 和 live 新消息。

## 当前结构

当前聊天页面没有独立 transcript 滚动容器：

- `AppShell` 的 `main` 提供页面主体、外层 padding 和底部留白。
- `CommittedTranscriptSurface` 渲染 committed transcript 内容，但没有 `overflow-y` 或内部滚动状态。
- `ComposerTurnControl` 固定在视口底部。

因此“页面底部”应按文档滚动容器判断，而不是引入新的 transcript 内部滚动面板。

## 行为设计

贴底状态表示用户当前仍在跟随最新内容。实现需要满足：

- 页面初始内容、attach snapshot 或 live 新消息导致内容增长时，如果变化前用户处于贴底状态，则在内容渲染后滚动到底部 sentinel。
- 如果用户向上滚动，底部 sentinel 离开可见区域，贴底状态变为 false，后续新消息不抢滚动位置。
- 如果用户手动滚回底部，底部 sentinel 再次可见，贴底状态恢复为 true，后续内容增长继续跟随底部。
- 滚动动作应使用页面级滚动容器，不创建 transcript 内部滚动容器。

## UI 边界

实现应放在 UI 层，优先由 `AppShell` 或一个小的 UI hook 拥有滚动逻辑。`CommittedTranscriptSurface` 可以在内容末尾渲染一个空的 bottom sentinel，供滚动逻辑观察和定位。

推荐边界：

- `CommittedTranscriptSurface` 保持负责 transcript DOM 结构，并暴露或渲染末尾 sentinel。
- `AppShell` 或同级 hook 负责观察 sentinel、维护贴底状态、响应内容增长后的滚动。
- transcript reducer 继续只负责 committed transcript 状态，不加入视口、滚动或 DOM 状态。

这个边界让滚动行为跟页面布局保持在一起，也避免把浏览器 DOM 行为混进 Redux state。

## 触发信号

触发信号需要能代表 committed transcript 内容增长或重建：

- attach snapshot 接受后，baseline transcript 渲染完成。
- live `itemCompleted` 让 committed transcript 新增或更新可见内容。

实现时可以从 transcript selector 派生一个轻量 revision key，例如 turn id、chunk id、chunk revision 或 committed entry 数量组合。该 key 只用于触发布局后的滚动检查，不改变状态模型。

滚动应在 React 完成 DOM 更新后执行，避免读取旧的 `scrollHeight` 或滚动到旧位置。

## 非目标

- 不新增 transcript 内部滚动容器。
- 不改变 composer fixed bottom 布局。
- 不改变初始 projection attach、live event buffering 或 transcript materialization 语义。
- 不在用户向上查看历史时自动跳到底。
- 不安装或引入新依赖。
- 不实现“新消息”浮动提示、未读计数或“回到底部”按钮。

## 测试设计

核心行为需要 browser test，因为 jsdom 不能可靠验证真实布局滚动。

优先在 `codex-gui/src/__tests__/App.browser.test.tsx` 增加覆盖：

- 当页面已贴底时，attach snapshot 渲染长 transcript 后保持底部。
- 当页面已贴底时，live 新消息出现后保持底部。
- 当用户向上滚动后，live 新消息出现不会强制跳到底，但消息仍正常渲染。

可以复用现有 projection fixtures 和 App browser test support。测试应直接观察 `document.scrollingElement` 的滚动位置和可见消息，而不是依赖 HeroUI DOM 细节。

如实现抽出纯 helper，可以补充小范围单元测试；但单元测试不能替代 App browser test。

## 验证

实现计划阶段应至少包含：

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser -- src/__tests__/App.browser.test.tsx
pnpm run type-check
```

如果实现只触及 App/browser test 和 UI hook，完整 `pnpm run ci` 可作为后续整体验证，不作为设计阶段动作。
