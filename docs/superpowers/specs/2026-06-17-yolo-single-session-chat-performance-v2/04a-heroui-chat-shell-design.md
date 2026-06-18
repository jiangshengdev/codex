# HeroUI Page Shell Redesign

日期: 2026-06-18
状态: 设计草案, 待确认
范围: YOLO single-session chat GUI performance v2 的首屏页面和 committed transcript 可见界面

## 目标

本设计重写 `04-chat-shell-style-design.md` 之后的组件库策略。旧 `04` 把 production chat shell
收敛到 committed transcript 主体, 但允许 committed-only surface 继续以语义 HTML 和 Tailwind
手写视觉样式为主。这会让后续实现即使不真正采用 `@heroui/react` 组件, 也看起来满足设计。

本阶段的新目标是: 重写当前首屏页面的可见 UI, 让 HeroUI React v3 接管页面和 committed transcript
的主要视觉所有权。实现不应把 HeroUI 当作包裹旧 Tailwind 样式的 wrapper, 也不应只替换
`Entry` / `Empty` / `Status` 三处局部组件。

本设计不是实施计划, 不定义任务顺序、checkbox、测试命令或提交策略。实施计划必须在本设计确认后
单独编写。

## 已确认决策

1. 新建设计文件 `04a-heroui-chat-shell-design.md`, 不覆盖旧 `04` 设计。
2. 本阶段范围扩展到整个首屏页面, 包括 `App` 可见页面壳和 `CommittedTranscriptSurface`。
3. 可见页面层级、状态提示、empty state、message entry、turn metadata/status 必须使用
   `@heroui/react` 组件重新组织。
4. HeroUI 负责主要视觉骨架、surface 层级、card/alert/chip/typography 语义和状态色。
5. Tailwind 只保留布局 glue、响应式约束、长文本换行、稳定测试 hook 和必要的局部排版底线。
6. 自动测试不验证是否使用了组件库; 组件库使用由人工代码审查确认。
7. 不修改 `package.json`, 不修改任何 lockfile, 不新增组件库或样式依赖。
8. 旧 `GUI host` debug panel 仍然移除, 正常 host / connection 状态仍不进入 production UI。

## 与旧 04 设计的关系

本设计继承旧 `04` 中已经正确的产品边界:

- 移除可见 `GUI host` debug panel;
- 不展示 `status`、`attached`、`events`、`last event` 这组调试字段;
- `CommittedTranscriptSurface` 是当前首屏唯一主业务 UI;
- `App` 继续负责 host connection、projection ingress 和 Redux dispatch;
- `data-gui-host-status` 继续作为内部/测试信号保留;
- 本阶段不新增正式 loading UI、connection error UI、active tail、streaming 或真实 windowing。

本设计否定旧 `04` 的样式策略判断。旧 `04` 中“当前 committed-only surface 没有按钮、弹层或输入控件时,
可以优先使用语义 HTML + Tailwind”的判断不再适用。现在的目标不是在旧界面上做轻量修饰, 而是用
HeroUI 重新定义页面层级和可见内容容器。

后续计划应以本设计为准处理页面级组件库使用边界, 但不应顺手重写旧 `04` 设计文档。

## 本地 HeroUI 文档依据

实施前必须继续使用本地文档, 不能联网读取 HeroUI 文档:

```text
codex-gui/.heroui-docs/react/
```

已核对的本地 HeroUI v3 文档:

- `components/(layout)/surface.mdx`: `Surface` 从 `@heroui/react` 导入, 用于页面或区域 surface
  层级, 支持 `transparent` / `default` / `secondary` / `tertiary` variant。
- `components/(layout)/card.mdx`: `Card` 从 `@heroui/react` 导入, 使用 `Card.Header`、
  `Card.Title`、`Card.Description`、`Card.Content`、`Card.Footer` 这类 compound parts。
- `components/(feedback)/alert.mdx`: `Alert` 从 `@heroui/react` 导入, 使用 `Alert.Indicator`、
  `Alert.Content`、`Alert.Title`、`Alert.Description`, 支持 `default` / `accent` / `success` /
  `warning` / `danger` status。
- `components/(data-display)/chip.mdx`: `Chip` 从 `@heroui/react` 导入, 用于 standalone labels、
  statuses 和 categories。
- `components/(data-display)/badge.mdx`: `Badge` 从 `@heroui/react` 导入, 适合锚定状态点或计数;
  文档明确 standalone label 应使用 `Chip`。
- `components/(layout)/separator.mdx`: `Separator` 从 `@heroui/react` 导入, 用于内容分隔, 并适配
  不同 surface 背景。
- `components/(typography)/typography.mdx`: `Typography` 从 `@heroui/react` 导入, 用于 heading、
  paragraph、inline code 和 prose。

因此本设计中的 card body 概念应按本地 docs 实现为 `Card.Content`, 不是 `CardBody` API。
如果实施时发现本地 docs 与安装包类型不一致, 必须停止并回报, 不得改依赖或锁文件来迁就。

## 页面结构

页面级结构应从旧的 Tailwind shell 迁移为 HeroUI-owned surface:

```text
App
  -> main[data-gui-host-status]
      -> Surface(page)
          -> CommittedTranscriptSurface(region)
              -> global status alerts
              -> empty state card
              -> turn list
                  -> turn metadata row
                  -> committed chunks
                      -> committed entry cards
```

`main` 继续作为语义容器和 host status test hook 存在, 但不再拥有主要视觉样式。`main` 可以保留
viewport、布局和响应式外边距, 但页面背景、surface 层级和主视觉基调应由 `Surface` 或 HeroUI theme
class 接管。

`CommittedTranscriptSurface` 继续暴露 `aria-label="Committed transcript"` region。它可以继续作为
selector 和 component boundary, 但其可见内容容器不应继续由手写 `rounded/border/bg/shadow` Tailwind
组合完成。

## 组件所有权矩阵

| UI 层 | HeroUI 所有权 | Tailwind 允许范围 | 不应保留的旧样式 |
| --- | --- | --- | --- |
| Page shell | `Surface` 承担页面或首屏 surface 层级 | `min-h-svh`, `w-full`, responsive padding, centering | `main` 上完整承担 `bg-*`, `text-*` 页面视觉 |
| Transcript region | `Surface` 或无视觉 wrapper 承担区域层级 | `mx-auto`, `max-w-*`, `grid`, `gap-*`, stable class | 手写 section card/surface 外观 |
| Global status | `Alert status="danger"` 表达 interruption 状态 | 保留 `role="status"` wrapper 或必要 spacing | `border-danger/30`, `bg-danger/10`, `text-danger` 手写 alert |
| Empty state | `Card` 或 `Surface` 表达 empty container, `Typography` 表达文案 | region 内布局和居中约束 | `border-dashed`, 手写 empty panel |
| Turn metadata | `Chip` 表达 turn id/status/role 等 standalone labels | flex wrap, gap, stable class | `rounded-sm bg-foreground/5 px-*` 手写 pill |
| Entry container | `Card role="article"` 或语义 wrapper + `Card` 表达 message/status entry | chunk/list gap, stable class | `rounded-md border bg-background shadow-sm` 手写 card |
| Entry text | `Card.Content` + `Typography` 表达文本层级 | `whitespace-pre-wrap`, `wrap-break-word`, necessary line-height | 大量手写 color/font 规则形成第二套 typography |
| Separators | 必要时用 `Separator` 表达 turn/section 分隔 | margin/gap | 手写 border line |

这张矩阵是后续计划和人工审查的核心依据。实现可以根据 TypeScript API 和局部可访问性选择 wrapper 形态,
但不能把旧 Tailwind 视觉样式原样搬到 HeroUI 组件的 `className` 上。

## 旧样式清理规则

以下 Tailwind class 组合应视为遗留视觉实现, 后续实现需要主动清理或替换为 HeroUI variant/status:

- 页面壳视觉: `bg-background`, `text-foreground` 作为 `main` 的主要视觉 ownership;
- 手写 card: `rounded-md border border-foreground/10 bg-background shadow-sm`;
- 手写 empty panel: `rounded-md border border-dashed border-foreground/20`;
- 手写 alert: `border-danger/30 bg-danger/10 text-danger`;
- 手写 pill: `rounded-sm bg-foreground/5 px-2 py-0.5`;
- 仅为模拟 component library token 而堆叠的 `border-*`, `bg-*`, `shadow-*`, `text-*`。

允许保留的 Tailwind class 必须满足至少一个条件:

- 布局 glue: `grid`, `flex`, `gap-*`, `mx-auto`, `w-full`, `max-w-*`, `min-h-svh`;
- 响应式约束: `px-*`, `py-*`, `sm:*`, `lg:*`, 但只用于空间布局, 不用于重建旧视觉系统;
- transcript 文本底线: `whitespace-pre-wrap`, `wrap-break-word`, 必要 `leading-*`;
- 稳定 hook: `committed-transcript-*` class 和 `data-gui-host-status`;
- 可访问性 wrapper 或 selector boundary。

`committed-transcript-*` class 可以继续保留, 用途限定为测试 hook、稳定组件边界、迁移期识别和少量布局
载体。这些 class 不能替代 HeroUI 组件骨架, 也不能发展为第二套完整组件系统。

## App shell 契约

`App` 的业务职责不变:

- 初始化 GUI host connection;
- 处理 launch params;
- 创建 projection ingress adapter;
- dispatch attach / event / reconnect outcome;
- 维护 `data-gui-host-status` test hook。

`App` 的可见布局职责改变:

- 不再用 `main` 的 Tailwind class 承担页面视觉层;
- 不展示正常连接状态、event count 或 last event;
- 不新增 header、sidebar、toolbar 或 debug inspector;
- 首屏只承载 HeroUI-owned page surface 和 committed transcript region。

如果后续需要 connection error、reconnect banner、loading skeleton 或 running activity, 必须单独回到设计层。
本阶段不能把旧 debug panel 改名为正式状态 UI。

## Committed transcript 契约

`CommittedTranscriptSurface` 继续遵守 `03` 的 bounded component boundary:

```text
CommittedTranscriptRoot
  -> CommittedTranscriptGlobalStatus
  -> CommittedTranscriptTurnList
      -> CommittedTranscriptTurn
          -> CommittedTranscriptChunk
              -> CommittedTranscriptEntry
```

本设计不要求改变 selector 契约, 也不允许通过 `App` 或 shell helper 重新聚合完整 transcript tree。
`App` 只负责承载 surface, 不读取 `snapshotTurns + eventBuffer`, 不消费 `selectThreadTimelineMaterials`,
不解释 projection event 内容。

Entry / Empty / Status / Metadata 的可见形态必须由 HeroUI 组件接管:

- committed transcript entry 使用 `Card` 作为内容容器, 内容主体使用 `Card.Content`;
- entry 的 message role 可以用 `Chip` 或 `Typography` 表达, 不继续用手写 uppercase text-muted label;
- turn status 使用 `Chip`, 不继续使用手写 rounded status span;
- empty state 使用 `Card` 或 `Surface` 容器, 文案仍为 `No committed messages yet.`;
- global interruption status 使用 `Alert status="danger"`;
- 必要分隔优先使用 `Separator`, 不新增手写 border 分隔线。

## 可访问性和语义

本阶段必须保持现有用户可见语义:

- committed transcript region 仍可通过 `Committed transcript` region 找到;
- empty state 文案仍为 `No committed messages yet.`;
- global status 仍以状态语义暴露, 不应因为使用 HeroUI 而弱化 `role="status"` 或等价可访问语义;
- transcript turn 仍可通过 `role="article"` 和 `Turn <id>` 名称找到;
- message role、turn id、turn status 的可见文本不应为了使用组件库而丢失;
- committed entry 内容仍保持原始换行和长文本可读性。

如果 HeroUI 组件默认 DOM 与现有测试语义冲突, 设计优先级是保持用户可访问语义, 不是迁就组件内部 DOM。
可以使用语义 wrapper 或 HeroUI 组件支持的 `role` / `aria-*` 属性来保留契约。

## 测试契约

自动测试只验证用户可见行为和可访问语义, 不验证 HeroUI 使用细节。

应继续覆盖:

- 旧 `GUI host` debug UI 不回归;
- `Committed transcript` region 可见;
- empty state 在没有 committed chunks 时可见, 包括 host event 只产生 turn 而没有 committed chunk 的场景;
- global interruption status 文案在对应状态下可见;
- committed entry 内容可见;
- turn article 语义可见;
- host 状态只通过内部/test hook 验证。

不得新增以下类型的测试:

- 断言 `@heroui/react` import;
- 断言 HeroUI 内部 DOM 结构;
- 断言 HeroUI BEM class;
- 断言具体 Tailwind class;
- 为了证明组件库使用而写 brittle snapshot。

组件库是否真正接管页面视觉由代码审查确认。后续计划应把人工审查点写清楚, 但不把它编码成自动测试。

## 不变量

本设计完成后应满足:

- 首屏页面和 committed transcript 可见 UI 由 HeroUI React v3 组件体系重建;
- `App` shell 和 host connection 业务逻辑不变;
- `main[data-gui-host-status]` 继续作为内部/test hook;
- 旧 `GUI host` debug panel 不回归;
- 正常 host / connection 状态不进入 production UI;
- 不新增 HeroUI provider 或 HeroUI v2 模式;
- 不新增 `framer-motion` 或其他动画依赖;
- 不修改 `package.json`, `pnpm-lock.yaml` 或任何 lockfile;
- CSS import order 继续保持 Tailwind 在前、`@heroui/styles` 在后;
- 自动测试仍以用户可见行为和可访问语义为边界;
- active tail、streaming、running activity、loading UI、connection error UI 和真实 windowing 仍是后续设计范围。

## 后续计划要求

确认本设计后, 后续实施计划必须:

- 以页面级重写为范围, 覆盖 `App` 页面壳和 `CommittedTranscriptSurface`;
- 禁止修改旧 `04` 设计文档;
- 禁止修改依赖和锁文件;
- 要求实施前读取本地 `Surface` / `Card` / `Alert` / `Chip` / `Typography` docs;
- 明确先清理旧 Tailwind 视觉 ownership, 再接入 HeroUI 组件;
- 明确人工代码审查点: page shell、status、empty、entry、metadata 必须实际使用 `@heroui/react`
  组件, 且不能把旧手写 card/alert/pill 样式原样搬到 HeroUI `className`;
- 保持 focused browser/e2e 测试验证用户行为和可访问语义, 不验证组件库内部实现。
