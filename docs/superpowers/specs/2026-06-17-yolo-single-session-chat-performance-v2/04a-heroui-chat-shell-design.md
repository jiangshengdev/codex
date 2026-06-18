# HeroUI Chat Shell Correction Design

日期: 2026-06-18
状态: 设计草案, 待确认
范围: YOLO single-session chat GUI performance v2 的 committed transcript surface 组件库修正

## 目标

本设计修正 `04-chat-shell-style-design.md` 的组件库策略。旧 `04` 允许当前
committed-only surface 在没有交互控件时使用语义 HTML + Tailwind, 这导致实现可以不使用
`@heroui/react` 组件而仍然符合设计和计划。

本阶段的新目标是: `CommittedTranscriptSurface` 的核心可见 UI 必须使用现有 HeroUI React v3
组件, 而不是只沿用 `@heroui/styles` 和 Tailwind class。

本设计不是实施计划, 不定义任务顺序、checkbox、测试命令或提交策略。实施计划必须在本设计确认后
单独编写。

## 已确认决策

1. 新建设计文件 `04a-heroui-chat-shell-design.md`, 不覆盖旧 `04` 设计。
2. `Entry`、`Empty state` 和 `Global status` 三类可见 UI 必须使用 `@heroui/react` 组件。
3. `App` shell 不在本阶段修改; `main`、`section` 等语义 landmark 可以继续使用原生 HTML。
4. HeroUI 组件负责组件骨架, Tailwind 负责布局密度、文本换行和局部修饰。
5. 不修改 `package.json`, 不修改任何 lockfile, 不新增组件库或样式依赖。
6. 自动测试不验证是否使用了组件库; 组件库使用由人工代码审查确认。
7. 本阶段继续保持现有 focused browser/e2e 行为测试范围, 不新增 HeroUI DOM/class 结构测试。

## 与旧 04 设计的关系

本设计不否定旧 `04` 中已经正确的 shell 边界:

- 移除可见 `GUI host` debug panel;
- 正常 host / connection 状态不进入 production UI;
- `CommittedTranscriptSurface` 是 `App` 的唯一主 UI 区域;
- `App` 继续只负责 host connection、projection ingress 和 Redux dispatch;
- `data-gui-host-status` 继续作为内部/测试信号保留。

本设计只替换旧 `04` 的组件库策略。旧策略中“当前 committed-only surface 没有按钮、弹层或输入控件时,
可以优先使用语义 HTML + Tailwind”的判断不再适用于 `Entry`、`Empty state` 和 `Global status`。

后续计划应以本设计为准处理组件库使用边界, 但不应顺手重写旧 `04` 设计文档。

## 本地 HeroUI 文档依据

实施前必须继续使用本地文档, 不能联网读取 HeroUI 文档:

```text
codex-gui/.heroui-docs/react/
```

已核对的本地 HeroUI v3 文档:

- `components/(layout)/card.mdx` 定义 `Card`, 从 `@heroui/react` 导入, 并使用
  `Card.Header`、`Card.Title`、`Card.Description`、`Card.Content`、`Card.Footer` 这类 compound
  parts。
- `components/(feedback)/alert.mdx` 定义 `Alert`, 从 `@heroui/react` 导入, 并使用
  `Alert.Indicator`、`Alert.Content`、`Alert.Title`、`Alert.Description`。

因此本设计中的 card body 概念应按本地 docs 实现为 `Card.Content`, 不是臆造 `CardBody` API。
如果实施时发现本地 docs 与安装包类型不一致, 必须停止并回报, 不得改依赖或锁文件来迁就。

## 组件使用契约

`CommittedTranscriptSurface` 中以下可见 UI 必须使用 `@heroui/react`:

- committed transcript entry: 使用 `Card` 作为内容容器, 内容主体使用 `Card.Content` 或本地 docs
  等价 compound part;
- committed empty state: 使用 `Card` 作为 empty state 容器, 保留现有 empty state 文案;
- global status: 使用 `Alert` 表达状态提示; 如果可访问语义需要 `role="status"` 而 `Alert` 不能直接承载,
  应用语义 wrapper 保留 `role="status"`。

以下结构可以继续使用原生 HTML + Tailwind:

- `App` 的 `main[data-gui-host-status]`;
- `CommittedTranscriptSurface` 的 `section[aria-label="Committed transcript"]`;
- turn list、turn boundary、chunk boundary 这类纯结构层;
- 只用于布局、分组或 selector 边界的非交互 wrapper。

不得为了提高组件覆盖率强行把所有结构层都替换成 HeroUI 组件。组件库使用应集中在用户可见状态和内容
容器上。

## 样式组织

HeroUI 负责可见内容容器的基础骨架和状态语义。Tailwind 仍负责:

- root / list / chunk / turn 的布局密度;
- max width、gap、padding 的局部约束;
- `whitespace-pre-wrap`、长文本换行和 transcript 内容排版;
- `committed-transcript-*` 稳定语义 class;
- 少量与当前 theme token 对齐的局部修饰。

`committed-transcript-*` class 可以继续保留, 用途限定为:

- 测试 hook;
- 稳定组件边界;
- 迁移期识别;
- 局部 Tailwind styling 载体。

这些 class 不能替代 HeroUI 组件骨架, 也不能发展为第二套完整组件系统。

## 可访问性和语义

本阶段必须保持现有用户可见语义:

- committed transcript region 仍可通过 `Committed transcript` region 找到;
- empty state 文案仍为 `No committed messages yet.`;
- global status 仍以状态语义暴露, 不应因为使用 HeroUI 而弱化 `role="status"` 或等价可访问语义;
- transcript entry 仍应具备内容分组语义, 例如 `role="article"` 或语义 wrapper;
- message role、turn id、turn status 的可见文本不应为了使用组件库而丢失。

如果 HeroUI 组件默认 DOM 与现有测试语义冲突, 设计优先级是保持用户可访问语义, 不是迁就组件内部 DOM。

## 测试契约

自动测试只验证用户可见行为和可访问语义, 不验证 HeroUI 使用细节。

应继续覆盖:

- 旧 `GUI host` debug UI 不回归;
- `Committed transcript` region 可见;
- empty state 在没有 committed chunks 时可见;
- global status 文案在对应状态下可见;
- committed entry 内容可见;
- host 状态只通过内部/test hook 验证。

不得新增以下类型的测试:

- 断言 `@heroui/react` import;
- 断言 HeroUI 内部 DOM 结构;
- 断言 HeroUI BEM class;
- 为了证明组件库使用而写 brittle snapshot。

组件库是否真正使用由代码审查确认。实施计划应把人工审查点写清楚, 但不把它编码成自动测试。

## 不变量

本设计完成后应满足:

- `CommittedTranscriptSurface` 的 Entry / Empty / Status 使用 HeroUI React v3 组件;
- `App` shell 和 host connection 逻辑不变;
- 不新增 HeroUI provider 或 HeroUI v2 模式;
- 不新增 `framer-motion` 或其他动画依赖;
- 不修改 `package.json`, `pnpm-lock.yaml` 或任何 lockfile;
- CSS import order 继续保持 Tailwind 在前、`@heroui/styles` 在后;
- 自动测试仍以用户可见行为和可访问语义为边界;
- active tail、streaming、running activity、loading UI、connection error UI 和真实 windowing 仍是后续设计范围。

## 后续计划要求

确认本设计后, 后续实施计划必须:

- 只规划 `CommittedTranscriptSurface` 及其 focused tests 的必要调整;
- 禁止修改旧 `04` 设计文档;
- 禁止修改 `App` shell, 除非计划阶段发现本设计遗漏并先回到设计层;
- 禁止修改依赖和锁文件;
- 要求实施前读取本地 `Card` / `Alert` docs;
- 明确人工代码审查点: Entry / Empty / Status 必须实际使用 `@heroui/react` 组件。
