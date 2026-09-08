# B12：生成契约与共享 fixture 评审

日期：2026-09-08

状态：批次调查与独立审查已完成；未运行生成、测试或真实环境验收。

依据：[设计](./design.md)、[执行计划](./plan.md)、[覆盖与进度](./coverage-and-progress.md)。源码基线：`63762612e56d332f474a5ba3861b22be761f0479`。

## 范围与方法

本批主覆盖为清单中的 41 个文件：`scripts/protocolValidators/` 的 9 个文件、`src/generated/` 的 14 个文件，以及 `src/features/projection/` 的 15 个 JSON fixture 与 3 个测试／builder 文件。逐文件身份和主归属以覆盖清单为准。

手写代码按输入选择、引用闭包、代码生成、产物检查、失败传播和 fixture 消费链检查。生成代码采用权威来源、生成路径、导出集合、声明对应关系和相关运行分支核对；没有逐行人工解释全部 Ajv 机械生成分支。这里的 41 文件覆盖不表示生成物已经通过重新生成的字节一致性验证。

只读关联证据包括 Rust schema、方法元数据和 TypeScript 导出，GUI host 认证契约，Rust projection fixture 生成器与测试，以及前端直接契约消费者和 ingress 对相关字段的处理。外部实现仅用于核实本批契约，不承担其全面评审。

## 批次结论

已建立 Rust 权威定义到前端生成校验器、声明和共享 fixture 的明确来源链，未发现手写替代协议或导出集合缺项。发现一项 JSON schema 与 TypeScript 对字段可省略性的差异，记录为待验证风险 QR-B12-001；当前证据不足以认定真实后端故障或数据污染。

| 检查维度 | 结论与证据边界 |
| --- | --- |
| 行为正确性 | 输入元数据、消费选择和公开导出能够对应；普通通知的类型收窄存在 QR-B12-001 的保证差异。未运行校验器。 |
| 状态与生命周期 | 生成 CLI 在全部输出准备完成后切换目录，失败时逆序回滚；源码可见对应失败测试。共享 builder 保持 envelope 与嵌套 thread owner 的显式处理。未验证实际文件系统失败路径。 |
| 异常恢复 | 缺失／重复方法、缺失 schema、选中引用无法解析、格式化错误会显式失败；`--check` 报告 missing/stale/extra。没有以回退产物掩盖生成失败。 |
| 契约与安全 | runtime 由权威 schema 经 Ajv 机械生成，声明引用权威 TS；GUI host 与 app-server 使用独立 schema identity。可省略性差异须由权威契约 owner 澄清，不能手改生成物。 |
| 性能 | envelope 与 selected payload 分组，生成器只遍历消费闭包；这些是可见机制，未作运行性能测量，不据此声称性能达标。 |
| 职责与耦合 | CLI、输入选择、standalone runtime、TS AST 产物各有职责；fixture 由 Rust 类型序列化，builder 保留权威类型连接。本次未形成独立可维护性建议。 |
| 测试有效性 | 现有测试覆盖选择失败、可空／可选／联合语义、导出对应、确定性、检查不写入和回滚。fixture 有 Rust 逐字漂移检查及前端组合验证；本轮均未执行，可省略字段经类型谓词进入 ingress 的最小场景尚无本轮执行证据。 |

## 关键链路依据

完整路径相对仓库根；同段省略目录的文件名沿用前述目录，`src/` 路径相对 `codex-gui`。行号对应评审基线。

- `codex-gui/scripts/protocolValidators/cli.ts:313-382` 从 Rust `client-request-definitions.json`、`server-notification-definitions.json`、schema bundle 和 GUI host 两份认证 schema 组装输入；消费方法清单来自 `src/features/guiHost/appServerProtocol.ts:17-45`。
- `codex-gui/scripts/protocolValidators/core.ts:165-217` 核对消费方法和 schema；`standaloneValidatorArtifacts.ts:69-98` 收集引用闭包，`:130-224` 用 Ajv 生成 standalone，再构建 browser ESM。app-server envelope、payload 分组；GUI host 独立生成。
- `codex-gui/scripts/protocolValidators/typescriptArtifacts.ts:89-142` 生成权威 TS 类型引用，`:238-343` 生成 request descriptor；`src/generated/appServerProtocol/notificationDescriptors.ts:167` 起的分类入口调用生成 validator。raw、bundled 与声明中的公开集合为 envelope 1 个、payload 21 个、GUI host 2 个，未发现缺项。
- `codex-gui/scripts/protocolValidators/cli.ts:34-76` 比较文件集合与内容；`:271-288` 将 check 与 write 分开。`:120-174` 回滚切换结果；`cli.test.ts` 覆盖失败恢复与检查不写入。测试内容已读，结果未运行。
- `codex-rs/app-server/src/thread_projection_fixtures.rs:43-59` 注册 15 个 fixture，`:89-167` 从协议类型序列化。`thread_projection_fixtures_tests.rs:282` 将生成结果与前端提交的 JSON 逐字比较，避免只靠前端 import assertion 宣称契约正确。
- `codex-gui/src/features/projection/__tests__/projectionFixtures.ts` 导入上述 JSON，`projectionTestBuilders.ts` 通过权威类型、`Extract/Pick/Omit` 和显式返回类型构造派生样本；`projectionFixtures.test.ts` 检查 envelope、事件类型与提交链。`src/features/guiHost/__tests__/generatedAppServerProtocol.test.ts:91`、`:242-256` 关联现有 validator 与共享 fixture。

## QR-B12-001：通知校验谓词与权威类型的字段可省略性不同

分类：待验证风险。优先级：待跨批影响核实后确定；不能仅凭类型保证差异确定产品缺陷级别。

### 证据与触发条件

`codex-rs/app-server-protocol/src/protocol/v2/thread_projection.rs:67-72` 的 `parent_commit_id` 是 `Option<String>`。权威 JSON schema 允许省略它，权威 TS 则声明一个必有的 `parentCommitId: string | null` 属性：

- `codex-rs/app-server-protocol/schema/json/codex_app_server_protocol.schemas.json:22567-22599` 的 required 不含 `parentCommitId`。
- `codex-rs/app-server-protocol/schema/typescript/v2/ThreadProjectionEventNotification.ts:6` 将该属性声明为必有。
- `codex-gui/src/generated/appServerProtocol/appServerPayloadValidators.js:12079` 的必填检查与 schema 一致；`:12105` 仅在属性存在时检查其字符串／null 类型。
- `codex-gui/src/generated/appServerProtocol/appServerPayloadValidators.d.ts:48-55` 直接使用权威通知类型，而 `src/features/guiHost/appServerProtocol.ts:4` 的 `ProtocolValidator<T>` 声明 `value is T`。

因此，保留合法事件的其他字段、仅省略 `parentCommitId` 时，静态代码显示 runtime 校验不会因该字段缺失而失败；它给出的类型谓词却不包含 undefined。该结论来自代码分支，未执行该反例。Rust 反序列化的可省略语义与 TS 可空属性不是同一保证，不应把省略自动认定为违反 JSON schema。

### 影响与已排除项

实际后端是否会省略该字段尚未证实。当前 Rust 生成 fixture 明确携带 null 或字符串，不能从 schema 接受范围推断真实服务器发送行为。

已只读核实直接消费者：`codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts:105-125` 对非重复事件比较 `parentCommitId` 与 cursor head；正常 cursor head 为 null 或字符串时，缺失字段导致 `commitChainMismatch`。`:174-185` 返回 `manualReconnectRequired`。这条证据排除了在该正常 cursor 前提下“缺失 parentCommitId 仍被静默接受并推进 head”的判断；重复 commit 会先被忽略。没有数据污染证据。

剩余风险是 validator 的静态保证与输入接受范围不同，以及若真实合法输出出现这种省略，前端可能进入手动重连。其他字段、异常 attach cursor 与完整恢复路径不在本条现有证据范围内，由相关批次按实际链路核实。

### 根因与整改交接

确认的技术差异位于权威 JSON schema 和 TS 导出之间；前端 `typescriptArtifacts.ts:115-142` 对普通 response/notification 直接使用 TS 类型，将差异带入类型谓词。auxiliary 路径 `:98-111` 会按 schema required 机械派生 `Partial & Required<Pick<...>>`，但不能未经评估就将该实现推广到全部协议。

涉及模块：Rust app-server-protocol 权威导出 owner、前端协议生成器、B02 协议入口、B05 ingress；必要时关联 B03 恢复协调。

修正方向：先明确输出契约对“缺失／null”的真实保证及 TS/schema 分别表达的方向，再由权威 owner 统一生成或转换保证。不得在前端手写字段清单、重复 DTO、静默 fallback，或直接手改 validator 和 fixture。尚无已确认产品故障，当前不生成源码修复任务。

验收条件：

- 权威 JSON schema、TS、生成 runtime 和类型谓词对该字段的保证有一致且可说明的来源。
- 覆盖缺失、null、合法字符串及错误类型，分别核对校验结果与 ingress 结果。
- 保留重复 commit 忽略、提交链不匹配阻断与手动重连约束，不通过放宽断言或删除检查消除差异。
- 所有产物仍经原有生成路径产生，并通过精确产物检查；真实后端行为若未验证，继续保留证据边界。

关联问题：当前无其他稳定编号；交接至 B02/B05/B03 的相应契约与恢复链路，最终去重由跨模块报告处理。

## 验证记录与交接

调查节点仅执行只读搜索与文件读取；编辑节点仅创建本报告。未运行测试、protocol 生成／检查、构建或真实 runtime；没有“测试通过”结论。

| 建议验证 | 回答的问题 | 当前状态 |
| --- | --- | --- |
| 现有 `src/features/guiHost/__tests__/generatedAppServerProtocol.test.ts` | 已提交 validator 与共享 fixture 的组合是否仍成立 | 未执行，交主代理选择 V 节点 |
| 现有 `src/features/projection/__tests__/projectionFixtures.test.ts` | fixture envelope 和提交链断言是否通过 | 未执行 |
| 现有 `protocol:check-validators` | 14 个提交生成文件是否与本基线输入逐字一致 | 未执行；需精确 V 节点，check 不写入源码 |
| QR-B12-001 最小省略字段场景 | 类型谓词接受范围与 ingress 处理是否符合权威输出契约 | 未执行；本轮不新增测试，先由跨批证据收敛 |
| Rust `generated_fixtures_match_committed_files` | fixture 与当前 Rust 序列化是否逐字一致 | 仅检查其实现；外部测试不在默认授权内 |

Level 1：以上自动化均未执行。Level 2／Level 3：本批为生成契约和静态调查，不触发真实 GUI 验收；未执行且不以静态结果替代。

`projectionFixtures.test.ts:20-35` 的历史字段检查数组未包含 token usage fixture；Rust 对全体生成 fixture 做递归检查，前端生成协议测试另有 token usage 合法与错误嵌套 payload 断言。本批将其记为已排除的独立缺陷候选，不仅凭数组数量提出修复。

报告主覆盖范围保持 41 文件；字节级生成一致性、现有测试结果和真实后端省略行为均仍有明确验证缺口。独立报告审查及跨模块契约差异交接已完成，不执行源码修复。
