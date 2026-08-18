# Codex GUI 子代理信息显示设计

设计日期：2026-08-18

设计状态：已确认

确认日期：2026-08-18

确认原文：确认设计。开始计划

修订日期：2026-08-18（计划核查确认 `TagGroup` 可聚焦，按已确认只读语义机械改用 HeroUI `Chip`）

落盘授权：用户于 2026-08-18 明确要求“设计落盘”

## 唯一主目标

为 `codex-gui` 的当前任务与历史只读详情中的 transcript 子代理活动设计紧凑、可辨识、
可消歧的信息显示，同时保持 TUI 既有动作语义、事件顺序、chunk 性能边界和只读交互边界。

## 与既有设计的关系

本设计是
`docs/superpowers/specs/2026/07/26/2026-07-26-codex-gui-parent-subagent-activity-display-design.md`
的后续版本，不覆盖或重写旧文档。

旧设计已经完成两类结构化协作活动进入 transcript、按 TUI 语义派生文案、归入
`Intermediate updates` 和保持 chunk 边界等基础工作。当前实现随后又把原先的低视觉权重
Card 改成了 HeroUI v3 `TagGroup` / `Tag`，但仍原样显示完整 `agentPath`，没有任务名称格式化、
重名消歧或同动作多代理聚合。

本设计只收敛 `subAgentActivity` 的名称和聚合显示，不重新设计完整协作工具调用
`collabAgentToolCall`，也不撤销旧设计已经确认的 transcript 生命周期语义。

## 当前事实与问题证据

### 权威协议已有稳定身份和命名路径

`SubAgentActivityItem` 的权威来源是 Rust protocol，字段包括：

- `id`；
- `kind`：`started | interacted | interrupted`；
- `agent_thread_id`；
- `agent_path`。

app-server v2 将它们机械映射为生成 TypeScript 中的 `agentThreadId` 和 `agentPath`。GUI 必须继续
直接消费生成 contract，不能在前端手写一份镜像 DTO。

其中三类信息必须严格分开：

- 稳定身份：`agentThreadId`；
- 规范命名与层级路径：完整 `agentPath`；
- 展示任务名：从该活动的 `agentPath` 最后一段机械派生。

`agentPath` 可能迁移或在代理释放后复用；不同父代理也可以拥有相同的最后一段。因此最后一段
只能作为显示候选，不能作为 React key、状态索引或代理身份。

关键入口：

- `codex-rs/protocol/src/items.rs:313-319`
- `codex-rs/protocol/src/agent_path.rs:43-57`
- `codex-rs/core/src/agent/registry.rs:102-118`
- `codex-rs/core/src/agent/registry.rs:245-261`
- `codex-rs/app-server-protocol/src/protocol/v2/item.rs:363-370`
- `codex-rs/app-server-protocol/schema/typescript/v2/ThreadItem.ts`

### 当前 GUI 丢弃稳定身份并原样显示路径

当前 transcript 投影把 `subAgentActivity` 收敛为只含 `activityKind` 和 `agentPath` 的前端 entry，
主动丢弃了协议已经提供的 `agentThreadId`。selector 再把三种 kind 映射为
`agentStarted`、`agentInteracted`、`agentInterrupted`，renderer 用 HeroUI Tag 原样显示完整路径。
HeroUI 本地文档明确把 `TagGroup` 定义为可聚焦集合，现有 Browser 测试也锁定 Tag 的
`tabindex="0"`；这与本设计已经确认的纯信息、无额外焦点语义冲突。

因此当前用户会看到类似：

```text
已启动 [/root/gui_composer_surface]
```

而不是可读的任务名。当前也没有最后一段提取、snake_case 格式化、重名判断或多代理标签组。

关键入口：

- `codex-gui/src/features/transcriptState/transcriptStateModel.ts:97-129`
- `codex-gui/src/features/transcriptState/transcriptItemPolicy.ts:349-361`
- `codex-gui/src/features/transcriptState/transcriptStateSelectors.ts:279-304`
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:103-110`
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:313-336`

### TUI 动作文案是既有产品语义

TUI 对三种活动的文案分别是：

```text
Started {agentPath}
Interacted with {agentPath}
Interrupted {agentPath}
```

当前 GUI 的 Lingui 文案与这套语义一致。用户已明确要求继续沿用此前 TUI 风格文案，不采用闭源
客户端截图中的尾随“已更新”状态。

关键入口：

- `codex-rs/tui/src/multi_agents.rs:316-333`
- `codex-gui/src/locales/zh-CN.po:169-183`
- `codex-gui/src/locales/zh-CN.po:356-359`

## 已确认的产品决策

1. 只增强 transcript 内的子代理活动，不新增独立子代理面板。
2. 标签的主要名称使用格式化后的任务名，不使用随机 nickname 或 agent role。
3. 内部身份使用 `agentThreadId`；显示名和 `agentPath` 最后一段都不能充当身份 key。
4. 默认只显示任务名；同一可见聚合范围出现重名时，给重名项补最短可区分父路径。
5. 常态标签不附加 nickname 或 role。
6. 只显示当时发生的 `started`、`interacted`、`interrupted` 协作动作，不聚合或回写实时
   `running/completed/errored/shutdown` 状态。
7. 标签保持只读，不提供任务跳转、弹层、展开或其他交互。
8. 相邻且动作相同的活动聚合显示；固定展示前 3 个任务标签，其余显示“及其他 N 个子代理”。
9. 文案继续使用 TUI 风格的动作语序，不采用“任务标签 + 已更新”。
10. 长任务名在信息胶囊内保持单行并视觉省略；完整未截断名称继续提供给辅助技术。

## 目标

- 把原始完整路径转成易读任务标签，同时保留完整路径作为消歧依据。
- 对同名任务提供确定、最短且稳定的可见消歧结果。
- 对相邻同动作活动做有界聚合，减少并行子代理对 transcript 高度的占用。
- 当前任务和历史只读详情复用同一展示模型与 renderer。
- 保持 Lingui 国际化、可访问名称和只读标签语义。
- 保持 transcript chunk、selector cache、折叠不挂载隐藏内容等性能约束。

## 非目标

- 不新增子代理总览、树形面板或持续状态面板。
- 不显示或查询 nickname、role、prompt、model、reasoning effort、结果摘要或实时状态。
- 不新增 `Completed`、`Errored`、`Updated` 等协议不存在的 `subAgentActivity` 语义。
- 不把标签做成链接、按钮、Popover、Tooltip 或详情 disclosure。
- 不改变 `collabAgentToolCall` 的既有标题、详情和 wait 生命周期收敛。
- 不修改 Rust protocol、app-server schema、生成 TypeScript 或 GUI Host 通知白名单。
- 不跨 chunk 展平 transcript，也不为了聚合挂载已经折叠的隐藏条目。

## 展示模型

### 身份、路径与标签分离

前端领域 entry 应保留：

```text
identityKey   = agentThreadId
canonicalPath = agentPath
taskLabel      = format(lastSegment(agentPath))
```

这不是复制协议 DTO，而是从生成 `ThreadItem` variant 机械派生的前端展示语义。转换边界必须接受
权威生成类型并对 `kind` 保持穷尽分支。

`identityKey` 用于区分同路径复用或路径迁移前后的不同代理；`canonicalPath` 用于层级和重名消歧；
`taskLabel` 只用于可见文本。

### 任务名格式化

当前 `task_name` 约束为小写字母、数字和下划线，并被拼入 `agentPath` 的最后一段。展示格式化采用
确定性规则：

1. 取 `agentPath` 最后一段；
2. 将 `_` 替换为空格；
3. 对结果使用句式大小写：只把第一个可显示字符转成大写，其余字符保持来源顺序；
4. 不维护 GUI 专属缩写词典，不把 `gui` 猜成 `GUI`、把 `url` 猜成 `URL`；
5. 格式化结果为空属于非法上游数据，应由权威类型或既有校验失败暴露，不能显示静默 fallback。

示例：

```text
gui_composer_surface -> Gui composer surface
url_route_semantics  -> Url route semantics
task1_test_app_server -> Task1 test app server
```

### 重名消歧

同一可见聚合范围内，先按格式化后的 `taskLabel` 分组。只有两个不同 `agentThreadId` 得到相同标签时，
才从各自 `canonicalPath` 的父段开始向左补充，直到标签在该聚合范围内唯一。

示例：

```text
/root/backend/validation  -> Backend / Validation
/root/frontend/validation -> Frontend / Validation
```

若一层父路径仍不能唯一，继续补充更高层。非重名项不得常态显示父路径。完整 raw path 不作为额外
可见详情重复显示。

## 动作文案与多代理聚合

### 单个活动

动作语义保持 TUI 不变，信息 Chip 只替换原有 raw path 文本：

```text
Started [Gui composer surface]
Interacted with [Gui composer surface]
Interrupted [Gui composer surface]
```

简体中文继续通过 Lingui 表达为：

```text
已启动 [Gui composer surface]
已与 [Gui composer surface] 交互
已中断 [Gui composer surface]
```

不得把 `interacted` 翻译或重命名为“已更新”，因为这会把一次联系动作伪装成生命周期状态。

### 聚合边界

只有满足以下全部条件的活动才能进入同一可见组：

- 在同一个 transcript chunk 中；
- 在渲染顺序中相邻；
- `activityKind` 相同；
- 中间没有消息、reasoning、status、`collabAgentToolCall` 或其他可见 entry。

不同动作永远分组显示，不为了减少行数重排事件。聚合只改变相邻活动的表现形式，不改变
`entriesById`、projection 顺序或每个协议 item 的身份。

### 固定三个可见标签

每个聚合组按原始事件顺序展示前 3 个任务标签。其余数量按协议活动 item 数计算并显示：

```text
已启动 [Agent A] [Agent B] [Agent C] 及其他 2 个子代理
```

`+N` 不展开、不点击，不创建隐藏标签 DOM。省略项只参与计数和重名分析，不应先渲染再用 CSS
隐藏。

一个组只有 1 个活动时继续使用同一 renderer，不维护第二套单项 DOM 或文案实现。

## HeroUI v3 与响应式布局

使用已有 HeroUI v3 纯信息组件：

```text
普通 flex-wrap 容器
  Chip size="sm" variant="secondary" color="default"
```

组件语义：

- `Chip` 是 HeroUI 定义的 informational badge，默认使用非交互元素，不进入键盘焦点序列；
- React key 使用 `agentThreadId` 与 item identity 派生的稳定值，不能使用可能重名的 task label；
- 容器使用 `flex-wrap`，窄视口不产生水平滚动；
- 使用 `secondary` variant、`default` color 和设计 token，不按 nickname、role 或状态硬编码颜色；
- 不增加截图中没有权威语义来源的彩色代理图标。

长任务标签保持单行并允许在受约束的 `Chip.Label` 内截断，父容器必须 `min-width: 0`。省略只影响
视觉文本；组级可访问文案必须保留未截断的消歧标签。不得因为桌面宽度较大而动态提高三个标签的
固定上限。

本设计使用的本地 HeroUI 依据：

- `codex-gui/.heroui-docs/react/components/(data-display)/chip.mdx`
- `codex-gui/.heroui-docs/react/components/(collections)/tag-group.mdx`（仅用于确认现有 TagGroup 的
  可聚焦语义，不作为新实现组件）

## 可访问性与国际化

- 动作前缀、连接词和“及其他 N 个子代理”必须使用 Lingui，不拼接不可翻译的完整句子。
- 英文与中文语序可以不同；不能把多个 Chip 直接插入一个只适用于单数的翻译模板。
- 聚合组提供包含完整未截断标签和省略数量的可访问名称。
- Chip 只表达信息，不伪装为 button、link 或可选择项，不进入额外键盘焦点序列。
- 视觉截断不能成为唯一信息来源；辅助技术读取完整的消歧标签。
- `+N` 必须明确表达省略的是子代理，而不是普通 transcript item。

## Transcript 状态与性能边界

聚合属于 selector / presentation 层，不改变 authoritative item materialization 和 committed projection
的逐 item 身份。

必须保持：

- 不跨 chunk 查找或合并相邻活动；
- 不把一个 turn 的全部 entry 展平成新数组；
- 折叠 `Intermediate updates` 时不挂载隐藏 chunk 或隐藏 Chip；
- 新活动只使其所在 entry/chunk 的 selector 结果失效；
- 后续 chunk 保持引用稳定；
- `+N` 由有界组数据直接计算，不测量 DOM 行数、不使用 `ResizeObserver` 决定语义数量；
- 历史只读详情复用相同 selector 和 renderer，不建立第二份聚合状态。

为支持稳定身份，现有 transcript entry 需要保留协议已经提供的 `agentThreadId`。这是修复当前 GUI
投影丢字段的问题，不是新增 app-server 协议字段。

## 影响边界

后续计划应从以下 `codex-gui/**` 边界进一步收敛精确文件：

- transcript state model：为 `subAgentActivity` 保留 `agentThreadId`；
- transcript item policy：从生成 `ThreadItem` 机械派生稳定身份、路径和活动 kind；
- transcript selector / presentation：任务名格式化、重名消歧、相邻同动作分组和前三项截断；
- committed transcript surface：TUI 风格动作语序、HeroUI Chip、响应式换行和 `+N`；
- Lingui catalog：通过项目提取与编译命令更新生成文案；
- transcript state 与 Browser Mode 测试：覆盖身份、重名、聚合、截断、只读语义、当前页/历史页复用和
  chunk cache 边界。

明确不涉及：

- `codex-rs/**`；
- app-server API、schema 或生成 TypeScript；
- GUI Host transport、notification allowlist 或 WebSocket；
- Redux thread runtime 全局代理树；
- 路由、历史导航、Composer 或子任务打开能力。

## 验证设计

实现阶段应验证以下稳定、用户可感知约束：

1. 单项：三类 TUI 动作文案使用格式化任务 Chip，且不出现“已更新”。
2. 聚合：相邻同动作 1、2、3、4 个活动分别产生正确标签数和 `+N`。
3. 边界：不同动作、不同 chunk 或被其他 entry 分隔时不聚合、不重排。
4. 重名：不同父路径相同 leaf 时显示最短唯一父路径；非重名项不显示父路径。
5. 身份：相同显示文本的不同 `agentThreadId` 不发生 React key 或状态碰撞。
6. 响应式：手机和桌面均不产生横向溢出，长标签截断，组内标签允许换行。
7. 可访问性：只读 Chip 无 action/selection/focus 语义，完整未截断名称和 `+N` 对辅助技术可读。
8. 历史复用：当前任务与只读历史详情显示一致，且历史表面不出现交互能力。
9. 性能：聚合不跨 chunk，折叠时不挂载隐藏内容，单项更新不使无关后续 chunk 失效。

具体测试文件、命令和任务拆分只能在设计获得明确确认后的计划阶段确定。本设计文档不授权实现、
格式化、生成、测试、stage 或 commit。

## 设计确认

9 项实质决策已经在对话中完成，用户已经授权设计落盘，并于 2026-08-18 明确回复
“确认设计。开始计划”。本设计由此进入已确认状态；后续实现仍需对应计划获得明确确认。
