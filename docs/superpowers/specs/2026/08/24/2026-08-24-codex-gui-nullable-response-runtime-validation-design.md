# Codex GUI nullable response 运行时验证一致性设计

设计状态：已确认

设计日期：2026-08-24

设计分支：`dev`

设计时 HEAD：`88384ed3af3bb57bc62a13812467956a13037996`

## 唯一主目标

系统修复 app-server v2 response 中“字段必须存在、值可以为 `null`”的契约漂移，使生成
TypeScript、JSON Schema 与 Codex GUI runtime validator 对字段存在性保持一致；同时恢复失效的
app-server schema 固化生成入口，并用跨生成物契约测试防止同类回归。

本设计覆盖全部 v2 response，而不是只修 `thread/list` 或 GUI 当前直接消费的字段。

## 关联问题

- Issue：`docs/superpowers/issues/2026/08/24/2026-08-24-01-codex-gui-current-code-problems/2026-08-24-03-nullable-response-runtime-validation.md`

## 当前问题与根因

Rust 权威类型中的 `Option<T>` 同时承担两种不同的 wire 语义：

- 字段必须存在，值可以是 `T` 或 `null`；
- 字段可以省略，存在时值按字段定义校验。

ts-rs 与 schemars 对没有额外标注的 `Option<T>` 使用了不同的默认字段存在性表达。以
`ThreadListResponse.nextCursor` 和 `backwardsCursor` 为例：

- TypeScript 生成必传的 `string | null`；
- JSON Schema 为字段生成 `string | null`，却没有把字段加入 `required`；
- GUI 的 Ajv standalone validator 因而在字段为 `undefined` 时跳过校验；
- transport 把验证成功作为完整 response 类型的收窄证据，下游再用 nullish 判断把
  `undefined` 静默解释成正常的“没有下一页”。

因此根因不在 thread history 分页 consumer，而在 Rust 权威类型到两条生成链之间缺少统一的
“required nullable”表达及跨生成物约束。给 consumer 增加 `undefined` fallback、放宽 TypeScript
类型或手改生成 validator 都只会隐藏协议违规。

## 范围判定

### 只检查真实 RPC response 根类型

修复集合由两个权威事实的交集确定：

1. `client-request-definitions.json` manifest 中每个 v2 client request 声明的 response 根类型；
2. 对应生成 TypeScript response 顶层字段的 optionality。

只有 manifest 可达 response 根类型中，TypeScript 顶层字段为必传且字段类型允许 `null`，但 JSON
Schema 没有把字段列入 `required` 的情况，才属于本次漂移。

不能通过以下粗略规则确定范围：

- 扫描所有 Rust `Option<T>`；
- 按 `*Response` 名称收集类型；
- 递归把嵌套对象内的所有 nullable 字段都当成 response 顶层契约；
- 只看 GUI 当前导出的 validator。

这些方法会混入 params、notification、内部类型、不可达类型和本来允许省略的字段，也可能漏掉
别名或 manifest 映射的 response。

### 当前量化结果

只读审计得到：

- stable 生成视图中有 23 个 response 类型、28 个顶层字段发生“TypeScript 必传 nullable，JSON
  Schema 非 required”漂移；
- experimental 生成视图中有 39 个 response 类型、54 个同类顶层字段。

stable 与 experimental 是各自完整生成视图，experimental 包含 stable surface；两组数字不能
相加成 62 个 response 类型或 82 个字段。修复与验证必须分别在两个视图中固化，避免只修 stable
后让 experimental 输出继续漂移。

### 本来就是 optional 的字段

以下字段虽然 Rust 也是 `Option<T>`，但生成 TypeScript 明确带 `?`，不属于 required nullable
修复集合：

- stable：`GetAccountTokenUsageResponse.threadUsage`；
- stable：`McpServerToolCallResponse.isError`；
- experimental：`EnvironmentStatusResponse.error`。

它们必须保持 optional，不能为了统一 `Option<T>` 的表面形状而加进 JSON Schema `required`。
跨契约测试应从 TypeScript optionality 自动排除它们，而不是依赖“所有 Option 都必传”的错误
假设。

### `ConfigReadResponse.layers` 序列化例外

`ConfigReadResponse.layers` 使用
`#[serde(skip_serializing_if = "Option::is_none")]`：当调用方没有请求 layers 时，生产端会合法省略
该字段。当前 TypeScript 却把它生成成必传 nullable，因此它也会出现在原始漂移清单里，但正确
修复方向与普通 response nullable 字段不同。

这不是根据属性名称推测出来的兼容需求，而是已有实现与历史共同确定的 wire 语义：

- `ConfigReadParams.includeLayers` 为 `false` 时，`ConfigManagerService` 通过
  `params.include_layers.then(...)` 构造 `layers: None`；
- `includeLayers` 为 `true` 时，同一条件构造返回 `Some(Vec<ConfigLayer>)`，即使没有 layer 也应是
  存在的空数组；
- `ConfigReadResponse.layers` 从首次引入该 response 的提交开始就带有
  `skip_serializing_if = "Option::is_none"`，不是近期生成漂移后新增的临时兼容。

该字段必须保留可省略但不接受 `null` 的 wire 语义：生成 TypeScript 应为
`layers?: Array<ConfigLayer>`。Rust 权威定义使用 response 已有先例 `#[ts(optional)]`，不能套用只
允许用于 client-to-server `*Params` 的 `#[ts(optional = nullable)]`。JSON Schema 同样必须是
optional 且 non-null：不把字段加入 `required`，并可用不带 `required` 的 `schema_with` 返回
`Vec<ConfigLayer>` schema，从属性值域中排除 `null`。不能删除 `skip_serializing_if` 来强迫生产端
发出 `null`；server wire 继续只允许省略或数组。校准后，manifest + TypeScript optionality 的
通用测试会自然把它排除在 required nullable 集合之外，无需在 GUI consumer 增加特判，也不得为
它或其他字段扩大 optional-nullable 白名单。

## 权威 schema 表达

### required 与 nullable 必须同时显式表达

普通必传 nullable response 字段在 Rust 权威类型上继续使用 `Option<T>` 表达值域，同时使用以下
schemars 组合表达字段存在性和 nullable schema：

```rust
#[schemars(
    required,
    schema_with = "crate::protocol::serde_helpers::<对应 nullable schema helper>"
)]
pub field: Option<T>,
```

`required` 只负责把字段加入对象 schema 的 `required`；`schema_with` 必须返回 `Option<T>` 对应的
nullable schema，负责保留 `null` 值域。现有 `nullable_string_schema` 已经证明这种组合可行；实现
时应按实际字段类型复用或增加最小数量的 nullable helper，而不是手写生成 JSON。

只添加 `#[schemars(required)]` 是错误修复。schemars 会把 `Option<T>` 的字段加入 `required`，但
可能把属性 schema 收窄为非 nullable `T`，结果从“缺失被错误接受”变成“合法 `null` 被错误拒绝”。
完成状态必须同时满足：字段缺失失败、字段为 `null` 成功、非 null 的 `T` 按原类型成功。

### 不改变序列化与业务语义

本次 schemars 标注只校准生成契约，不改变 RPC handler、response 构造、Serde 字段名或非 null
值域。`ConfigReadResponse.layers` 是明确的省略语义例外；三个已确认的 TypeScript optional 字段
继续保持省略语义。

不得引入双读、fallback、`undefined` 到 `null` 的 transport 归一化或兼容 adapter。修复后的
validator 需要暴露不完整 response，而不是替生产端补字段。

## stable 与 experimental 固化

app-server protocol schema 有 stable 和 experimental 两套预计算导出。两套输出必须从同一 Rust
权威定义生成，并分别通过生成及一致性检查：

- stable 视图证明公开 surface 的 response 字段存在性一致；
- experimental 视图证明 gated surface 以及 stable surface 在 experimental 展开后仍一致；
- 测试报告必须区分视图，失败时定位到 response 类型与字段，不能只给出 bundle 级 diff。

通用契约断言不把当前的 23/28 或 39/54 硬编码成永久业务基线；这些数字是设计时影响面证据，
不是允许未来继续存在漂移的快照。目标基线是除真实 optional 字段外，required-nullable 漂移为零。

## 固化生成入口

仓库根 `just write-app-server-schema` 当前仍调用已经不存在的
`codex-app-server-protocol` `write_schema_fixtures` binary，因而不能执行项目规定的生成流程。实际
权威入口已经是：

`codex-rs/app-server-protocol/scripts/write_schema_fixtures.py`

`just` recipe 必须改为调用该脚本并原样透传参数，使以下两种固化模式都可从项目入口到达：

- 默认 stable 生成；
- `--experimental` experimental 生成。

这不是另建旁路命令，而是修复仓库已经声明、测试错误信息也要求使用的固化入口。生成脚本内部
继续负责设置环境变量并调用被 ignore 的 schema fixture test；不得复制脚本逻辑到 `justfile`，
也不得绕过 fixture generator 直接改 `.json`、`.ts` 或压缩导出。

## GUI runtime validator

app-server stable schema 固化后，必须通过 `codex-gui` 已有
`protocol:generate-validators` 入口重新生成 runtime validator 与声明文件。不得直接编辑：

- `appServerPayloadValidators.js`；
- `appServerPayloadValidators.raw.js`；
- `appServerPayloadValidators.d.ts`；
- request/notification descriptor 生成物。

GUI generator 的职责仍是忠实消费 app-server JSON Schema，不在 GUI 增加第二套 nullable 规则。
修复后的 standalone validator 应在字段缺失时返回 false，在字段显式为 `null` 时返回 true，并继续
作为 transport 的可信类型守卫。

## 验证设计

### 协议层通用交叉契约测试

在 `codex-app-server-protocol` schema fixture 测试层增加通用断言，分别生成 stable 与
experimental 临时视图，并交叉读取：

- client request manifest 的 response 根类型映射；
- 对应 response 的生成 TypeScript 顶层字段及 `?` optionality；
- 对应 JSON Schema 顶层 properties、nullable 值域与 `required` 集合。

对 manifest 可达 response 的每个顶层字段，测试应保证：TypeScript 必传且 nullable 时，JSON
Schema 同时 required 且 nullable；TypeScript optional 时，不强迫其 required，并检查 JSON Schema
的 nullable 值域与 TypeScript 字段类型是否允许 `null` 一致。失败信息包含视图、response 名称和
字段名，使新增 response 的漂移在生成源头被直接定位；测试不得用扩大 optional-nullable 白名单来
绕过值域不一致。

测试只约束两套公开生成契约的一致性，不用 Rust 字段名猜 wire 名称，也不把所有嵌套类型升级成
response 顶层约束。`ConfigReadResponse.layers` 在权威 TypeScript optionality 修正后按 optional
分支验证；三个本来 optional 的字段同样不会被误报。

### GUI 的四字段运行时测试

GUI generator 测试对当前实际导出且被消费的四个字段建立成对断言：

- `ThreadListResponse.nextCursor`；
- `ThreadListResponse.backwardsCursor`；
- `ThreadResumeResponse.serviceTier`；
- `ThreadResumeResponse.reasoningEffort`。

每个字段都覆盖两种关键输入：从最小合法 response 中删除该字段必须被 validator 拒绝；保留字段
并显式赋值 `null` 必须被 validator 接受。fixture 的其他 required 字段保持合法，确保失败确实由
被测字段存在性造成。

这四组测试证明 JSON Schema 修复已经到达 GUI runtime 边界。完整系统范围由协议层通用交叉契约
测试承担，GUI 不复制 23/28 或 39/54 的全量字段矩阵。

测试应落在现有 generated descriptor 消费边界，优先复用
`codex-gui/src/features/guiHost/__tests__/generatedAppServerProtocol.test.ts` 中通过
`requestDescriptors[method].validateResponse(...)` 验证 response 的结构；如需补充类型守卫与
descriptor 关联断言，则使用相邻的 `guiHostGeneratedProtocol.test.ts`。不把这项消费边界回归优先
放进 generator 内部的 `core.test.ts`，避免测试只证明生成器内部文本而没有证明 GUI 实际导出的
descriptor 行为。

### `ConfigReadResponse.layers` wire 序列化回归

在 app-server config response 的直接 wire 与契约验证边界固定三种行为：

- `includeLayers: false` 形成 `layers: None`，序列化后的 response object 中完全没有 `layers` key；
- `includeLayers: true` 形成 `layers: Some(...)`，序列化后的 response object 中存在数组类型的
  `layers` key，且空数组是合法结果；
- response object 显式携带 `layers: null` 时，必须被生成契约拒绝。

断言必须检查序列化后的 JSON object，而不只检查 Rust `Option` 值，才能防止后续为消除 schema
漂移而误删 `skip_serializing_if`、把省略改成显式 `null`。这项回归与通用 schema 交叉契约测试
共同证明：普通 response 字段收紧为 required nullable，而 `layers` 保持
`layers?: Array<ConfigLayer>` 的 optional、non-null wire 语义。

### 生成物与常规验证

协议 schema fixture 的 stable、experimental 一致性检查应全部通过；GUI validator 的 check 模式
应证明生成物没有漂移。Rust 侧只运行 `codex-app-server-protocol` 的定向测试，GUI 侧运行 validator
generator 的定向测试与项目现有 validator check。具体命令、依赖和调度边界留给后续计划阶段，
本设计不提前形成实施任务清单。

## 兼容性

本修复不改变符合既有 TypeScript 契约的 response：显式携带字段且值为 `null` 或合法非 null 值的
payload 继续通过。行为变化只发生在此前被 JSON Schema 误接受、但本来就不符合 TypeScript
契约的缺失字段 payload；它们将按协议错误被拒绝。

`ConfigReadResponse.layers` 反向校准为 TypeScript optional，保留生产端已有的合法省略行为。
三个已确认 optional 字段同样保持现状。无需 protocol version bump、旧新 validator 并存、consumer
fallback 或数据迁移。

## 非目标

- 不修改 thread pagination、thread resume 或其他 GUI consumer 来接受 `undefined`；
- 不修复 app-server handler 如何构造业务 response，除非后续验证证明其违反本来就存在的必传
  契约；这类新事实应单独报告；
- 不把所有 Rust `Option<T>` 统一改成 required；
- 不改变 params 的 `#[ts(optional = nullable)]` 规则、notification 契约或嵌套数据模型；
- 不重写 schema/TypeScript 导出架构，不更换 Ajv，也不增加 GUI 手写 DTO；
- 不手改 JSON Schema、TypeScript、压缩导出或 GUI validator 生成物；
- 不增加忽略、allowlist、测试跳过或宽松断言来维持当前漂移计数；
- 不创建兼容层、双路径或运行时补 `null` 逻辑；
- 不在本设计阶段编写实施计划、execution graph、修改代码、生成产物或提交 Git。

## 预计实现文件范围

权威源码与生成入口预计涉及：

- `codex-rs/app-server-protocol/src/protocol/v2/**/*.rs`：manifest 可达 response 的 required nullable
  字段标注，以及 `ConfigReadResponse.layers` 的 TypeScript optionality；
- `codex-rs/app-server-protocol/src/protocol/serde_helpers.rs`：按实际值类型提供 nullable schema
  helper；
- `codex-rs/app-server-protocol/src/schema_fixtures_tests.rs`：stable/experimental 通用交叉契约测试；
- `justfile`：恢复 `write-app-server-schema` 到现有 Python fixture generator 的固化入口。

机械生成物预计涉及：

- `codex-rs/app-server-protocol/schema/json/**`；
- `codex-rs/app-server-protocol/schema/typescript/**`；
- app-server protocol 既有 stable/experimental 预计算导出；
- `codex-gui/src/generated/appServerProtocol/**` 中由既有 generator 实际更新的 validator 与 descriptor
  产物。

GUI 测试预计只涉及：

- `codex-gui/src/features/guiHost/__tests__/generatedAppServerProtocol.test.ts`：通过现有 generated
  descriptor 验证四个字段的缺失与 `null` 行为；
- 如类型守卫/descriptor 关联需要补充，涉及
  `codex-gui/src/features/guiHost/__tests__/guiHostGeneratedProtocol.test.ts`。

`ConfigReadResponse.layers` 的直接 wire 回归预计落在现有 config service/RPC 测试边界：

- `codex-rs/app-server/src/config_manager_service_tests.rs` 和/或
  `codex-rs/app-server/tests/suite/v2/config_rpc.rs`，由计划阶段根据哪个现有 fixture 能直接观察序列化
  JSON object 确定最窄位置。

具体 v2 Rust 文件和生成物清单必须由后续计划基于最终 manifest 审计与实际生成 diff 固化；不得
为了追求较小 diff 漏掉同根字段，也不得把 generator 没有改动的文件预先纳入提交。

## 完成标准

1. stable 视图中 manifest 可达 response 的 TypeScript required-nullable 顶层字段，与 JSON
   Schema 的 required 和 nullable 语义完全一致。
2. experimental 视图满足同一不变量；两个视图的同类漂移都为零。
3. `ConfigReadResponse.layers` 生成成 `layers?: Array<ConfigLayer>`，JSON Schema 保持 optional 且
   non-null；`includeLayers=false` 的 wire object 没有 `layers` key，`includeLayers=true` 时该 key
   为数组并允许空数组，显式 `layers: null` 被契约拒绝。三个已确认 optional 字段同样不被错误提升
   为 required，且其 nullable 值域与各自 TypeScript 类型一致。
4. 单独 `required` 不会导致合法 `null` 被拒绝；所有普通目标字段同时具备 required 与 nullable
   schema。
5. `just write-app-server-schema` 能通过现有 Python fixture generator 到达 stable 与
   experimental 固化流程并透传参数。
6. 所有受影响 app-server schema、TypeScript 与 GUI validator 均由项目入口生成，没有手改生成物。
7. GUI 四个已审计字段均满足“缺失拒绝、显式 `null` 接受”。
8. transport 与 consumers 不新增 `undefined` 兼容、fallback 或协议错误静默处理。
9. 协议层通用交叉契约测试能在未来新增 manifest response 时自动发现同类漂移，而不是只保护
   当前字段名单。

## 反向审计结论

反向审计专门检查了可能遗漏或误扩大的边界：

- stable 23 个 response 类型/28 个字段及 experimental 39 个 response 类型/54 个字段的量化结果
  证明这不是 `ThreadListResponse` 孤例；只修该类型不能满足已确认的全 v2 response 范围；
- 按所有 `Option<T>` 或 `*Response` 粗扫会误伤三个明确 optional 字段、params、notification、
  嵌套或不可达类型，必须以 manifest + TypeScript optionality 限定；
- `ConfigReadResponse.layers` 的 Serde 省略行为证明它不能套用普通 required nullable 修复，必须
  保留 `skip_serializing_if`，用 response 先例 `#[ts(optional)]` 生成
  `layers?: Array<ConfigLayer>`，并让 JSON Schema 保持 optional、non-null；`includeLayers=false` 的
  条件构造、`includeLayers=true` 的数组结果以及该 skip 从首次引入即存在，共同表明 server wire
  只能省略或携带数组，显式 `null` 必须被契约拒绝；
- 只加 `schemars(required)` 会隐藏原缺失问题，却制造拒绝合法 `null` 的新契约错误，因此必须与
  nullable `schema_with` 成对使用；
- 只生成 stable 会遗漏 experimental surface，只生成 protocol schema 则不会自动证明 GUI runtime
  validator 已更新；两套视图与 GUI 边界都需要独立证据；
- 手改生成物、在 transport 补 `null` 或让 consumer 接受 `undefined` 都不能消除根因，并会降低
  validator 的类型收窄可信度；
- 失效的 `just` recipe 是正规生成链的真实阻塞，不修入口就无法按仓库固化流程完成系统修复。

未发现需要修改 transport、pagination owner、thread resume owner、RPC handler、Ajv 配置或外部 API
版本的证据。上述范围足以解决根因，并保留所有已确认的合法 optional、required nullable 与
optional non-null 语义。
