# GUI 新建未持久化任务加载：仅前端实施计划

状态：待用户确认，禁止执行。

设计依据：[已于本轮对话确认的设计](../../../../specs/2026/09/07/2026-09-07-gui-live-thread-loading-frontend-design.md)。用户本轮授权新建计划文件，未授权本轮实施或提交。设计文件中的“待确认”为落盘时状态，以用户随后明确确认为准。

## 目标与硬边界

只修复前端无条件 resume 导致新建、未发消息、无 rollout 的已加载任务无法打开 GUI 的问题。按 `thread/loaded/list` 查询结果分流：已加载直接 attach；完整分页查询后未加载才 resume → attach。分别覆盖未持久化已加载、已持久化已加载、已持久化未加载。

不修改 `codex-rs/**`，不修改后端 schema、存储或持久化时机，不纳入 `session_meta-only`。不得以空历史、错误字符串匹配或 attach 失败后自动 resume 掩盖错误。不得安装依赖、构建后端、操作 Git 远程、amend 或强制暂存。不得混入不改变行为的代码重排。

本计划确认后才执行以下节点；落盘本身不启动执行。实施前独立提交本次设计和计划。使用现有 `dev` 工作树，不新建 worktree，不修改 workspace version。

## 计划前证据闭包

| 字段 | 已核验事实与对应处理 |
| --- | --- |
| 权威入口 | `GuiHostConnectionBridge.tsx:101-113` 在命令就绪后创建 controller 并调用 `activateRecoveryThread`；`activeThreadSession.ts:421` 为实际初始化 owner。后端已有 loaded/list，host 已放行，无需后端新增能力。 |
| 已追踪链路 | 既有协议类型/schema → `appServerProtocol.ts` 方法选择 → 前端生成校验/请求描述 → gateway → controller；`activeThreadSessionCollectionContracts.ts:90` 暴露失败阶段；controller 持有 pending、dispose、订阅清理和 retry。 |
| 修改范围 | 方法选择、gateway、前端生成物、初始化及失败阶段、对应测试与共享 mock；`appComposerQueueBrowserTestSupport.tsx:153` 的全命令计数及 Ordinary/Steer 两处精确预期是间接消费者。独立反向审计另确认 `ContinueTaskFailureAlert.tsx:257` 穷尽消费失败阶段，路由与多会话测试消费 resume 行为，均纳入下列集合。 |
| 验证映射 | unit 配置运行普通测试并排除 Browser；Browser parallel 配置收集下列六个文件并使用 Chromium/Firefox/WebKit；shared 配置明确 headless。类型检查覆盖新增必需命令的其他调用方。真实新任务验收独立于 fixture。 |
| 排除项 | 后端已有无 rollout 空任务 attach 测试；历史只读 owner 不需要改变，其恢复入口最终使用现有会话 owner，但失败显示消费者必须同步处理新增阶段。无 UI 结构或组件变更，复用现有连接准备失败文案，不新增 HeroUI 控件、样式或翻译，不改变队列产品行为。 |
| 剩余未知 | 当次真实 runtime、完整 URL 和专用任务前提需执行时提供，不能提前复用旧地址；这影响 Level 2 启动，不改变源码修复方案。执行时若无法取得，保留 Level 2 未执行及未完成状态。 |

工具入口已只读检查：fnm 管理的 pnpm 10.34.5 可解析；项目 Vitest、TypeScript、tsx、oxfmt 已存在。Browser 二进制和真实 runtime 在执行前再次核验，不因入口存在就宣称可运行。本轮没有运行测试。

## 文件与生成边界

以下集合以 `/Users/jiangsheng/cnb/codex` 为根；普通编辑限定于列明文件，新增实现文件须先说明必要性并按授权边界判断。

- `P`：`codex-gui/src/features/guiHost/appServerProtocol.ts`、`guiHostCommandGateway.ts`。
- `S`：`codex-gui/src/features/activeThreadSession/activeThreadSession.ts`、`activeThreadSessionCollectionContracts.ts`，以及 `codex-gui/src/features/threadHistory/ContinueTaskFailureAlert.tsx` 的新增查询失败阶段分支，复用既有连接准备失败文案。
- `U`：`codex-gui/src/features/activeThreadSession/__tests__/activeThreadSession.test.ts`；`codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts`、`guiHostCommandGateway.test.ts`、`generatedAppServerProtocol.test.ts`。
- `H`：`codex-gui/src/__tests__/appBrowserTestSupport.ts`、`appComposerQueueBrowserTestSupport.tsx`。新的合法投影变体若现有 builder 无法表达，仅扩展 `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`；不复制协议对象定义。
- `B`：`codex-gui/src/__tests__/AppActiveThreadSession.browser.test.tsx`、`AppComposerQueueOrdinary.browser.test.tsx`、`AppComposerQueueSteer.browser.test.tsx`、`AppRouting.browser.test.tsx`、`AppMultiSessionIsolation.browser.test.tsx`；以及 `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryDetailContinuation.browser.test.tsx`。
- `G`：`codex-gui/src/generated/appServerProtocol/**`、`codex-gui/src/generated/guiHostContract/**`，仅生成器写入。
- `D`：本计划和对应新设计文件，仅实施前文档提交节点暂存；执行中不重写正文。

权威生成入口是 `protocol:generate-validators`。输入为现有 `codex-rs/app-server-protocol/schema/json`、`codex-rs/gui-host/schema/json`、前端方法选择模块及 `scripts/protocolValidators`。后端输入只读。完整输出边界为 `G`，不得把预期 diff 行数或 source refs 当白名单。人工补充仅在 `P/S/U/H/B`；审查全部生成差异，重复生成确认稳定，再运行 check。边界外输出、旧协议语义漂移或不稳定必须停止相关生成后继并报告。

## 行为与测试契约

第一项回归直接表达产品结果：在已加载且无 rollout 的 fixture 中，resume 明确拒绝 `no rollout found`，attach 返回合法空投影；激活应达到 ready。先在原初始化实现上运行，必须因无条件 resume 导致不可用而失败，类型/导入失败不算红灯。

随后分别建立三个正常状态的具名用例，不把它们折叠为一个默认成功 mock。测试使用独立的 loaded 与 stored 前提；既有依赖 resume 的场景显式声明已存储但未加载，不能统一改成已加载来绕开原检查。

覆盖目标位于后续页、分页结束仍未找到、查询失败及非法响应、resume 失败、attach 失败不 fallback、重试重新查询及状态变化、查询等待期间连接失效。新增异步边界保持 pending 去重、任务身份检查、订阅清理、前后台隔离与发布时机。错误阶段增加准确的加载查询阶段并保留错误原貌。

Browser 验证新任务空态与首发、已加载任务历史与运行状态、未加载持久化任务恢复。Ordinary/Steer 中更新新增命令的初始计数，但保持队列移动前后完整命令计数相等断言。AppRouting 与 AppMultiSessionIsolation 的恢复场景显式保留已持久化未加载前提；历史 Continue 入口验证查询失败显示与既有 Retry。失败时先解释 fixture 的产品前提，禁止为变绿删除覆盖、降低断言或扩大豁免。

## 描述式执行 DAG

节点字段语义遵守 `$delegating-micro-stages/references/execution-graph.md`。以下公共字段与逐节点字段合并构成完整节点，不以表格顺序制造依赖。

公共字段：

- `executionContext`：现有 `/Users/jiangsheng/cnb/codex`，分支 `dev`，共享实际 Git index（执行前用 `git rev-parse --git-path index` 解析）。不创建其他 checkout。
- `authorizationGate`：当前全部执行节点为 pending；用户明确确认计划并允许开始后，由 `$action-authorization` 根据本节点动作、读写集合和副作用生成最小能力信封。Level 2 另需当次专用任务/URL 目标明确。本轮仅文档创建为 active。
- `subdelegation`：所有节点 false；主代理可以直接给下列只读审查节点及不相交 Browser 编辑节点分配一层子代理，其余不继续委派。
- `owner`：默认主代理；E4 为 Browser 编辑子代理，V4 为未参与修改的独立审查者。共享 Git index、生成、格式化和提交仅主代理操作。
- `estimatedCost`：默认短；E3/E4/V2/L2 为中；无无依据时间上限。
- `deferralEvidence`：默认无。资源冲突按锁处理，不伪造依赖或以历史并发上限暂停节点。
- `readSet`：已确认设计/计划、适用 AGENTS/skills，加本节点消费的输入；验证与审查读取稳定 `P/S/U/H/B/G` 及项目配置、依赖、只读权威 schema。
- `resourceLocks`：编辑对具体 writeSet 写锁；所有验证对其源码/生成输入读锁。生成对两个实际生成目录写锁；格式化对目标文件写锁。Vitest unit 与 Browser 各自 runner 输出/缓存按执行时实际 canonical 路径锁定，发现共享写入时错开执行；Git index 仅暂存/提交节点持写锁。Level 2 对专用任务和受控无头浏览器会话持独占操作锁。
- `failureDomain`：节点本身及实际消费其产物的后继。失败不暂停无依赖分支；错误边界扩大时按新证据重算。
- `replanTriggers`：新增后端能力、计划外写入、产品行为变化、无法保持原检查能力、生成边界漂移、真实任务前提不符。范围内修正继续形成有界节点，不把普通测试失败当终止。
- `verification`：逐节点 completionEvidence 和下文命令；只验证真实命中的目标。测试/生成/格式化程序正常产生的缓存、日志和报告是已授权命令的固有副作用。

| nodeId / taskBoundary / operationKind | hardPredecessors 与 consumes | outcome / produces / completionEvidence | writeSet / stateEffects / commandScope |
| --- | --- | --- | --- |
| D1 / 文档 / stage | 计划执行授权；已确认 D | 仅两份文档暂存，staged diff 精确且无空白错误 | Git index；仅 `git add --` 两文件及只读 staged 检查 |
| D2 / 文档 / commit | D1 的已审查 index | 独立文档 commit ID | Git index/对象/ref；普通 `git commit` |
| E1 / 修复 / 编辑 | D2；原始初始化与合法 fixture | 新任务产品回归写入，生产代码保持原行为 | U 中 session test；普通源码 patch |
| V0 / 修复 / 验证 | E1 的测试 | 精确红灯：实际执行目标，期望 ready、实际因 resume 无存档失败 | 测试运行产物；指定新用例 unit 命令 |
| E2 / 修复 / 编辑 | V0；当前协议和 mock | gateway 方法、独立状态 mock、命令与校验测试就绪 | P/H/U 中 gateway 测试；普通 patch；禁止改初始化 |
| G1 / 修复 / 生成 | E2 的方法选择 | G 完整差异已审查，输出合法 | G；权威生成命令 |
| E3 / 修复 / 编辑 | G1 的请求类型/校验与 E2 的 mock | 分页查询分流、失败阶段、session unit 完成 | S 及 U 中 session test；普通 patch |
| E4 / 修复 / 编辑 | G1 与 E2 的稳定 mock | 三状态 Browser、队列、路由/多会话及历史失败重试回归完成 | B；普通 patch，不写 H、不运行组合测试、不操作 Git |
| G2 / 修复 / 生成 | E3/E4 完成，人工内容稳定 | 重复生成无额外漂移 | G；同一权威生成命令与只读 diff |
| F1 / 修复 / 格式化 | G2 的组合产物 | 修改文件按 oxfmt 格式化并检查实际 diff | 本任务前端修改文件；项目格式化入口，见下文范围约束 |
| V1 / 修复 / 验证 | F1 的稳定组合源码 | 新回归绿灯且相关 unit 全部通过，无目标漏收集 | unit 运行产物；下文 unit 命令 |
| V2 / 修复 / 验证 | F1 的稳定组合源码 | 六个 Browser 文件三引擎通过，实际收集数已记录 | Browser 报告/缓存；下文 Browser 命令 |
| V3 / 修复 / 验证 | F1 的稳定组合源码 | type-check、lint、oxfmt、protocol check 通过 | 检查固有缓存；下文检查命令 |
| V4 / 无提交 / 审查 | F1 的稳定 diff | 独立检查范围、旧契约保护、分页/重试、生成来源，无未解决发现 | 无文件写入；只读代码与 diff |
| L2 / 修复 / 验证 | V1/V2/V3/V4；当次专用 runtime 和 URL | 下文全部真实验收场景有前提与结果证据 | 仅专用验收任务的 GUI 交互、首发消息、正常运行产物；无头浏览器，不调用有状态诊断 RPC |
| C1 / 修复 / stage | L2 及全部有效验证/审查证据 | 只暂存 P/S/U/H/B/G 内实际修改，完整 staged diff 检查通过 | Git index；精确文件 `git add --`，禁止目录无差别暂存 |
| C2 / 修复 / commit | C1 | 独立代码行为修复 commit ID | Git index/对象/ref；普通 `git commit`，不 amend |
| Z / 无提交 / fan-in | D2/C2 及全部有效最终证据 | 记录提交、实际测试结果、Level 2、工作区状态及剩余限制 | 无产品修改；只读 Git 核验及最终报告 |

授权生效后 initial ready set 为 D1。关键路径预计 D1/D2 → E1/V0 → E2/G1 → E3/E4 汇合 → G2/F1 → 验证汇合 → L2 → C1/C2/Z。E3 与 E4 的写集合不相交，可并行；V1/V2/V3/V4 读取同一稳定组合产物，除实际共享缓存锁外无相互前置。先生成再消费者依赖来自 generated descriptor，不是为中间提交可编译而添加兼容层。

两个任务提交边界为 D2 文档、C2 完整行为修复；不是每个节点一个提交。全部代码属于同一修复任务，无跨任务并行写分支，因此不需要 worktree。修正若发生于提交之后，单独新提交。执行动态图由主代理在执行上下文维护；不自动创建研究/执行日志文件或回写已确认计划。

## 验证命令与完成标准

所有前端命令 cwd 为 `/Users/jiangsheng/cnb/codex/codex-gui`。执行前重新核验 fnm/pnpm 来源、schema、依赖及浏览器；缺组件由用户安装，助手不安装。命令为计划内容，本轮未执行。

红灯运行以下路径并以实施时新增的唯一测试名称通过 `-t` 精确筛选；记录原始错误和实际收集结果。绿灯运行完整相关 unit：

```sh
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/activeThreadSession/__tests__ src/features/guiHost/__tests__
```

Browser 使用已存在的无头 parallel 配置，覆盖三个引擎：

```sh
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel src/__tests__/AppActiveThreadSession.browser.test.tsx src/__tests__/AppComposerQueueOrdinary.browser.test.tsx src/__tests__/AppComposerQueueSteer.browser.test.tsx src/__tests__/AppRouting.browser.test.tsx src/__tests__/AppMultiSessionIsolation.browser.test.tsx src/features/threadHistory/__tests__/ThreadHistoryDetailContinuation.browser.test.tsx
```

生成与静态检查：

```sh
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:generate-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
```

格式化以项目 oxfmt 为 owner，不运行 prettier 或仓库 `just fmt`。现有 fix 脚本固定全包 `.`，追加文件不能去掉它的全包范围；本轮已检查 oxfmt help 支持显式 PATH 列表。因此按用户“自动化命令必须尽量限定到明确文件或目标”的约束，F1 使用同一项目 oxfmt 的 `pnpm exec oxfmt --write`，参数逐一列出本任务实际修改的前端文件，不附 `.`、不使用全包 fix；之后检查完整 diff 并运行上述非 fix 入口。lint 使用非 fix 检查，实际修正仅限本任务引入的问题。

不机械全量重跑所有前端测试；新失败若指向共享 mock 的其他实际消费者，在本范围中诊断并补充针对性验证。不得把未运行的测试记为通过。

## 真实 GUI 验收与运行时边界

Level 1 为上述 unit/Browser；Level 2 必须执行，Level 3 不适用，不开启可见浏览器或桌面窗口。

执行时由用户提供可用当前 runtime 和专用验收任务完整 URL（来自当次 `/gui` 或 `launch_gui`），并使其加载本次前端。助手核对实际服务前端是否包含本次修改；若需要后端构建，由用户执行。助手不使用旧 URL、不操作用户正在工作的任务、不安装工具、不通过 `thread/read(includeTurns=true)` 或其他有状态 RPC 制造测试前提。

在专用任务上，计划执行授权包含无头打开 GUI、观察、通过正常输入框发送一条无工具操作的简短测试消息以及正常刷新。前提准备由用户通过正常产品流程完成；助手可只读核对当前 loaded/list 和对应 rollout 是否存在，不修改存档或人为 unload。

| 场景 | 打开前证据 | 交互与通过条件 |
| --- | --- | --- |
| 全新任务 | 未发消息、已加载、对应 rollout 不存在 | 首次打开直接进入空会话，无 resume 失败；发送测试消息正常进入会话；记录请求和显示结果 |
| 已持久化且已加载 | 已有历史、当前 loaded/list 包含 ID | 打开后历史和运行状态一致，无重复恢复；可观察后续更新 |
| 已持久化但未加载 | 已有存档、完整 loaded/list 无该 ID | 正常打开恢复后展示既有历史，后续消息正常 |

必须先完成全新任务首次打开的证据，再发送首条消息；首发后已落盘的同一任务不能冒充原始新任务前提。当前日期与真实前提在验收时重新核验。

运行时、URL、无头状态或前提证据缺失时，只暂停 L2 及提交/完成后继，继续无依赖的已授权修改和自动验证；明确说明缺口，不把静态或 Browser 结果替代真实验收。若现有后端真实行为与设计证据不符，报告证据并停在前端范围，不改 Rust。

## 结束条件

新任务红灯与修复后绿灯有可核验证据；三种正常状态、分页、失败重试、旧队列契约均通过对应验证；生成稳定；独立审查无未解决问题；所有适用 Level 2 场景通过；两次独立本地提交仅含本任务内容。最终报告分别给出 Level 1/2 结果、提交和实际并行/关键路径/未启动 ready 节点，不以文档完成或测试数量代替修复完成。
