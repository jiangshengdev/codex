# Codex GUI 历史任务继续失败即时可见设计

> 日期：2026-09-04
> 状态：已确认
> 确认日期：2026-09-04
> 用户确认原文：`确认，计划落盘`
> 主目标确认原文：`确认`
> 已确认产品决策：底部固定反馈；摘要默认可见、诊断按需展开；失败后主按钮仍显示“继续此任务”

## 目标

历史任务详情页执行“继续此任务”失败时，在用户当前视口内立即、持续地显示失败提示，无需滚动到
完整历史记录末尾；同时保留只读详情、现有重试能力和排查所需的原始诊断信息。

后续代码实现必须在工作树中进行。当前 checkout 在设计与计划阶段只承载工作文档，不在其中修改
`codex-gui` 生产代码或测试代码。

## 当前事实与根因

`ThreadHistoryDetailContent` 当前先渲染完整只读 transcript，最后才渲染
`ContinueTaskAction`。`ContinueTaskAction` 又把失败 `Alert` 放在普通文档流中，把“继续此任务”操作栏
单独设为 `fixed inset-x-0 bottom-0`。因此，长历史页面中点击始终可见的按钮后，新增错误卡片实际出现
在当前视口之外的文档末尾。

失败分支目前只更新 `ContinueTaskState`，没有滚动、聚焦或其他视觉定位动作。`role="alert"` 能向辅助
技术宣布错误，但不会把文档流中的错误卡片带入视觉视口。该问题属于反馈承载位置错误，不是
`thread/resume` 错误产生过晚、错误文本丢失或按钮不可重试。

现有 `AppShell` 通过固定 `h-24` 占位避免 transcript 末尾被底栏遮挡。失败提示进入固定底栏后，底栏
高度将随摘要、恢复操作和展开诊断变化，固定占位不再能表达真实遮挡边界。

## 已确认的用户可见行为

### 固定反馈位置

所有“继续此任务”失败状态都在底部固定操作区内显示，位于操作按钮行上方。错误与触发操作处于
同一持久表面；不依赖自动滚动、页面顶部通知或瞬时 Toast 才能发现失败。

失败后继续保留只读历史详情。原“继续此任务”按钮保持现有文案，不改为“重试继续此任务”，再次
点击仍重新发起继续操作；请求进行期间继续使用现有 pending 状态阻止重复提交。

### 摘要与诊断层级

固定区默认显示：

- 当前失败标题；
- 面向用户的简短原因；
- 当前失败分支已有的必要恢复操作，例如“返回当前任务”；
- 仅在存在原始诊断时显示的“查看诊断信息”展开入口。

原始 `operation`、`cleanup` 和 unexpected error 文本移入诊断展开区，默认折叠，不删除、不截断为另一
套错误语义。没有诊断信息的失败分支不显示空展开入口。展开与折叠只改变诊断可见性，不清除错误
状态，也不触发重试。

再次点击“继续此任务”时沿用当前状态机：旧失败反馈退出、按钮进入 pending；若重试再次失败，则
以新失败结果重新显示反馈。成功路径、路由切换和成功后的 warning Toast 保持不变。

## 组件与布局设计

### 状态与操作 owner

`ContinueTaskAction` 继续拥有：

- `ContinueTaskState` 与 capability token；
- 单请求门禁、pending、重试和成功导航；
- 固定底部操作表面及其实际高度；
- 二维码入口和“继续此任务”主按钮。

不新增 Redux 状态、第二套恢复状态机或错误镜像。`ActiveThreadSession.activate` 及其
`ActiveThreadActivationFailure` 仍是失败语义的权威来源。

### 失败展示 owner

把现有各类继续失败的展示映射集中到 feature-private 的失败反馈组件。该组件只接收当前失败结果与
必要导航回调，负责：

- 保持 `switchInProgress`、`currentThreadChanged`、`currentThreadUnresolved` 的 warning 语义；
- 保持 `connectionLost`、`operationFailed`、`empty`、`unexpectedFailure` 的 danger 语义；
- 保持 `beforeCommit` 与 `afterCommit` 的不同标题和恢复说明；
- 把用户摘要与可选诊断分层呈现；
- 保持现有“返回当前任务”按钮的出现条件和导航目标。

若计划采用新文件承载该 owner，纯代码迁移与用户可见行为修改必须拆成独立任务和独立提交，避免在
同一提交中混合顺序调整与行为修改。

### HeroUI 组件

- 继续使用 HeroUI v3 `Alert` compound API：`Alert.Indicator`、`Alert.Content`、
  `Alert.Title`、`Alert.Description`。
- 按现有失败分类使用 `status="warning"` 或 `status="danger"`，不使用硬编码状态颜色。
- 使用 HeroUI v3 `Disclosure` compound API 承载“查看诊断信息”：`Disclosure.Heading`、
  `Disclosure.Trigger`、`Disclosure.Indicator` 与 `Disclosure.Content`。
- 继续使用 HeroUI `Button` 的 `primary`、`secondary` 语义和 `onPress`，不创建手写 button 或新的
  交互依赖。
- 固定表面继续使用 `bg-surface`、`border-separator` 等现有语义 token，不增加一次性颜色。

### 动态底部空间

固定操作表面从仅按钮行变为可变高度的纵向布局：失败反馈在上、操作按钮行在下。操作按钮行始终
可见；展开的长诊断内容在自身可用区域内滚动，不能把主操作推出视口。

由 `ContinueTaskAction` 在文档末尾渲染与固定表面实际高度同步的无障碍隐藏占位，替代
`AppShell` 当前按路由提供的固定 `h-24` 占位。固定表面通过 `ResizeObserver` 观测自身高度，在失败
出现、诊断展开、响应式换行或字体尺寸变化后同步占位。这样 transcript 滚到底部时，其末尾仍位于
固定表面上方，且没有为其他路由引入全局布局状态。

高度同步仅负责避免遮挡，不改变当前文档滚动位置。失败出现时不自动滚动历史、不抢占视觉焦点；
`role="alert"` 继续负责即时辅助技术公告。

## 可访问性

- 每次新失败结果继续渲染 `role="alert"`，保证屏幕阅读器即时获知失败。
- “查看诊断信息”由 `Disclosure.Trigger` 提供键盘操作、展开状态和 focus-visible 行为。
- “继续此任务”按钮文案按已确认决策保持不变；失败摘要与按钮保持可访问描述关联，使按钮的重试
  上下文不只依赖颜色和位置。
- 诊断展开后焦点留在 trigger；折叠、重试和响应式高度变化不把焦点移入历史正文。
- “返回当前任务”继续作为独立 secondary action，不与继续按钮合并。

## 预计代码范围

后续计划应以工作树内的以下范围为起点：

- `codex-gui/src/features/threadHistory/ContinueTaskAction.tsx`：状态机、固定表面、动态占位和操作行。
- `codex-gui/src/features/threadHistory/ContinueTaskFailureAlert.tsx`：各失败分支的摘要、恢复操作和诊断
  Disclosure；仅在抽取形成清晰 owner 时新增。
- `codex-gui/src/features/appShell/AppShell.tsx`：移除 history detail 专用固定 `h-24` 占位，把高度责任
  交还局部 action owner。
- `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryDetailContinuation.browser.test.tsx`：失败
  可见性、摘要/诊断层级、按钮文案、重试与可访问语义。
- `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryDetailRead.browser.test.tsx`：动态占位与
  transcript 末尾不被遮挡的几何回归。

若实现需要修改 `ActiveThreadSession`、GUI Host 协议、路由、全局 Toast、HeroUI sibling checkout 或
其他生产 owner，说明当前根因或范围假设失效，必须先回到计划范围确认。

## 验收设计

### Level 1：Browser Mode 回归

覆盖组合不能继续沿用“空历史失败”与“长历史只测遮挡”彼此分离的现状。至少应包含：

- 长历史、页面未滚到底部时点击“继续此任务”，模拟 `resume` operation failure；
- 失败 `Alert` 与操作按钮处于同一个 fixed `aside`，且 Alert 完整位于当前 viewport；
- 标题与简短原因默认可见，原始 operation/cleanup diagnostic 默认不可见；
- 键盘操作“查看诊断信息”后诊断可见，再次折叠后隐藏；
- 失败后的主按钮 accessible name 仍为“继续此任务”，再次点击产生第二次 activate 请求；
- pending 期间无法重复提交，重试失败后显示最新结果；
- 有诊断与无诊断、warning 与 danger、带“返回当前任务”操作的代表分支保持原语义；
- 失败折叠态、诊断展开态及响应式换行后，占位高度跟随 fixed 表面；滚到文档底部时 transcript
  末尾不被遮挡；
- Disclosure trigger、继续按钮和可选 secondary action 均可通过键盘访问，Alert 继续具有即时公告
  语义。

几何断言应直接比较 fixed 表面、Alert、viewport、动态占位和 transcript 末尾的边界，不能只以元素
存在或测试退出码替代“第一时间可见”。

### Level 2：真实 Codex runtime 无头验收

在后续计划取得本次运行的完整 GUI URL 后，使用真实长历史任务触发或注入可重复的继续失败状态，
分别检查常规宽度和窄宽度：

- 点击前无需位于文档末尾；
- 点击失败后摘要立即出现在底部固定区；
- 展开诊断时操作按钮保持在视口内，长文本可读且不会水平撑破页面；
- 折叠、再次继续和滚到底部后均无正文遮挡或无依据的滚动跳转。

若无法获得可重复的真实失败条件，Level 2 只验证可由真实运行态证明的布局与响应式部分，并明确
记录失败注入场景未执行；不得用旧 URL 或纯组件测试冒充真实运行验收。

### Level 3：可见桌面验收

本设计不依赖操作系统窗口、跨应用焦点、系统 IME 或 DevTools，Level 3 不适用。默认不启动可见
浏览器或桌面窗口。

## 明确排除

- 不修改 `thread/resume`、attach、prepare 或 activate 的协议与失败分类。
- 不自动滚动到文档底部，不在失败时移动页面或强制视觉焦点。
- 不用 Toast、顶部通知或 Modal 作为继续失败的唯一反馈。
- 不删除原始诊断，不把所有失败统一为同一句泛化错误。
- 不改变“继续此任务”按钮文案、二维码入口、成功路由或 warning Toast。
- 不改变只读历史内容、pagination、Composer 是否存在或历史详情 URL。
- 不新增 Redux slice、兼容路径、fallback、双重错误来源或新依赖。
- 不修改 HeroUI 官方源码或全局组件样式。

## 风险与约束

- **动态高度引起正文遮挡**：以 fixed 表面实测高度驱动局部占位，不保留静态 `h-24` 猜测。
- **长诊断占满视口**：限制诊断内容的可用区域并在其中滚动，操作行始终可见。
- **反馈状态重复或漂移**：继续由单一 `ContinueTaskState` 派生展示，不复制失败状态。
- **组件抽取混合行为修改**：若需要抽取，迁移提交与行为提交分离；最终只保留一条展示路径。
- **测试只证明 DOM 存在**：增加长历史、当前 viewport 与动态高度的真实几何断言。
- **工作区污染**：设计确认后的计划必须先定义工作树名称、branch、base、路径和准备命令；相关工作
  文档独立提交成功且工作树预配核验完成前，不开始代码实现。
