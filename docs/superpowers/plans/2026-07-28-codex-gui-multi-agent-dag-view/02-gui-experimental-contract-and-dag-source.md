# GUI experimental 契约与 AgentDagSource 实施计划

日期：2026-07-28
状态：待确认
上游计划：`01-app-server-inter-agent-projection.md`
总览：`00-overview.md`

## 唯一目标

把任务 `01` 已完成的 experimental app-server 权威契约机械接入 `codex-gui`，并在生成的 request descriptor、runtime validator 和 `GuiHostCommands` 之上建立窄的 production/in-memory `AgentDagSource`，为后续 DAG runtime 提供完整类型化的 descendants、turns、attach 与 detach 数据源。

## 前置条件

- `01-app-server-inter-agent-projection.md` 已完成聚焦验证并形成独立本地提交。
- `01` 已钉死且生成独立的 experimental schema profile：
  - TypeScript：`codex-rs/app-server-protocol/schema/experimental/typescript/`；
  - JSON：`codex-rs/app-server-protocol/schema/experimental/json/`。
  本任务只消费该 profile，不覆盖稳定 `codex-rs/app-server-protocol/schema/typescript/` 与 `codex-rs/app-server-protocol/schema/json/`，也不在 GUI 内手写或修补 Rust contract。
- experimental profile 必须同时包含：
  - `ThreadItem::InterAgentMessage`；
  - `ThreadListParams.ancestorThreadId`；
  - `thread/turns/list` request/response；
  - 既有 `thread/list`、`thread/projection/attach`、`thread/projection/detach` 及 projection notifications。
- 开始实现前，先运行 `git status --short` 并核对 `01` 的提交与 experimental profile 路径；任一条件不满足即停止，不用临时 DTO、交叉类型或 assertion 补洞。

## 非目标

- 不修改 Rust protocol、app-server projection、rollout record、schema generator 或任务 `01` 的输出语义。
- 不实现多 Thread runtime、分页并发、history/live 协调、projection notification fanout 或 subscription lease 管理。
- 不把 projection item 转换为五类 DAG 事件，不实现 causal replay、batch merge、activation、lane、颜色、Redux scene 或 React Flow。
- 不修改现有单 Thread `ProjectionApplicationCoordinator`、`threadRuntime.current` 或 transcript state。
- 不新增通用 `request(method, unknown)`，不把生成类型擦除成 `unknown` 后再手写校验或 assertion。
- 不新增依赖，不涉及 HeroUI 组件、视觉样式或浏览器测试。

## 权威契约与派生路径

```text
任务 01 的 Rust app-server v2 类型
  -> 任务 01 的独立 experimental schema profile
    -> codex-gui protocolValidators 选择该 profile
      -> src/generated/appServerProtocol/*
        -> RequestParams<M> / RequestResponse<M>
          -> GuiHostCommands
            -> AppServerAgentDagSource
```

`AgentDagSource` 的 `Thread`、`Turn` 与 `ThreadProjectionAttachResponse` 必须直接引用 `@codex-protocol/v2` 生成类型；允许 `Extract`、indexed access 等机械类型变换，不允许创建字段等价的 consumer-owned DTO。production adapter 只组合生成命令；in-memory adapter 也存放同一生成类型，不创建第二套测试协议。

## 精确文件范围

### 修改：experimental profile 选择与生成入口

- `codex-gui/tsconfig.app.json`
  - 把 `@codex-protocol` 与 `@codex-protocol/*` 指向 `../codex-rs/app-server-protocol/schema/experimental/typescript/`。
- `codex-gui/vite.config.ts`
  - 让运行与测试解析使用 `../codex-rs/app-server-protocol/schema/experimental/typescript/`，避免 tsc 与 Vite 读取不同 contract。
- `codex-gui/scripts/protocolValidators/cli.ts`
  - 从 `../codex-rs/app-server-protocol/schema/experimental/json/` 读取 `codex_app_server_protocol.schemas.json`、`client-request-definitions.json` 和 `server-notification-definitions.json`；`--check` 与 `--write` 必须选择同一 profile。
- `codex-gui/scripts/protocolValidators/cli.test.ts`
  - 固定 profile 路径选择、manifest 输入和缺失/错误 profile 的失败传播。
- `codex-gui/src/features/guiHost/appServerProtocol.ts`
  - 在现有方法白名单中加入 `thread/list`、`thread/turns/list`、`thread/projection/detach`；保留 `initialize`、`thread/projection/attach`、`turn/start`、`turn/interrupt` 和现有 projection notification 白名单。

> stable 与 experimental 目录必须继续并存；不得对 stable 目录运行 `--experimental`，也不得让 GUI 的 TypeScript alias 与 validator generator 分别读取两个 profile。experimental profile 仍只由任务 `01` 规定的 `just write-app-server-schema --schema-root app-server-protocol/schema/experimental --experimental` 生成，本任务不重复修改其生成流程。

### 生成：只由项目生成命令更新

- `codex-gui/src/generated/appServerProtocol/requestDescriptors.ts`
- `codex-gui/src/generated/appServerProtocol/notificationDescriptors.ts`
- `codex-gui/src/generated/appServerProtocol/appServerPayloadValidators.raw.js`
- `codex-gui/src/generated/appServerProtocol/appServerPayloadValidators.js`
- `codex-gui/src/generated/appServerProtocol/appServerPayloadValidators.d.ts`
- `codex-gui/src/generated/appServerProtocol/jsonRpcEnvelopeValidators.raw.js`
- `codex-gui/src/generated/appServerProtocol/jsonRpcEnvelopeValidators.js`
- `codex-gui/src/generated/appServerProtocol/jsonRpcEnvelopeValidators.d.ts`
- `codex-gui/src/generated/appServerProtocol/index.ts`

生成目录必须通过 `protocol:generate-validators` 整体原子更新；禁止手改其中任一文件。实际生成文件集合以生成器输出为准，生成后检查 extra/missing/stale，不能保留旧 profile 的多余 artifact。

### 修改：initialize、Host commands 与契约测试

- `codex-gui/src/features/guiHost/guiHostHandshakeController.ts`
  - `initialize` 明确发送 `capabilities: { experimentalApi: true, requestAttestation: false }`；其余握手顺序和 attach 行为不变。
- `codex-gui/src/features/guiHost/guiHostCommandGateway.ts`
  - 给 `GuiHostCommands` 增加四个窄命令：`listThreads`、`listTurns`、`attachThreadProjection`、`detachThreadProjection`；每个命令都使用对应生成 descriptor、`RequestParams<M>` 与 `RequestResponse<M>`。
- `codex-gui/src/features/guiHost/__tests__/guiHostHandshakeController.test.ts`
  - 固定 initialize capability 的精确 wire payload。
- `codex-gui/src/features/guiHost/__tests__/guiHostGeneratedProtocol.test.ts`
  - 用类型级断言固定 `ThreadItem` experimental union arm、`ancestorThreadId`、四个 source request 的 params/response 关联与 exhaustive narrowing。
- `codex-gui/src/features/guiHost/__tests__/generatedAppServerProtocol.test.ts`
  - 通过生成 validator 验证四类 source response 的合法 payload，并拒绝关键字段缺失或错误 union arm；不得手写 validator。
- `codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts`
  - 固定新增命令的 JSON-RPC method/params、合法 response、malformed response、RPC failure 与 gateway invalidation 行为。
- `codex-gui/src/features/guiHost/__tests__/guiHostCommandGateway.test.ts`
  - 扩展 ready/inactive/invalidated 边界，确认新增命令与既有命令共享同一 readiness gate。
- `codex-gui/src/__tests__/appBrowserTestSupport.ts`
  - 集中扩展 `createGuiHostCommands` 的 typed mock，使现有 Browser Mode 消费者继续通过完整 `GuiHostCommands` 构造测试环境；本任务不改这些消费者的 UI 断言。

### 修改：共享合法 projection fixture builder

- `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`
  - 只在 adapter 测试确有需要时增加由生成 `Thread`、`Turn`、`ThreadProjectionAttachResponse` 类型约束的 builder；复用 `baseTurn`、`attachWithThreadId` 等现有 seam，不在 adapter 测试中手写大型协议对象。

### 新增：AgentDagSource port 与 adapters

- `codex-gui/src/features/agentDagSource/agentDagSource.ts`
  - 定义设计确认的窄 interface：
    - `listDescendants(rootThreadId): AsyncIterable<Thread[]>`
    - `listTurns(threadId): AsyncIterable<Turn[]>`
    - `attach(threadId): Promise<ThreadProjectionAttachResponse>`
    - `detach(threadId): Promise<void>`
- `codex-gui/src/features/agentDagSource/appServerAgentDagSource.ts`
  - production adapter 只依赖 `GuiHostCommands`；内部循环 `nextCursor`。
  - descendants 请求固定 `ancestorThreadId: rootThreadId`，不自行过滤或递归扫描 parent IDs。
  - turns 请求固定 `sortDirection: "asc"`、`itemsView: "full"`，逐页 yield 原始生成 `Turn[]`。
  - attach/detach 只转发窄 Host command；detach 成功后丢弃生成 response，错误原样传播。
- `codex-gui/src/features/agentDagSource/inMemoryAgentDagSource.ts`
  - 存储由生成类型组成的 descendants pages、per-thread turns pages 与 attach responses；记录 attach/detach 调用，供任务 `05` 的 runtime 测试复用。
  - 不模拟排序、validator、transport 或 subscription coordinator 行为。
- `codex-gui/src/features/agentDagSource/__tests__/appServerAgentDagSource.test.ts`
  - 对 fake `GuiHostCommands` 做请求等值断言，覆盖多页 cursor、空页终止、asc/full 固定参数、attach/detach、第二页失败传播。
- `codex-gui/src/features/agentDagSource/__tests__/inMemoryAgentDagSource.test.ts`
  - 覆盖 page 顺序、按 Thread 隔离、attach/detach 记录和缺失 fixture 的显式失败。

## 实施步骤

### 1. 先建立 generated contract 的失败测试

1. 扩展 `cli.test.ts`，要求 GUI generator 明确读取任务 `01` 的 experimental JSON profile；stable profile 或缺失 profile 必须失败，而不是生成缩水 contract。
2. 扩展 `guiHostGeneratedProtocol.test.ts`：
   - `Extract<ThreadItem, { type: "interAgentMessage" }>` 不是 `never`；
   - `ThreadListParams` 具有生成的 `ancestorThreadId`；
   - `thread/turns/list`、`thread/list`、projection attach/detach 的 descriptor 与生成 params/response 一一对应。
3. 扩展 `generatedAppServerProtocol.test.ts`，先写合法/非法 response validator 断言。测试失败必须指向 profile/descriptor/validator 缺口，不用 type assertion 让测试先编译通过。

### 2. 切换 GUI 到独立 experimental profile 并重新生成

1. 根据任务 `01` 的精确输出，统一修改 `tsconfig.app.json`、`vite.config.ts` 和 `protocolValidators/cli.ts`，保证 TypeScript、Vite/Vitest 与 validator generator 读取同一 profile。
2. 在 `appServerProtocol.ts` 增加 source 所需 request 白名单。
3. 使用项目原生命令生成整个 `src/generated/appServerProtocol/`；检查 diff 中只出现由所选 Rust schema 机械派生的 declaration、descriptor 和 validator。
4. 运行 `protocol:check-validators`，证明所选 source profile 与全部 generated artifacts 一致；若 stable/experimental 内容混用，停止并修正 profile 选择，不在生成物上 patch。

### 3. 启用 experimental capability

1. 先把握手测试的 initialize 期望改为精确 capability object。
2. 修改 `GuiHostHandshakeController`，只把 `capabilities: null` 改成 `{ experimentalApi: true, requestAttestation: false }`。
3. 保持 authenticate -> initialize -> root projection attach 的既有顺序、回调和失败语义不变。

### 4. 扩展窄的 Host command gateway

1. 在 command/gateway 测试中先覆盖新增四个 method 的 exact wire payload 与生成 validator 失败。
2. 用现有 `requestDescriptors[method]` 增加 `listThreads`、`listTurns`、`attachThreadProjection`、`detachThreadProjection`；禁止暴露底层 `AppServerRequestSender` 或任意 method request。
3. 复用 `withReadyGateway`，确认 cleanup、socket error/close 与 terminal protocol failure 会让全部新增命令同步失效。
4. 扩展 `src/__tests__/appBrowserTestSupport.ts` 的集中式 `createGuiHostCommands`，为新增字段提供 typed mock；不得在各消费测试内散落不完整 command object。

### 5. 先定义 port，再实现 production adapter

1. 新增 `AgentDagSource` interface，签名直接使用生成类型。
2. 在 production adapter 测试中以 typed `GuiHostCommands` fake 固定分页参数和产出页。
3. 实现 descendants cursor loop：每次 yield `response.data`，仅当 `nextCursor !== null` 时继续；不扁平化所有 descendants。
4. 实现 turns cursor loop：始终发送 `sortDirection: "asc"`、`itemsView: "full"`，逐页 yield `response.data`；不在本层排序、去重或转换 item。
5. 实现 attach/detach passthrough；transport readiness、response validation 与 invalidation 继续由 command gateway/transport session 拥有。

### 6. 实现可复用 in-memory adapter

1. 只接受生成类型的 pages/responses，默认不制造协议数据。
2. 异步迭代严格保留注入 page 边界，为任务 `05` 测试 pagination、不同 page 切分和 arrival order 提供 seam。
3. 记录 attach/detach 调用；缺失 Thread fixture 时显式 reject，不能返回空 snapshot 掩盖测试配置错误。

### 7. 收口本任务验证

1. 对修改的普通 TypeScript 文件使用项目已有 `oxfmt` 自动格式化；生成文件仅由 generator 产生。
2. 先运行 protocol generator/check 和本任务聚焦测试，再运行 `lint`、`type-check` 与全量 unit tests。
3. 所有前端验证通过后，从 `codex-rs/` 运行一次 `just fmt`；这是根仓库对仓库内任何代码变更的完成规则，不是后端 build。此后不重跑测试，只检查 `just fmt` 的 diff 是否仍在本任务文件范围内。
4. 只修正本任务直接引入且仍在上述文件/语义范围内的问题；不得开始任务 `03` 的事件模型或任务 `05` 的 runtime。

## 测试 seam

- **Profile seam**：`loadAppServerGenerationInputs` 接收明确 schema directory；测试断言 bundle、request manifest、notification manifest 来自同一 experimental profile。
- **Generated type seam**：`RequestParams<M>` / `RequestResponse<M>` 与 `Extract<ThreadItem, ...>` 在编译期证明 GUI 依赖 Rust 权威 union 与 request 定义。
- **Runtime validation seam**：只调用生成 descriptor 的 `validateResponse` 和生成 payload validators；malformed payload 必须在 transport boundary 失败。
- **Command seam**：RecordingSocket 断言 method/params 并用真实生成 validator settle response，覆盖 readiness/invalidation。
- **Source seam**：production adapter 依赖 typed `GuiHostCommands` fake；测试只判断分页参数、page 输出与错误传播，不越层测试 WebSocket。
- **Future runtime seam**：in-memory adapter 保留 page 边界和 attach/detach 调用记录，任务 `05` 可注入而无需知道 JSON-RPC。
- **Fixture seam**：合法 projection payload 优先扩展 `projectionTestBuilders.ts`；malformed payload、JSON-RPC envelope 和 outbound request 继续在拥有断言的测试内显式书写。

## 验证命令

以下命令均在 `codex-gui/` 下使用用户的 fnm runtime；执行前先确认 `/opt/homebrew/bin/fnm` 存在，并运行 `/opt/homebrew/bin/fnm exec --using-file pnpm --version`。若工具缺失或 pnpm 解析到 `/Users/<user>/.cache/codex-runtimes/`，停止并让用户自行修复环境；不得安装依赖。

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:generate-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run scripts/protocolValidators/cli.test.ts src/features/guiHost/__tests__/guiHostGeneratedProtocol.test.ts src/features/guiHost/__tests__/generatedAppServerProtocol.test.ts src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/agentDagSource/__tests__/appServerAgentDagSource.test.ts src/features/agentDagSource/__tests__/inMemoryAgentDagSource.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit
```

上述前端验证全部通过后，在 `codex-rs/` 下执行最后的仓库格式化步骤：

```bash
just fmt
```

`just fmt` 是根仓库规则要求的格式化命令，不是后端 build。执行后不得重跑任何测试，只运行 `git diff --check`、查看 `git status --short` 与实际 diff，确认格式化没有产生本任务范围外变更；若出现范围外变更立即停止并汇报。

不运行 Browser Mode、E2E、Vite build、Rust build 或完整 Rust test；本任务没有 UI，Browser Mode 留给任务 `06`。`protocol:generate-validators` 是实现步骤中的生成命令，不是最终只读检查；生成后必须以 `protocol:check-validators` 复验。

## 独立暂存边界与建议提交

本任务完成所有聚焦验证并闭环本任务引入的问题后，独立暂存：

- 上述 `codex-gui` profile/config、protocol generator、generated artifacts；
- initialize 与 command gateway 及其测试；
- `projectionTestBuilders.ts` 中本任务实际新增的 builder；
- 新增 `agentDagSource` port、production/in-memory adapters 及其测试。

不得暂存任务 `01` 的 Rust/schema 变更、其他 `01`–`06` 计划文件、无关工作区变更或后续 DAG 实现。暂存后必须运行 `git diff --cached --check` 和 `git diff --cached --stat`，再检查 staged diff 未出现手写 generated 文件、协议镜像或通用 request。

建议提交信息：

```text
feat(codex-gui): add experimental DAG source contract
```

该提交创建成功后才能开始任务 `03`。

## 停止条件

出现以下任一情况立即停止当前任务并回到计划确认，不自行扩大范围：

- 任务 `01` 没有独立 experimental profile、profile 路径或 manifest 不明确，或 profile 缺少本任务依赖的 type/method。
- 必须修改 Rust contract、projection 数据语义、稳定 schema profile或任务 `01` 的生成流程才能继续。
- 生成 union、descriptor 或 validator 无法由权威 schema 表达，需要手写 DTO、literal union、field list、validator、declaration merge、`unknown` assertion 或 silent fallback。
- `thread/list` 的 descendant 语义、`thread/turns/list` 的 asc/full 分页语义或 projection attach/detach response 与已确认设计不一致。
- production source 需要获得通用 transport/request 能力，或需要承担 notification routing、subscription lease、并发、排序、去重、event conversion、Redux 或 UI 职责。
- 修改范围需要越过本计划列出的文件、新增依赖、安装工具、运行禁止的后端/原生/CLI build，或改变外部接口、数据或安全语义。
- 验证发现预存或与本任务无关的问题；只记录并汇报，不借本任务修复。

## 完成出口

- GUI 的 TypeScript、Vite/Vitest 与 runtime validator generator 全部读取任务 `01` 的同一个独立 experimental profile；stable profile 未被覆盖。
- initialize 明确声明 `experimentalApi: true` 和 `requestAttestation: false`。
- `InterAgentMessage`、`ancestorThreadId`、`thread/turns/list`、thread/projection attach/detach 均从生成 contract 进入 GUI，且 descriptor/validator drift check 通过。
- `GuiHostCommands` 只增加所需窄命令，没有通用 request 逃生口。
- production/in-memory `AgentDagSource` 均直接使用生成类型；production adapter 隐藏 cursor 和固定 turns asc/full，in-memory adapter 保留 page seam。
- 本任务聚焦测试、format check、lint、type-check 和全量 unit tests 通过。
- staged diff 仅包含本任务文件并形成一个独立本地提交；提交后停止，不提前执行任务 `03`。
