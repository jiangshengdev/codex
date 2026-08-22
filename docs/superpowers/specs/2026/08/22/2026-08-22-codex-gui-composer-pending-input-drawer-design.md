# Codex GUI Composer 待处理输入抽屉设计

状态：已确认

日期：2026-08-22

## 唯一主目标

统一 Codex GUI Composer 中普通排队与 same-turn 引导的待处理呈现：输入框附近只保留一个紧凑的“待处理”入口，分别显示两条 lane 的数量；逐条内容移入同一个只读抽屉，并继续保留 ordinary 与 steer 既有的独立 FIFO、优先级、交付确认和失败恢复语义。

本设计只改变 Composer 的用户可见投影和读取接口，不合并执行队列，不改变 `turn/start`、`turn/steer`、`expectedTurnId`、`clientUserMessageId` 或 recovery 的权威状态机。

## 与既有设计的关系

本设计是 `2026-08-19-codex-gui-composer-steer-input-design.md` 的增量版本，只替换其中“GUI 投影 / 统一待处理区域”的正常态呈现：

- 旧设计让 `引导中`直接展示逐条预览，而 ordinary 只显示聚合数量。
- 新设计让两条正常 lane 都只在输入框附近显示数量，并把逐条内容放入统一抽屉。
- 旧设计关于 two-lane FIFO、显式 steer 越过 ordinary、rejected-first、delivery unknown、commit 对账、interruption 和恢复的全部语义继续有效。
- 旧设计文档保留为历史，不覆盖、不删除。

## 背景与当前代码证据

### 当前外壳统一，但信息结构不统一

`ComposerPendingInputRegion.tsx` 已经由一个组件、一个 `Surface` 和一个 coordinator snapshot 渲染所有待处理状态：

- `pendingSteers + queuedSteers` 合并为 `引导中`，显示标题、数量和逐条 preview。
- `rejectedSteers` 显示为 `将优先发送`，带状态文案和逐条 preview。
- ordinary 只读取 `queuedCount`，显示 `已排队 N 条`，没有逐条 preview。
- recovery 显示未发送数量和 `继续发送`按钮。

因此截图中的不统一不是两个独立组件或两个状态 owner 漂移，而是现有产品投影刻意采用了不同信息密度。

### ordinary owner 有完整内容，但公开投影只有数量

`ComposerInputQueueImpl` 内部的 `ordinary` 保存完整 `ComposerQueueMessage[]`，并保持严格 FIFO。当前 `view()` 只把 `this.ordinary.length` 传给 `projectComposerInputQueueView`，所以 React 无法显示 ordinary 内容。

这意味着新设计不能只改 JSX 或 className。必须在单一 queue/coordinator owner 上增加只读、有界的详情读取接口；React 不得建立第二份 ordinary/steer 队列。

### steer preview 有单项边界，但列表没有条数边界

`projectComposerInputPreview` 已把单条文本 preview 限制为 160 个 grapheme，非文本输入只投影类型数量。当前 `pendingSteers`、`queuedSteers` 和 `rejectedSteers` 仍会把完整数组发布进 snapshot，未发现产品级条数上限。

新抽屉必须让所有条目逻辑上可访问，同时避免一次把无上限队列和完整消息内容复制、比较并渲染到 React。

### 执行语义不能随界面统一而合并

ordinary 与 steer 是不同执行 lane：

- ordinary 等待下一轮 `turn/start`，自身严格 FIFO。
- steer 绑定当前 `expectedTurnId`，走 `turn/steer`，可以越过 ordinary。
- 空 Composer 的引导快捷键只会把 ordinary 队首迁移到 steer 队尾。
- `deliveryUnknown` 保留原 lane 的 pending owner，不能自动重试或释放。
- 明确不可 steer 的消息进入 rejected-first 路径，当前轮结束后优先于 ordinary 发起下一轮。
- recovery 需要显式 `继续发送`，不能隐藏成普通排队成功。

统一 UI 只能统一入口和详情阅读方式，不能把上述阶段直接相加成一个“总排队数”，也不能合并发送顺序。

## 已确认产品决策

设计访谈完成了 4 项实质决策：

1. ordinary 与 steer 在输入框附近都只显示数量，逐条内容移入抽屉。
2. 使用一个“待处理”入口，但分别显示 `引导 N` 与 `排队 N`；点击后打开同一个分组抽屉，不显示会混淆 lane 的单一总数。
3. 正常待处理内容进入抽屉；`未发送`、`引导状态未知`、`继续发送`等异常或可操作状态继续在输入框附近直接显示。
4. 抽屉条目默认显示最多 160 个 grapheme；被截断的文本可以展开查看完整内容，并可以再次收起。

## 范围

本设计包含：

- 输入框附近的单一紧凑“待处理”入口。
- 分别表示 ordinary 与 steer 的数量 Chip。
- 一个只读、分组、可滚动的 HeroUI Drawer。
- ordinary 与 steer 的有界详情分页读取。
- 被截断文本的按需完整详情读取与展开/收起。
- 特殊状态继续内联显示，并保持现有操作能力。
- Lingui 文案、键盘/焦点、读屏语义和响应式验证。
- queue projection、coordinator controller、Composer UI 和对应测试的必要调整。

## 非目标

- 合并 ordinary 与 steer 的 owner、FIFO、计数或执行顺序。
- 修改 `turn/start`、`turn/steer` 或 app-server wire contract。
- 新增编辑、删除、重排、选择、批量操作或手动重试。
- 把 queued/pending 内容乐观写入正式 transcript。
- 隐藏现有可见的 steer `deliveryUnknown`、明确失败或 user-stop recovery。
- 新增队列持久化、跨页面共享或跨进程恢复。
- 给队列增加产品容量上限。
- 用固定 padding、gap、颜色或阴影测试锁定主观样式数值。

## 用户界面

### 输入框附近的紧凑入口

待处理入口继续位于 Composer 内、编辑区与动作区附近，替换当前铺开的正常 `引导中`列表和 ordinary 聚合 Chip。

入口包含：

- 文案 `待处理`。
- steer lane 非空时显示 `引导 N`。
- ordinary lane 非空时显示 `排队 N`。
- 某 lane 数量为 0 时不显示该 Chip。
- 两条正常 lane 都为 0 时不显示入口。

入口不显示单一合计数。`引导 N`继续只表示 `pendingSteers + queuedSteers`；`排队 N`继续只表示尚未取得 start ownership 的 ordinary FIFO。rejected、recovery 和 pending start 不得混入这两个数字。

整个入口是打开详情的单一可访问操作。Chip 只表达数量，不独立冒充按钮，也不产生两个抽屉。

### 统一详情抽屉

点击待处理入口打开一个只读抽屉。抽屉使用两个正常分组：

1. `引导中`：先展示 pending steers，再展示 queued steers，保持既有提交顺序。
2. `已排队`：按 ordinary FIFO 从队首到队尾展示。

每个分组标题显示自己的数量，不显示跨 lane 总数。抽屉不允许通过渲染顺序改变 queue owner 的发送顺序。

抽屉只负责阅读：

- 不提供删除、拖动、重新排序、重新发送或 lane 迁移。
- 不暴露内部 path、message identity、expected turn identity 或 transport 字段。
- 抽屉关闭后，队列内容和展开状态不影响发送调度。
- 队列变化时，抽屉从同一 coordinator owner 重新读取可见页；不存在 React 本地队列副本。

抽屉使用右侧 placement，表达“补充详情”而不是阻断主操作。HeroUI `Drawer.Body`负责滚动；窄屏下 Drawer 保持组件库提供的可访问 dialog、焦点圈定和滚动锁语义，内容宽度适配 viewport，不另造自定义 overlay。

### 预览与完整内容

每条文本默认复用 160-grapheme preview：

- 未截断时直接显示完整 preview，不出现无效展开控件。
- 已截断时使用 Disclosure 提供展开与收起。
- 展开时按稳定 item key 从 coordinator owner 读取完整的只读显示详情。
- 完整详情只用于当前展开项的渲染，不进入公开 snapshot，不成为可重发 payload owner。
- 条目移出 queue 后，旧 key 的详情读取返回不存在；UI 关闭该条 Disclosure，不显示陈旧内容。

结构化输入在首版继续显示机械派生的类型摘要，不新增完整结构化详情渲染器。展开完整内容只适用于被 160-grapheme 边界截断的文本；禁止为本功能手写复制 app-server authoritative contract。

### 异常与可操作状态

以下状态继续在输入框附近直接显示，不要求用户先打开抽屉：

- `引导状态未知`：继续明确提示；不提供可能造成重复输入的重试按钮。对应 steer 仍计入 `引导 N`，并可在抽屉查看详情。
- `将优先发送` / `当前无法引导，已加入队列`：继续显示当前 rejected-first 状态和必要预览，不谎称为普通排队。
- `未发送` / `继续发送`：继续显示 recovery 数量、可用性和明确操作。
- interrupt 失败等已有直接状态：保持其当前反馈边界。

ordinary pending start 的 `deliveryUnknown` 继续保留现有 ownership 和 release blocker 语义，但本设计不新增专用内联文案或详情项。若未来要把该内部阶段显式展示为新的用户状态，必须另行确认产品语义。

这些内联状态与 Drawer 中的正常详情可以引用同一 owner 数据，但不能重复创建 live region 或重复播报同一错误。

## HeroUI v3 组件策略

设计遵循本地 HeroUI v3 Design Principles：语义意图优先、无障碍为基础、组合优于配置、渐进披露和可预测行为。

组件选择：

- `Drawer`：统一详情 overlay；使用 `Drawer.Backdrop`、`Drawer.Content`、`Drawer.Dialog`、`Drawer.CloseTrigger`、`Drawer.Header`、`Drawer.Heading` 和 `Drawer.Body` compound API。
- `Button` / `Drawer.Trigger`：待处理入口是可交互替代操作，使用语义 variant 和 `onPress`，不使用手写 clickable div。
- `Chip`：只显示 `引导 N`、`排队 N` 和分组数量，不承担点击语义。
- `Disclosure`：仅用于被截断消息的展开/收起，保留键盘、focus-visible 和 expanded ARIA 状态。
- `Alert`、`Button`、`Chip`：继续表达异常、恢复和可操作状态。
- `Separator`、语义 section/list/heading：用于分组和列表结构；这些承载文档语义，不强行替换成无对应语义的组件。

不得为了匹配截图手写 Drawer、focus trap、ESC 关闭、scroll lock 或 Disclosure 状态机。若 HeroUI 已有组件能表达交互，就使用组件库能力；Tailwind 只负责必要布局和 token 化间距。

## 数据投影与 owner

### 概览 snapshot

coordinator 的热 snapshot 只保留 Composer 主界面所需的有界概览：

- `guidingCount`。
- `ordinaryQueuedCount`。
- `hasUnknownSteer`。
- recovery/interrupt 等现有特殊状态摘要，以及现有 rejected-first 内联投影。
- 用于通知 Drawer 刷新读取结果的单调 revision 或等价版本事实。

不得把 ordinary 完整 payload、全部完整文本或正常 pending/queued steer 的无上限详情数组复制进每次 publish 的 snapshot。正常 pending/queued steer 应迁移到统一的只读详情读取边界，使两条正常 lane 采用相同的信息披露模型。rejected-first 不属于正常 Drawer 分组，继续沿用现有内联 preview 投影；本设计不顺带重做其产品投影和恢复界面。

具体字段名属于计划阶段的实现判断，但必须由同一个 queue/coordinator owner 机械产生，不能由 React 根据多个来源拼接。

### 有界列表读取

controller 提供只读、同步或可取消的详情页读取能力，至少接受：

- lane：`steer` 或 `ordinary`。
- 页游标/offset。
- 明确 limit。
- 当前 revision 或等价一致性事实。

返回值至少包含：

- 稳定 display key。
- lane。
- 有界 preview。
- 是否被截断。
- 当前页顺序。
- next cursor/has more。

每页使用固定上限，初始只渲染首个有界页；用户滚动或触发“显示更多”后按序读取后续页。所有条目逻辑上可访问，但任何一次读取和新增 DOM 数量都有硬上限。

当 revision 变化导致旧 cursor 不再对应当前 FIFO 时，丢弃旧分页结果并从 owner 重新读取，而不是在 React 中推测插入、删除或重排。

### 按需完整详情

展开被截断条目时，controller 按稳定 key 查询当前 owner：

- key 仍存在时，返回只读的显示详情。
- key 已释放、迁移或属于旧 generation 时，返回不存在。
- 返回值不授予 submit、retry、remove 或 reorder 权限。
- 不返回可被消费者保存为第二份发送 owner 的可变引用。

完整详情不参与热 snapshot 的 `JSON.stringify` 相等检查，避免每次 queue 变化复制和比较长消息。

### 生命周期

详情读取必须绑定当前 thread owner 和 coordinator generation：

- thread/connection replacement 后，旧 cursor、旧 key 和旧展开结果失效。
- dispose 后不再发布详情更新。
- Drawer 打开或关闭不创建、释放或迁移任何 queue claim。
- accepted、commit、terminal、rejected 和 recovery 仍只由现有 queue/coordinator 状态机处理。

## 国际化与可访问性

- 新增文案使用 Lingui `Trans`、`Plural` 或 `useLingui`，不得手写中英文分支。
- 中文核心文案包括 `待处理`、`引导 N`、`排队 N`、`待处理详情`、`引导中`、`已排队`、`展开`和`收起`。
- Trigger 的 accessible name 必须包含当前两条可见计数；Chip 不能成为唯一读屏信息。
- Drawer 必须有 `Drawer.Heading`，关闭后焦点返回 Trigger。
- Disclosure Trigger 必须说明操作对象和展开/收起状态。
- 队列更新不得抢走 Composer 输入焦点，也不得自动打开 Drawer。
- 计数、错误和恢复不能只靠颜色区分。
- 不创建重复 live region；异常状态只在一个权威位置播报。

## 失败与恢复保持不变

本设计不改变以下规则：

- ordinary `definitelyNotAccepted` 进入显式 recovery。
- ordinary `deliveryUnknown` 保持 pending start ownership。
- steer `accepted` 继续等待匹配 committed user message。
- steer `deliveryUnknown` / response turn mismatch 保留 pending owner、显示状态未知并阻塞不安全后继。
- active turn 不可 steer 或目标 terminal 时，条目转入 rejected-first。
- user-stop recovery 仍需明确继续。

Drawer 不能提供绕过这些状态的操作。某项从正常 lane 转成异常或 recovery 时，UI 必须让内联状态出现，同时从正常详情页按 owner 新事实移除或重新分类。

## 验证边界

### queue projection 与读取接口

定向测试至少证明：

- overview 的两条计数分类口径不重叠且各自正确，不产生错误总数。
- ordinary 与 steer 的详情页分别保持各自 FIFO。
- 每次详情页读取和 DOM 增量有明确上限，所有条目仍可按序访问。
- revision 变化使旧 cursor/result 失效，不在 React 中合并陈旧页。
- preview 仍限制为 160 grapheme，并准确标记 truncated。
- 按需读取只返回当前 owner 中仍存在的 key。
- 完整详情不会进入热 snapshot，也不会成为第二个可重发 owner。
- thread replacement、generation 变化和 dispose 会使旧详情读取失效。

### Composer Browser Mode

组件测试至少证明：

- 只有 steer 时显示一个待处理入口和 `引导 N`。
- 只有 ordinary 时显示同一个入口和 `排队 N`。
- 两条 lane 同时存在时仍只有一个 Trigger，并分别显示两个数字。
- 点击 Trigger 打开带 heading 的 Drawer，两个分组保持顺序和独立计数。
- 默认只显示有界 preview；被截断条目可展开完整内容并收起。
- zero-count lane 不显示 Chip；两条正常 lane 都为空时入口隐藏。
- `引导状态未知`、rejected-first 和 recovery 仍在输入框附近可见并保留现有操作。
- Drawer 关闭后焦点返回 Trigger；键盘可以打开、遍历 Disclosure 和关闭 Drawer。
- 中英文 plural 与 accessible name 正确。

### App 纵向路径

App 级验证至少证明：

- ordinary 进入 FIFO 后正文不乐观进入 transcript，但可在 Drawer 查看。
- steer 可越过 ordinary；统一 Drawer 不改变 RPC 次序或 client identity。
- matching commit 后 steer 从 Drawer/计数消失并进入正式 transcript。
- ordinary terminal drain 后普通条目按 FIFO 从 Drawer/计数消失。
- steer unknown/mismatch 不重试后继，内联状态存在，对应 steer 详情仍可读取。
- rejected-first 与 user-stop recovery 不被错误计入 ordinary/steer 正常详情。

### 可见 GUI 验证

使用可见 Google Chrome for Testing 验证：

- 桌面宽度下待处理入口紧凑、不挤压 Composer 主操作。
- Drawer 打开后内容可滚动，Composer 和页面不会产生横向溢出。
- 窄屏下 Trigger、Chip、Drawer、Disclosure 和关闭控件可见、可键盘操作。
- 中英文长文本、连续长 token、结构化输入摘要不会溢出自身宽度。
- 异常/恢复状态不会被 Drawer 遮蔽或要求先打开 Drawer 才能发现。

样式验证只确认稳定的可用性与响应式约束，不锁定具体 padding、gap、颜色、圆角或阴影数值。

## 预期影响面

计划阶段需要沿以下纵向路径核验并确定具体修改任务：

- `composerInputQueueContracts.ts`：概览、列表页与详情读取的类型边界。
- `composerInputQueue.ts`：ordinary/steer owner 的只读分页和按 key 读取。
- `composerInputQueueProjection.ts` / `composerInputPreview.ts`：统一 preview、truncated 和显示详情投影。
- `composerInputQueueCoordinator.ts`：overview snapshot、revision 和 controller 读取能力。
- `ComposerPendingInputRegion.tsx`：紧凑 Trigger、异常内联区域和 Drawer 接线。
- 新的私有 Drawer/list item 组件文件：HeroUI compound 组件和 Disclosure 细节，避免继续扩大现有 region 职责。
- 对应 unit、Browser Mode、App-path、i18n catalog 与可见 GUI 验证。

具体文件拆分、类型命名、page size 常量、cursor 形状和测试文件组织属于计划阶段的技术判断，不在设计阶段提前固化。

## 完成标准

只有以下路径同时成立，才算完成本设计：

```text
single queue/coordinator owner
  -> bounded overview counts near Composer
  -> one HeroUI Drawer trigger
  -> grouped bounded detail pages
  -> on-demand expandable full detail
```

并且：

- ordinary 与 steer 继续使用独立 FIFO 和既有优先级。
- 正常详情从输入框主界面移入 Drawer。
- 异常和可操作状态仍在输入框附近直接可见。
- React 不保存第二份 queue，不持有可重发 payload。
- 所有逻辑条目可访问，但任何一次 projection 和 DOM 增量有硬上限。
- HeroUI 负责 overlay、focus、keyboard、scroll 和 Disclosure 交互。
- 不新增队列管理或协议行为。
