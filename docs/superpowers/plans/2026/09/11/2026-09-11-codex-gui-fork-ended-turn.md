# Codex GUI 已结束 turn fork 实施计划

日期：2026-09-11

授权：用户调用 `implement`，要求实现现有规格、验证、独立审查并提交当前 `dev` 分支。采用此前两项任务拆分；删除空内容任务。规格为同日 `codex-gui-fork-ended-turn-design`。不改 parent 入口、历史持久化、TUI、模型选择或文件系统。

## 任务和验收

1. 当前聊天 fork 全流程。Blocked by：无功能前置。Status：ready-for-agent。交付 GUI-host 放行、权威协议生成、App 生命周期创建和恢复 owner、现有已展示且已结束 turn 的末尾按钮及当前聊天跳转。
   - [ ] `completed`、`interrupted`、`failed` 传入来源 `threadId` 和 `lastTurnId`；不传 `beforeTurnId` 或模型覆盖。
   - [ ] 原会话生成和输入归属保留；成功激活新 ID 并进入新会话。
   - [ ] 进行中防重复；已知 ID 恢复不重新创建；未知结果提示检查历史，原入口可再次创建，无专门重试按钮。
   - [ ] App 生命周期保留已创建 ID；过期连接或导航响应不得劫持选择；跨页 fragment 不重复入口。
2. 历史预览 fork。Blocked by：任务 1 的稳定共享操作契约。Status：ready-for-agent。
   - [ ] 来源明确取历史预览 thread，不能取当前工作 thread。
   - [ ] 复用创建、激活、导航与恢复 owner；原工作线程草稿和待发送输入不转移。
   - [ ] 页面 Browser 验证预览来源与跳转，覆盖当前聊天和历史路径组合。

## 权威来源与变更边界

Rust `ThreadForkParams.last_turn_id` 已支持 terminal prefix；GUI-host 的 `filter.rs` 请求 allowlist 尚未放行。前端 `appServerProtocol.ts` 方法集合经 `RequestParams` / `RequestResponse` 从权威 `ClientRequestDefinition` 派生，命令网关使用 generated request descriptor。

生成入口为 `pnpm run protocol:generate-validators`；输入 owner 为 Rust 协议 JSON（client request、server notification、聚合 schemas）、GUI-host auth schemas、前端选择集合；完整输出边界为 `src/generated/appServerProtocol/**` 与 `src/generated/guiHostContract/**`。禁止手写生成物。检查完整 diff、语义仅接入 fork；重复生成应稳定。Lingui 使用 `messages:extract`，完整输出为配置中的 catalogs；人工仅补新增翻译，重新提取须稳定。边界外输出或未计划语义变化先诊断，不静默接受。

共享 transcript 保持现有隐藏规则和 chunk selectors，仅末尾 fragment 增加按钮。HeroUI `Button secondary`、`isPending`、`Spinner`、`Alert`，沿用 surface / foreground / muted / danger tokens。生命周期 owner 挂载 App，复用 ActiveThreadSession.activate，不能复用耦合首次发送的 NewSessionOwner.submit。

## 执行 DAG 与能力

统一执行上下文：`/Users/jiangsheng/cnb/codex`、`dev`、现有 Git index，不创建 worktree。主代理是唯一 index、生成器与格式化写 owner。节点授权源是当前 implement 请求及此前计划落盘请求；禁止 remote、安装、后端 build/run、项目外主动修改、amend、扩大展示范围、继续委派。节点完成后信封到期；新授权或产品结果变化触发局部暂停。所有节点只读本项目及适用 skill，写集合限定下述对应边界，程序内部正常产物遵守现有能力信封规则。

节点字段采用如下公共约定：operationKind 由节点名给定；estimatedCost 为编辑中、验证中、其余小；deferralEvidence 无；consumes 为明确前置产物，produces 为 outcome；completionEvidence 为实际 diff、命令结果或 commit ID；failureDomain 为节点及传递消费者；replanTriggers 为权威契约、授权或产品结果变化；authorizationGate active；subdelegation false。readSet 是消费者源码、契约与测试，writeSet 是本节点产物；stateEffects 仅对应编辑/生成/验证/提交。每项 resourceLocks 对 canonical 文件/目录声明，读可并行、写冲突串行。

- D：文档提交。无前置；主代理 stage/commit 本规格及本计划；独占 Git index；产出文档提交 ID，作为所有实现前置。
- E1：任务 1 编辑。前置 D（文档门禁）；主代理写 GUI-host filter、GUI 协议选择/网关、fork owner/UI、App 集成、共享 transcript 和对应 tests；产出当前聊天完整行为。能力仅上述源码编辑，不操作 index。
- G1：生成。前置 E1（方法与消息输入）；主代理独占上述 generated 和 catalogs 边界；产出权威生成稳定 diff。
- V1：验证。前置 G1（可运行组合）；主代理只读组合源码，runner 写正常测试产物；产出定向 Browser、类型与 GUI-host 测试证据。
- C1：任务 1 提交。前置 V1；主代理独占 index，exact allowlist 提交任务 1 文件。
- E2：任务 2 编辑。前置 E1 稳定共享操作契约；与 G1/V1 的间接消费者读写冲突时等锁；主代理只写历史预览接入和页面测试。
- V2/C2：任务 2 验证及独立提交。消费 E2 与共享产物，各为单一验证/stage/commit 动作；主代理组合验证后独占 index 提交任务 2。
- F：最终验证。消费两任务最终源码；类型、lint、生成稳定检查、前端完整测试按 implement 最终门禁运行一次；Rust 只跑精确过滤。失败插入有界诊断/修正/复验，不削弱检查。
- R：独立审查。消费稳定变更快照；按 code-review 并行 Standards/Spec 只读子代理，主代理汇总。审查授权由 implement 明确调用；子代理无写、Git 状态变更或继续委派能力。修正另建独立提交，禁止 amend。

初始 ready set 为 D；关键路径 D、E1、G1、组合验证、提交、最终验证、审查。E2 真实依赖共享操作契约，不能提前臆造接口；两个审查轴可 read/read 并行。任务编号不构成额外栅栏。fan-in 为组合验证与最终审查。没有独立 prefactor 或为了中间提交增加的兼容路径。

## 验证拓扑与限制

已确认 seams 为规格页面级 Browser、GUI-host 请求过滤、现有 app-server terminal prefix 集成和权威生成检查；采用这些边界 TDD。运行工具预检已发现 fnm/pnpm、cargo、just，后续命令按实际 cwd 再核验。

GUI 使用 `/opt/homebrew/bin/fnm exec --using-file pnpm run ...`：开发定向 `test:unit <file>` / `test:browser:parallel --run <file>`、`type-check`；最终 `test:unit` 和两组 headless Browser 全量各一次（implement 门禁），`lint`、`protocol:check-validators`，格式使用权威 oxfmt。Rust 仅 `just test -p codex-gui-host filter::tests`；Rust 变更完成触发 `just fmt`。不运行后端构建。

Level 1 记录实际执行目标、数量和结果。Level 2 需当前完整 GUI URL 和含本次 GUI-host 修改的真实运行时，验证真实截断历史、父生成和新输入对象；缺少时明确未执行，不以 Browser 模拟代替。Level 3 不适用，不打开可见桌面。执行证据和提交身份另在同目录同主题执行记录维护，不能把初始计划改写成执行日志。
