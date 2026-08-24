# Codex GUI nullable response 运行时验证一致性实施计划

计划状态：已确认

确认日期：2026-08-24

确认原文：确认计划

计划日期：2026-08-24

计划分支：dev

计划基线：88384ed3af3bb57bc62a13812467956a13037996

## 关联文档

- 已确认设计：docs/superpowers/specs/2026/08/24/2026-08-24-codex-gui-nullable-response-runtime-validation-design.md
- Issue：docs/superpowers/issues/2026/08/24/2026-08-24-01-codex-gui-current-code-problems/2026-08-24-03-nullable-response-runtime-validation.md

## 目标与当前基线

唯一目标是从 Rust 权威 response 类型修正 app-server v2 中“字段必须存在、值可以为 null”的
契约表达，使 TypeScript、JSON Schema 和 Codex GUI runtime validator 一致；同时保留
ConfigReadResponse.layers 的“可省略、存在时只能为数组”语义，恢复仓库固化生成入口，并建立
跨生成物回归约束。

当前代码证明必须修改，而不是仅靠目标设计推演修改：

- client-request-definitions.json 可达的 stable 视图有 23 个 response 类型、28 个顶层字段发生
  TypeScript 必传 nullable、JSON Schema 非 required 的漂移。
- experimental 完整视图有 39 个 response 类型、54 个同类字段；它包含 stable surface，不能与
  stable 数量相加。
- 54 个 experimental 字段中，ConfigReadResponse.layers 是唯一需要反向校准为 optional、
  non-null 的例外；其余 53 个普通字段都必须同时变成 required 与 nullable。
- GetAccountTokenUsageResponse.threadUsage、McpServerToolCallResponse.isError 和
  EnvironmentStatusResponse.error 已经是 TypeScript optional nullable，必须保持 optional，
  不属于 53 个普通字段。
- ThreadListResponse 的两个 cursor 在生成 TypeScript 中必传、生成 JSON Schema 中不在 required，
  GUI standalone validator 因此接受缺失字段；transport 随后把不完整对象收窄成完整 response，
  consumer 又把 undefined 当成 nullish 分页结束。这证明问题位于权威 schema 与生成链，不在
  pagination consumer。
- justfile 的 write-app-server-schema 仍调用已删除的 write_schema_fixtures binary，而现存权威
  入口是 codex-rs/app-server-protocol/scripts/write_schema_fixtures.py；不修 recipe 就无法按项目
  固化入口重新生成。
- 只加 schemars(required) 会把 Option<T> 的属性值域收窄成非 nullable，合法 null 会被拒绝；
  因此普通字段必须成对使用 required 与返回 Option<T> schema 的 schema_with。

## 精确影响面

### Rust 权威源

53 个普通字段分布在以下 13 个 v2 源文件；括号内列出本次目标 response 与字段：

- codex-rs/app-server-protocol/src/protocol/v2/account.rs：GetAccountRateLimitsResponse.
  rateLimitResetCredits、rateLimitsByLimitId；GetAccountTokenUsageResponse.dailyUsageBuckets；
  GetAccountResponse.account。
- codex-rs/app-server-protocol/src/protocol/v2/apps.rs：AppsListResponse.nextCursor。
- codex-rs/app-server-protocol/src/protocol/v2/config.rs：ConfigRequirementsReadResponse.
  requirements、ConfigWriteResponse.overriddenMetadata；另含 layers 例外。
- codex-rs/app-server-protocol/src/protocol/v2/environment.rs：EnvironmentInfoResponse.cwd。
- codex-rs/app-server-protocol/src/protocol/v2/experimental_feature.rs：
  ExperimentalFeatureListResponse.nextCursor。
- codex-rs/app-server-protocol/src/protocol/v2/mcp.rs：ListMcpServerStatusResponse.nextCursor、
  McpResourceReadResponse.originCallId。
- codex-rs/app-server-protocol/src/protocol/v2/model.rs：ModelListResponse.nextCursor。
- codex-rs/app-server-protocol/src/protocol/v2/permissions.rs：
  PermissionProfileListResponse.nextCursor。
- codex-rs/app-server-protocol/src/protocol/v2/plugin.rs：
  MarketplaceRemoveResponse.installedRoot、PluginSkillReadResponse.contents、
  PluginShareSaveResponse.canPublishToWorkspace、PluginShareCheckoutResponse.remoteVersion。
- codex-rs/app-server-protocol/src/protocol/v2/plugin_search.rs：
  PluginSearchResponse.nextCursor。
- codex-rs/app-server-protocol/src/protocol/v2/project.rs：ProjectListResponse.nextCursor。
- codex-rs/app-server-protocol/src/protocol/v2/remote_control.rs：
  RemoteControlClientsListResponse.nextCursor、RemoteControlDisableResponse.environmentId、
  RemoteControlEnableResponse.environmentId、RemoteControlPairingStartResponse.manualPairingCode、
  RemoteControlStatusReadResponse.environmentId。
- codex-rs/app-server-protocol/src/protocol/v2/thread.rs：
  MockExperimentalMethodResponse.echoed；
  ThreadBackgroundTerminalsListResponse.nextCursor；
  ThreadForkResponse.activePermissionProfile、reasoningEffort、serviceTier；
  ThreadGoalGetResponse.goal；
  ThreadItemsListResponse.backwardsCursor、nextCursor；
  ThreadListResponse.backwardsCursor、nextCursor；
  ThreadLoadedListResponse.nextCursor；
  ThreadQueueListResponse.nextCursor；
  ThreadResumeResponse.activePermissionProfile、initialTurnsPage、itemsBackwardsCursor、
  reasoningEffort、serviceTier、turnsBackwardsCursor；
  ThreadRevertResponse.itemsBackwardsCursor、turnsBackwardsCursor；
  ThreadSearchOccurrencesResponse.nextCursor；
  ThreadSearchResponse.backwardsCursor、nextCursor；
  ThreadSectionListResponse.nextCursor；
  ThreadStartResponse.activePermissionProfile、reasoningEffort、serviceTier；
  ThreadTurnsListResponse.backwardsCursor、nextCursor。

辅助权威源：

- codex-rs/app-server-protocol/src/protocol/serde_helpers.rs：按实际字段类型复用或增加最少量的
  nullable schema helper；helper 返回 Option<T> 的 schema，不手写 JSON。
- codex-rs/app-server-protocol/src/protocol/v2/config.rs 中的 ConfigReadResponse.layers：
  保留 skip_serializing_if，增加 #[ts(optional)]，并使用 optional、non-null 的 Vec<ConfigLayer>
  schema helper；禁止使用只适用于 client request params 的 #[ts(optional = nullable)]。

### 测试与入口

- justfile：recipe 仅切换到现有 Python generator 并原样透传参数。
- codex-rs/app-server-protocol/src/schema_fixtures_tests.rs：增加 manifest、TypeScript optionality 与
  JSON Schema required/nullable 的 stable/experimental 通用交叉契约测试；失败信息必须包含视图、
  response 和字段。测试必须在临时目录生成 fresh in-memory stable/experimental 树并交叉读取，
  不读取或依赖 vendored fixture 更新，因此可在 source 阶段先 red、修改权威源后立即 green。
- codex-rs/app-server/tests/suite/v2/config_rpc.rs：通过
  read_stream_until_response_message(...).result 读取原始 JSON result，验证 includeLayers=false 时
  key 缺失、includeLayers=true 时 key 为数组且允许空数组；layers:null 的拒绝由协议 schema
  交叉契约测试验证，不向 app-server 注入非法 response。
- codex-gui/src/features/guiHost/__tests__/generatedAppServerProtocol.test.ts：唯一 GUI 手写测试文件；
  对 ThreadListResponse.nextCursor、backwardsCursor 和 ThreadResumeResponse.serviceTier、
  reasoningEffort 分别断言缺失拒绝、显式 null 接受。

### 机械生成物

只能由固化入口根据实际 diff 更新：

- codex-rs/app-server-protocol/schema/json/**；
- codex-rs/app-server-protocol/schema/typescript/**；
- codex-rs/app-server-protocol/schema/precomputed/app-server-exports-stable.json.zst；
- codex-rs/app-server-protocol/schema/precomputed/app-server-exports-experimental.json.zst；
- codex-gui/src/generated/appServerProtocol/**；
- codex-gui/src/generated/guiHostContract/** 仅由 GUI generator 作为第二个原子输出目录检查；若内容
  无变化，不为追求清单完整而制造 diff。

## 权威到 consumer 的纵向链

1. 13 个 v2 response 源文件定义 wire 字段与 ts-rs/schemars 标注；serde_helpers 提供值域 schema。
2. protocol/common.rs 的 v2 client request manifest 把 method 映射到 response 根类型。
3. schema_fixtures_tests 与 export/generator 生成 stable、experimental 的 JSON Schema、TypeScript
   与压缩预计算导出。
4. justfile 的 write-app-server-schema 是唯一固化写入口，转发给现有 Python 脚本；脚本设置环境
   后调用被 ignore 的 fixture test。
5. codex-gui 的 protocol:generate-validators 读取 stable client request manifest 和 JSON Schema，
   原子写入 src/generated/appServerProtocol 与 src/generated/guiHostContract 两个目录。
6. appServerProtocol requestDescriptors 暴露 validateResponse；guiHostTransportSession 以验证成功
   作为完整 response 类型收窄证据。
7. thread list/resume 等 consumer 只消费完整类型，不新增 undefined fallback。修复后的缺失字段在
   transport 边界直接失败，显式 null 继续合法。

## 实现约束

- 普通字段保持 Option<T>，使用 #[schemars(required, schema_with = "...nullable...")]；不得只加
  required。
- layers 使用 #[ts(optional)] 和 optional non-null schema helper；原始 JSON 只允许缺失或数组，
  null 由 schema 契约拒绝。
- 范围由 manifest 可达 response 根类型与 TypeScript 顶层 optionality 的交集决定，不按所有
  Option<T> 或名称通配扩张。
- 不手改任何 JSON、TypeScript、zst、validator 或 descriptor 生成物。
- 不增加 allowlist、豁免、skip、fallback、双路径、adapter、undefined 归一化或宽松断言。
- 不安装任何工具、依赖、runtime 或浏览器；工具缺失即停止并报告。
- 不运行 cargo build、cargo run、后端/原生 CLI 构建或运行命令。
- 不执行任何 Git 远程命令，不执行 force 语义 Git 命令。
- 不运行 just test、crate-wide test、workspace-wide lint、crate-wide lint 或
  just argument-comment-lint。
- dev 与 test 分支上的 codex-rs/Cargo.toml workspace.package.version 必须保持 0.0.0。

## 精确 worktree 预配

所有相关文档先形成独立 docs-only commit。该提交成功后，必须统一创建并核验下面两个 worktree；
两者都成功前，禁止任何实现编辑、生成、验证、stage 或任务提交。

### schema entry worktree

创建命令：

    git worktree add -b codex/nullable-response-schema-entry /Users/jiangsheng/cnb/codex/.worktrees/nullable-response-schema-entry dev

- 名称：nullable-response-schema-entry
- branch：codex/nullable-response-schema-entry
- base：dev（docs-only commit 后的已提交 HEAD）
- 目标路径：/Users/jiangsheng/cnb/codex/.worktrees/nullable-response-schema-entry
- include 范围：完整 worktree；不使用 sparse checkout。
- 创建后核验 branch、HEAD、justfile 可读、独立 Git index 与 git status --short --branch。

### GUI tests sparse worktree

必须使用项目专用脚本，不得展开为手写 git/symlink 命令：

    bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh --name nullable-response-gui-tests --branch codex/nullable-response-gui-tests --base dev

- 名称：nullable-response-gui-tests
- branch：codex/nullable-response-gui-tests
- base：dev（docs-only commit 后的已提交 HEAD）
- 目标路径：/Users/jiangsheng/cnb/codex/.worktrees/nullable-response-gui-tests
- include 范围：脚本默认 sparse 范围，不增加 --include：
  .codex/skills、.agents/skills、docs/superpowers、codex-gui、
  codex-rs/app-server-protocol/schema/typescript、
  codex-rs/app-server-protocol/schema/json、codex-rs/gui-host/schema/typescript、
  codex-rs/gui-host/schema/json。

执行前披露门禁：在调用脚本之前，必须在同一轮先原样打印完整命令、canonical worktree path，
以及以下五个 canonical link mapping；这是知情披露，不是二次确认。Vitest target 的 requested
alias 是 /Users/jiangsheng/cnb/vitest，其实际 canonical target 是
/Users/jiangsheng/GitHub/vitest，二者都必须披露。任何一项缺失都不得调用脚本。

- /Users/jiangsheng/cnb/codex/.worktrees/nullable-response-gui-tests/codex-gui/node_modules
  -> /Users/jiangsheng/cnb/codex/codex-gui/node_modules
- /Users/jiangsheng/cnb/codex/.worktrees/nullable-response-gui-tests/codex-gui/.heroui-docs/react
  -> /Users/jiangsheng/cnb/codex/codex-gui/.heroui-docs/react
- /Users/jiangsheng/cnb/codex/.worktrees/nullable-response-gui-tests/codex-gui/.redux-toolkit-docs/redux
  -> /Users/jiangsheng/cnb/codex/codex-gui/.redux-toolkit-docs/redux
- /Users/jiangsheng/cnb/codex/.worktrees/nullable-response-gui-tests/codex-gui/.redux-toolkit-docs/toolkit
  -> /Users/jiangsheng/cnb/codex/codex-gui/.redux-toolkit-docs/toolkit
- /Users/jiangsheng/cnb/codex/.worktrees/vitest
  -> /Users/jiangsheng/GitHub/vitest
  （requested target alias：/Users/jiangsheng/cnb/vitest）

脚本执行后核验实际 sparse list、固定 control plane、AGENTS/skill/doc/schema 可读、五个 link、
branch 与 git status --short --branch。任何路径、branch、链接或已有状态冲突都停止，不覆盖。

## 提交拓扑

每个边界形成独立本地提交，不 amend、不 squash、不把行为修改与纯顺序调整混在一个提交：

1. docs：已确认设计 + 本计划；实施前必须先提交。
2. entry：justfile 的 schema recipe 修复。
3. protocol source + tests：13 个 v2 源、serde_helpers、schema_fixtures_tests 和
   config_rpc 原始 JSON 回归。
4. GUI test：只含 generatedAppServerProtocol.test.ts，保留预期 red 证据。
5. protocol generated：只含项目入口产生的 protocol schema/TypeScript/precomputed diff。
6. GUI generated：只含 protocol:generate-validators 实际产生的两个输出目录 diff。
7. format-only（条件提交）：最终 just fmt 若产生纯格式差异，单独提交；不得并入行为提交。

entry 与 GUI test 在各自 branch 形成提交后，使用普通 git merge 集成回 dev，保留各自提交与 merge
关系；禁止 cherry-pick、squash、amend。protocol source + tests 直接在主 dev 形成提交。

## 验证命令

执行前只读确认工具已经存在；不安装缺失工具。

Rust 定向命令均遵守 codex-rust-verification Hard Limits：

    just test -p codex-app-server-protocol response_field_presence_matches_typescript_contract
    just test -p codex-app-server config_read_layers_wire_contract
    just test -p codex-app-server-protocol typescript_schema_fixtures_match_generated
    just test -p codex-app-server-protocol json_schema_fixtures_match_generated
    just test -p codex-app-server-protocol stable_precomputed_exports_match_schema_fixtures
    just test -p codex-app-server-protocol experimental_precomputed_exports_match_generated

生成命令只能通过固化入口，stable 与 experimental 因写相同 schema/precomputed 底层资源而串行：

    just write-app-server-schema
    just write-app-server-schema --experimental

GUI 命令必须在 codex-gui 目录通过 fnm 托管的 pnpm：

    /opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
    /opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/generatedAppServerProtocol.test.ts
    /opt/homebrew/bin/fnm exec --using-file pnpm run protocol:generate-validators
    /opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators
    /opt/homebrew/bin/fnm exec --using-file pnpm run type-check
    /opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt

最终所有测试、generator check、类型和前端格式检查通过后运行：

    just fmt

just fmt 之后不再运行测试。只审查格式 diff、按需形成 format-only 提交并做只读最终状态检查。

## 可调度 execution graph

以下 43 个节点构成权威 execution graph。deferralEvidence 未填写的节点均写“无”；可调度性只由
硬前置、授权、读写集合、执行上下文和 canonical 资源锁推导。

### N00E 记录计划确认元数据

- nodeId：N00E
- taskBoundary：docs
- operationKind：编辑
- outcome：消费用户届时明确的计划确认原文，只把本计划顶部元数据更新为
  计划状态：已确认、确认日期：2026-08-24、确认原文：<用户届时原文>。
- estimatedCost：低
- deferralEvidence：无
- hardPredecessors：用户明确确认本计划；等待可引用的确认原文。
- consumes：用户明确的计划确认原文、当前状态为“待确认”的本计划。
- produces：只含本计划确认元数据变化的 docs diff。
- completionEvidence：本计划状态为已确认，确认日期准确，确认原文逐字保留；正文实施范围未变。
- readSet：本计划、用户确认消息。
- writeSet：仅
  docs/superpowers/plans/2026/08/24/2026-08-24-codex-gui-nullable-response-runtime-validation-plan.md。
- executionContext：主 checkout，dev；不操作 Git index。
- resourceLocks：本计划文件 write。
- owner：docs metadata edit owner；禁止修改设计、issue 或其他文件。
- verification：git diff --name-only 仅含既有两份未提交工作文档；本节点新增 diff 仅位于计划顶部
  确认元数据。
- failureDomain：失败暂停 N00V/N00S/N00C、N01、N02 及全部实施后继。
- replanTriggers：用户确认原文不可取得、确认日期变化、编辑触及元数据外正文或其他文件。
- authorizationGate：只有用户明确确认计划后满足；当前计划落盘阶段尚未满足，不预填确认信息。

### N00V 文档只读验证

- nodeId：N00V
- taskBoundary：docs
- operationKind：验证
- outcome：只读确认已确认设计、本计划与 issue 的关联、状态、范围和文档 diff。
- estimatedCost：低
- deferralEvidence：无
- hardPredecessors：N00E；等待已经写入用户确认原文的计划元数据。
- consumes：已确认设计、已确认计划、用户确认元数据、当前 docs diff。
- produces：docs-only 范围验证记录。
- completionEvidence：设计与计划状态均为已确认；计划包含确认日期和逐字确认原文；路径/关联正确，
  两个文档无范围外内容和行尾错误。
- readSet：设计、计划、issue、Git status/diff。
- writeSet：无。
- executionContext：/Users/jiangsheng/cnb/codex，dev，只读。
- resourceLocks：两份文档与 Git status read。
- owner：docs verification owner。
- verification：git status --short；两份文档内容审查；未跟踪文件行尾检查。
- failureDomain：失败暂停 N00S/N00C、N01、N02 及全部实施后继。
- replanTriggers：文档范围变化、设计/计划未确认、确认元数据缺失或失真、docs diff 混入其他文件。
- authorizationGate：用户确认计划后满足只读验证与实施授权。

### N00S 文档 stage

- nodeId：N00S
- taskBoundary：docs
- operationKind：stage
- outcome：只暂存已确认设计与本计划。
- estimatedCost：低
- deferralEvidence：无
- hardPredecessors：N00V；等待 docs-only 验证记录。
- consumes：两份已验证工作文档。
- produces：docs-only staged snapshot。
- completionEvidence：git diff --cached --name-only 仅含设计与计划，git diff --cached --check 通过。
- readSet：两份工作文档、主 index。
- writeSet：主 Git index。
- executionContext：主 checkout，dev，主 index 独占。
- resourceLocks：/Users/jiangsheng/cnb/codex/.git/index write。
- owner：docs task 唯一 stage owner。
- verification：staged name/status/diff/check 审查。
- failureDomain：失败暂停 N00C、N01、N02 及全部实施后继。
- replanTriggers：index 预存内容、stage 混入其他文件、工作文档在验证后变化。
- authorizationGate：计划确认；只允许精确两份文档进入 index。

### N00C 文档 commit

- nodeId：N00C
- taskBoundary：docs
- operationKind：commit
- outcome：从 N00S 的稳定 staged snapshot 形成 docs-only commit，不自行 stage。
- estimatedCost：低
- deferralEvidence：无
- hardPredecessors：N00S；等待 docs-only staged snapshot。
- consumes：N00S staged snapshot。
- produces：docs commit id。
- completionEvidence：git show --stat 证明 commit 仅含两份工作文档。
- readSet：主 index 的 staged snapshot。
- writeSet：refs/heads/dev。
- executionContext：主 checkout，dev；读取稳定 index snapshot。
- resourceLocks：主 index read；refs/heads/dev write。
- owner：docs task 唯一 commit owner；禁止执行 git add。
- verification：git show --stat；git status --short。
- failureDomain：失败暂停 N01、N02 及全部实施后继。
- replanTriggers：staged snapshot 身份变化、commit hook 改写范围。
- authorizationGate：计划确认；仅本地 commit。

### N01 entry worktree 预配

- nodeId：N01
- taskBoundary：无提交，统一预配
- operationKind：授权
- outcome：按精确命令创建并核验完整 schema entry worktree。
- estimatedCost：低
- deferralEvidence：无
- hardPredecessors：N00C；等待 docs commit 作为两个 worktree 的共同 base。
- consumes：N00C commit、精确 worktree 参数。
- produces：可用的 entry worktree/branch/index 核验记录。
- completionEvidence：HEAD 等于 N00C 后 dev、branch/path/status 与计划一致。
- readSet：dev commit tree、worktree registry。
- writeSet：.git/worktrees、refs/heads/codex/nullable-response-schema-entry、目标目录。
- executionContext：主 checkout 发起，本地 worktree registry 独占。
- resourceLocks：.git/worktrees write；目标路径 write；entry branch ref write。
- owner：预配 owner；只创建和核验，不实施。
- verification：git worktree list、git status --short --branch、justfile 可读。
- failureDomain：仅暂停 N03E 及统一预配屏障 N02F；不删除已成功的 N02。
- replanTriggers：目标路径/branch 已存在、base 漂移、worktree registry 冲突。
- authorizationGate：计划确认后精确命令获授权；冲突或覆盖风险仍须停止。

### N02 GUI worktree 预配

- nodeId：N02
- taskBoundary：无提交，统一预配
- operationKind：授权
- outcome：完成披露后用专用脚本创建并核验默认 sparse GUI worktree及五个链接。
- estimatedCost：低
- deferralEvidence：无
- hardPredecessors：N00C；等待 docs commit 作为共同 base。
- consumes：N00C commit、脚本、精确路径/branch/base/default sparse/link mapping。
- produces：可用的 GUI worktree/branch/index 核验记录。
- completionEvidence：脚本成功，sparse list、control plane、五个链接与 status 核验通过。
- readSet：dev tree、脚本、链接目标、worktree registry。
- writeSet：.git/worktrees、GUI worktree、GUI branch、五个链接位置。
- executionContext：主 checkout 发起；GUI worktree/branch/index 独立。
- resourceLocks：.git/worktrees write；GUI 目标路径 write；GUI branch ref write；五个 link path write。
- owner：GUI 预配 owner；必须先输出完整披露，再调用脚本。
- verification：专用脚本内建验证及 skill 要求的执行后核验。
- failureDomain：仅暂停 N04E 及统一预配屏障 N02F；不删除已成功的 N01。
- replanTriggers：路径/branch/link 冲突、默认 sparse 输入不存在、canonical mapping 变化。
- authorizationGate：计划确认后精确动作获授权；披露是执行前硬门禁，参数漂移需重新确认。

### N02F 统一预配 fan-in

- nodeId：N02F
- taskBoundary：无提交，统一预配
- operationKind：fan-in
- outcome：证明 N01、N02 全部成功后开放实现编辑。
- estimatedCost：低
- deferralEvidence：无
- hardPredecessors：N01、N02；等待两个独立 worktree 的稳定核验记录。
- consumes：两个预配核验记录。
- produces：implementation-ready 屏障证据。
- completionEvidence：两条 worktree 记录均匹配计划且无冲突。
- readSet：预配记录、git worktree list。
- writeSet：无。
- executionContext：协调上下文，只读。
- resourceLocks：worktree registry read。
- owner：主协调者。
- verification：交叉核对 base、branch、path、index 隔离。
- failureDomain：失败暂停 N03E、N04E、N05；不影响文档提交。
- replanTriggers：任一 worktree 状态变化或核验失效。
- authorizationGate：用户已确认计划且 N00C 已完成。

### N03E entry 修改

- nodeId：N03E
- taskBoundary：entry
- operationKind：编辑
- outcome：justfile recipe 改为调用现有 Python fixture generator 并原样透传参数。
- estimatedCost：低
- deferralEvidence：无
- hardPredecessors：N02F；等待统一预配完成。
- consumes：失效 recipe、write_schema_fixtures.py 参数接口。
- produces：仅 justfile 的可变 diff。
- completionEvidence：diff 仅把 recipe 切换到现有脚本并保留参数透传。
- readSet：justfile、Python generator。
- writeSet：entry worktree/justfile。
- executionContext：entry worktree，codex/nullable-response-schema-entry；不操作 index。
- resourceLocks：entry justfile write。
- owner：entry edit owner；只编辑 recipe。
- verification：静态核对命令、脚本路径与参数透传。
- failureDomain：失败暂停 N03V/N03S/N03C/N07，不暂停 N04E/N05。
- replanTriggers：Python 脚本参数不匹配、recipe 需要新入口或额外文件。
- authorizationGate：计划确认且统一预配完成；禁止运行实际生成直到 N07。

### N03V entry 验证

- nodeId：N03V
- taskBoundary：entry
- operationKind：验证
- outcome：证明修复后的 recipe 能到达现有脚本的 help 路径且不启动生成。
- estimatedCost：低
- deferralEvidence：无
- hardPredecessors：N03E；等待 entry diff。
- consumes：修复后的 recipe。
- produces：entry 验证记录。
- completionEvidence：just write-app-server-schema --help 成功且未生成文件。
- readSet：justfile、Python generator、entry diff。
- writeSet：仅命令临时状态。
- executionContext：entry worktree，codex/nullable-response-schema-entry；Git 状态只读。
- resourceLocks：just runner write；entry justfile read。
- owner：entry verification owner。
- verification：just write-app-server-schema --help；git diff --check。
- failureDomain：失败暂停 N03S/N03C/N07。
- replanTriggers：help 触发生成、recipe 未透传参数、出现范围外 diff。
- authorizationGate：计划确认；禁止实际 schema generation。

### N03S entry stage

- nodeId：N03S
- taskBoundary：entry
- operationKind：stage
- outcome：只把已验证的 justfile recipe 修复写入 entry 独立 index。
- estimatedCost：低
- deferralEvidence：无
- hardPredecessors：N03V；等待验证证据。
- consumes：entry diff、验证记录。
- produces：entry staged snapshot。
- completionEvidence：staged diff 仅 justfile，git diff --cached --check 通过。
- readSet：entry diff。
- writeSet：entry index。
- executionContext：entry worktree，codex/nullable-response-schema-entry，独立 index 独占。
- resourceLocks：entry index write。
- owner：entry task 唯一 stage owner。
- verification：staged name/diff/check 审查。
- failureDomain：失败暂停 N03C/N07。
- replanTriggers：stage 出现范围外文件、验证证据失效。
- authorizationGate：计划确认；仅本地提交。

### N03C entry 提交

- nodeId：N03C
- taskBoundary：entry
- operationKind：commit
- outcome：从 N03S staged snapshot 形成 entry commit，不自行 stage。
- estimatedCost：低
- deferralEvidence：无
- hardPredecessors：N03S；等待稳定 staged snapshot。
- consumes：entry staged snapshot。
- produces：entry commit id。
- completionEvidence：commit 可见且仅含 justfile。
- readSet：entry index staged snapshot。
- writeSet：entry branch ref。
- executionContext：entry worktree，codex/nullable-response-schema-entry。
- resourceLocks：entry index read；entry branch ref write。
- owner：entry task 唯一 commit owner；禁止执行 git add。
- verification：git show --stat；git status --short --branch。
- failureDomain：失败暂停 N07。
- replanTriggers：staged snapshot 变化、commit hook 产生范围外变更。
- authorizationGate：计划确认；仅本地 commit。

### N04E GUI red test 编辑

- nodeId：N04E
- taskBoundary：GUI test
- operationKind：编辑
- outcome：只修改 generatedAppServerProtocol.test.ts，加入四字段各自“缺失拒绝/null 接受”断言，
  不修改生成物。
- estimatedCost：中
- deferralEvidence：无
- hardPredecessors：N02F；等待 GUI sparse worktree 可用。
- consumes：当前 generated descriptors 与最小合法 ThreadList/ThreadResume fixtures。
- produces：仅指定 GUI 测试文件的可变 diff。
- completionEvidence：四字段均有删除字段与显式 null 的成对断言。
- readSet：指定测试、src/generated/appServerProtocol/**、appServerProtocol descriptors。
- writeSet：GUI worktree 的 generatedAppServerProtocol.test.ts。
- executionContext：GUI sparse worktree，codex/nullable-response-gui-tests；不操作 index。
- resourceLocks：指定测试文件 write。
- owner：GUI test edit owner。
- verification：静态审查 fixtures 其余 required 字段合法。
- failureDomain：失败暂停 N04F/N04R/N04S/N04C/N09 与 GUI 最终验证，不暂停 entry/protocol 分支。
- replanTriggers：四字段 descriptor 不可达、fixture 还因其他字段非法失败、需要改第二个 GUI 文件。
- authorizationGate：计划确认；GUI 写范围硬限制为一个测试文件。

### N04F GUI test 自动格式化

- nodeId：N04F
- taskBoundary：GUI test
- operationKind：格式化
- outcome：通过 fnm-backed format:oxfmt:fix 自动格式化 GUI 测试 diff，并证明没有改动目标测试外文件。
- estimatedCost：中
- deferralEvidence：无
- hardPredecessors：N04E；等待 GUI test 编辑完成。
- consumes：GUI test 可变 diff、现有 codex-gui tree。
- produces：格式化后的单文件 test diff。
- completionEvidence：format:oxfmt:fix 成功；格式化前后 name-only 均只含
  generatedAppServerProtocol.test.ts。
- readSet：codex-gui/**、package scripts、fnm toolchain。
- writeSet：codex-gui 格式化器可达范围；完成态必须只留下目标测试文件 diff。
- executionContext：GUI sparse worktree，codex/nullable-response-gui-tests；不操作 index。
- resourceLocks：GUI oxfmt runner write；codex-gui formatter scope write。
- owner：GUI test formatter owner。
- verification：/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix；前后 git diff
  --name-only；目标测试 diff 审查。
- failureDomain：范围外文件变化或格式失败暂停 N04R/N04S/N04C/N09 与 GUI 最终验证。
- replanTriggers：format:oxfmt:fix 修改目标测试之外文件、fnm pnpm 指向 runtime shim。
- authorizationGate：计划确认；只允许自动格式化，禁止安装依赖。

### N04R GUI red 验证

- nodeId：N04R
- taskBoundary：GUI test
- operationKind：验证
- outcome：记录当前 validator 对缺失字段产生假阳性的可归因 red 证据。
- estimatedCost：中
- deferralEvidence：无
- hardPredecessors：N04F；等待格式化后的测试 diff。
- consumes：格式化后的 GUI 测试 diff、旧 generated validator。
- produces：预期 red Vitest 输出。
- completionEvidence：单文件 Vitest 仅因缺失字段仍被接受而失败，显式 null case 成功。
- readSet：测试文件、旧 generated appServerProtocol。
- writeSet：Vitest 临时状态。
- executionContext：GUI sparse worktree；Git 状态只读。
- resourceLocks：GUI Vitest runner write；测试/generated files read。
- owner：GUI verification owner。
- verification：fnm-backed 单文件 Vitest。
- failureDomain：不可归因失败暂停 N04S/N04C/N09 与 GUI 最终验证；正常 red 解锁 N04S。
- replanTriggers：测试意外为绿、失败来自环境或 fixture 其他字段。
- authorizationGate：计划确认；不得安装依赖。

### N04S GUI test stage

- nodeId：N04S
- taskBoundary：GUI test
- operationKind：stage
- outcome：只把具有可归因 red 证据且已自动格式化的 GUI 测试写入独立 index。
- estimatedCost：低
- deferralEvidence：无
- hardPredecessors：N04R；等待 red 证据。
- consumes：GUI test diff、red 记录。
- produces：GUI test staged snapshot。
- completionEvidence：staged diff 仅含 generatedAppServerProtocol.test.ts。
- readSet：GUI test diff。
- writeSet：GUI index。
- executionContext：GUI sparse worktree，codex/nullable-response-gui-tests，独立 index 独占。
- resourceLocks：GUI index write。
- owner：GUI test task 唯一 stage owner。
- verification：git diff --check；git diff --cached --check；staged diff 审查。
- failureDomain：失败暂停 N04C/N09 与 GUI 最终验证。
- replanTriggers：stage 混入链接或其他文件、red 证据失效。
- authorizationGate：计划确认；仅本地提交。

### N04C GUI test 提交

- nodeId：N04C
- taskBoundary：GUI test
- operationKind：commit
- outcome：从 N04S staged snapshot 形成 GUI test commit，不自行 stage。
- estimatedCost：低
- deferralEvidence：无
- hardPredecessors：N04S；等待稳定 staged snapshot。
- consumes：GUI test staged snapshot。
- produces：GUI test commit id。
- completionEvidence：commit 仅含 generatedAppServerProtocol.test.ts。
- readSet：GUI index staged snapshot。
- writeSet：GUI branch ref。
- executionContext：GUI sparse worktree，codex/nullable-response-gui-tests。
- resourceLocks：GUI index read；GUI branch ref write。
- owner：GUI test task 唯一 commit owner；禁止执行 git add。
- verification：git show --stat；git status --short --branch。
- failureDomain：失败暂停 N09 与 GUI 最终验证。
- replanTriggers：staged snapshot 变化、commit hook 产生范围外变更。
- authorizationGate：计划确认；仅本地 commit。

### N05 protocol 契约测试编辑

- nodeId：N05
- taskBoundary：protocol source + tests
- operationKind：编辑
- outcome：增加 stable/experimental 通用交叉契约测试和 ConfigReadResponse.layers 原始 JSON result
  回归测试，不修改权威字段。
- estimatedCost：中
- deferralEvidence：无
- hardPredecessors：N02F；等待统一预配完成。
- consumes：manifest、fresh in-memory stable/experimental 生成 API、TestAppServer 原始 JSON
  response API。
- produces：仅测试的可变 diff。
- completionEvidence：diff 仅 schema_fixtures_tests.rs 与 config_rpc.rs；cross-contract test 生成并
  读取临时 stable/experimental 树，不读取 vendored schema fixture。
- readSet：protocol schema 测试、manifest/schema/TS、config RPC test support。
- writeSet：主 dev 的 schema_fixtures_tests.rs、config_rpc.rs。
- executionContext：主 checkout，dev，主工作树；本节点不操作 index。
- resourceLocks：两个测试文件 write。
- owner：protocol task 测试编辑 owner；不 stage/commit。
- verification：静态审查测试覆盖 manifest 根类型、TS optionality、required/nullability、raw result。
- failureDomain：失败暂停 N06、N10；不暂停 N03E/N04E。
- replanTriggers：测试需要 consumer allowlist、无法读取原始 result、写集合扩大。
- authorizationGate：计划确认；只允许计划内测试文件。

### N05R protocol red 验证

- nodeId：N05R
- taskBoundary：protocol source + tests
- operationKind：验证
- outcome：在修改权威字段前证明新测试暴露当前漂移与 layers 契约不一致。
- estimatedCost：中
- deferralEvidence：无
- hardPredecessors：N05；等待测试 diff。
- consumes：测试 diff、未修改权威源码、fresh in-memory 临时生成树。
- produces：可归因的 red 输出。
- completionEvidence：cross-contract 定向测试基于 fresh in-memory 树失败并定位 response/field
  漂移或 layers TypeScript/schema 语义，而非 vendored fixture、编译或环境错误；raw wire test
  可独立保持 green。
- readSet：N05 diff、当前 protocol 源、schema fixtures。
- writeSet：仅测试 runner 临时目录/target 增量状态。
- executionContext：主 checkout，dev；不写 Git index。
- resourceLocks：Rust target/test runner write；主工作树 read。
- owner：protocol verification owner。
- verification：两个计划内定向 test filter；不运行 crate-wide。
- failureDomain：不可归因失败暂停 N06/N10；正常 red 解锁 N06。
- replanTriggers：测试意外为绿、失败来自预存问题、filter 枚举范围超限。
- authorizationGate：计划确认；普通测试允许，禁止 build/run 与全 crate。

### N06 protocol 权威源修改

- nodeId：N06
- taskBoundary：protocol source + tests
- operationKind：编辑
- outcome：在精确 13 个 v2 文件和 serde_helpers 完成 53 个 required-nullable 字段及 layers 例外。
- estimatedCost：高
- deferralEvidence：无
- hardPredecessors：N05R；等待可归因 red 契约证据。
- consumes：53 字段清单、layers 语义、nullable helper 需求。
- produces：权威 Rust 源 diff。
- completionEvidence：manifest 审计映射完整；普通字段 required+nullable；layers
  #[ts(optional)] + optional non-null helper；三项原 optional 未改。
- readSet：13 个 v2 源、serde_helpers、manifest、测试。
- writeSet：精确 13 个 v2 源和 serde_helpers。
- executionContext：主 checkout，dev；不操作 index。
- resourceLocks：14 个权威源文件 write。
- owner：protocol source owner；只做普通源码编辑，不生成/stage。
- verification：字段清单反查；禁止手改生成物。
- failureDomain：失败暂停 N06V、N10 及 protocol 后继；不暂停 GUI test。
- replanTriggers：出现第 14 个 v2 源、字段类型需要计划外 helper/架构、consumer 行为需改。
- authorizationGate：计划确认；范围限于已审计权威源。

### N06V protocol 组合验证

- nodeId：N06V
- taskBoundary：protocol source + tests
- operationKind：验证
- outcome：对 source + tests 组合 diff 运行定向 green 验证。
- estimatedCost：高
- deferralEvidence：无
- hardPredecessors：N06；等待同一任务全部编辑 fan-in。
- consumes：N05/N06 组合 diff、red 基线。
- produces：定向 green 证据。
- completionEvidence：fresh in-memory 通用契约测试与 layers raw result 定向测试通过；无需先更新
  vendored fixture；diff 仅计划文件。
- readSet：任务全部 source/test diff。
- writeSet：Rust target/test 临时状态。
- executionContext：主 checkout，dev；Git 状态只读。
- resourceLocks：Rust target/test runner write；任务 diff read。
- owner：protocol verification owner。
- verification：两个窄 filter；git diff --check。
- failureDomain：失败暂停 N06S/N06C/N07/N10 及其后继；不暂停 entry/GUI。
- replanTriggers：green 需要放宽测试、范围外源码变化、测试暴露无关失败。
- authorizationGate：计划确认；禁止 crate-wide test/lint。

### N06S protocol source + tests stage

- nodeId：N06S
- taskBoundary：protocol source + tests
- operationKind：stage
- outcome：只把已通过组合验证的 protocol source + tests 写入主 index。
- estimatedCost：低
- deferralEvidence：无
- hardPredecessors：N06V；等待 green 证据。
- consumes：N05/N06 组合 diff、N06V 证据。
- produces：protocol source + tests staged snapshot。
- completionEvidence：staged diff 仅计划文件集且 staged check 通过。
- readSet：任务组合 diff。
- writeSet：主 Git index。
- executionContext：主 checkout，dev，主 index 独占。
- resourceLocks：主 index write。
- owner：protocol task 唯一 stage owner。
- verification：git diff --cached --check；staged diff 审查。
- failureDomain：失败暂停 N06C/N07/N10 及其后继。
- replanTriggers：stage 范围扩大、验证证据失效。
- authorizationGate：计划确认；仅本地提交。

### N06C protocol source + tests 提交

- nodeId：N06C
- taskBoundary：protocol source + tests
- operationKind：commit
- outcome：从 N06S staged snapshot 形成 protocol source + tests commit，不自行 stage。
- estimatedCost：低
- deferralEvidence：无
- hardPredecessors：N06S；等待稳定 staged snapshot。
- consumes：protocol source + tests staged snapshot。
- produces：protocol source + tests commit id。
- completionEvidence：commit 文件范围与 N06S snapshot 一致。
- readSet：主 index staged snapshot。
- writeSet：refs/heads/dev。
- executionContext：主 checkout，dev。
- resourceLocks：主 index read；dev ref write。
- owner：protocol task 唯一 commit owner；禁止执行 git add。
- verification：git show --stat；git status --short。
- failureDomain：失败暂停 N07/N10 及其后继。
- replanTriggers：staged snapshot 变化、commit hook 产生范围外变更。
- authorizationGate：计划确认；仅本地 commit。

### N07 entry 普通 merge 集成

- nodeId：N07
- taskBoundary：entry 集成
- operationKind：集成
- outcome：把 entry branch 普通 merge 到 dev，保留 entry commit。
- estimatedCost：低
- deferralEvidence：无；与 N09 若同时 ready 仅因主 index canonical lock 动态排队，不建伪依赖。
- hardPredecessors：N03C、N06C；等待 entry commit 与已提交的主 dev protocol source。
- consumes：entry commit、protocol commit 后的 dev。
- produces：含 entry 与 protocol 源的 dev commit graph。
- completionEvidence：git log 显示 entry commit 保留；无 cherry-pick/squash/amend；工作树干净。
- readSet：entry branch、dev history。
- writeSet：主 worktree、主 index、dev ref。
- executionContext：主 checkout，dev，主 index 独占。
- resourceLocks：主工作树 write；主 index write；dev ref write。
- owner：主集成 owner。
- verification：普通 git merge；git status；git log --graph。
- failureDomain：冲突暂停 N10 及 entry 后继；不暂停 N09 未冲突分支。
- replanTriggers：merge conflict、entry branch/base 漂移、非计划文件进入 merge。
- authorizationGate：计划确认授权本地普通 merge；禁止远程与 force。

### N09 GUI test 普通 merge 集成

- nodeId：N09
- taskBoundary：GUI test 集成
- operationKind：集成
- outcome：把 GUI test branch 普通 merge 到 dev，保留 red-test commit。
- estimatedCost：低
- deferralEvidence：无；与 N07 的同时就绪由主 index canonical lock协调。
- hardPredecessors：N04C；只等待稳定 GUI test commit，不等待 protocol generation。
- consumes：GUI test commit、当时 dev history。
- produces：dev 上可达的 GUI test commit。
- completionEvidence：git log 显示原 commit 保留；merge 无 cherry-pick/squash/amend。
- readSet：GUI branch、dev history。
- writeSet：主 worktree、主 index、dev ref。
- executionContext：主 checkout，dev，主 index 独占。
- resourceLocks：主工作树 write；主 index write；dev ref write。
- owner：主集成 owner。
- verification：普通 git merge；git status；git log --graph。
- failureDomain：失败仅暂停 N12；不暂停 N10 protocol generation。
- replanTriggers：merge conflict、测试文件被其他节点修改、branch 漂移。
- authorizationGate：计划确认授权本地普通 merge；禁止远程与 force。

### N10 protocol stable/experimental 生成

- nodeId：N10
- taskBoundary：protocol generated
- operationKind：生成
- outcome：依次通过修复后的固化入口生成 stable，再生成 experimental，得到唯一机械 protocol diff。
- estimatedCost：高，关键路径
- deferralEvidence：无
- hardPredecessors：N07；N07 已同时消费 N03C 与 N06C，故提供修复入口 + 权威源的稳定 fan-in；
  明确不等待 N04C/N09。
- consumes：修复后的 recipe、protocol source + tests commit。
- produces：stable/experimental schema、TypeScript、precomputed 机械 diff。
- completionEvidence：两条入口命令依次成功；实际 diff 仅 generator 输出；stable 后 experimental
  没有丢失 stable surface。
- readSet：justfile、Python generator、protocol source、schema generator。
- writeSet：codex-rs/app-server-protocol/schema/json/**、
  schema/typescript/**、schema/precomputed/**。
- executionContext：主 checkout，dev；主工作树独占生成，暂不操作 index。
- resourceLocks：protocol schema/json directory write；schema/typescript directory write；
  schema/precomputed directory write；Rust target/generator runner write。stable 与 experimental
  共用这些 canonical write lock，必须在本节点内串行。
- owner：protocol generated task 唯一 generator owner。
- verification：just write-app-server-schema；随后同锁下
  just write-app-server-schema --experimental；审查实际生成 diff。
- failureDomain：失败暂停 N11V、N12 及后继；不回滚已提交 source。
- replanTriggers：generator 改动计划外源码/锁文件、stable/experimental 输出集合变化、入口绕过脚本。
- authorizationGate：计划确认；固化入口获授权，禁止直接调用 cargo 或手改生成物。

### N11V protocol generated 验证

- nodeId：N11V
- taskBoundary：protocol generated
- operationKind：验证
- outcome：验证 stable/experimental 生成物与源一致且预计算导出无漂移。
- estimatedCost：中
- deferralEvidence：无
- hardPredecessors：N10；等待完整 stable/experimental 生成 diff。
- consumes：N10 机械 diff。
- produces：四个窄 fixture/precomputed green 记录。
- completionEvidence：四个窄 fixture/precomputed tests 通过，diff 只有实际生成物。
- readSet：protocol generated diff、schema fixtures。
- writeSet：Rust test临时状态。
- executionContext：主 checkout，dev；Git 状态只读。
- resourceLocks：Rust target/test runner write；protocol schema read。
- owner：protocol generated verification owner。
- verification：typescript/json fixture 与 stable/experimental precomputed 四个窄 test filter；
  git diff --check。
- failureDomain：失败暂停 N11S/N11C/N12 与最终 Rust/GUI 后继；N09 可继续集成。
- replanTriggers：fixture 失败要求手改生成物、生成 diff 混入源码、test filter 过宽。
- authorizationGate：计划确认；只提交 generator 实际输出。

### N11S protocol generated stage

- nodeId：N11S
- taskBoundary：protocol generated
- operationKind：stage
- outcome：只把通过 N11V 的 protocol 机械生成物写入主 index。
- estimatedCost：低
- deferralEvidence：无
- hardPredecessors：N11V；等待生成物 green 证据。
- consumes：N10 机械 diff、N11V 证据。
- produces：protocol generated staged snapshot。
- completionEvidence：staged diff 只有实际生成物且 staged check 通过。
- readSet：protocol generated diff。
- writeSet：主 index。
- executionContext：主 checkout，dev，主 index 独占。
- resourceLocks：主 index write。
- owner：protocol generated task 唯一 stage owner。
- verification：git diff --cached --check；staged diff 审查。
- failureDomain：失败暂停 N11C/N12 与最终 Rust/GUI 后继。
- replanTriggers：stage 混入源码、验证证据失效。
- authorizationGate：计划确认；只提交 generator 实际输出。

### N11C protocol generated 提交

- nodeId：N11C
- taskBoundary：protocol generated
- operationKind：commit
- outcome：从 N11S staged snapshot 形成 protocol generated commit，不自行 stage。
- estimatedCost：低
- deferralEvidence：无
- hardPredecessors：N11S；等待稳定 staged snapshot。
- consumes：protocol generated staged snapshot。
- produces：protocol generated commit id。
- completionEvidence：commit 仅含 N11S 的实际生成物。
- readSet：主 index staged snapshot。
- writeSet：dev ref。
- executionContext：主 checkout，dev。
- resourceLocks：主 index read；dev ref write。
- owner：protocol generated task 唯一 commit owner；禁止执行 git add。
- verification：git show --stat；git status --short。
- failureDomain：失败暂停 N12 与最终 Rust/GUI 后继。
- replanTriggers：staged snapshot 变化、commit hook 产生范围外变更。
- authorizationGate：计划确认；仅本地 commit。

### N12 GUI validator 生成

- nodeId：N12
- taskBoundary：GUI generated
- operationKind：生成
- outcome：从 N11C 的 stable protocol schema 通过现有 GUI generator 原子刷新两个输出目录。
- estimatedCost：中，关键路径
- deferralEvidence：无
- hardPredecessors：N11C；只等待 protocol generated 稳定输入，不等待 GUI test merge N09。
- consumes：stable manifest/JSON Schema、当前 appServerProtocol method selection、gui-host schema。
- produces：两个 GUI generated output directory 的机械 diff。
- completionEvidence：fnm-backed protocol:generate-validators 成功；输出只位于两个声明目录。
- readSet：protocol stable schema、gui-host schema、generator、appServerProtocol selection。
- writeSet：codex-gui/src/generated/appServerProtocol/**、
  codex-gui/src/generated/guiHostContract/**。
- executionContext：主 checkout，dev；不操作 index。
- resourceLocks：appServerProtocol generated directory write；guiHostContract generated directory
  write；fnm-backed Node generator runner write。两个目录是同一原子 generator 的 write lock。
- owner：GUI generated task 唯一 generator owner。
- verification：生成后审查目录级 diff；禁止手改。
- failureDomain：失败暂停 N12V/N12S/N12C 与 GUI 最终验证；不暂停并行 Rust 最终验证。
- replanTriggers：generator 写第三目录、需要改 generator 逻辑、fnm pnpm 指向 Codex runtime shim。
- authorizationGate：计划确认；禁止 install/add/update。

### N12V GUI generated 验证

- nodeId：N12V
- taskBoundary：GUI generated
- operationKind：验证
- outcome：以 check 模式证明两个 GUI generated 输出目录与输入一致。
- estimatedCost：中
- deferralEvidence：无
- hardPredecessors：N12；等待两个目录的原子生成 diff。
- consumes：GUI generated diff。
- produces：protocol:check-validators green 记录。
- completionEvidence：protocol:check-validators 通过，diff 仅两个输出目录实际变化。
- readSet：两个 generated 目录、generator inputs。
- writeSet：validator check 临时状态。
- executionContext：主 checkout，dev；Git 状态只读。
- resourceLocks：两个 generated directory read；fnm-backed validator check runner write。
- owner：GUI generated verification owner。
- verification：fnm-backed protocol:check-validators；git diff --check。
- failureDomain：失败暂停 N12S/N12C 与 GUI 最终验证；不暂停最终 Rust 验证。
- replanTriggers：check 漂移、生成物外文件进入 stage、descriptor surface 意外变化。
- authorizationGate：计划确认；只提交机械输出。

### N12S GUI generated stage

- nodeId：N12S
- taskBoundary：GUI generated
- operationKind：stage
- outcome：只把通过 N12V 的 GUI 机械生成物写入主 index。
- estimatedCost：低
- deferralEvidence：无
- hardPredecessors：N12V；等待 GUI generated green 证据。
- consumes：GUI generated diff、N12V 证据。
- produces：GUI generated staged snapshot。
- completionEvidence：staged diff 仅两个输出目录实际变化且 staged check 通过。
- readSet：两个 generated output diff。
- writeSet：主 index。
- executionContext：主 checkout，dev，主 index 独占。
- resourceLocks：主 index write。
- owner：GUI generated task 唯一 stage owner。
- verification：git diff --cached --check；staged diff 审查。
- failureDomain：失败暂停 N12C 与 GUI 最终验证；不暂停最终 Rust验证。
- replanTriggers：stage 混入非生成文件、N12V 证据失效。
- authorizationGate：计划确认；只提交机械输出。

### N12C GUI generated 提交

- nodeId：N12C
- taskBoundary：GUI generated
- operationKind：commit
- outcome：从 N12S staged snapshot 形成 GUI generated commit，不自行 stage。
- estimatedCost：低
- deferralEvidence：无
- hardPredecessors：N12S；等待稳定 staged snapshot。
- consumes：GUI generated staged snapshot。
- produces：GUI generated commit id。
- completionEvidence：commit 仅含 N12S 的实际生成物。
- readSet：主 index staged snapshot。
- writeSet：dev ref。
- executionContext：主 checkout，dev。
- resourceLocks：主 index read；dev ref write。
- owner：GUI generated task 唯一 commit owner；禁止执行 git add。
- verification：git show --stat；git status --short。
- failureDomain：失败暂停 GUI 最终验证。
- replanTriggers：staged snapshot 变化、commit hook 产生范围外变更。
- authorizationGate：计划确认；仅本地 commit。

### N13P protocol 最终定向验证

- nodeId：N13P
- taskBoundary：无提交，最终 Rust protocol 证据
- operationKind：验证
- outcome：在 protocol source + generated 稳定提交上重跑 fresh in-memory cross-contract filter。
- estimatedCost：高
- deferralEvidence：无；与 N13W 同时 ready 时只因共享 Rust target runner write lock 动态串行。
- hardPredecessors：N11C；等待 protocol generated 稳定 commit。
- consumes：protocol source/test/generated commits；N11V 已提供四项 fixture/precomputed 稳定证据。
- produces：cross-contract filter 最终通过记录。
- completionEvidence：response_field_presence_matches_typescript_contract 通过，无 crate-wide 枚举；
  不重复 N11V 的四项 fixture tests。
- readSet：protocol source、fresh in-memory generator/test。
- writeSet：/Users/jiangsheng/cnb/codex/codex-rs/target 测试增量状态。
- executionContext：主 checkout，dev；Git 工作树只读。
- resourceLocks：/Users/jiangsheng/cnb/codex/codex-rs/target write；Rust test runner write；
  protocol source read。
- owner：protocol final verification owner。
- verification：just test -p codex-app-server-protocol
  response_field_presence_matches_typescript_contract。
- failureDomain：失败暂停 N15；GUI 与 N13W 继续，除非失败推翻共享 protocol 前提。
- replanTriggers：filter 扩到 crate-wide、fresh generation 不再内存隔离、计划内实现失败。
- authorizationGate：计划确认；Hard Limits 生效。

### N13W app-server raw wire 最终验证

- nodeId：N13W
- taskBoundary：无提交，最终 Rust app-server 证据
- operationKind：验证
- outcome：验证 ConfigReadResponse.layers 原始 JSON result 的缺失/数组 wire 行为。
- estimatedCost：高
- deferralEvidence：无；与 N13P 无硬依赖，只共享 Rust target runner write lock动态串行。
- hardPredecessors：N11C；等待 protocol source/generated 稳定 commit。
- consumes：config RPC test 与 protocol source commit。
- produces：raw wire filter 最终通过记录。
- completionEvidence：config_read_layers_wire_contract 通过，无 crate-wide 枚举。
- readSet：app-server config RPC test、protocol config response。
- writeSet：/Users/jiangsheng/cnb/codex/codex-rs/target 测试增量状态。
- executionContext：主 checkout，dev；Git 工作树只读。
- resourceLocks：/Users/jiangsheng/cnb/codex/codex-rs/target write；Rust test runner write；
  app-server/protocol sources read。
- owner：app-server raw wire verification owner。
- verification：just test -p codex-app-server config_read_layers_wire_contract。
- failureDomain：失败暂停 N15；GUI 与 N13P 继续，除非失败推翻共享 wire 前提。
- replanTriggers：filter 扩到 crate-wide、失败来自预存问题或需要 handler 行为修改。
- authorizationGate：计划确认；Hard Limits 生效。

### N14C GUI validator check

- nodeId：N14C
- taskBoundary：无提交，最终 GUI validator 证据
- operationKind：验证
- outcome：证明 committed GUI generated outputs 与当前权威输入无漂移。
- estimatedCost：中
- deferralEvidence：无
- hardPredecessors：N09、N12C；等待 GUI test 与 generated commits 均可达。
- consumes：generated validator 两目录与 generator inputs。
- produces：protocol:check-validators green 记录。
- completionEvidence：fnm-backed validator check 成功。
- readSet：两个 generated dirs、protocol/gui-host schema、generator。
- writeSet：runner 临时进程状态，不写项目文件。
- executionContext：主 checkout/codex-gui，dev；fnm-backed pnpm。
- resourceLocks：generated/schema/generator read；Node validator check runner write。
- owner：GUI validator verification owner。
- verification：/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators。
- failureDomain：失败暂停 N15；其他最终验证继续。
- replanTriggers：生成漂移、check 写项目文件、fnm pnpm 路径异常。
- authorizationGate：计划确认；不得安装依赖。

### N14T GUI 单文件 Vitest

- nodeId：N14T
- taskBoundary：无提交，最终 GUI runtime 证据
- operationKind：验证
- outcome：证明四字段均缺失拒绝、显式 null 接受。
- estimatedCost：中
- deferralEvidence：无；与 N14Y 无硬依赖，只因同一 tsbuildinfo write lock 动态串行。
- hardPredecessors：N09、N12C；等待 GUI test 与 generated commits 均可达。
- consumes：GUI test 与 generated descriptors/validators。
- produces：单文件 Vitest green 记录。
- completionEvidence：目标测试文件全部通过。
- readSet：generatedAppServerProtocol.test.ts、generated appServerProtocol。
- writeSet：/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/tsconfig.vitest.tsbuildinfo。
- executionContext：主 checkout/codex-gui，dev；fnm-backed pnpm。
- resourceLocks：/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/
  tsconfig.vitest.tsbuildinfo write；Vitest runner write。
- owner：GUI Vitest verification owner。
- verification：fnm-backed 单文件 Vitest 命令。
- failureDomain：失败暂停 N15；N14C/N14F/N13P/N13W 继续。
- replanTriggers：失败需要 consumer fallback、测试范围扩张、缓存路径事实变化。
- authorizationGate：计划确认；不得安装浏览器或依赖。

### N14Y GUI type-check

- nodeId：N14Y
- taskBoundary：无提交，最终 GUI type 证据
- operationKind：验证
- outcome：证明 protocol 类型与 GUI consumer 在完整项目 type-check 中一致。
- estimatedCost：高
- deferralEvidence：无；与 N14T 无硬依赖，只因同一 tsbuildinfo write lock 动态串行。
- hardPredecessors：N09、N12C；等待 GUI test 与 generated commits 均可达。
- consumes：codex-gui TypeScript project、generated contracts。
- produces：type-check green 记录。
- completionEvidence：fnm-backed type-check 成功。
- readSet：codex-gui TypeScript sources/config、generated contracts。
- writeSet：/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/tsconfig.vitest.tsbuildinfo。
- executionContext：主 checkout/codex-gui，dev；fnm-backed pnpm。
- resourceLocks：/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp/
  tsconfig.vitest.tsbuildinfo write；TypeScript runner write。
- owner：GUI type-check owner。
- verification：/opt/homebrew/bin/fnm exec --using-file pnpm run type-check。
- failureDomain：失败暂停 N15；其他最终验证继续。
- replanTriggers：type-check 写集合变化、计划外类型错误、需要修改 consumer。
- authorizationGate：计划确认；不得安装依赖。

### N14F GUI format check

- nodeId：N14F
- taskBoundary：无提交，最终 GUI format 证据
- operationKind：验证
- outcome：证明 GUI 测试和 generated outputs 满足当前 oxfmt check。
- estimatedCost：中
- deferralEvidence：无
- hardPredecessors：N09、N12C；等待 GUI test 与 generated commits 均可达。
- consumes：codex-gui tree。
- produces：format:oxfmt green 记录。
- completionEvidence：fnm-backed format:oxfmt check 成功且项目文件无变化。
- readSet：codex-gui/**。
- writeSet：runner 临时进程状态，不写项目文件。
- executionContext：主 checkout/codex-gui，dev；fnm-backed pnpm。
- resourceLocks：codex-gui tree read；oxfmt check runner write。
- owner：GUI format check owner。
- verification：/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt。
- failureDomain：失败暂停 N15；N14C/N14T/N14Y 与 Rust 验证继续。
- replanTriggers：check 修改文件、格式失败涉及目标外文件。
- authorizationGate：计划确认；check-only。

### N15 最终 fan-in 与 just fmt

- nodeId：N15
- taskBoundary：format-only（条件）
- operationKind：格式化
- outcome：两个 Rust 最终验证与四个 GUI 最终验证全部通过后最后运行 just fmt；此后不再测试。
- estimatedCost：中
- deferralEvidence：无
- hardPredecessors：N13P、N13W、N14C、N14T、N14Y、N14F；等待全部最终验证证据。
- consumes：全部已集成代码、测试和生成提交。
- produces：格式化完成证据与可能的纯格式 diff。
- completionEvidence：just fmt 成功；之后未运行任何测试；diff 无行为变化。
- readSet：scripts/format.py 管理范围、全部已改 Rust/justfile。
- writeSet：just fmt 实际管理文件。
- executionContext：主 checkout，dev；格式化器独占，不操作 index。
- resourceLocks：repo formatter write；Rust source/justfile write。
- owner：最终 formatter owner。
- verification：只审查格式 diff与 git diff --check；明确不再测试。
- failureDomain：失败暂停 N15S/N15C/N16，不回写既有行为提交。
- replanTriggers：fmt 产生行为变化、修改计划外非格式文件、需要修复已有提交。
- authorizationGate：计划确认；已有提交修正必须新提交，禁止 amend。

### N15S 条件 format-only stage

- nodeId：N15S
- taskBoundary：format-only（条件）
- operationKind：stage
- outcome：N15 有纯格式 diff 时只暂存该 diff；无 diff 时记录“不执行 stage”并完成。
- estimatedCost：低
- deferralEvidence：无
- hardPredecessors：N15；等待最终格式化稳定结果。
- consumes：N15 格式 diff 或无差异证据。
- produces：可选 format-only staged snapshot。
- completionEvidence：有差异时 staged diff 仅纯格式；无差异时 index 为空。
- readSet：N15 diff。
- writeSet：条件下主 index。
- executionContext：主 checkout，dev，主 index 独占。
- resourceLocks：条件下主 index write。
- owner：format-only task 唯一 stage owner。
- verification：git diff --cached --check；staged diff 语义审查；不运行测试。
- failureDomain：失败暂停 N15C/N16。
- replanTriggers：出现行为变化、计划外文件、需要重新测试。
- authorizationGate：计划确认；禁止 amend，禁止空提交。

### N15C 条件 format-only 提交

- nodeId：N15C
- taskBoundary：format-only（条件）
- operationKind：commit
- outcome：N15S 有 staged snapshot 时形成 format-only commit；无 snapshot 时记录“不创建空提交”；
  不自行 stage。
- estimatedCost：低
- deferralEvidence：无
- hardPredecessors：N15S；等待条件 stage 完成。
- consumes：可选 format-only staged snapshot。
- produces：可选 format-only commit id。
- completionEvidence：有 snapshot 时 commit 仅含纯格式；无 snapshot 时没有空提交。
- readSet：条件下主 index staged snapshot。
- writeSet：条件下 dev ref。
- executionContext：主 checkout，dev。
- resourceLocks：条件下主 index read、dev ref write。
- owner：format-only task 唯一 commit owner；禁止执行 git add。
- verification：git show --stat 或无 snapshot 记录；不运行测试。
- failureDomain：失败暂停 N16。
- replanTriggers：staged snapshot 变化、commit hook 改写文件。
- authorizationGate：计划确认；禁止 amend，禁止空提交。

### N16 最终只读审查

- nodeId：N16
- taskBoundary：无提交，完成检查
- operationKind：审查
- outcome：只读确认最终提交图、版本、工作树清洁状态与禁止项，为清理提供稳定证据。
- estimatedCost：低
- deferralEvidence：无
- hardPredecessors：N15C；等待最后格式化及可选提交稳定。
- consumes：最终 dev commit graph、worktree/branch 状态。
- produces：最终审查记录与 clean/merged 清理前提。
- completionEvidence：workspace.package.version 为 0.0.0；任务提交均可达且边界保留；三个
  checkout 无未提交任务 diff；两个 task branch 均已合并。
- readSet：Cargo.toml、git log/status/worktree list、任务 diff。
- writeSet：无。
- executionContext：主 checkout，dev；只读。
- resourceLocks：Git refs/worktree registry/Cargo.toml read。
- owner：主协调者，只读审查。
- verification：rg 检查 workspace.package.version；git status/log/worktree list；确认未运行远程、
  install、build/run、全 crate test/lint。
- failureDomain：失败暂停 N17；版本或范围错误阻止完成报告。
- replanTriggers：worktree 非干净、branch 未合并、version 非 0.0.0、存在范围外 diff。
- authorizationGate：计划确认；只读检查。

### N17 worktree 与 task branch 清理

- nodeId：N17
- taskBoundary：无提交，本地清理
- operationKind：集成
- outcome：按精确命令移除两个干净且已合并的 worktree，并以非 force -d 删除两个本地 task
  branch；不删除共享 Vitest link 或任何 link target。
- estimatedCost：低
- deferralEvidence：无
- hardPredecessors：N16；等待 clean/merged 稳定证据。
- consumes：N16 审查记录、精确清理目标。
- produces：worktree/branch 清理记录。
- completionEvidence：两个 worktree 不再列出，两个 task branch 不再存在；主 dev 状态不变。
- readSet：worktree registry、task branch refs、三个 checkout status。
- writeSet：.git/worktrees、两个 worktree 目录、两个本地 task branch refs。
- executionContext：主 checkout，dev；worktree registry 独占。
- resourceLocks：.git/worktrees write；两个 worktree path write；两个 local branch ref write。
- owner：清理 owner；逐个检查后执行，不使用 force。
- verification：git worktree list、git branch --merged、git status --short --branch。
- failureDomain：某一清理失败只停止该目标及其 branch 删除，不破坏已完成提交或另一已核验目标。
- replanTriggers：worktree 非干净、branch 未合并、路径或 ref 与计划不一致。
- authorizationGate：计划确认授权精确本地清理；禁止 force，状态不满足则停止。

清理命令必须在确认对应 branch 已合并且 worktree 干净后按下列顺序执行：

    git worktree remove /Users/jiangsheng/cnb/codex/.worktrees/nullable-response-schema-entry
    git branch -d codex/nullable-response-schema-entry
    git worktree remove /Users/jiangsheng/cnb/codex/.worktrees/nullable-response-gui-tests
    git branch -d codex/nullable-response-gui-tests

不得删除共享 /Users/jiangsheng/cnb/codex/.worktrees/vitest link，也不得修改五个 link target；前四个
worktree 内 link 随 worktree 目录移除。

## 调度摘要

- 初始 ready set：用户明确确认计划后只有 N00E；docs 分支为
  N00E -> N00V -> N00S -> N00C。
- N00C 完成后 fan-out：N01 与 N02 同时 ready；二者全部完成后 N02F 才开放实现。
- N02F 完成后 fan-out：N03E entry、N04E GUI red test、N05 protocol tests 同时 ready。
- entry 分支为 N03E -> N03V -> N03S -> N03C；GUI test 分支为
  N04E -> N04F -> N04R -> N04S -> N04C。
- protocol 分支是 N05 -> N05R -> N06 -> N06V -> N06S -> N06C。
- N03C 与 N06C 在 N07 汇合后即可启动 N10；N04C/N09 不是 protocol
  generation 前置。
- N04C 完成即使 N10 尚未完成也可使 N09 ready；N07 与 N09 只因主 Git index 动态互斥，不存在
  硬依赖。
- N10 -> N11V -> N11S -> N11C 后 fan-out：N12、N13P、N13W 同时 ready；N13P 与 N13W 无
  硬依赖，只共享 Rust target runner write lock。
- N12 -> N12V -> N12S -> N12C 不等待 N09；N09 与 N12C 同时完成后，N14C、N14T、N14Y、
  N14F 同时 ready。N14C/N14F 可并行；N14T/N14Y 无硬依赖，但共享同一 tsbuildinfo write lock。
- N13P、N13W、N14C、N14T、N14Y、N14F 在 N15 最终汇合；最后运行 just fmt，之后不再测试。
- N15 -> N15S -> N15C 处理条件 format-only 提交；N16 只读审查通过后由 N17 清理。

粗粒度关键路径：

N00E -> N00V -> N00S -> N00C -> N01/N02 -> N02F -> N05 -> N05R -> N06 -> N06V -> N06S
-> N06C -> N07 -> N10 -> N11V -> N11S -> N11C -> N12 -> N12V -> N12S -> N12C
-> N14Y（与 N14T 共享锁时取较慢者）-> N15 -> N15S -> N15C -> N16 -> N17。

GUI test 分支和 entry 分支在无硬依赖、无 canonical 资源冲突时必须与 protocol 分支重叠；每次节点
完成、失败、资源释放或图变化后，协调者在同一调度循环重新计算 ready set，立即运行全部可运行
节点。资源冲突只让 ready 节点等待锁，不得伪造新的依赖边。

## 失败与修正边界

- 节点失败只暂停其 failureDomain 与传递后继；其他 ready/running 节点继续。
- 计划内验证发现由本次改动引入的问题时，插入范围内修正节点并重算图；若修正针对已有提交，
  必须新建独立提交，禁止 amend。
- 若需要第 14 个 v2 源文件、第二个 GUI 手写测试文件、transport/consumer fallback、generator
  架构改写、依赖安装、远程操作、force、全 crate 验证或其他计划外文件/行为，则停止受影响后继
  并返回用户确认，不借修正节点扩大授权。
- 预存或无关失败只报告，不修复。

## 完成标准

1. 53 个普通字段在 stable/experimental 可达视图中同时 required 与 nullable；漂移为零。
2. layers 生成 layers?: Array<ConfigLayer>，schema optional non-null；原始 JSON result 在
   includeLayers=false 时缺失、true 时为数组，null 被 schema 契约拒绝。
3. 三个原本 optional nullable 字段保持 optional，未加入 required。
4. stable 与 experimental 都由修复后的 just 固化入口生成，生成物无手改。
5. GUI 四字段缺失均拒绝、显式 null 均接受；transport 与 consumers 无兼容修改。
6. 所有窄 Rust 验证和 fnm-backed GUI 验证先通过，之后最后运行 just fmt 且不再测试。
7. docs、entry、protocol source + tests、GUI test、protocol generated、GUI generated 和条件
   format-only 提交边界均保留；T1/T3 通过普通 merge 集成，无 cherry-pick/squash/amend。
8. dev 的 workspace.package.version 仍为 0.0.0；无远程、安装、后端 build/run、全 crate
   test/lint 或 force 操作。
