# B02 连接、认证与 RPC 边界评审

日期：2026-09-08。代码基线：`63762612e56d332f474a5ba3861b22be761f0479`。

调查节点：I-B02-1；报告节点：E-B02。状态：调查与独立复核完成。仅静态读取，未运行测试、修改源码或执行真实环境验收。

## 范围与结论

主覆盖为 `codex-gui/src/features/browserLaunch/**` 与 `codex-gui/src/features/guiHost/**` 的全部 20 个文件，包含实现、测试和测试支撑。逐文件身份、归属和全局进度以 [覆盖清单](./coverage-and-progress.md) 为准。

本批未确认独立产品缺陷，未提出单凭规模或风格的可维护性整改。保留一项 RPC 错误与交付事实之间的待验证风险 QR-B02-001，交给 X01 核对消费者及后端语义。此结论不表示生产行为已全面验证，也不表示已发生重复发送。

## 七维检查

| 维度 | 结论与依据 |
| --- | --- |
| 行为正确性 | 认证成功后才初始化，初始化成功后才发布命令；重复响应不重复推进，路由只接受成功且合法的最终 match。`guiHostHandshakeController.ts:38`、`guiHostClient.ts:136`、`guiRouteTarget.ts:29`。 |
| 状态与生命周期 | transport、handshake、gateway 分别拥有 pending 请求、握手进程与命令可用性；pending 在回调前移除，gateway 失效后不可重新激活，cleanup 拆除 socket handlers。`guiHostTransportSession.ts:301`、`guiHostCommandGateway.ts:103`、`guiHostClient.ts:249`。 |
| 异常恢复 | 已发送请求遇到断线、缺失或畸形 result 为未知交付；发起前不可用不发送。RPC error 一律明确拒绝的业务依据尚未闭合，见 QR-B02-001。 |
| 契约与安全 | 参数和响应从权威 `ClientRequestDefinition` 派生，通知从权威 `ServerNotification` 派生，运行校验使用生成物；token 先写存储再清 URL，写失败显式传播。host allowlist 与本批消费的方法对应。 |
| 性能 | 每条消息一次解析及相关生成校验；请求按 id 从 Map 取出，不扫描全部 pending。失效时遍历 pending 以完成所有结算。未发现具有具体触发证据的性能缺陷；未做吞吐或内存测量。 |
| 职责与耦合 | facade 组织 socket 事件，握手不拥有业务队列，gateway 不拥有会话生命周期；目前未见需单独整改的多重状态权威。交付分类是跨边界假设，需与消费者和服务端共同核实。 |
| 测试有效性 | 已读测试覆盖顺序、重复响应、生成校验、ready handle 失效、断线 pending、存储失败和非法路由。测试可验证前端分类实现，不能证明 RPC error 必然没有业务副作用。未将阅读断言记为测试通过。 |

上述未加目录的文件位于本批对应 feature 目录；下文关键证据使用完整仓库相对路径。

## 关键链路依据

### 授权与路由

`codex-gui/src/features/browserLaunch/browserAuthorizationSession.ts:59-80` 在 fresh fragment launch 时生成新 persistence context，写成功才清 fragment；恢复路径保留既有 context，历史记录缺少 context 时先补持久化。`commitActiveThread` 与 `clearActiveThread` 均在持久化成功后替换内存快照，失败不制造已保存假象。

`guiRouteTarget.ts` 直接使用 GUI host 生成的 path segment 常量，并拒绝错误、pending、not-found match、额外 query 与不合法 UUID。测试验证大小写 UUID、空 query 和非法路径。此处的 activeThreadId 是当前恢复目标；本批没有据此推导 TUI 原始任务锚点。

### 认证到命令与通知

`guiHostHandshakeController.ts` 用 started/active 防重复推进与 stop 后的迟到响应；`guiHostClient.ts:143-146` 先发布 initialized 状态，再尝试激活 gateway，因此状态回调同步 cleanup 不会重新发布旧 handle。对应测试覆盖 initialized/ready 回调内 cleanup。

`guiHostTransportSession.ts:153-181` 先清 pending，再逐个结算，即使一个结算回调抛错，也继续结算其他请求后传播首个错误；dispose 使用 finally 拆 handler 并关闭 socket。单次业务响应失败不自动使整条连接失效。

`guiHostClient.ts` 先验证 JSON-RPC envelope，再按 request id 结算或分类通知。选中通知参数畸形会报告协议错误并失效连接，已知但未消费通知不转发。权威路径为 `codex-rs/app-server-protocol/schema/typescript/**` → 前端生成 descriptor/validator → transport 与 facade；生成链全面主评审归 B12。

只读核对 `codex-rs/gui-host/schema/typescript/browserContract.ts`、`codex-rs/gui-host/src/filter.rs:1-35` 与 `ws.rs:128-225`：host 认证后才连接 backend，认证有 host timeout，前端请求与通知集合有对应 allowlist，转发的是文本消息。`ws.rs:279-299` 拒绝同时包含 result/error 的 backend envelope，因而前端 envelope validator 接受该额外字段组合不构成已确认的当前生产路径缺陷。

关联读取 `codex-gui/src/features/appShell/guiHostConnectionLifecycle.ts:128-178` 和 `activeThreadSession.ts:402-427`：mount inactive 后不处理回调；连接失效 dispose controller 后，projection 不再传入成员。关联文件不因此取得 B02 主覆盖状态。

## QR-B02-001：RPC error 的明确拒绝分类缺少完整业务保证

分类：待验证风险。优先级：P2 调查优先级；依据是该分类直接影响输入队列的失败处理，尚未证明当前 GUI 可触发已接受后报错或发生重复发送，不按潜在后果宣称已确认高优先级缺陷。

位置与证据：

- `codex-gui/src/features/guiHost/guiHostTransportSession.ts:261-269` 将所有关联 RPC error 标为 `definitelyNotAccepted`，没有按业务错误含义区分。
- `codex-gui/src/features/composerInputQueue/composerInputQueueCoordinator.ts:209-211` 使用该字段选择明确拒绝或未知交付。
- `codex-rs/core/src/session/mod.rs:884-909` 明示已排队调用不会因丢弃等待者而撤回，reply 通道失效返回 `InternalAgentDied`。`codex-rs/app-server/src/request_processors/turn_processor.rs:641-645`、`:1040-1044` 将 Core 错误映射为普通 RPC error。
- `codex-rs/core/src/session/turn_input.rs:279-282`、`:485-488` 先接受 steering 输入，再调用 `apply_steered`；`:186-194` 表明 settings 更新可能返回错误，`:638-650` 可见输入进入队列。X01 已核实当前 GUI 不提供这些 settings overrides，默认更新直接成功，因此该失败分支不能作为当前 GUI 可达反例。

触发条件与影响：需要先证明当前 GUI 发出的请求能走到“输入已接受或无法确认，但返回 RPC error”的路径，再核对消费者是否以明确拒绝处理并允许再次交付。现有静态材料不足以证明重复发送已发生，也不足以把所有 RPC error 视为无副作用保证。

根因或缺口：传输 envelope 类别被用于推导业务交付事实；缺少对当前请求参数、服务端部分完成或回复失效、队列重试行为的完整串联。Core 的可失败类型本身不作为已发生部分提交的证明。

验证状态：未运行测试。既有 `guiHostTransportSession.test.ts`、`guiHostCommandGateway.test.ts` 验证当前前端分类和失效行为，不能消除此业务保证缺口；未找到能回答该问题的现有前端测试，不为形式覆盖启动无关全套测试。

整改交接：

- 涉及模块：guiHost transport/gateway、composerInputQueue；直接外部证据涉及 app-server turn processor 与 Core input routing。
- 修正方向：先核实当前可达路径；若确认分类不能由服务端保证，应让交付结论依赖可证明的业务结果，并保持未知交付的恢复屏障。本报告不指定具体实现或授权修改后端。
- 必须保留：未知交付不得自动重发；明确拒绝应有未接受输入的证据；不得用吞错误或弱化测试换取通过。
- 验收条件：明确拒绝分支可证明没有记录或入队输入；已接受后回复失效或后续失败不会进入可自动重复交付路径；合法明确拒绝仍可按既有产品规则处理。
- 关联：X01 发送到展示链路、B09 队列；当前正文唯一保留于本报告，其他报告用编号引用。

## 排除与验证边界

`guiHostHandshakeController.ts:128-130` 对 send/unavailable 静默停止由现有测试明确覆盖。注入 socket 的 send throw 可让握手不继续，但本批未证明生产原生 WebSocket 当前握手时序能触发该异常且没有后续 close/error，因此不登记确定缺陷。对任意消费者 callback 抛错导致 facade 后续清理中断的假设，同样未闭合实际生产触发条件，不用合成异常推断用户可见故障。

未将缺少客户端超时单独列为缺陷：host 已有认证时限，其他 RPC 未确认统一时限需求。没有因文件大小、测试数量或防御机制存在而提出重构。

Level 1：本批未执行，现有测试仅静态检查。Level 2：未执行，真实 runtime 不在默认授权中。Level 3：未执行，本批没有依赖可见桌面状态的结论。不宣称整体 GUI 验收通过。

## 覆盖与交接

已逐一读取的主范围共 20 文件：browserLaunch 的 `browserAuthorizationSession.ts`、`guiRouteTarget.ts` 及各自测试；guiHost 的 `appServerProtocol.ts`、`guiHostClient.ts`、`guiHostCommandGateway.ts`、`guiHostHandshakeController.ts`、`guiHostProtocol.ts`、`guiHostTransportSession.ts`；其 `__tests__` 下 `generatedAppServerProtocol.test.ts`、`guiHostClientTestSupport.ts`、`guiHostCommandGateway.test.ts`、`guiHostCommands.test.ts`、`guiHostGeneratedProtocol.test.ts`、`guiHostHandshake.test.ts`、`guiHostHandshakeController.test.ts`、`guiHostProtocolErrors.test.ts`、`guiHostTestSupport.ts`、`guiHostTransportSession.test.ts`。本批范围内无排除文件。

独立复核与 X01 已完成；QR-B02-001 保留为有边界的待验证风险。若需要仅验证前端失效行为，可建立单独 V 节点选择 `guiHostTransportSession.test.ts`、`guiHostProtocolErrors.test.ts` 或 `guiHostCommandGateway.test.ts`；它们不替代业务交付保证核实。

## X01 最终收敛

当前 GUI start 只发送 thread/input/client ID，steer 另带 expectedTurnId；未提供 settings overrides。`turn_processor.rs:689-700,752-890,1030-1044` 与 `turn_input.rs:88-110,186-194,270-324,452-488` 未闭合正常路径接受输入后返回 RPC error 的具体触发。reply 通道失效仅提供可失败类型，不能据此升级缺陷。coordinator `:835-839,862-867` 明确拒绝后进入 recovery 并停止当前 effects，不立即自动重发；需用户显式恢复才可能重提。后续调查应证明当前参数下接受后报错及显式恢复的幂等语义。
