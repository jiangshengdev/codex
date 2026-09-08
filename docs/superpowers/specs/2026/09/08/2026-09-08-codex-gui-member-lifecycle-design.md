# Codex GUI 集合内部成员生命周期设计

日期：2026-09-08。

状态：主目标与设计已获确认；本文按“确认，设计落盘”请求固化。实施计划尚未确认，未开始实现。

代码证据基线：`f62af19ae`。行为结论来自当前源码及既有测试定义；本轮未执行测试或真实 GUI 验收。

## 主目标与范围

在保持现有行为和对外 interface 不变的前提下，集中单个成员的生命周期规则，改善 locality。

源码范围限定为 `codex-gui/**`。设计文档沿用仓库已有 `docs/superpowers/specs/` 布局。页面连接生命周期已由 `guiHostConnectionLifecycle` 管理，本设计从其创建的 session collection 向内展开。

不改变当前选择、后台会话、恢复暂停、未知投递、错误归属或移除阻塞的产品语义；不新增自动重连、自动重试或自动重发。不重做队列、reservation、协议和读模型，也不改变 UI、路由与持久化格式。

## 当前结构与摩擦

生产链路为 `GuiHostConnectionBridge` → `startGuiHostConnectionLifecycle` → `createActiveThreadSession`。页面连接生命周期向 collection 转交通知、恢复和终止事件。

`activeThreadSession.ts` 的 collection implementation 同时持有：

- 集合成员资格、当前选择、`selectionIntent`、集合持久化及操作错误。
- 单个成员的 `attached`、`subscriptionId`、初始化通知、frame、live、roles、slot identity 和清理恢复方向。

初始化失败、主动移除与连接结束会分别操作成员资源字段；通知转交也需要知道成员是否正在初始化、何时排空缓冲以及何时取消 frame。理解集合选择因而需要同时理解成员内部协议。

现有集合 module 已有 depth，并非 shallow 的无意义转发。问题不在文件长度，而在集合 implementation 需要掌握过多成员内部规则。

## module 职责与 seam

新增内部 `activeThreadMemberLifecycle` module，拥有一个成员从初始化到资源释放的完整周期，内部继续使用现有 live session module。

| module | 权威职责 |
| --- | --- |
| 集合 | 成员列表及其持久化、当前选择、选择意图、集合错误与操作错误、跨成员协调、整个移除操作的去重与完成 |
| 成员生命周期 | 初始化及其 pending、通知缓冲、投影调度、状态刷新、初始化与清理错误、清理重试、live 与读模型资源生命周期 |
| 现有 live session | 队列、revision、角色能力、技能与压缩状态、已有 reservation 及其提交和撤销语义 |

集合与成员之间的 seam 只传递只读状态和生命周期操作结果。集合不再直接读写 `attached`、`subscriptionId`、`frame` 等成员内部字段，也不绕过成员操作 live 来重复编排其资源规则。

interface 按完整操作表达初始化、重试、通知接收、暂停、释放和终结。集合仍需知道某次局部操作已经完成、被阻塞或失败，但不需要重建成员内部的步骤。具体函数名称、类型形式和内部组织在实施计划中确定。

成员向集合提供状态变化通知，集合继续组装对外 snapshot、发布当前选择和集合错误。成员就绪不产生提交集合当前选择的权限。稳定 roles 和 revision 行为继续沿用现有契约。

commands 与 scheduler 使用现有可注入 seam。生产 adapter 使用现有 Host commands 与帧调度，测试 adapter 提供受控响应和调度；不新增通用 adapter 注册框架。

depth 的收益是集合不必学习成员内部资源协议。locality 体现为初始化、通知和清理规则集中；leverage 体现为初始化失败、主动移除和连接终止复用同一套成员资源 implementation。

Deletion test：若提取后集合仍维护同样的可变成员字段，或者必须经一组细碎回调重建原步骤，只是搬移代码，没有增加 depth。最终只保留一个成员生命周期权威来源；不保留旧新路径并存或临时同步逻辑。内部仍可区分初始化、通知和释放职责，不把全部操作压入一个通用函数。

## 初始化与通知契约

保留当前 loaded 查询、必要时 resume、attach、投影构造、live 构造和状态确认的顺序。成员列表新增无法持久化时，不得开始 resume 或 attach。

成员在初始化期间维护自己的通知缓冲、subscription 匹配、状态与技能失效标记及暂停状态。delta 仍按成员进行帧调度；非 delta 通知沿用现有取消 frame 和同步处理顺序。后台成员处理通知不能改变当前查看对象。

同步 dispatch 和 live 构造可能重入。slot identity 必须在相关 dispatch 前登记；dispatch 或构造之后仍须检查终止状态。安装 live subscription 后排空初始化期间的通知，并完成必要的状态确认，再对外暴露 ready snapshot。

不发布尚未完成初始化的 live 状态，不改变 Redux 与 session revision 的一致性。既有测试没有完整断言所有 publication 的精确次数，本设计不据测试标题新增“恰好一次发布”指标。

晚到的 attach、状态查询和投影事件继续受到成员身份与终止状态约束。暂停发生在 attach 完成前时，成员初始化后仍应用现有恢复暂停规则；是否存在需要暂停的队列继续由既有队列语义决定。

## 清理方向与移除交接

初始化失败与主动移除共用成员资源清理能力，但结束条件不同。

| 场景 | 保留的结果 |
| --- | --- |
| 初始化失败，detach 未完成 | 保留初始化主错误及清理错误，禁止重新 attach |
| 初始化失败，显式重试完成清理 | 按现有路径重新初始化同一成员 |
| 主动移除，清除选择失败 | 撤销 reservation，成员保持可用，错误仍归集合 |
| 主动移除，detach 失败 | 保留待清理成员，允许按现有路径显式重试 |
| detach 成功，成员列表持久化删除失败 | 保留 `removalPending` 成员及读模型；后续重试不重复 detach |
| 成员列表持久化删除成功 | 结束成员生命周期、删除对应读模型，再完成集合成员退出 |
| 连接终止 | 集合终结所有成员并发布集合终态；保留已有本地释放与协议 detach 的区别 |

主动移除的交接保持以下顺序：

1. 成员刷新和检查释放条件，使用已有 live reservation。
2. 集合清除选择；失败时撤销 reservation，不损坏健康成员。
3. reservation 提交成功后，成员禁用能力并进行资源释放、detach。
4. 集合持久化成员删除；成功后，成员才删除保留的读模型资源并结束生命周期。

复用现有 reservation，不建立第二套冻结、提交或撤销机制。reservation 不向订阅者暴露中间冻结状态；子状态变化后仍须拒绝陈旧提交，撤销不得恢复陈旧状态。

本地 dispose 不等价于协议 detach，不把所有终止路径合并成总会发送 detach 的 cleanup。保留错误可见性和现有异常传播，不顺带增加新的异常恢复策略。

## 集合选择与错误归属

`view` 与显式 `activate` 的区别不变：查看失败成员不隐式重试；显式激活沿用现有恢复行为。切换查看对象不 detach 后台成员。

成员 ready 与提交当前选择是两个时点。集合在初始化返回后检查 `selectionIntent`；retry 还须检查开始时及完成时是否仍为当前查看成员。后台重试可以成功，但不能覆盖新的选择。

选择持久化失败继续产生已有 warning，不能反向撤销成员 ready。成员生命周期重试不清空无关的集合错误或 navigation / remove 操作错误。成员退出后的操作错误迁移继续由集合负责。

## 契约权威来源

- 对外 session、collection、成员状态和操作结果以 `activeThreadSessionCollectionContracts.ts` 为权威；保持调用方所见 interface 不变。
- live 状态、roles 所依赖的能力及 reservation 继续来自 `activeThreadSessionContracts.ts` 和现有 live implementation。
- 新成员 module 引用这些权威类型，或用 `Pick`、`Extract`、索引访问和 `ReturnType` 等机械派生，避免手写镜像状态、结果或协议 DTO。
- 内部初始化恢复方向可以表达成员自身语义，但不能复制一套对外契约或改变结果映射。
- 投影通知与 attach 响应继续使用 `@codex-protocol/v2` 权威类型；Host commands 继续来自现有 Host module。新 module 不解析 JSON-RPC，不新增 runtime validator，不修改协议生成链。
- 读模型 slot action、identity 与 revision 契约保持不变；职责提取只改变调用位置。创建先于 transition、删除匹配 threadId 与 instanceId 的规则继续有效。

## 验证设计

保留现有集合与 live session 测试，补充从成员 interface 驱动的生命周期测试。通过受控 commands、scheduler、通知及读模型输出断言行为，不断言私有字段或要求调用方拼装内部状态。

| 现有证据入口，路径相对 `codex-gui/` | 保留的检查能力 |
| --- | --- |
| `src/features/activeThreadSession/__tests__/activeThreadSession.test.ts:331` | live 构造时同步重入通知不丢失 |
| 同文件 `:429`、`:451` | 选择失败不损坏成员，操作错误独立保留和迁移 |
| 同文件 `:481`、`:532` | 持久化失败保留 slot，清理未决禁止重挂，重试不重复 detach |
| 同文件 `:573`、`:600` | 后台 retry 不覆盖选择，选择持久化失败仅产生 warning |
| 同文件 `:697`、`:990`、`:1043`、`:1168` | 晚到挂载的暂停、通知与状态补齐、revision 一致性、同步 dispatch 后终止 |
| `src/features/activeThreadSession/__tests__/liveActiveThreadSession.test.ts:356` | 既有 reservation 的撤销、提交、子状态变化与 dispose |
| `e2e/multiSession.spec.ts` | 多会话通知归属、后台队列、独立错误与移除行为 |
| `e2e/persistence.spec.ts` | 恢复暂停、显式继续、未知投递不重发 |

新成员测试不能替代或削弱集合真实调用链覆盖，不删除断言或修改基线来接受行为变化。具体测试、类型检查及格式命令由实施计划核验后列出。

- Level 1：实施验证适用，包括成员、集合、live 及相关无头集成回归；本轮未执行。
- Level 2：本设计涉及真实 session 与投影生命周期，实施后的集成场景及状态准备在计划阶段明确；本轮未执行，不以模拟 Host 结果替代真实 runtime 证据。
- Level 3：本设计不依赖可见桌面状态，不要求启动可见窗口。

## 当前证据与后续阶段

源码关键证据为 `activeThreadSession.ts:410` 的初始化控制、`:431` 的初始化流程、`:557` 的移除、`:677` 的通知路由、`:739` 的集合终止，以及 `:763` 的资源清理。选择与重试协调位于 `:230` 和 `:284`，对外发布位于 `:793`。行号对应本文基线。

已确认的内容是职责、交接与行为约束。具体内部函数形状、修改文件清单和验证执行入口由下一阶段实施计划确定。本文不构成源码修改、测试执行或 Git 提交授权，也不记录任何修复或验收完成结论。
