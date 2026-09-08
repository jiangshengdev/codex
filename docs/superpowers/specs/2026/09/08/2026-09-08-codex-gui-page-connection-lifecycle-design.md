# Codex GUI 页面恢复与连接生命周期设计

日期：2026-09-08。

状态：主目标与设计方向已获用户确认；本文按“先落盘设计文件”请求整理，待审阅。实施计划尚未确认，未开始实现。

代码证据基线：`f468657b1`。本文的行为结论来自当前源码和既有测试定义；本轮未执行测试或真实 GUI 验收。

## 主目标与范围

仅在 `codex-gui` 内集中页面恢复与连接生命周期的协调逻辑，提高可测试性，同时保持现有恢复、输入保留及发送行为不变。

本设计加深页面连接生命周期 module，使 React 调用方不再理解连接轮次的内部编排。设计文档沿用仓库现有 `docs/superpowers/specs/` 布局；源码修改范围仍限于 `codex-gui/**`。

不把会话集合、队列、草稿、协议解析或路由决策合并进新 module。不新增自动重连、自动重试或自动发送行为，不改变 UI 布局、文案、持久化格式和后端契约。本次不处理相邻的异常清理策略改进。

## 当前结构与架构摩擦

生产入口为 `src/main.tsx` 的 `StrictMode` 挂载，经 `src/App.tsx` 到 `GuiHostConnectionBridge`。

`App` 持有稳定的 `NewSessionOwner`、连接状态、授权 token、commands 和 active session，并通过 `AppCapabilities` 向消费者发布。路由变化由 `App` 单独处理。

`GuiHostConnectionBridge` 的 effect 同时承担：

- 消费浏览器授权、发布 token，处理失败微任务。
- 订阅 `pagehide` / `pageshow`，暂停队列并触发连接重建。
- 创建 Host 连接，转交投影、skills 和 thread status 通知。
- 创建 session collection，将连接交给 `NewSessionOwner`，激活恢复目标。
- 处理连接失效、清理旧 controller 和 Host、清空页面能力。

这些行为并非无意义转发。当前摩擦是：验证一次恢复或连接替换的顺序，必须理解 React effect 闭包、Host callbacks、collection 终结和新会话 generation 的交接。简单搬移 effect 或按文件长度拆分，不能增加 depth。

## module、interface 与 seam

引入页面连接生命周期 module，集中一个页面挂载期间的连接轮次协调。其 implementation 保留授权读取、轮次创建与释放、通知转交和页面恢复这些可区分的职责，不压成一个包揽所有操作的函数。

外部 interface 表达挂载生命周期和页面能力输出。调用方不读取或修改内部 controller、轮次标识、监听器集合与清理句柄，也不手工调用一串初始化或销毁步骤。具体函数名称、类型形式和文件内部组织在实施计划中确定。

`GuiHostConnectionBridge` 保留为 React adapter，负责 effect 的创建、释放与现有状态 setter 的绑定。浏览器事件订阅及其恢复策略由生命周期 module 管理；Bridge 不再通过自己的 `pageSessionRevision` 编排旧连接销毁和新连接创建。

测试沿同一 interface 驱动事件与观察输出。浏览器环境和 Host 创建入口是实际可替换的 seam：生产 adapter 使用现有浏览器能力和 `startGuiHostConnection`，测试 adapter 提供可控事件、连接回调与清理记录。依赖采用现有权威类型直接引用或机械派生，不建立通用 adapter 注册框架。

depth 的收益标准是调用方需要掌握的时序知识减少。locality 体现为恢复、失效和释放规则集中；leverage 体现为无需挂载整页即可验证同一套生命周期 implementation。现有 React 和端到端覆盖仍验证真实接线。

Deletion test：旧 Bridge 内的完整协调逻辑应被新 module 吸收。若调用方仍要维护连接轮次、组合清理步骤或干预内部状态，则本次提取不成立；最终只保留一条生命周期实现路径。

## 保留现有职责归属

| 现有 module | 继续拥有的语义 | 生命周期 module 的职责 |
| --- | --- | --- |
| `App` / `AppCapabilities` | 页面能力发布、稳定的 `NewSessionOwner`、路由观察 | 使用现有 setter 输出能力，接入现有 owner |
| `browserAuthorizationSession` | token 消费、fragment 清理、sessionStorage 与授权上下文 | 每轮按现有入口消费授权，不重写存储或解析规则 |
| `guiHostClient` | 握手、协议处理、commands 可用性、Host 错误分类与通知顺序 | 创建连接并原样衔接回调 |
| `activeThreadSession` | 集合、成员身份、恢复激活、投影处理、队列暂停及资源释放 | 每轮创建并终结 controller，路由通知 |
| `NewSessionOwner` | 草稿、capture、threadId、导航与连接 generation、首次输入交接 | 更新其连接绑定，不重建或清空草稿 owner |
| Composer queue | 持久化、恢复许可、不确定投递及发送 | 调用已有暂停入口，不复制发送策略 |

当前 `App.tsx` 已提供所需输入，无需为本设计迁移其路由或草稿职责。

## 生命周期行为契约

### 启动与授权

每次连接轮次使用既有授权消费入口。该入口包含 sessionStorage 写入及 URL fragment 清理，不能当作无副作用 token getter，也不能改为整个页面只读取一次。

授权失败时，不启动 Host、不安装页面恢复监听器；沿用现有延迟错误发布。Host 同步启动失败时，沿用先处理 connection unavailable、再发布 error 的延迟路径。卸载后，尚未执行的错误微任务不得继续发布。

Host commands ready 后，沿现有顺序发布 commands、创建 collection、绑定 `NewSessionOwner`、发布 active session 并启动恢复。通知仍交给该轮次的 controller。

### 页面暂停与恢复

| 输入或前提 | 保持的行为 |
| --- | --- |
| `pagehide`，任意 `persisted` 值 | 同步暂停集合中全部成员的恢复队列 |
| `pageshow` 且 `persisted=false` | 不触发连接重建 |
| `pageshow` 且 `persisted=true` | 先暂停旧队列，再释放旧轮次并创建新轮次 |
| 暂停时尚未完成 attach 的成员 | 完成初始化后仍保持暂停语义 |
| 无恢复队列 | 重连后可正常接受首次明确发送，不制造“需要继续发送”状态 |
| 已有恢复队列 | 先前 Continue sending 许可失效，等待人工检查后继续 |
| 未知 Send / Guide 投递结果 | 不因重连、终止通知或 Continue sending 自动重发 |

初始 `startupTarget` 继续固定为挂载时目标。当前路由仍由 `ActiveThreadRouteSync` 调用 `session.view`；不得将两者合并，或把普通路由观察变为新的显式 `activate` 策略。

### 连接失效与草稿保留

普通 Host unavailable 本身不触发自动重连。按现有顺序解除 `NewSessionOwner` 的连接、终结 controller，再清空 commands。

不可用时通过 controller 的 disposed 状态通知已有订阅者；不提前把 active session 引用改为 null。实际轮次 cleanup 才清空引用。

`NewSessionOwner` 跨连接轮次存活。替换连接只使旧操作 generation 失效，不清除 draft、capture 或已获得的 threadId。旧创建请求返回的 threadId 可以按既有规则保留，但不能继续使用失效连接 activate 或 handoff。创建结果未知时，连接恢复不能自动再次创建或发送。

### 清理、迟到回调与错误

轮次释放需要解除页面监听器、旧 session 绑定和 Host 连接。旧轮次 cleanup 内触发的 unavailable callback 不得清除新轮次绑定；已释放轮次的通知不再影响当前 controller。

保留 StrictMode 挂载、清理、再挂载的行为，不能使两套 live queue 同时工作。卸载后不得继续发布能力或处理通知。

Host 的错误回调顺序保持不变：socket error / close 路径先 unavailable 后 status；协议错误路径先 error status 后 unavailable。不能为了统一处理入口而重排。

`activeThreadSession.dispose` 可能在发布 disposed 状态后抛出 cleanup error。本次保持错误可见性，不静默吞错，也不顺带重设计异常后的释放保证。若提取必须改变这些可观察语义，应先回到设计确认。

## 契约权威来源

`GuiHostStatus`、`GuiHostCommands` 与 `StartGuiHostConnectionOptions` 直接来自现有 Host module；session 输入与 controller 来自现有 collection module；授权对象与新会话 owner 使用其既有定义。

协议类型继续由 `@codex-protocol` 及 `@codex-gui-host-contract` 别名引用现有权威 TypeScript 产物；现有 Host 使用 `src/generated/appServerProtocol` 的分类与校验结果。新生命周期 module 只组合这些能力，不解析 JSON-RPC，不手工镜像协议字段、DTO、schema 或 runtime validator。

本设计不改变协议选择、生成输入和生成输出。现有契约发生不兼容变化时，类型错误仍应传播到实际消费者。

## 验证设计

新增 module 测试从其 interface 驱动授权结果、页面事件、Host 回调和清理过程，断言可观察的调用顺序、连接绑定、队列暂停与输出，不锁定私有状态布局。

覆盖正常启动、授权失败、Host 启动失败、卸载前排入的微任务、普通 pageshow、persisted 恢复、通知转交、旧轮次回调和卸载清理。对于恢复，明确保留初始目标与当前路由的不同职责。

| 现有验证入口 | 保留的检查能力 |
| --- | --- |
| `src/__tests__/AppRouting.browser.test.tsx` | React 接线、恢复前暂停、路由与连接次数 |
| `src/__tests__/AppActiveThreadSession.browser.test.tsx` | StrictMode、单一 live queue、卸载后通知与重复释放 |
| `src/__tests__/AppProjectionAvailability.browser.test.tsx` | 失联后的能力和页面表现 |
| `e2e/persistence.spec.ts` | 草稿保留、空队列恢复、恢复许可撤销、未知投递不重发 |
| `e2e/newSession.spec.ts` | 连接替换后的新会话输入保留与显式 Retry |
| session、Host 既有测试 | 成员暂停、通知时序、错误传播和底层释放契约 |

新增测试不能替代或削弱现有调用链覆盖，不修改断言基线来接受行为漂移。格式、lint、类型检查与具体测试命令由实施计划核验权威入口后列出。

- Level 1：适用，包括 module 测试及无头 Browser / E2E 回归；本轮未执行。
- Level 2：实施后需要以当前真实 Codex runtime 核对连接与恢复相关集成，具体场景和状态准备在计划阶段明确；本轮未执行，尚未取得当次有效 URL。
- Level 3：本设计没有依赖可见桌面状态的验收要求，不启动可见浏览器或桌面窗口。

现有 E2E 用合成 `PageTransitionEvent` 验证生产恢复处理逻辑，不证明浏览器真实 BFCache 导航资格。不得把这些测试结果表述为真实 BFCache 验收。

## 证据入口与后续门禁

下列行号对应上述代码基线，路径均相对仓库根目录：

- `codex-gui/src/App.tsx:14`：稳定 owner 与能力；`:33`：导航；`:72`：当前路由 view。
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:33`：初始目标；`:47`：授权；`:65`：页面事件；`:76`：失效；`:102`：ready；`:130`：cleanup。
- `codex-gui/src/features/browserLaunch/browserAuthorizationSession.ts:64`：授权消费与存储、fragment 副作用。
- `codex-gui/src/features/guiHost/guiHostClient.ts:88`：socket 失败；`:121`：协议失败；`:249`：Host cleanup。
- `codex-gui/src/features/activeThreadSession/activeThreadSession.ts:209`：恢复激活；`:730`：集合暂停；`:739`：dispose。
- `codex-gui/src/features/newSession/newSessionOwner.ts:71`：连接 generation；`:114`：创建结果及后续有效性检查。
- `codex-gui/src/__tests__/AppActiveThreadSession.browser.test.tsx:682`：StrictMode 与清理回归。
- `codex-gui/src/__tests__/AppProjectionAvailability.browser.test.tsx:180`：失联后消费者表现。
- `codex-gui/e2e/persistence.spec.ts:217`：恢复后撤销发送许可。
- `codex-gui/e2e/newSession.spec.ts:154`：创建响应丢失后的连接替换。

主目标与设计方向已经确认；本文只固化其职责、行为和验证约束，不包含实施任务、提交授权或修复完成声明。本文经审阅确认后再完成实施计划；计划确认前不开始源码修改。
