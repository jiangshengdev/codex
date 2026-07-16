# Codex GUI 权威契约生成设计

状态：已确认

## 唯一主目标

修复 `codex-gui` 在 app-server generated protocol 与 Rust GUI Host 私有协议边界上的权威契约漂移，使 Rust 侧的不兼容变更能够通过 generation、runtime validation、type-check 或 build 稳定传播到前端，而不是退化为手写 DTO、宽泛泛型、类型断言、分散 literal 或静默 fallback。

## 背景与根因

当前大多数 GUI production 领域模型仍直接消费 `@codex-protocol/v2` 类型或其机械派生，问题集中在 GUI Host transport 边界。

app-server protocol 已由 Rust 宏同时声明 request method、params 与 response 类型，并生成 TypeScript payload 类型和 JSON Schema。但是前端接收 WebSocket 消息后，先把 payload 擦除为 `unknown` 或 `Record<string, unknown>`，再通过手写字段清单、literal union 和 type predicate 恢复完整 generated 类型。请求侧使用自由 `TResponse`、`method: string`、`params: unknown` 与 `result as TResponse`，因此 method、params 与 response 的关联没有从 Rust 权威源传播到前端。缺失 result 还可能通过空对象 fallback 被解释为成功。

Rust GUI Host 的 launch URL、WebSocket route 与 `gui/authenticate` 是 app-server 建连前的私有协议，但当前没有机械导出链。Rust 和前端分别手写 `threadId`、`token`、`/ws`、`gui/authenticate` 与 authenticate payload，任何一侧变化都不会在另一侧编译失败。

现有手写 runtime validator 不能保留：它们不是由 Rust contract 机械生成，且部分 validator 只检查少量字段，却通过 type predicate 承诺完整 payload。只删除 runtime validation 同样不可接受，因为当前 malformed projection payload 已有明确的协议错误与关闭行为。

## 设计约束

- Rust 类型与 Rust 协议定义是唯一权威源。
- 前端不得手写 Rust contract 的 DTO、schema、validator、字段清单、method/variant union 或 response map。
- TypeScript 静态类型继续由 Rust `ts-rs` 生成。
- JSON Schema 继续由 Rust `schemars` 生成。
- 前端 runtime validation 使用 Ajv v8 直接消费 Rust JSON Schema，不引入 Zod、TypeBox、Valibot 或 ArkType DSL 作为第二套 schema 表达。
- method、params、response 与 validator 必须通过 generated descriptor 机械绑定。
- malformed payload 的现有 terminal/non-terminal policy、错误文案与 socket close 语义保持不变，除非本设计明确要求修正虚假成功。
- generated artifact 必须具备可重复生成与 tree-diff 漂移测试；禁止手工维护生成文件。
- app-server protocol 与 GUI Host 私有协议保持两个独立权威边界，不把 `gui/authenticate`、launch URL 或 `/ws` 误加入 app-server v2 API。
- 不扩大为 GUI 业务模型、Redux 状态或 UI 架构重构。

## 已确认技术选择

前端引入 Ajv v8 作为直接依赖。Ajv 只编译 Rust 生成的 JSON Schema，不承载静态类型权威。

为避免浏览器启动时动态调用 `compile()`、增加 CSP 风险或把完整 schema compiler 带入运行路径，validator 在生成阶段通过 Ajv standalone code generation 产出稳定的 TypeScript/JavaScript 模块。浏览器运行时直接调用已生成 validator。

Ajv 生成物可能引用 `ajv/dist/runtime/*` helper，因此 Ajv 必须作为 `codex-gui` 的显式 production dependency，不能依赖 ESLint 等工具链的传递版本，也不能默认只放入 `devDependencies`。只有实际 schema 使用需要额外 format 实现时才引入 `ajv-formats`；本设计不预先增加该依赖。

静态与运行时双产物链为：

```text
Rust protocol types
  |-- ts-rs -------> generated TypeScript types
  |-- schemars ----> generated JSON Schema
                           |
                           v
                    Ajv standalone codegen
                           |
                           v
                 generated runtime validators

generated method definitions
  + TypeScript types
  + runtime validators
          |
          v
generated request/notification descriptors
```

## 总体架构

### app-server protocol 权威生成链

`client_request_definitions!` 继续作为 request method、params 与 response 关系的唯一来源。当前宏已经掌握 `$wire`、`$params` 与 `$response`，生成链需要将该关联导出为前端可消费的 metadata artifact，而不是从生成后的 TypeScript 文件名或调用点重新推断。

新增 generated request-definition artifact，至少表达：

- wire method；
- params TypeScript 类型；
- response TypeScript 类型；
- params JSON Schema 标识；
- response JSON Schema 标识。

该 artifact 是 compile-time metadata，不是 JSON-RPC wire response。不得把 Rust 内部带 method tag 的 `ClientResponse` 表述误当作服务端实际返回结构。

`ServerNotification` 已经是 generated method/params 判别联合。其 runtime validator 直接从 generated `ServerNotification` JSON Schema 产生，不再创建 frontend-owned notification DTO 或手写 method union。若全量 validator 对 bundle 有不可接受的影响，只能由生成器从 Rust metadata 机械拆分为 per-method validator，不能在前端手写 projection 子集。

现有 `just write-app-server-schema` 继续是 app-server TypeScript、JSON Schema 与新增关联 artifact 的唯一 regeneration 入口。fixture 测试必须比较 fresh generation 与 vendored tree，确保 Rust 修改但忘记重新生成时 CI 失败。

### Ajv standalone 生成链

`codex-gui` 增加独立 protocol-validator generator。它读取 vendored Rust JSON Schema 和 request-definition artifact，稳定生成：

- JSON-RPC envelope validator；
- app-server response result validators；
- `ServerNotification` validator 或机械拆分后的 notification validators；
- typed request descriptors；
- typed notification descriptors 或 registry；
- GUI Host 私有 authenticate validator。

生成器必须满足：

- 输入 schema 缺失时失败；
- method 重复或 response mapping 不完整时失败；
- `$ref`、`$defs`、nullable、optional、tagged union 与 `additionalProperties` 按 Rust schema 语义编译；
- schema 和输出排序稳定；
- 连续运行两次 byte-for-byte 一致；
- 提供 write 模式与只比较、不写文件的 check 模式；
- 输出带 generated header，不接受手工修改。

生成器本身属于 frontend build tooling，不在浏览器消息热路径执行。

### Rust GUI Host 私有 browser contract

在 `codex-rs/gui-host` 建立独立的 browser contract owner，统一声明：

- launch URL 的 thread query key；
- launch URL 的 token fragment key；
- WebSocket route；
- authenticate method；
- authenticate params；
- authenticate result。

Rust `url`、`host` 与 `ws` 实现必须直接消费该 owner。前端 session storage key `codex-gui.launchToken` 是浏览器本地实现细节，不属于跨进程协议，继续由 `browserLaunch` owner 持有。

GUI Host 生成链输出：

- generated TypeScript 常量与 authenticate 类型；
- generated authenticate JSON Schema；
- fresh generation 与 vendored tree 漂移测试。

前端通过独立 alias 消费该 artifact。browser launch、QR access 与 GUI Host client 不再写出 contract literal。测试可以保留少量 wire literal 作为黑盒外部行为断言或 malformed input，但 production 必须只有 generated owner。

## 前端数据流

### Outbound request

前端不再调用自由泛型 `request<TResponse>(method: string, params: unknown)`。调用方使用 generated descriptor：

```text
request(descriptor, params)
```

descriptor 静态携带对应 params 和 response 类型，运行时携带 method 与 response validator。pending request entry 保存 descriptor，因此 response 到达时无需由调用方断言 result 类型，也不需要维护 frontend response map。

command gateway 仍只暴露已有 `startTurn` 与 `interruptTurn` 语义。是否把内部 descriptor 暴露为公共 API 不在本设计范围内。

### Inbound response

```text
WebSocket data
  -> JSON parse
  -> generated JSON-RPC envelope validator
  -> numeric ID correlation
  -> pending descriptor response validator
  -> typed Promise resolve
```

response 必须先关联 pending ID，再使用该 request 保存的 response validator 验证 result。缺失 result 或 result validation 失败不再以 `{}` 完成 Promise。

错误 policy 保持请求类别差异：

- correlated command JSON-RPC error 只 reject 当前 command，不关闭连接；
- handshake JSON-RPC error 继续是 terminal；
- malformed correlated command result 只 reject 当前 command；
- malformed handshake result 按当前阶段的既有 protocol error 与 close policy 处理；
- unmatched、duplicate、late response 不得推进握手或恢复已失效 session。

### Inbound notification

```text
WebSocket data
  -> generated JSON-RPC envelope validator
  -> generated ServerNotification validator
  -> method-discriminated generated union
  -> exhaustive routing
  -> projection callback
```

明确为 projection notification 但 params 不合法时，继续使用现有 method-specific malformed payload error 和 terminal close policy。格式正确但不由 GUI 消费的 notification 继续按既有 filter/routing policy 忽略，不引入新的用户可见错误。

### Launch 与 authenticate

```text
Rust browser contract
  |-- launch keys ------> Rust URL producer + browser launch + QR access
  |-- WebSocket path ---> Rust router + frontend socket URL
  |-- auth contract ----> Rust parser/response + generated TS/Ajv validator
```

authenticate result 只有通过 generated Ajv validator 后才能进入 `authenticated` 状态。launch-param consumption 顺序、fragment 清理、storage fallback、现有错误文本和 `onLaunchParams` callback 顺序保持不变。

## Runtime validation 与错误呈现

Ajv error object 只用于协议层诊断和测试。对用户可见的 `GuiHostStatus` 与 socket close reason 继续使用现有稳定文案，不能把 schema path、validator keyword 或 Rust 内部类型名直接暴露到 UI。

协议层可以在内部保留精确 validation failure 信息，以便测试区分 missing result、invalid envelope、invalid response 与 invalid notification，但不得为每个 Ajv keyword 创建新的业务错误分类。

schema 对额外字段的处理必须遵循 Rust serde/schema 权威语义，不由前端另行决定。尤其是 authenticate 私有协议，如果 Rust 不接受额外字段，生成 schema 必须明确相同行为。

## Downstream 失败传播

transport 修复后，还需要关闭以下 generated variant 传播缺口：

- projection closed 处理必须消费 generated `notification.reason`，不能固定产生 frontend literal；
- snapshot replay 的 terminal status 判断必须对 `Turn["status"]` 穷尽分类；
- projection ingress、thread runtime 与 transcript state 的 generated event switch 必须增加 `never` 门禁。

这些修改只增加 compile-time failure propagation，不改变当前 reconnect、replay、active-turn 或 transcript 业务语义。当前只有一个 closed reason 时，运行时结果应保持相同。

## 测试 fixture 收敛

合法 projection protocol payload 继续由现有共享 fixtures 和 builders 统一构造。扩展 builder 时只能使用 generated 类型的窄字段变体或组合现有 builder，禁止新增 `Record<string, unknown>`、宽泛 `Partial<完整 DTO>` 或另一套 frontend schema。

问题文档列出的五个测试文件需要迁移合法 attach/event/delta/closed/turn payload。以下内容继续在测试本地显式书写：

- malformed payload；
- JSON-RPC envelope；
- outbound request assertion；
- Redux 或 UI expected-state object。

fixture 收敛不与 transport 重构绑定为同一提交，也不得扩大为测试框架重写。

## Generated artifact 所有权

生成物预计分为三组：

- `codex-rs/app-server-protocol/schema/**`：app-server TypeScript、JSON Schema 与 request-definition metadata；
- `codex-rs/gui-host/schema/**`：GUI Host 私有 browser contract TypeScript 与 JSON Schema；
- `codex-gui/src/generated/**`：Ajv standalone validators 与 typed descriptors。

具体文件名在计划阶段锁定，但所有生成物必须：

- 明确标记 generated；
- 由单一项目命令生成；
- 被 Git 跟踪；
- 具备 check-only 漂移验证；
- 不接受 manual fix、format-only edit 或调用方补丁。

Vite、TypeScript 与 Vitest 对 Rust vendored artifact 的 alias 必须保持一致。Bazel 测试或编译若读取新 schema 文件，必须在 `BUILD.bazel` 中声明 `compile_data`、test data 或对应 runfiles，不能依赖 Cargo 下的偶然可见性。

## 性能与安全边界

- JSON 仍只 parse 一次。
- validator 不 clone、normalize 或 stringify payload。
- attach validation 会完整遍历 snapshot，但只发生在 attach/reattach；live event 和 delta payload 有严格的小体积上界。
- 不在 render、selector 或 transcript chunk hot path 执行 validation。
- Ajv compilation 只在生成阶段执行，浏览器运行时不使用 `new Function`。
- generated standalone validator 的 bundle 成本需要在 implementation verification 中检查；若全量 `ServerNotification` validator 过大，只允许机械拆分，不允许恢复手写子集。
- launch token、origin/host validation 与 WebSocket authentication security policy保持不变。

## 兼容性与 breaking-change 分析

### Wire compatibility

合法 wire method、params、response、notification、launch URL、route 和 authenticate shape 均不改变。本设计只改变这些契约的声明、生成和消费方式。

### Runtime behavior

合法消息行为保持不变。主要有意修正是：缺失或不符合 schema 的 result 不再通过 assertion 或 `{}` fallback 被解释为成功。

手写 validator 过去可能接受 Rust schema 不接受的 payload，或拒绝 Rust schema 允许的 payload。迁移后以 Rust generated schema 为准，这属于修复权威契约漂移，而不是建立前端兼容层。

### TypeScript compatibility

`GuiHostCommands` 与现有 callbacks 的公开语义保持不变。transport 内部 request API、pending entry 和 notification routing 会发生有意的类型重构，但不应扩大为 React、Redux 或其他 feature 的公共 API 变化。

### External integration surface

不新增 app-server v2 method，不修改 CLI 参数、configuration loading、rollout resume 或 raw response item event。GUI Host 私有 artifact 仍是 host 与其内嵌/开发前端之间的内部边界。

## 验证策略

### Rust generation

- request-definition artifact 能正确表达 wire rename、params 与 response 关系；
- app-server schema fresh generation 与 vendored tree 一致；
- GUI Host browser contract fresh generation 与 vendored tree 一致；
- launch URL、dev/prod WebSocket route 与 authenticate parser/response 继续满足现有行为；
- 新增 schema 文件在 Cargo 与 Bazel 环境中均可见。

Rust 验证使用定向 test filter。未经额外授权不运行 crate-wide 或 workspace-wide 完整测试。

### Ajv generator

- 合法 attach/event/delta/closed、command response 和 authenticate result 通过；
- 缺字段、错误类型、unknown discriminant、缺 schema 与重复 method 失败；
- `$ref`/`$defs` 与 optional/nullable 语义正确；
- 两次生成 byte-for-byte 一致；
- check 模式能检测手改或过期 artifact；
- production build 不在浏览器运行时编译 schema。

### Frontend transport

- method、params 与 response 在调用点保持机械关联；
- malformed result 被正确拒绝；
- missing result 不再回退空对象；
- 合法 notification callback 与顺序不变；
- malformed projection notification 继续走 terminal protocol error；
- command JSON-RPC error 仍为非 terminal；
- handshake error 仍为 terminal；
- cleanup、late response 与 commands invalidation 语义不变。

### Downstream 与 fixtures

- closed reason 来自 generated notification；
- 当前全部 `TurnStatus` 有明确分类；
- generated event switch 具备 `never` 门禁；
- 五个合法 fixture 文件只通过共享 builder 构造协议 payload；
- Browser Mode 测试继续由现有 Chromium 配置执行，无用户可见 UI 变化时不新增 snapshot。

### Tooling

- 前端命令使用用户 fnm 管理的 Node/pnpm；
- 依赖与 lockfile 由 `pnpm add` 原生命令更新；
- Rust dependency 变化同步运行 `just bazel-lock-update`；
- generated artifact 使用项目生成命令更新；
- code change 完成后执行 scoped Rust fix、`just fmt`、frontend type-check、lint 和 format。

## 实施边界

为保持可审查性，后续计划必须至少保留以下独立边界：

1. app-server method/params/response 关联 artifact；
2. Ajv standalone generator 与 generated validators；
3. app-server GUI transport 迁移；
4. Rust GUI Host 私有 browser contract 与前端原子迁移；
5. downstream exhaustiveness 与合法 fixture 收敛；
6. 完整验证后更新原 issue 状态与证据。

不得提交“Rust 已建立新 owner，但前端仍稳定维护旧手写 owner”的中间状态。characterization tests 可以单独提交；权威 owner 与全部 production consumer 的迁移必须在同一原子边界内完成。

## 非目标

- 不恢复提交 `1052a362` 的 frontend-owned DTO/validator 方向。
- 不把 command success 类型收窄为 `Promise<void>`，除非未来独立设计。
- 不重做 B02 transport/handshake owner 拆分。
- 不修改 app-server wire API、projection payload 或 GUI Host 安全策略。
- 不重构 Redux、snapshot replay、Transcript State、timeline、rendering、scroll 或 Composer。
- 不新增通用 frontend compatibility layer。
- 不把 Ajv 扩大为全仓所有不可信输入的强制验证框架。
- 不在本设计阶段创建实施计划或修改代码。

## 完成标准

- app-server request method、params、response 和 runtime validator 从同一 Rust 宏定义机械传播。
- projection notification runtime validation 由 Rust generated schema 驱动。
- GUI Host launch/auth/route contract 只有一个 Rust owner，前端消费 generated artifact。
- production 不再包含本问题所列的手写 contract mirror、自由 response 泛型、result assertion 或空对象 fallback。
- downstream generated variant 具备穷尽失败传播。
- 合法 projection fixture 统一使用共享 builder。
- Rust source、vendored schema、generated validators 与前端类型之间的漂移可由定向测试或 check 命令稳定检测。
- 合法运行时行为保持不变，malformed/missing result 不再产生虚假成功。
