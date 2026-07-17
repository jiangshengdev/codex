# Codex GUI 协议校验器包体积优化设计

状态：已确认

## 唯一主目标

在保持 Rust JSON Schema 为唯一权威来源和现有已消费消息校验语义的前提下，重新设计 `codex-gui` 的前端协议校验生成链，使生产构建只包含 GUI 实际需要的 Ajv standalone validator 及其引用闭包，显著降低 validator 对主入口和最终打包目录体积的影响。

## 与既有设计的关系

本设计承接 `docs/superpowers/specs/2026-07-16-codex-gui-authoritative-contract-generation-design.md`，不推翻其 Rust authority、`ts-rs`、`schemars`、Ajv standalone、generated drift check 和 GUI Host transport 迁移结论。

既有设计已经明确：如果完整 `ServerNotification` validator 对 bundle 影响不可接受，只能由生成器从 Rust metadata 机械拆分为 per-method validator，不能恢复 frontend-owned DTO、手写 method union 或手写 structural validator。本设计只落实该性能扩展点，并修正当前生成根与实际消费边界不匹配的问题。

## 已确认决策

- 保留 Ajv standalone，不在本次变更中替换为 Zod、Valibot、TypeBox、SchemaSafe、解释执行型 JSON Schema validator 或 Rust/WASM validator。
- 生成物使用 ESM，并按运行时职责分组；不是每个 validator 独立生成一个文件。
- JSON-RPC 外层结构继续严格校验，但 `params` 与 `result` 在 envelope 阶段保持 opaque。
- 只有 GUI 实际消费的 response result 和三个 `thread/projection/*` notification payload 执行完整 schema validation。
- 其他 Rust 权威源中已知、但 GUI 不消费的 notification 只校验 envelope 后忽略，不递归校验 payload。
- 未知 method、非法 JSON-RPC envelope、非法已消费 payload 继续按协议错误处理。
- 优先通过缩小 schema root 和引用闭包解决体积问题，而不是把同样的大代码移动到异步 chunk 或调高 Vite warning limit。

## 现状与根因

### 构建证据

使用同一套现有 Node、Vite 与 `node_modules` 对 2026-07-16 的关键提交进行隔离构建，结果为：

| 状态 | 主 JavaScript | 全部构建产物 |
|---|---:|---:|
| `480643e08`，validator 生成前 | 719,576 B | 11,003,222 B |
| `65bdc2da3`，只生成 validator | 719,576 B | 11,003,258 B |
| `4af8b73d7`，transport 开始消费 validator | 1,310,412 B | 11,594,094 B |
| 当前日终状态 | 1,320,592 B | 11,604,274 B |

从生成前到当前：

- 主 JavaScript 增加 601,016 B，约 83.5%；
- 主 JavaScript gzip 约从 230.16 kB 增至 278.16 kB；
- 全部构建产物增加 601,052 B，约 5.46%；
- `4af8b73d7` 激活约 590.8 kB，占本次新增体积的绝大多数。

Shiki 全语言、主题和 Oniguruma WASM 动态资产在 2026-07-16 之前已经存在，基线构建与当前构建的相关 chunk 文件名和大小一致。它们是最终目录长期较大的独立问题，不是本次 validator 回归的根因，也不纳入本设计。

### 生成根过宽

当前 generator 无条件把以下 schema 作为 Ajv standalone root：

- 完整 `JSONRPCMessage`；
- 完整 `ServerNotification`；
- GUI 选中 request 的 response schema。

完整 `ServerNotification` 包含约 70 个 notification variant。GUI Host transport 实际只路由：

- `thread/projection/event`；
- `thread/projection/delta`；
- `thread/projection/closed`。

Ajv 会为被选择的 root 编译完整可达引用闭包。ESM tree shaking 可以删除未使用的 export，却不能删除一个已使用的 `validateServerNotification` 或 `validateJSONRPCMessage` 函数内部的无关 union 分支。因此当前问题不是输出格式仍为 CommonJS，也不是 Ajv runtime 被打入浏览器，而是生产代码实际使用了两个过大的 validator root。

### 单体 registry 扩大保留范围

当前 generated registry 把 JSON-RPC、ServerNotification 和多个 response validator 聚合进同一个对象，transport 再从 barrel 入口导入 registry、request descriptors 与 notification validator。聚合对象使 bundler 更难证明某个属性永远不会使用，也模糊了每个 runtime 边界的真实依赖。

本设计不依赖 bundler 对聚合对象做属性级消除。调用方必须通过静态 named import 直接依赖所需 validator。

## 设计约束

- Rust 类型、Rust JSON-RPC 定义和 Rust generated metadata 是唯一协议权威源。
- 不在前端手写 payload DTO、JSON Schema、字段清单、method union、response map 或 type predicate。
- frontend-owned method selection 只表达“GUI 消费哪些权威 method”，不能复制这些 method 的 params 结构。
- 生成输入缺失、method 重复、mapping 不完整或权威 schema 结构不符合预期时必须失败。
- Rust 权威源的不兼容变化必须通过 generation、type-check、测试或 build 传播到前端。
- JSON 仍只 parse 一次；validator 不 clone、normalize 或 stringify payload。
- 不把 schema compiler、`new Function` 或完整 JSON Schema bundle 带入浏览器运行时。
- 不改变合法 response、projection callback、pending request、terminal/non-terminal error policy 和 socket cleanup 顺序。
- 不新增生产依赖。Ajv 与 esbuild 继续只承担现有生成职责。
- 不扩大到 Streamdown、Shiki、Markdown rendering、Redux 或 UI 架构优化。

## 权威 metadata 扩展

### Request metadata

现有 request-definition artifact 继续表达：

- wire method；
- params TypeScript 类型；
- response TypeScript 类型；
- params schema ID；
- response schema ID。

前端 `APP_SERVER_REQUEST_METHODS` 继续只选择 GUI 实际发起的 request。generator 根据该列表从 Rust metadata 中选择 response root，不从 TypeScript 文件名或调用点猜测映射。

### Notification metadata

Rust app-server protocol generation 增加 notification-definition metadata，机械表达：

- wire method；
- notification union variant；
- params TypeScript 类型；
- params schema ID；
-完整 notification envelope schema ID 或足以机械构造该 envelope 的权威关联。

该 metadata 来自生成 `ServerNotification` 判别联合的同一 Rust owner。不得由前端遍历生成后的 TypeScript 文本、解析类型名或维护第二份 method-to-params 映射。

前端增加 `APP_SERVER_NOTIFICATION_METHODS`，只包含三个 projection method，并使用 generated `ServerNotification["method"]` 或等价机械类型约束检查 method literal。这个列表只表示消费范围；payload 类型与 validator 映射仍完全来自 Rust metadata。

### JSON-RPC envelope metadata

现有 Rust `JSONRPCMessage` 已经是专用于 transport 分派的浅层 JSON-RPC envelope：request/notification 的 `params` 和 response 的 `result` 均为 opaque JSON value。生成链继续直接导出并消费该权威 schema，不新增第二个 envelope 类型。它必须保留权威 JSON-RPC 结构，包括：

- JSON-RPC version；
- request、notification、success response 与 error response 的互斥关系；
- id、method 和 error object 的合法形状；
- Rust 权威源中全部合法 method discriminant。

`params` 与 `result` 在该 schema 中继续使用 opaque JSON value，只负责确认 envelope 可安全分派，不递归承诺具体 payload 类型。全部合法 notification method 则来自 Rust notification metadata，用于区分“已知但未消费”和“未知”。

该 envelope schema 必须继续由 Rust 协议 owner 生成，不能由前端通过删除属性、替换 `$ref` 或手写宽松 schema 得到。这样 envelope 语义变化仍会通过 Rust generation 传播。

## ESM 生成架构

### 产物分组

app-server validator 生成物拆成两个职责组：

```text
codex-gui/src/generated/appServerProtocol/
  jsonRpcEnvelopeValidators.js
  jsonRpcEnvelopeValidators.d.ts
  appServerPayloadValidators.js
  appServerPayloadValidators.d.ts
  requestDescriptors.ts
  notificationDescriptors.ts
  index.ts
```

`jsonRpcEnvelopeValidators.js` 只包含浅层 envelope validator。它不能引用完整 `ServerNotification`、完整 request params、完整 response result 或业务 payload definition。

`appServerPayloadValidators.js` 在同一次 Ajv standalone generation 中生成：

- selected request response validators；
- `thread/projection/event` validator；
- `thread/projection/delta` validator；
- `thread/projection/closed` validator。

这些 root 在同一 Ajv 实例和同一次 standalone generation 中编译，使 `Thread`、`Turn`、`ResponseItem` 等共同可达 definition 能在模块内部复用校验函数。不得默认采用“每个 validator 一个独立 Ajv 输出文件”，避免公共引用闭包重复。

GUI Host 私有 authenticate validator 继续属于独立 `generated/guiHostContract` 组，不与 app-server payload validator 合并。

### Ajv 输出与机械 bundling

Ajv 保持：

```text
code.esm = true
code.source = true
```

每个职责组分别调用 `standaloneCode()`。如果生成物引用 `ajv/dist/runtime/*` helper，继续由现有 esbuild 以 browser ESM 方式机械 bundle；esbuild 不改变 validator 逻辑，也不把多个职责组重新合并成单体文件。

生产 validator 只需要 boolean 结果和首个错误用于内部诊断，不消费完整错误集合。因此将 `allErrors` 从 `true` 调整为 `false`。这不改变合法/非法判定，只减少无用分支和错误累积代码。若现有测试或诊断路径确实依赖多错误集合，必须先明确证据；不能为假设性的调试需求保留体积成本。

### Tree-shaking contract

生成物必须满足以下静态模块约束：

- 每个 validator 是顶层 named export；
- 模块顶层不得注册全局状态、执行 runtime compilation 或产生其他 side effect；
- descriptors 直接 import 具体 validator export；
- 禁止生成包含全部 validator 的 eager registry object；
- `index.ts` 只能使用纯 ESM re-export，生产调用方优先直接从职责模块或 descriptor 导入；
- 不使用动态属性名查找 validator；
- 不通过 `unknown` registry 再恢复类型关系。

Tree shaking 是生成物的辅助能力，不是主要缩减手段。即使 bundler 保守地保留整个 `appServerPayloadValidators.js`，该模块本身也只能包含 GUI 已选择的 payload root，不能包含完整协议闭包。

## 运行时数据流

### 统一入口

```text
WebSocket data
  -> JSON.parse once
  -> validateJsonRpcEnvelope
  -> envelope kind dispatch
```

JSON parse 或浅层 envelope validation 失败时，继续使用稳定的 malformed JSON-RPC protocol error，并按现有 terminal policy 关闭连接。

### Success response

```text
success response envelope
  -> numeric pending request correlation
  -> pending descriptor.validateResponse(result)
  -> typed Promise resolve
```

response payload 只由发起该 request 时保存的 generated descriptor 校验。缺失 result、错误 result 类型、late response、duplicate response 和 unmatched response 的既有行为保持不变。

### Error response

error response 的 code、message、id 和 envelope 互斥关系由浅层 validator 校验。correlated command error 继续只 reject 当前 command；handshake error 继续是 terminal。该路径不需要完整 app-server payload schema。

### Notification

```text
notification envelope
  -> method lookup
  -> selected projection method
       -> generated method-specific payload validator
       -> exhaustive projection routing
  -> known but unconsumed method
       -> ignore without recursive payload validation
  -> unknown method
       -> protocol error
```

明确属于三个 projection method、但 params 不合法时，继续使用现有 method-specific malformed payload error 和 terminal close policy。

合法但未消费的 notification payload 不进入 Redux、projection callback 或其他业务路径，因此不再承担递归校验整个 app-server notification universe 的成本。

### Server request

如果权威 JSON-RPC envelope 允许 server-to-client request，GUI 当前不支持的合法 server request 在 envelope 校验后按现有 transport policy 忽略，不构造 response，也不把 params 解释为任何 generated payload 类型。未来若 GUI 开始消费某个 server request，必须通过独立设计把对应 method 和 params schema 加入 selection metadata。

## 类型关系与失败传播

`notificationDescriptors.ts` 由 generator 根据 Rust notification metadata 和 `APP_SERVER_NOTIFICATION_METHODS` 产生。每个 descriptor 至少机械绑定：

- wire method；
- generated notification envelope 类型；
- generated params 类型；
- method-specific runtime validator。

调用方通过 method 判别后获得对应 generated 类型，不写 `as ServerNotification`、`Record<string, unknown>` 或 frontend-owned payload predicate。

生成器必须为以下情况失败：

- selected method 不存在；
- selected method 对应多个 metadata 条目；
- params schema ID 缺失；
- envelope schema 与 metadata method 不一致；
- standalone named export 与 declaration 不一致；
- descriptor 缺少对应 runtime validator；
- Rust metadata 新增或修改已消费 variant，但 vendored frontend artifact 未更新。

Rust 新增 GUI 不消费的 notification 时，不应扩大 payload validator 输出，也不应造成无关 bundle 漂移；浅层 envelope 中的合法 method 集合会随权威 artifact 更新。

## 错误与安全语义

- 未知 method 仍视为协议错误，不能与“已知但未消费”混为一类。
- 已知但未消费的 payload 即使字段不符合其完整业务 schema，也只要 envelope 合法便忽略；这是本设计明确接受的运行时语义变化。
- 该放宽只适用于不会进入 GUI 业务逻辑的消息。任何将要被读取、路由、存储或显示的 payload 都必须先通过对应权威 validator。
- projection payload、handshake response 和 command response 的合法/非法判定继续由 Rust schema 决定。
- validator errors 只用于内部诊断与测试，不把 schema path、Rust 类型名或 Ajv keyword 直接暴露到 UI。
- 不改变 launch token、WebSocket authentication、origin/host 或 session storage 安全边界。

## 其他库评估结论

SchemaSafe 等 JSON Schema validator 可能产生不同大小的代码，但完整编译约 70 个 notification variant 时仍会承担同类闭包成本。Zod、Valibot、TypeBox 和 typia 会改变或增加 schema 表达层；解释执行型 validator 会把 schema 与解释器带入运行时；Rust/WASM 会引入新的加载和跨边界成本。

当前证据已经把根因定位为 schema root 与消费范围不匹配，而不是 Ajv 版本或 Ajv runtime。因此本次不增加替代库依赖，也不把库 benchmark 设为实施前置条件。完成 schema slicing 后，如果 validator 仍未达到体积完成标准，再开启独立评估，不在本设计内预先扩大范围。

## Generated artifact 与命令边界

- `just write-app-server-schema` 继续负责 Rust TypeScript、JSON Schema、request metadata、notification metadata 和浅层 envelope schema。
- `codex-gui` 现有 protocol-validator generator 继续负责读取 vendored artifact 并生成 Ajv ESM、declarations 和 descriptors。
- write 模式必须原子更新同一 generated group；check 模式只比较，不写文件。
- 连续生成两次必须 byte-for-byte 一致。
- generated JavaScript 保持不透明；不得通过手写 patch、字符串替换或 AST 变换重写 Ajv validator 内部逻辑。
- TypeScript declarations 和 descriptors 继续通过 TypeScript Compiler API 生成并由项目 formatter 格式化。
- Vite、Vitest 与 TypeScript 的 alias 必须解析到同一 vendored/generated owner。

## 验证策略

### Generator 单元验证

- selected request response 和三个 projection method 能从 Rust metadata 精确解析；
- missing、duplicate、mismatched method/schema mapping 失败；
- envelope ESM 不包含业务 payload definition；
- payload ESM 不包含未选择 notification method；
- 同组 validator 对共同 `$ref` 生成可共享的内部校验函数，而不是每个 export 复制完整闭包；
- named exports、declarations 与 descriptors 一致；
- `allErrors: false` 下合法/非法判定与当前已消费 payload 测试一致；
- write/check、稳定排序和 byte-for-byte determinism 保持有效。

### Transport 行为验证

- malformed JSON、非法 envelope 和未知 method 继续 terminal；
- 合法但未消费 notification 即使 payload 不完整也被忽略；
- 三个 projection method 的合法 payload 继续到达原 callback；
- 三个 projection method 的非法 params 继续 terminal；
- selected response 的合法 result 正常 resolve；
- malformed result、missing result、JSON-RPC error、late response 和 cleanup policy 不变；
- JSON 仍只 parse 一次。

### 生产构建验证

使用相同 Node、pnpm、Vite、依赖树和构建命令记录以下对比：

- 主 JavaScript raw 与 gzip 大小；
- 全部 `dist` 文件 raw 总大小；
- JavaScript 文件数；
- generated validator 源文件 raw 大小；
- 主入口是否仍包含未消费 method literal。

至少验证主入口和全部构建产物均相对当前状态减少 400 kB。若未达到该门槛，不得通过提高 `chunkSizeWarningLimit`、异步搬移同一代码或仅调整报告方式宣称完成；必须重新检查 schema root、重复闭包和静态 import graph。

产物中不得再出现仅由完整 notification validator 带入的未消费 method，例如 `windowsSandbox/setupCompleted`。Shiki chunk 数量和大小应保持不变，以证明本次结果没有混入无关 Markdown/highlighting 优化。

### Drift 与权威链验证

- Rust fresh generation 与 vendored schema/metadata 一致；
- frontend validator check 模式无 diff；
- Rust 修改已消费 method 或 payload 时，frontend generation/type-check/build 能失败；
- Rust 新增未消费 notification 时，payload validator ESM 不增长；
- Rust 新增合法 method 时，浅层 envelope 的 method 集合机械更新。

## 兼容性与 breaking-change 分析

### Wire API

不修改 app-server request、response、notification 或 GUI Host wire payload，不新增 v2 method，也不改变 CLI、config、rollout resume 或 raw response item event。

### Runtime behavior

合法已消费消息行为保持不变。唯一明确的语义变化是：合法 method 的未消费 notification 不再递归验证 params；其 payload 无论是否满足完整业务 schema 都被忽略。未知 method、非法 envelope 和非法已消费 payload 仍是协议错误。

### TypeScript API

`GuiHostCommands` 和现有 projection callbacks 的公开类型保持不变。generated registry 与内部 transport import 会调整，但不扩大为 React、Redux 或其他 feature 的公共 API 重构。

### Generated artifacts

现有单体 `standaloneValidators.js`、对应 declarations 和 eager registry 会被新的职责分组产物替代。它们是内部 generated artifact，不是外部兼容接口。

## 实施边界

后续实施计划应保持以下可审查边界：

1. Rust notification metadata 与浅层 JSON-RPC envelope schema；
2. frontend generator 的 schema selection、分组 Ajv ESM 与 declarations；
3. descriptors 与 GUI Host transport 消费迁移；
4. focused behavior、drift 和 production bundle verification；
5. 验证完成后更新相关 issue 的 bundle 证据。

本设计不授权实施。设计确认后才能编写实施计划；实施计划再次确认后才能修改代码或生成产物。

## 非目标

- 不替换 Ajv。
- 不引入替代 validator benchmark 或新依赖。
- 不优化 Shiki、Streamdown、Markdown、CSS 或其他长期包体成本。
- 不通过 lazy chunk 隐藏而不减少最终打包体积。
- 不调整 Vite chunk warning threshold。
- 不恢复 frontend-owned DTO、schema 或 structural validator。
- 不改变 projection 数据模型、Redux state、transcript rendering 或 UI。
- 不在本设计阶段创建实施计划、修改代码、运行生成命令或提交 Git。

## 完成标准

- production 不再导入或执行完整 `JSONRPCMessage` 和完整 `ServerNotification` payload validator。
- JSON-RPC envelope 由 Rust 权威 schema 机械生成并保持严格外层校验。
- request response 与三个 projection notification validator 从 Rust metadata 和 JSON Schema 机械选择。
- 同一职责组内的公共 schema 校验函数可以复用，未选择的 payload root 不进入生成物。
- generated ESM 使用静态 named exports，不存在 eager all-validator registry 或运行时动态编译。
- 合法已消费消息行为、错误 policy 和 socket 生命周期保持不变。
- 合法但未消费 notification 按已确认语义忽略 payload。
- 主入口和全部构建产物相对当前状态至少减少 400 kB，且不包含未消费 notification method literal。
- Shiki 相关 chunk 保持不变，证明体积下降来自 validator 生成边界修正。
- Rust source、vendored metadata/schema、generated validator、declaration、descriptor 和 transport 之间的漂移可由定向验证稳定检测。
