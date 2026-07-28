# App-server inter-agent 结构化投影实施计划

日期：2026-07-28
状态：待确认

## 唯一目标

从既有 durable raw inter-agent rollout 记录统一物化 experimental `ThreadItem::InterAgentMessage`，使历史分页、projection attach snapshot 与实时 projection notification 使用同一套结构化语义、稳定 identity 和顺序来源。

## 非目标

- 不新增或修改 core / rollout 原始 inter-agent event、`InterAgentCommunicationMetadata`、legacy `InterAgentCommunication` 或文本信封。
- 不把 payload、encrypted content 或 plaintext 正文暴露到结构化 projection。
- 不修改 `codex-gui/**`，不生成 GUI artifacts，不增加 GUI Host command 或 `AgentDagSource`。
- 不实现 DAG event model、因果排序、batch merge、Redux、runtime、React Flow 或任务视图。
- 不新增依赖，不做数据迁移，不改变 stable client 的可见 union surface。

## 权威契约与不变量

新增的 Rust 权威类型在 wire 上表达为：

```ts
{
  type: "interAgentMessage";
  id: string;
  sourceOrdinal: string;
  author: string;
  recipient: string;
  messageKind: "message" | "finalAnswer" | "newTask" | "unresolved";
  diagnostic: string | null;
}
```

- `id` 优先沿用原始 `ResponseItem::AgentMessage.id`；原始 ID 缺失时，使用 Thread ID 与 durable rollout ordinal 构造确定性 fallback，不使用进程内计数、时间或随机数。
- `sourceOrdinal` 是该来源 record 的 durable rollout ordinal 十进制字符串；旧记录缺失 ordinal 时使用 canonical replay record position。Rust 内部保持整数，进入 wire 前才转为字符串，避免 JavaScript `u64` 精度损失。
- `author`、`recipient` 仅从既有 raw record 的结构化字段读取。
- `messageKind` 由相邻的 modern `InterAgentCommunicationMetadata.trigger_turn`、legacy `InterAgentCommunication.trigger_turn` 与既有 envelope 规则归一化；无法确定时输出 `unresolved` 和非空 `diagnostic`，不得静默猜测。
- modern metadata 与其相邻 `ResponseItem::AgentMessage` 只生成一个 item；legacy record 生成等价 item；同一 raw delivery 在历史重建、attach 和实时刷新中不得重复。
- 实时 raw notification 只作为“durable history 已可能推进”的刷新触发器，不携带 identity 权威。只有重新读取到带 durable ordinal 的 history change 后，才能发出 `ItemCompleted` projection event。
- history、snapshot 与 live 必须调用同一个 raw-to-structured converter；GUI 不解析 envelope。
- rollback、compaction、subagent history 起始 ordinal、turn 归属和 item 顺序继续服从现有 Thread history 规则。

## 精确文件边界

### 预计修改

- `codex-rs/app-server-protocol/src/protocol/v2/item.rs`
  - 增加 experimental `ThreadItem::InterAgentMessage` variant 与 `InterAgentMessageKind`。
  - 补齐 `ThreadItem::id()` 等穷尽分支；不在该大文件中实现 raw record 解析。
- `codex-rs/app-server-protocol/src/protocol/mod.rs`
  - 注册并只按所需可见性导出新的 converter 模块。
- `codex-rs/app-server-protocol/src/protocol/thread_history_projection.rs`
  - 将当前逐 `RolloutLine` 无状态入口收敛到可协调相邻 record 的批投影 seam，并复用统一 converter。
- `codex-rs/app-server-protocol/src/protocol/thread_history_projection_tests.rs`
  - 扩展 paginated history、ordinal、相邻 pair、去重与 subagent prefix 测试。
- `codex-rs/app-server-protocol/src/protocol/thread_history.rs`
  - 让 legacy/stateful reconstruction、rollback 和 compaction 路径复用统一 converter，并维持现有 change accumulator 语义。
- `codex-rs/app-server-protocol/src/experimental_api.rs`
  - 在既有 experimental field registry 之外登记 enum variant，供 stable schema filter 使用。
- `codex-rs/codex-experimental-api-macros/src/lib.rs`
  - 让 `ExperimentalApi` derive 为带 `#[experimental(...)]` 的 enum variant 生成 registry metadata；不得把 variant 当作 field 假注册。
- `codex-rs/app-server-protocol/src/export.rs`
  - 扩展 stable TypeScript 与 JSON Schema filter，按 variant registry 移除 `ThreadItem` 的 experimental union arm，同时保留 experimental profile 完整 union。
- `codex-rs/app-server-protocol/tests/schema_fixtures.rs`
  - 增加 stable / experimental 双 profile drift 检查，以及 `interAgentMessage` union arm 在 experimental 中存在、在 stable 中不存在的断言。
- `codex-rs/thread-store/src/local/thread_history_materialization.rs`
  - 按 ordinal 顺序批量投影本次完整 rollout suffix，使 modern metadata + response pair 能跨相邻 line 协调；不得退回两套逐行解析。
- `codex-rs/thread-store/src/local/thread_history_materialization_tests.rs`
  - 覆盖 durable ordinal、相邻 pair、重复刷新、subagent prefix、rollback / compaction 与失败重试不重复。
- `codex-rs/app-server/src/bespoke_event_handling.rs`
  - raw response item 仍发送既有普通 notification；另把它作为 durable history refresh 的触发点，不直接从 notification 构造 `InterAgentMessage`。
- `codex-rs/app-server/src/outgoing_message.rs`
  - 为 Thread-scoped sender 增加窄的 durable history change projection 入口，使普通 notification fanout 与 projection fanout 的职责保持分离。
- `codex-rs/app-server/src/projection_fanout.rs`
  - 接受由统一 converter 产出的 durable item change，并继续复用既有 per-thread generation、backpressure 与 subscriber fanout。
- `codex-rs/app-server/src/thread_projection.rs`
  - 将新的 durable item change 转为 `ThreadProjectionEvent::ItemCompleted`；按稳定 item ID / `sourceOrdinal` 抑制 attach snapshot 已包含或先前刷新已发出的重复项。
- `codex-rs/app-server/src/request_processors/thread_projection.rs`
  - attach snapshot 从相同 durable history projection 取得 item，并在同一 snapshot cut 上建立 live 去重基线。
- `codex-rs/app-server/src/thread_projection_runtime.rs`
  - 保持 snapshot-cut / attach 竞态语义，补齐 attach 期间 durable inter-agent item 到达时不丢失、不重复的 runtime seam。
- `codex-rs/app-server/tests/suite/v2/thread_projection.rs`
  - 通过公共 JSON-RPC projection API 覆盖历史 snapshot、attach 后 live item、刷新/重连去重和 stable identity。

### 预计新增

- `codex-rs/app-server-protocol/src/protocol/inter_agent_message_projection.rs`
  - 唯一拥有 modern / legacy raw record 识别、相邻 record 协调、kind 归一化、turn 归属、identity 与 diagnostic 的纯转换逻辑。
- `codex-rs/app-server-protocol/src/protocol/inter_agent_message_projection_tests.rs`
  - converter 的 sibling test module，使用完整对象等值断言固定 projection contract。

### 预计生成

stable 与 experimental 使用两个独立生成根；experimental 生成绝不能覆盖 stable 目录：

- stable 根：
  - `codex-rs/app-server-protocol/schema/typescript/`
  - `codex-rs/app-server-protocol/schema/json/`
- experimental 根：
  - `codex-rs/app-server-protocol/schema/experimental/typescript/`
  - `codex-rs/app-server-protocol/schema/experimental/json/`

生成器拥有上述目录内的全部 artifacts。与本变更直接相关的输出至少包括：

- stable：
  - `codex-rs/app-server-protocol/schema/typescript/v2/ThreadItem.ts`
  - `codex-rs/app-server-protocol/schema/typescript/v2/index.ts`
  - `codex-rs/app-server-protocol/schema/typescript/index.ts`
  - `codex-rs/app-server-protocol/schema/json/v2/ThreadItem.json`
  - `codex-rs/app-server-protocol/schema/json/codex_app_server_protocol.v2.schemas.json`
  - `codex-rs/app-server-protocol/schema/json/codex_app_server_protocol.schemas.json`
  - `codex-rs/app-server-protocol/schema/json/client-request-definitions.json`
  - `codex-rs/app-server-protocol/schema/json/server-notification-definitions.json`
- experimental：上述 TypeScript / JSON 树的完整独立副本，以及新增的 `v2/InterAgentMessageKind.ts`、`v2/InterAgentMessageKind.json`（名称以原生 generator 实际输出为准）。

所有 generated TypeScript / JSON、bundle、index 和 manifests 只能由 schema generator 创建或更新，禁止手写。`codex-rs/app-server-protocol/BUILD.bazel` 当前已包含 `schema/**`，除非生成或测试的一手证据证明新根未进入 runfiles，否则不修改该文件。

## 依赖顺序与实施步骤

### 1. 先固定 converter 测试 seam

1. 在新的 sibling test 文件中先写 modern pair、legacy record、kind 映射、unresolved diagnostic、ID fallback、`sourceOrdinal`、turn 归属和敏感内容不泄露的失败测试。
2. 测试输入显式携带 Thread ID、record ordinal / replay position 与相邻 raw records；期望值比较完整 `ThreadHistoryChangeSet` 或完整 `ThreadItem`，不逐字段零散断言。
3. 覆盖原始 AgentMessage 有 ID 与无 ID 两种情况，并证明多次运行得到同一 identity。

### 2. 实现唯一 raw-to-structured converter

1. 在 `inter_agent_message_projection.rs` 中实现批量、有序、纯函数转换；输入适配 modern `RolloutLine` 与 legacy replay，但核心归一化只保留一份。
2. 先识别相邻 metadata / response pair，再解析既有 envelope 以归一化 `author`、`recipient` 与 `messageKind`；不复制 payload 或正文。
3. 输出携带 turn ID 的 `ThreadHistoryItemChange`，让后续 history materialization 与 live fanout 消费同一 change。
4. 对缺失或矛盾信息生成 `unresolved` diagnostic；不得通过忽略 record、默认成 `message` 或 fallback 到 raw notification 隐藏问题。

### 3. 接入两类历史重建

1. 把 paginated `thread_history_projection` 从单 line 转换调整为按有序 suffix 批投影，使跨 line 的 modern pair 原子地产生一个 change。
2. 修改 thread-store materialization 一次投影本批完整 records，并继续在 SQLite transaction 中按原 ordinal 应用 change；失败重试不得重复 item。
3. 将 legacy/stateful `ThreadHistoryBuilder` 接到同一 converter，同时保留 rollback、compaction、change accumulator 与 subagent history prefix 规则。
4. 证明 history pagination 和 attach snapshot 对同一 raw records 生成相同 `ThreadItem`、turn、ID 与顺序。

### 4. 建立 durable live refresh

1. 保留现有 `rawResponseItem/completed` notification 行为，但该 notification 只触发 app-server 重新读取已经持久化的 Thread history。
2. 对重新读取的 durable records 调用步骤 2 的统一 converter，按 snapshot cut / 已投影 `sourceOrdinal` 计算尚未发送的 item changes。
3. 通过 projection facade / manager 把每个新 change 包装为既有 `ThreadProjectionEvent::ItemCompleted`，沿现有 generation、subscription 与 backpressure fanout 发给目标 Thread。
4. attach snapshot 建立去重基线；attach 读 snapshot 期间出现的 durable record 必须落在 snapshot 或后续 event 中且恰好一次。
5. live 路径不得使用 raw notification 中缺 durable ordinal 的 `ResponseItem` 直接计算 ID，也不得另写 envelope parser。

### 5. 扩展 experimental variant registry 与 schema filter

1. 在 Rust `ThreadItem` variant 上标注 experimental reason，并让 derive macro 生成 variant registry。
2. 扩展 stable TS filter，精确删除 `ThreadItem.ts` 中的 `interAgentMessage` union arm及仅由它使用的 import；不得影响其他 stable arms。
3. 扩展 stable JSON filter，处理 root、definitions、bundle 与独立 schema 中的 tagged union arm；不得留下悬空 definition / reference。
4. 保持默认 stable 生成根不变；使用独立 experimental 根生成完整 experimental profile。
5. schema fixture 测试同时断言 stable absence、experimental presence 和两套 manifests / bundles 自洽。

### 6. 聚焦验证并形成单独提交

1. 依次运行原生 schema 生成、格式化、聚焦测试、scoped fix 与最终格式检查；检查每个命令产生的 diff。
2. 不运行 `cargo test`、crate-wide `just test -p <crate>`、workspace-wide `just test` 或 workspace-wide `just fix`。
3. 只暂存本计划列出的 01 Rust 源码、测试以及 stable / experimental schema generator 实际改动的 artifacts。
4. 检查 staged diff 确认没有 GUI、DAG 或其他计划文件后，创建 01 的独立本地提交；提交完成后才允许进入 02。

## 测试 seam

### Converter 单元测试

- modern metadata + `ResponseItem::AgentMessage` 恰好生成一个 item。
- legacy `InterAgentCommunication` 生成同构 item。
- `MESSAGE`、`FINAL_ANSWER`、`NEW_TASK` 与无法识别 envelope 的 `unresolved` 映射固定。
- author / recipient 结构化输出正确；payload、encrypted content 和 plaintext 正文均不出现在序列化结果。
- 原始 ID 优先；fallback ID、`sourceOrdinal` 与 replay 结果稳定。
- metadata 缺失、错位或矛盾时输出 diagnostic，而不是静默跳过或错误归类。

### History / thread-store 测试

- 相邻 line 跨 materialization batch 边界时仍能正确配对，且刷新重试不重复。
- paginated history、legacy history、rollback、compaction 与 subagent history prefix 维持各自现有语义。
- item 的 turn、rollout order、ID 和 JSON snapshot 在 SQLite 读取后不漂移。

### Schema 测试

- stable TypeScript / JSON 的 `ThreadItem` 不包含 `interAgentMessage`。
- experimental TypeScript / JSON 包含完整 variant 与 `InterAgentMessageKind`。
- stable 与 experimental 各自的 bundle、index、client request manifest 和 server notification manifest 无 drift、无悬空引用。

### App-server 公共 API 测试

- attach snapshot 能看到 durable inter-agent item。
- attach 后的新 durable item 以 `ItemCompleted` projection event 发送。
- raw notification 自身不产生第二个 identity；重复刷新、attach race 与重连均恰好一次。
- snapshot 与 live 对同一 record 的 item、turn、ID、`sourceOrdinal` 完全相同。
- projection subscriber backpressure / generation 行为保持现状。

## 允许执行的验证命令

以下命令只在后续获准实施 01 时执行；本次仅编写计划，不执行。工作目录均为 `codex-rs`，顺序如下：

```bash
just write-app-server-schema
just write-app-server-schema --schema-root app-server-protocol/schema/experimental --experimental
just fmt
just test -p codex-app-server-protocol thread_history_projection
just test -p codex-app-server-protocol schema_fixtures
just test -p codex-thread-store thread_history_materialization
just test -p codex-app-server --test all suite::v2::thread_projection::
just fix -p codex-app-server-protocol
just fix -p codex-thread-store
just fix -p codex-app-server
just fmt
just fmt-check
```

`fix` / 最终 `fmt` 后不重跑测试。若 scoped command 实际选择了超出上述 seam 的 crate-wide 测试或修改计划外文件，应停止并先更新计划，不用豁免、skip、baseline 或放宽断言绕过。

## 独立暂存边界与建议提交

- 01 是一个独立顶层计划任务，也是一个独立本地提交边界。
- 只暂存“精确文件边界”列出的实际修改 / 新增 Rust 文件，以及两次原生 schema 生成命令实际产生的 stable / experimental artifacts。
- 暂存后必须检查 `git diff --cached --stat` 与 `git diff --cached`，确认没有 `codex-gui/**`、02–06 内容、其他计划文档或无关 workspace 变更。
- 建议提交信息：`feat(app-server): project inter-agent messages`
- 本次仅落盘本计划文档，不 stage、不 commit。

## 停止条件

出现以下任一情况立即停止，不扩大范围、不用兼容兜底隐藏问题；先更新本计划并等待用户确认：

- 必须修改 core / rollout raw event、metadata、文本信封或 persistence 语义才能确定投影。
- 无法仅凭既有 raw record 与 durable ordinal / canonical replay position 稳定确定 identity、kind 或 turn。
- live 只能从缺 durable ordinal 的 raw notification 生成，无法与 history / snapshot 共用 identity。
- modern metadata 与 response item 无法在 thread-store 的合法 materialization batch 边界内可靠配对。
- 必须手写 generated TypeScript / JSON、bundle、index 或 manifest。
- experimental profile 必须覆盖 stable schema 根才能实现，或 stable schema 无法排除新 union arm。
- 必须新增 GUI、DAG、runtime 产品文件，或提前实现 02–06 的职责。
- 需要新依赖、数据迁移、stable 外部接口语义扩大、安全语义变化或不可逆操作。
- `codex-rs/app-server-protocol/BUILD.bazel` 之外的计划外 Bazel / build 文件，或任何其他计划外 crate / file 成为必要修改。
- 聚焦验证只能通过新增 / 扩大豁免、忽略、skip、降级检查、放宽断言、删除覆盖或修改 baseline 才能通过。

## 完成条件

- Rust 权威 contract、唯一 converter、modern / legacy history、thread-store materialization、attach snapshot 与 durable live projection 全部接通。
- 同一 raw delivery 在 history、snapshot 和 live 中具有完全一致的结构化 item、稳定 ID、`sourceOrdinal`、turn 与顺序，且不重复、不泄露敏感内容。
- stable schema 不暴露 experimental variant；独立 experimental schema 根完整包含该 variant；所有 artifacts 均由原生 generator 生成。
- 上述聚焦测试和验证通过，staged diff 仅包含 01 边界，并创建建议的独立本地提交。
- 01 独立提交完成后立即停止本任务；后续按已确认的 00 线性计划进入 02。
