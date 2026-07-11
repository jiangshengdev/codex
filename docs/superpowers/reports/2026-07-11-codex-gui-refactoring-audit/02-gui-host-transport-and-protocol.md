# 02 GUI Host 传输与协议

状态：完成

## 审计范围

状态：完成。

计划范围：GUI host launch、transport、handshake、protocol 与公共 API 边界。

launch params/token/URL owner、transport/request/handshake、protocol parsing、commands/errors wire contract 与公共类型 owner 三个微阶段均已完成。

## 范围交界

状态：完成。

- `02` 拥有 launch params、token storage、浏览器 URL 清理和 transport/protocol 边界的完整证据。
- Rust GUI host 仅作为前端 launch URL/token 外部契约的定义侧证据；不评价 Rust 内部重构机会。
- 禁止扩张：timeline、transcript、Redux state shape 和协议重设计。

### Runtime/ingress 交界

- 交界引用: [RA-03-001](./03-projection-ingress-and-thread-runtime.md#ra-03-001)
- 本报告仅使用的交界事实: `02` 输出 typed connection/notification handoff；连接状态进入 Redux 后的 lifecycle、projection ingress 与 thread runtime 由 `03` 拥有。
- Evidence owner: `03-projection-ingress-and-thread-runtime.md`

### QR/access 交界

- 交界引用: [RA-07-004](./07-composer-access-and-localization.md#ra-07-004)
- 本报告仅使用的交界事实: QR/access UI 与 QR URL 构造消费 `LaunchParams`，但其组件和 URL builder 职责不属于 `02`。
- Evidence owner: `07-composer-access-and-localization.md`

### Timeline materials 交界

- 交界引用: [RA-04-001](./04-timeline-materials-and-domain-models.md#ra-04-001)
- 本报告仅使用的交界事实: `02` 只拥有 wire decode 与 typed notification 输出；timeline/domain 转换位于该 handoff 下游。
- Evidence owner: `04-timeline-materials-and-domain-models.md`

### 测试基础设施交界

- 交界引用: [RA-08-002](./08-test-infrastructure-fixtures-and-support.md#ra-08-002)
- 本报告仅使用的交界事实: GUI host tests 为 transport/protocol 行为提供证据；跨 feature test harness owner 由 `08` 审计。
- Evidence owner: `08-test-infrastructure-fixtures-and-support.md`

## 审计进度

| 微阶段 | 状态 | 压缩结论 | Finding ID / 覆盖状态 | 关键证据 |
| --- | --- | --- | --- | --- |
| Launch params/token/URL owner | 已完成 | 启动参数具有独立生命周期和稳定依赖方向，但浏览器侧类型、解析、存储与地址栏清理被嵌入 transport owner。 | RA-02-001 | `guiHostClient.ts:29-110`、`guiHostLaunchParams.test.ts:14-65` |
| Transport/request/handshake | 已完成 | WebSocket 生命周期、通用请求关联、握手推进、commands readiness 与 teardown 共置；握手阶段还由 request ID `1/2/3` 隐式编码。 | RA-02-002 | `guiHostClient.ts:112-394`、`guiHostHandshake.test.ts:31-116`、`guiHostCommands.test.ts:20-145`、`guiHostProtocolErrors.test.ts:13-112` |
| Protocol parsing/commands/errors | 已完成 | Runtime protocol guards 声明为完整生成类型，但只验证部分字段；command success response 另以泛型断言直接信任。 | RA-02-003 | `guiHostProtocol.ts:8-220`、`guiHostClient.ts:164-185`、`guiHostHandshake.test.ts:155-296` |
| 报告完成门禁 | 已完成 | launch、transport、handshake、protocol 四类职责、公共类型 owner、与 `03` 的 handoff 及五个测试/支持文件覆盖状态均已明确。 | RA-02-001 至 RA-02-003 | 本报告“职责与公共类型 owner”及“测试与支持文件覆盖状态”章节 |

## Findings

状态：完成。

### RA-02-001 Launch params 生命周期被嵌入 transport owner

- **Finding ID：** `RA-02-001`。
- **主报告：** `02-gui-host-transport-and-protocol.md`。
- **Evidence owner：** `02-gui-host-transport-and-protocol.md`；本报告拥有浏览器 launch params、token storage 和 URL 清理边界的完整证据。
- **状态：** 确认重构点。
- **重构优先级：** P2。
- **结论摘要：** `LaunchParams`、launch URL 解析、token 会话恢复和 fragment 清理具有独立、稳定的领域生命周期，但当前由 `guiHostClient.ts` 与 WebSocket transport 共同拥有。该边界还被 App 和 QR/access 消费，导致上层 UI 通过 transport 实现文件依赖启动契约。
- **当前 owner 与当前职责：** `guiHostClient.ts` 同时定义 `LaunchParams` 和连接 options，拥有 token storage key、query/fragment 解析、storage 读写、地址栏 fragment 清理，并在 `startGuiHostConnection` 内立即进入 WebSocket 连接编排。`App.tsx` 保存解析结果，`GuiHostConnectionBridge` 负责 handoff，QR/access 链路消费该结果。
- **问题类型：** 职责混合、类型归属、依赖方向。
- **影响文件、定义侧、构造方、调用方和消费方：**
  - 定义侧：`codex-gui/src/features/guiHost/guiHostClient.ts:29-45` 定义 `LaunchParams` 及其回调接口；外部契约由 `codex-rs/gui-host/src/token.rs:6-20` 和 `codex-rs/gui-host/src/url.rs:59-110` 表达。
  - 构造方：`codex-gui/src/features/guiHost/guiHostClient.ts:56-84` 从 URL/storage 构造 `LaunchParams`；`codex-gui/src/features/qrAccess/qrAccessUrl.ts:1-11` 以同一参数对构造 QR access URL。
  - 调用方：`codex-gui/src/features/guiHost/guiHostClient.ts:93-110` 清理 fragment、读取参数并发出 `onLaunchParams`；唯一生产入口位于 `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:127-138`。
  - 消费方：transport 使用 token 完成认证并使用 thread ID 发起 attach（`codex-gui/src/features/guiHost/guiHostClient.ts:214-216`、`codex-gui/src/features/guiHost/guiHostClient.ts:295-303`）；`App.tsx:10-24` 保存并向 shell 传递参数；`QrAccessPopover.tsx:13-27` 消费参数生成 QR URL。
- **共同语义或变化原因：** `threadId` query 与 `token` fragment 共同描述一次 GUI 启动入口；token 在同一 session 中支持刷新恢复，地址栏必须移除敏感 fragment，同时保留 pathname/query。该语义同时服务认证和 QR access，变化原因不同于 WebSocket 请求、握手状态或 JSON-RPC parsing。
- **推荐边界、建议 owner 和允许的依赖方向：** 浏览器侧应由独立的 launch params owner 统一拥有参数类型、URL 解析、会话恢复和 fragment 清理语义。transport、App handoff 和 QR/access 只能依赖该 owner；launch params owner 不依赖 WebSocket transport、JSON-RPC protocol、Redux 或 UI 组件。Rust GUI host 继续作为外部 launch 契约生产方，本 finding 不建议改变该契约。
- **预期收益：** 收束 token/URL 安全不变量，避免 UI 消费方依赖 transport 实现文件；后续修改启动 URL、刷新恢复或地址栏清理时，不必同时理解请求关联、握手和通知处理。
- **建议变更范围、最小可审查批次和明确排除范围：** 后续设计只应确定浏览器 launch owner 及上述单向依赖关系，并以“不改变启动 URL、storage、认证或 QR 行为”为最小批次边界。具体文件拆分、符号移动和迁移步骤留给后续设计；明确排除 Rust host、WebSocket 状态机、RPC wire shape、Redux lifecycle、thread runtime 和 QR UI 重构。
- **行为、契约、状态、性能和测试风险：**
  - 行为风险：必须保留 fragment token 即使 storage 写入失败仍可用于当前连接的行为。
  - 契约风险：必须保留 `threadId` query、`token` fragment、pathname/query 清理结果和缺参错误语义。
  - 状态风险：必须保持 URL 快照解析、sessionStorage 恢复和 App handoff 的先后关系，不能扩大 token 的存储期限或可见范围。
  - 性能风险：当前证据未显示性能敏感路径；不得以本 finding 引入额外渲染状态或重复解析。
  - 测试风险：现有测试同时锁定直接解析、刷新恢复、缺参、fragment 清理和 storage 失败降级，后续边界调整不能只保留 transport happy path。
- **后续实施时建议的验证范围：** 运行并保持 launch params 行为测试；核对 GUI authenticate 使用原 token、刷新恢复、地址栏清理和 QR URL 构造。若后续设计改变公开类型导入边界，还应验证 App、connection bridge、composer/QR 消费链的类型与行为，但本轮不执行任何命令。
- **当前代码关键证据路径与行号：**
  - `codex-gui/src/features/guiHost/guiHostClient.ts:29-32`：启动参数公共类型。
  - `codex-gui/src/features/guiHost/guiHostClient.ts:56-91`：storage key、参数解析、刷新恢复与 fragment 清理。
  - `codex-gui/src/features/guiHost/guiHostClient.ts:93-112`：launch 生命周期嵌入连接启动编排。
  - `codex-gui/src/features/guiHost/__tests__/guiHostLaunchParams.test.ts:14-65`：完整行为边界。
  - `codex-gui/src/features/guiHost/guiHostProtocol.ts:8-220`：protocol 文件拥有 JSON-RPC parsing/validation，反证 launch 语义不属于 wire adapter。
  - `codex-gui/src/App.tsx:10-24`、`codex-gui/src/features/qrAccess/QrAccessPopover.tsx:13-27`：transport 外的实际消费者。
- **关联的既有报告、issue 或专项设计：** 审计 ownership 依据 `docs/superpowers/specs/2026-07-11-codex-gui-refactoring-audit-design.md`；QR/access 内部职责见 [RA-07-004](./07-composer-access-and-localization.md#ra-07-004)。无关联 issue。
- **已排除项：** 未把 token 按 thread 分键列为缺陷，因为当前外部契约显示 token 由 GUI host 生成并持有；未把 storage `getItem` 异常缺少专门降级测试升级为独立 finding；本 finding 不拥有 transport/handshake/protocol、Redux/thread runtime 或 Rust 内部结构。
- **报告建议：** 进入后续独立设计，先确定 launch params owner 和允许的依赖方向，再规划任何代码移动。

### RA-02-002 Handshake 阶段被 request ID 隐式编码并与 transport 生命周期混合

- **Finding ID：** `RA-02-002`。
- **主报告：** `02-gui-host-transport-and-protocol.md`。
- **Evidence owner：** `02-gui-host-transport-and-protocol.md`；本报告拥有 WebSocket transport、请求关联、握手状态、commands readiness 和连接关闭边界的完整证据。
- **状态：** 确认重构点。
- **重构优先级：** P2。
- **结论摘要：** `startGuiHostConnection` 使用同一组闭包状态同时管理 WebSocket 生命周期、通用 JSON-RPC request correlation、握手推进、status 单调性、commands availability 和 teardown。最脆弱的耦合是握手阶段由全局 request ID `1/2/3` 隐式编码，而 pending request 只记录是否为终端错误，没有记录请求方法或握手阶段。
- **当前 owner 与当前职责：** `guiHostClient.ts` 的单一连接函数创建 socket，维护 `terminalError`、`closed`、`nextRequestId`、`pendingRequests` 和 `commandsReady`，构造 handshake/command 请求，处理全部 socket 事件和响应，并负责 cleanup。外部 `GuiHostConnectionBridge` 只接收 connection/notification handoff；其 Redux 和 runtime 状态见 [RA-03-001](./03-projection-ingress-and-thread-runtime.md#ra-03-001)。
- **问题类型：** 职责混合、状态契约、依赖方向。
- **影响文件、定义侧、构造方、调用方和消费方：**
  - 定义侧：`codex-gui/src/features/guiHost/guiHostClient.ts:93-117` 定义连接入口并创建共享 session 状态；`guiHostClient.ts:390-394` 的 `PendingRequest` 只保留 `terminalOnError`、resolve 和 reject。
  - 构造方：`guiHostClient.ts:112-117` 创建 socket 与共享状态；`guiHostClient.ts:164-212` 构造通用 request、command request 和 handshake request；`guiHostClient.ts:205-208` 构造 commands API。
  - 调用方：唯一生产入口为 `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:128`，commands ready/unavailable handoff 位于同文件 `177-180`；本 finding 不追入 bridge 的状态实现。
  - 消费方：App/shell/composer 消费 `GuiHostStatus` 和 ready commands；其 UI 行为不是本 finding 的 owner。服务器响应经 `socket.onmessage` 进入 request correlation 和 handshake 推进。
- **共同语义或变化原因：** transport 关心 socket 可用性、发送、响应 correlation 和资源释放；handshake 关心 authenticate → initialize → attach 的阶段顺序和终端错误；commands 关心 attach 后可用、普通 RPC error 非终端、连接终止后失效。三者共享同一连接，但变化原因不同，当前通过 request ID、`terminalOnError` 和共享布尔状态隐式耦合。
- **推荐边界、建议 owner 和允许的依赖方向：** transport session owner 应拥有 socket、通用 request correlation、pending rejection 和 close；handshake owner 单向依赖 transport request 能力并显式拥有阶段推进与握手终端错误；command gateway 依赖 ready session，并由 session 通知失效。外部 status、commands callbacks 和 connection/notification handoff 保持不变；公共类型最终 owner 见本报告“四类职责与公共类型 owner”章节。
- **预期收益：** 去除握手阶段对全局 request ID 的隐式依赖；修改握手步骤时不必同时理解 command 和 notification 分支；pending rejection、command invalidation 和终止状态不变量由明确 owner 表达。
- **建议变更范围、最小可审查批次和明确排除范围：** 后续设计只应确定 transport session、handshake owner 和 command gateway 的职责及单向依赖，并以“不改变公开 callbacks、status 序列、RPC 方法、请求结果和关闭行为”为最小批次。具体文件、类、函数和迁移步骤留给后续设计；明确排除 Redux/thread runtime、projection ingress、UI 交互和协议 wire shape 重设计。
- **行为、契约、状态、性能和测试风险：**
  - 行为风险：必须保留 `connecting` → `authenticated` → `initialized` → `attached` 的成功状态顺序。
  - 契约风险：握手 RPC error 必须终止并关闭；command RPC error 只拒绝对应 command，不关闭连接。
  - 状态风险：cleanup、socket error、socket close 和终端 protocol error 都必须拒绝 pending commands；`onCommandsUnavailable` 只能在 commands ready 后触发，terminal error 后的 clean close 不能覆盖错误状态。
  - 性能风险：当前证据未显示性能问题；后续边界不得增加额外 React 状态、消息复制或重复 parsing。
  - 测试风险：cleanup 必须保持幂等并抑制后续 socket callbacks；当前测试未覆盖 duplicate/out-of-order handshake response，不能把该缺口推断为已确认 bug。
- **后续实施时建议的验证范围：** 保持完整握手顺序与 status 序列、ready commands 成功请求、command 非终端错误、各关闭路径下 pending rejection 与 commands invalidation、terminal error 单调性、cleanup 抑制和 malformed message 关闭行为。本轮不运行测试。
- **当前代码关键证据路径与行号：**
  - `codex-gui/src/features/guiHost/guiHostClient.ts:112-162`：socket、终端状态、pending rejection、commands invalidation 和 protocol close 共用生命周期状态。
  - `codex-gui/src/features/guiHost/guiHostClient.ts:164-212`：通用 request、command request 和 handshake request 只以 `terminalOnError` 区分。
  - `codex-gui/src/features/guiHost/guiHostClient.ts:214-237`：socket open/error/close 与同一状态集合耦合。
  - `codex-gui/src/features/guiHost/guiHostClient.ts:248-327`：完成 response correlation 后继续按固定 request ID `1/2/3` 推进握手并启用 commands。
  - `codex-gui/src/features/guiHost/guiHostClient.ts:370-394`：cleanup 和缺少 method/stage 信息的 `PendingRequest`。
  - `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts:31-116`：覆盖 authenticate、initialize、attach、status 顺序和 notification forwarding 的完整 happy path。
  - `codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts:20-76`：覆盖 ready commands 与非终端 command error；同文件 `78-145` 覆盖 cleanup、socket error/close 和终端 protocol error 下的 pending rejection 与 commands invalidation。
  - `codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts:13-80`：覆盖 cleanup 抑制和 terminal status 单调性；同文件 `82-112` 覆盖 malformed message 与 policy close。
  - `codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts:88-214`：提供 raw socket、RPC result/error、未完成握手 connection 和 commands-ready 四层测试支持。
- **关联的既有报告、issue 或专项设计：** 连接和 notification 进入 Redux 后的生命周期见 [RA-03-001](./03-projection-ingress-and-thread-runtime.md#ra-03-001)；测试基础设施边界见 [RA-08-002](./08-test-infrastructure-fixtures-and-support.md#ra-08-002)。无关联 issue 或已有专项设计。
- **已排除项：** 不拥有 bridge 内的 Redux dispatch、projection ingress、snapshot index 或 reconnect；notification parsing/validators 和公共类型 owner 分别由 `RA-02-003` 与本报告 owner 总结覆盖；未将 duplicate/out-of-order response 测试缺口升级为 bug。
- **报告建议：** 进入后续独立设计，显式确定 transport session、handshake 和 command readiness 的 owner 及依赖方向。

#### 测试 helper 覆盖结论

- `RecordingWebSocket` 是 GUI host client 测试所需的最小 socket fake。
- `startGuiHostConnectionWithSocket` 表达“已创建但未完成握手”，`startConnectionUntilCommandsReady` 表达“完整握手成功且 commands ready”；后者具有明确的阶段后置条件，不是表面重复。
- `sendAuthenticateResult`、`sendInitializeResult` 和 `sendAttachResult` 显式表达协议阶段，当前不建议合并为宽泛公共 helper。
- 本报告将这些 helper 记录为非 finding；跨 feature 测试基础设施边界见 [RA-08-002](./08-test-infrastructure-fixtures-and-support.md#ra-08-002)。

### RA-02-003 Runtime protocol guards 声明强于实际验证范围

- **Finding ID：** `RA-02-003`。
- **主报告：** `02-gui-host-transport-and-protocol.md`。
- **Evidence owner：** `02-gui-host-transport-and-protocol.md`；本报告拥有 GUI host runtime wire parsing、projection guards、command response trust 和 protocol error 边界的完整证据。
- **状态：** 确认重构点。
- **重构优先级：** P2。
- **结论摘要：** `guiHostProtocol.ts` 已经是正确的 feature-private runtime protocol owner，但其 type guards 声明返回完整 `@codex-protocol/v2` 类型，实际只检查前端当前消费的部分字段；command success response 则通过泛型断言直接视为生成类型。wire contract、runtime validation 与 transport consumption 之间缺少明确的“完整验证或收窄 DTO”边界。
- **当前 owner 与当前职责：** `guiHostProtocol.ts` 解析 JSON-RPC envelope/error，并验证 attach response 与 projection event/delta/closed notifications；`guiHostClient.ts` 消费这些 guards，决定 protocol error、连接关闭和 typed callback forwarding。生成的 `@codex-protocol/v2` 类型拥有编译时 wire contract；command facade 使用其 params/response 类型，但 runtime result 由 transport 泛型断言。
- **问题类型：** 协议契约、类型归属、重复语义、依赖方向。
- **影响文件、定义侧、构造方、调用方和消费方：**
  - 定义侧：`codex-gui/src/features/guiHost/guiHostProtocol.ts:8-220`；生成 wire 类型位于 `codex-rs/app-server-protocol/schema/typescript/v2/**`。
  - 构造方：`guiHostProtocol.ts:19-45` 构造内部 `RpcMessage`；`47-208` 的 guards 将 `unknown` 收窄为生成类型；`guiHostClient.ts:164-185` 将 command result 断言为泛型 response。
  - 调用方：`guiHostClient.ts:239-368` 是 parser/guards 的唯一生产调用者；commands 构造位于 `205-208`。
  - 消费方：projection callbacks 和 ready command API 消费 typed payload；connection/notification 进入 Redux 后只作为 [RA-03-001](./03-projection-ingress-and-thread-runtime.md#ra-03-001) handoff。
- **共同语义或变化原因：** wire contract 由生成类型定义；runtime boundary 必须明确保证“完整生成类型”或只保证“前端已验证的最小 DTO”。当前 guards 采用后者的检查范围，却采用前者的返回类型；command success payload 又采用第三种完全信任策略。
- **推荐边界、建议 owner 和允许的依赖方向：** 保持 `guiHostProtocol.ts` 为 runtime protocol owner。后续设计应在该边界明确选择完整验证生成 wire 类型，或转换为只包含已验证字段的 frontend-owned DTO。依赖方向只能是 generated wire contract → runtime decoder/adapter → transport client → connection/notification handoff；transport、Redux 和 thread runtime 不自行补充 wire shape 判断。
- **预期收益：** 防止生成 contract 漂移后 guards 继续错误声称完整类型；统一 projection callback 与 command response 的信任策略；让 malformed payload 测试直接对应 runtime boundary，而不是散落在 transport 分支。
- **建议变更范围、最小可审查批次和明确排除范围：** 后续设计只确定 runtime validation contract、返回类型和 transport 依赖方向，并以“不改变 wire shape、RPC 方法、错误文本、close policy 和 Redux handoff”为最小批次。具体 decoder 技术、schema 生成方案、文件移动和代码 patch 留给后续设计；明确排除服务端协议重设计、thread runtime、projection ingress 和 timeline 领域转换。
- **行为、契约、状态、性能和测试风险：**
  - 行为风险：完整验证不能误拒绝生成 contract 允许的 payload；收窄 DTO 必须保留下游实际需要的字段。
  - 契约风险：`Thread`、`Turn`、`ThreadItem` 的完整生成结构当前没有被 guards 完整证明；command success result 也没有 runtime shape validation。
  - 状态风险：protocol refactor 不能改变 terminal protocol error 与非终端 command error 的差异，也不能进入 connection handoff 后的 Redux lifecycle。
  - 性能风险：不得对大型 snapshot 重复深度解析或复制；验证成本需要在后续设计中受控。
  - 测试风险：valid-but-non-object JSON、错误 `jsonrpc` version、缺少生成类型必需字段和 malformed command success response 尚无完整覆盖；不能把这些缺口宣称为已复现 bug。
- **后续实施时建议的验证范围：** 覆盖 attach/event/delta/closed 的有效与 malformed payload、生成 `Thread`/`Turn`/`ThreadItem` 必需字段缺失、JSON-RPC envelope/version/error、`turn/start` 与 `turn/interrupt` success/error，并保持现有关闭策略。本轮不执行测试。
- **当前代码关键证据路径与行号：**
  - `codex-gui/src/features/guiHost/guiHostProtocol.ts:8-45`：宽松 JSON-RPC envelope/error parsing。
  - `codex-gui/src/features/guiHost/guiHostProtocol.ts:47-109`：attach 与 notification 顶层 guards。
  - `codex-gui/src/features/guiHost/guiHostProtocol.ts:111-208`：只验证前端当前使用字段的嵌套 guards。
  - `codex-gui/src/features/guiHost/guiHostClient.ts:11-19`、`239-368`：transport 单向依赖 protocol adapter 并负责 error/forwarding。
  - `codex-gui/src/features/guiHost/guiHostClient.ts:164-185`：command success payload 使用泛型断言。
  - `codex-rs/app-server-protocol/schema/typescript/v2/ThreadProjectionAttachResponse.ts:1-6`、`ThreadProjectionSnapshot.ts:1-6`、`Thread.ts:11-77`：完整生成 attach/thread contract。
  - `codex-rs/app-server-protocol/schema/typescript/v2/Turn.ts:9-37`：完整生成 turn contract。
  - `codex-rs/app-server-protocol/schema/typescript/v2/ThreadProjectionEvent.ts:1-9`、`ThreadProjectionDelta.ts:1-9`：生成 discriminated unions。
  - `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts:155-296`：四类 malformed projection payload。
  - `codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts:20-76`：command wire request、success 和非终端 error。
  - `codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts:31-112`：JSON-RPC error、malformed JSON 和 close policy。
- **关联的既有报告、issue 或专项设计：** connection/notification 进入 Redux 后见 [RA-03-001](./03-projection-ingress-and-thread-runtime.md#ra-03-001)；timeline/domain 转换见 [RA-04-001](./04-timeline-materials-and-domain-models.md#ra-04-001)。无关联 issue 或已有专项设计。
- **已排除项：** 不把 `guiHostProtocol.ts` 本身视为错误 owner；不建议把 validators 移入 transport 或新增宽泛 shared/common protocol 层；不将当前未覆盖场景宣称为已复现 bug。
- **报告建议：** 进入后续独立设计，明确 runtime decoder 的保证范围、返回类型和单向依赖。

## 四类职责与公共类型 owner

- **Launch：** launch URL、token storage、刷新恢复和 fragment 清理由独立 launch params owner 统一拥有；transport、App handoff 和 QR/access 单向依赖它。见 `RA-02-001`。
- **Transport：** transport session 拥有 socket、通用 request correlation、pending rejection 和 close，不拥有 handshake 阶段或 Redux lifecycle。见 `RA-02-002`。
- **Handshake：** handshake owner 显式拥有 authenticate → initialize → attach 的阶段推进与终端错误；不再依赖 request ID `1/2/3` 表达阶段。见 `RA-02-002`。
- **Protocol：** `guiHostProtocol.ts` 继续作为 feature-private runtime decoder/adapter owner；生成类型拥有 wire contract，transport 只消费 decoder 结果。见 `RA-02-003`。
- **公共类型：** `RpcMessage` 保持 protocol adapter 私有；generated projection/turn types 继续归 `@codex-protocol/v2`；`GuiHostStatus`、`GuiHostCommands`、`StartGuiHostConnectionOptions` 和 cleanup 是 GUI host client facade，当前归属合理；`LaunchParams` 归属调整已由 `RA-02-001` 覆盖。
- **与 `03` 的唯一交界：** connection/notification handoff。连接状态进入 Redux 后的 lifecycle、projection ingress、snapshot index、reconnect 和 thread runtime 均不属于本报告。

## 测试与支持文件覆盖状态

| 文件 | 已审核机制 | 覆盖状态 |
| --- | --- | --- |
| `guiHostLaunchParams.test.ts` | URL 解析、storage 恢复、fragment 清理、缺参、storage 写入失败 | `RA-02-001` 完整行为证据 |
| `guiHostHandshake.test.ts` | happy handshake、status、projection forwarding、四类 malformed payload | `RA-02-002` 与 `RA-02-003` |
| `guiHostCommands.test.ts` | command methods/params/result、非终端 error、pending rejection、commands unavailable | `RA-02-002` 与 `RA-02-003`；malformed success response 为后续验证风险 |
| `guiHostProtocolErrors.test.ts` | handshake error、terminal status、malformed JSON、policy close | `RA-02-002` 与 `RA-02-003`；valid non-object/version mismatch 为后续验证风险 |
| `guiHostClientTestSupport.ts` | socket fake、RPC helpers、raw connection、commands-ready setup | 已审核；分层 helper 语义不同，非 finding；跨 feature 基础设施见 [RA-08-002](./08-test-infrastructure-fixtures-and-support.md#ra-08-002) |

## 已排除项

状态：完成。

- `guiHostProtocol.ts` 不拥有 launch 参数、token storage 或 URL 清理语义；其职责限定为 runtime protocol decoding/validation。
- `GuiHostConnectionBridge` 只作为 connection/notification handoff 交界；其中 Redux dispatch、projection ingress、snapshot replay、reconnect 和 runtime 生命周期见 [RA-03-001](./03-projection-ingress-and-thread-runtime.md#ra-03-001)。
- QR UI、popover 交互和 QR URL builder 内部组织见 [RA-07-004](./07-composer-access-and-localization.md#ra-07-004)；本报告只记录其对 `LaunchParams` 的消费依赖。
- Rust GUI host 只作为 launch contract 生产方证据，不评价其模块拆分或实现质量。
- `guiHostClientTestSupport.ts` 中 raw connection、commands-ready helper 和协议阶段 helper 具有不同测试语义，不因表面相似建议公共化。
- 不重设计 wire protocol、RPC 方法、服务端 schema 或生成类型；生成文件只作为前端 contract 证据。
- 不进入 thread runtime、projection ingress、timeline 或 transcript；与 [RA-03-001](./03-projection-ingress-and-thread-runtime.md#ra-03-001) 的交界仅为 connection/notification handoff。

## 风险

状态：完成。

- 后续若建议调整 launch owner，必须保留 `guiHostLaunchParams.test.ts:14-65` 锁定的刷新恢复、缺参、地址栏清理和 storage 写入失败降级行为。
- token 当前会进入 React state 并沿组件 props 传递；后续设计不得借重构扩大敏感值的可见范围或持久化期限。
- 当前 `readLaunchParams` 对 storage `setItem` 异常有降级，但没有同等处理 `getItem` 异常；本阶段只记录为鲁棒性风险，不在静态证据不足时扩张为新 finding。
- transport/handshake 后续重构必须保持 handshake error 与 command error 的终端性差异、pending rejection、commands invalidation、cleanup 幂等和 terminal status 单调性。
- 当前握手推进依赖 request ID `1/2/3`，但现有测试未覆盖 duplicate/out-of-order response；报告只将其作为边界与验证风险，不宣称存在已复现 bug。
- protocol 后续重构必须明确是完整验证生成类型还是返回收窄 DTO，且不得借机改变 wire contract 或把 validation 推入 Redux/thread runtime。
- 深度验证大型 snapshot 可能增加解析成本；后续设计必须控制重复遍历和数据复制。
