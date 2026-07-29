# Chat Shell Style Design

日期: 2026-06-17
状态: 设计草案, 待确认
范围: YOLO single-session chat GUI performance v2 的 App shell、组件库和样式边界

## 目标

本设计定义 Performance v2 的第四块落地边界: 把 `App` 从早期 host debug 页面收敛为 production
chat shell, 移除可见 `GUI host` 调试面板, 并明确 committed transcript surface 的组件库和 CSS
策略。

本设计建立在 `03-committed-transcript-surface-design.md` 之上。`03` 负责 committed transcript
的 bounded selector 和 React component boundary; 本设计只负责 `App` shell、可见页面结构、样式组织
和正常 host 状态的展示边界。

本设计不是实施计划, 不定义任务顺序、checkbox、测试命令或提交策略。

## 已确认决策

1. 移除 `App` 中可见的 `GUI host` debug 面板。
2. 不再展示 `status`、`attached`、`events` 和 `last event` 这组调试字段。
3. `App` 首屏采用单栏 transcript 主体, `CommittedTranscriptSurface` 是本阶段唯一的主 UI 区域。
4. 沿用现有 HeroUI v3、`@heroui/styles` 和 Tailwind v4, 不引入新组件库或新样式依赖。
5. 正常 host / connection 状态不进入 production UI, 只保留内部状态和测试信号。
6. 本阶段只保留 committed empty state, 不新增正式 loading / error UI。
7. 样式以组件内 Tailwind 为主, 少量稳定语义 class 只用于测试 hook 或明确组件边界。

## 与既有设计的关系

本设计不修改 `00-overall-design.md` 的 performance v2 总目标, 也不修改 `02` / `03` 已经定义的
transcript facts owner、selector 契约或 committed transcript component boundary。

边界关系:

- `02-committed-transcript-state-cleanup-design.md` 负责 `transcriptState` facts owner;
- `03-committed-transcript-surface-design.md` 负责删除 `chatTextModel` 并建立 bounded committed
  transcript surface;
- 本设计负责 `App` shell 和样式策略, 让 `CommittedTranscriptSurface` 成为首屏主 UI;
- 后续 active tail、streaming、running activity 和真实 windowing 仍需要独立设计。

## 范围

本设计覆盖:

- `App` 如何保留 host connection / projection ingress 职责, 但移除可见 debug panel;
- `CommittedTranscriptSurface` 如何成为 `App` 的单栏主 UI;
- 正常 host / connection 状态如何作为内部状态或测试信号保留;
- committed empty state 的最小 production UI 语义;
- HeroUI v3、`@heroui/styles` 和 Tailwind v4 的使用边界;
- 组件内 Tailwind 与稳定语义 class 的分工。

本设计不覆盖:

- `transcriptState` 状态结构或 selector 契约变更;
- `chatTextModel` 删除策略;
- active tail facts owner;
- assistant streaming、running tool、hook、plan、reasoning 的即时展示;
- connection error 的正式用户可见 UI;
- loading UI;
- debug console、可展开 host inspector 或开发者面板;
- 真实 virtualization / windowing 选型和滚动测量;
- 新组件库选型、组件库替换或新增样式依赖;
- app-server projection protocol 变更。

## App shell

`App` 继续负责 GUI host connection、launch params、projection ingress 和 Redux dispatch。这些职责是
应用 shell 的内部连接行为, 不是 production chat surface 的可见布局。

`App` 的可见布局应收敛为单栏 transcript 主体:

```text
App
  -> main[data-gui-host-status]
      -> CommittedTranscriptSurface
```

`main` 可以继续暴露 `data-gui-host-status` 或等价稳定测试 hook。这个 hook 用于 browser tests
验证 host connection 状态, 不能重新形成用户可见 debug sidebar。

## 旧 GUI host 面板

旧 `GUI host` 面板属于开发期调试 UI, 不是 production chat shell。以下字段不再作为页面内容展示:

```text
GUI host
status
attached
events
last event
```

`connected`、`attached`、`received event`、`eventCount`、`lastEventType` 等正常 host 状态只能作为
内部状态、日志输入或测试信号存在。Production UI 不展示正常连接进度, 也不展示 event counter。

如果后续需要用户可见的 connection error 或 reconnect 状态, 必须单独回到设计层定义正式 error UI。
本阶段不能把旧 debug panel 改名为 error UI 或 status UI。

## Committed transcript 主体

`CommittedTranscriptSurface` 是本阶段唯一的主 UI 区域。它仍遵守 `03` 的 bounded component
boundary:

```text
CommittedTranscriptRoot
  -> CommittedTranscriptGlobalStatus
  -> CommittedTranscriptTurnList
      -> CommittedTranscriptTurn
          -> CommittedTranscriptChunk
              -> CommittedTranscriptEntry
```

本设计不要求改变 `03` 的 selector 契约, 也不允许通过 `App` 或 shell helper 重新聚合完整
transcript tree。`App` 只负责承载 surface, 不读取 `snapshotTurns + eventBuffer`, 不消费
`selectThreadTimelineMaterials`, 不解释 projection event 内容。

## Empty state

本阶段没有 committed messages 时展示一个简洁的 committed empty state。Empty state 只表达
"当前没有 committed transcript 内容", 不表达 host loading、connection progress 或 app-server
协议状态。

本阶段不新增正式 loading UI 或 connection error UI。连接中、attached、received event 这些正常状态
不产生用户可见内容。连接错误如果必须用户可见, 应作为后续 error UI 设计处理。

## 组件库和样式策略

本阶段沿用 `codex-gui` 现有前端栈:

- HeroUI v3;
- `@heroui/styles`;
- Tailwind v4;
- 现有 theme class / `data-theme` 入口。

设计不引入新组件库、不替换 HeroUI、不新增样式依赖, 因此也不应触发 lockfile 变化。

样式组织以组件内 Tailwind class 为主。布局、间距、颜色、字体和密度控制应贴近组件边界。少量
`committed-transcript-*` 语义 class 可以保留, 但用途限定为测试 hook、稳定组件边界或迁移期识别,
不能成为新的事实模型或完整样式系统。

HeroUI 组件只用于本阶段确实需要的正式交互控件或状态组件。当前 committed-only surface 没有按钮、
弹层或输入控件需求时, 可以优先使用语义 HTML + Tailwind。后续如果引入状态条、操作按钮或弹层,
应继续使用现有 HeroUI v3 模式, 不新增第二套组件系统。

## 测试契约

测试应证明 shell 和样式边界, 不复制旧 debug UI 行为:

- `App` 不再渲染可见 `GUI host` debug 面板;
- 页面中不再出现可见的 `status`、`attached`、`events`、`last event` 调试字段;
- host connection 的正常状态只通过内部状态或稳定测试 hook 验证;
- `CommittedTranscriptSurface` 是 `App` 的主 UI;
- empty committed transcript 渲染简洁 empty state;
- 测试不新增 loading / error UI 断言;
- 测试不要求新组件库、新样式依赖或 lockfile 变化。

## 不变量

本设计完成后应满足:

- `App` production layout 是单栏 transcript 主体;
- `App` 不包含可见 host debug sidebar;
- 正常 host / connection 状态不进入 production UI;
- host connection / projection ingress 逻辑仍保留;
- committed transcript surface 不通过 shell 重新 materialize 完整 transcript tree;
- 本阶段不新增组件库、样式依赖或 lockfile 变化;
- CSS import order 继续保持 Tailwind 在前、`@heroui/styles` 在后;
- committed transcript surface 样式以组件内 Tailwind 为主, 语义 class 只作为稳定 hook 或组件边界;
- active tail、streaming、running activity、loading UI、connection error UI 和真实 windowing 仍是
  后续设计范围。

## 后续设计

本设计之后仍需要独立设计:

- active tail facts owner: 覆盖 running / streaming / transient transcript-like items;
- production windowing / virtualization: 在 committed chunk boundary 上实现真实可见窗口;
- connection error UI: 如果需要用户可见错误状态, 单独设计正式 status / error surface。
