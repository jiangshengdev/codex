# Codex GUI 新建会话实施计划

日期：2026-09-07。

状态：待用户确认。已授权创建本计划文件；尚未授权执行本计划、提交或启动真实运行时。

设计依据：[已确认设计](../../../../specs/2026/09/07/2026-09-07-codex-gui-new-session-design.md)。

## 目标与固定约束

在导航菜单提供新建入口，首条消息发送时才创建会话。复用当前多会话集合、加载分流、投影与输入队列，不建立第二套运行管理器。

- 无既存草稿时，目录取当前会话目录；没有当前会话则取保留的历史目录，没有目录不可新建。
- 标签页只保留一份新建草稿，绑定原目录并显示目录；再次新建恢复原草稿，不因查看另一目录会话而改变归属。刷新或关闭标签页不恢复未创建草稿。
- 创建采用草稿所属目录的 Codex 默认配置，不复制旧会话临时设置。
- 旧会话及后台队列继续运行。排队、恢复等保护仅约束移出，不阻塞新建。
- 创建结果未知时不自动重试；保留草稿供用户主动重试，接受可能留下额外空会话。取得 ID 后不再重复创建。
- 不增加目录选择器、设置页、多份草稿、后端幂等能力或自动消息重放。

## 六字段证据闭包

| 字段 | 当前证据与计划结论 |
| --- | --- |
| 权威入口 | `AppShellTopBar` → `router.tsx`/`guiRouteTarget.ts` → 页面；RPC 来自 `appServerProtocol.ts` 和 command gateway，类型来自 app-server 生成协议；生产页面由 `gui-host/src/host.rs::router_for_state` 显式注册 |
| 已追踪链路 | Rust `ThreadStartParams/Response` → schema/TypeScript →前端方法选择及生成响应校验 → gateway 的投递分类；`activeThreadSession.selectThread/initialize` → loaded/list 分页 → resume（仅未加载）→ attach → composerRole → queue 持久事务；失败继续沿现有成员错误和恢复机制 |
| 修改范围 | 新建 feature、App 生命周期接线、导航/路由/标题；GUI RPC 方法选择与 gateway；host allowlist、生产路由及浏览器契约生成；对应测试、前端校验生成物与 en/zh-CN catalogs |
| 验证映射 | host 的 HTTP/WS 集成测试证明生产路由与请求转发；owner unit 证明创建/交接/未知结果；App Browser 证明目录、草稿、导航与后台隔离；E2E 证明刷新和真实浏览器交互；Level 2 单独证明真实 runtime 创建与首发 |
| 排除项 | app-server 已有 thread/start，不改其参数或持久化；已有 loaded/list 分流处理内存中新会话，不再修改加载算法；不改队列未知投递、持久化格式、移出保护、TUI、权限策略或通用错误布局 |
| 剩余未知 | 实施时的工作树与工具状态须复核；真实 runtime 的当前完整 URL、包含本次 host 变更的程序及专用测试目录/会话尚未提供，属于 Level 2 的外部前置，不得伪报完成。最终源码复核若发现交接必须改变上述产品约束，暂停受影响节点并回到设计 |

现有加载分流以当前 `activeThreadSession.ts::initialize` 为准；其他历史文档关于无条件 resume 的描述已经不适用于当前代码。本轮只核查源码和工具入口，未运行产品测试。

## 实现落点与接口

### Host 和协议

采用独立 `/new` 路由，避免把 `new` 当作 `/task/$threadId` 的 UUID。新增 `NEW_TASK_PATH_SEGMENT` 到 host 浏览器契约源，前端从生成契约导入，不手写重复常量。

修改范围：

- `codex-rs/gui-host/src/browser_contract.rs`、`browser_contract_fixtures.rs`：常量及生成出口。
- `codex-rs/gui-host/src/host.rs`：生产 `/new` 返回带现有安全头的 index，保持 Host/Origin 约束；dev 继续走现有 Vite 代理。
- `codex-rs/gui-host/src/filter.rs`：允许 `thread/start`；不放宽其他请求、通知或认证边界。
- `codex-rs/gui-host/schema/**`：仅由既有生成器更新。
- `codex-gui/src/features/guiHost/appServerProtocol.ts`、`guiHostCommandGateway.ts`：选择并暴露 `startThread`，参数与返回值使用 `RequestParams<"thread/start">`/`RequestResponse<"thread/start">`。
- 相应 host、gateway、协议测试与共享命令 mock。通过成功响应取得 ID，不额外放行无人消费的 `thread/started`。

### 新建 owner 与输入交接

新增 `codex-gui/src/features/newSession/`，以 feature 内 owner 管理单份草稿、固定目录、创建请求状态、已知会话 ID 和输入交接结果。使用现有 `ComposerDraft`/输入捕获类型，不复制协议 DTO，不直接调用 `turn/start` 绕过队列。

owner 挂在 App 页面切换之外的生命周期内，页面卸载不丢草稿；整个标签页刷新后重新建立，不写入新建草稿的 sessionStorage。连接替换使在途能力失效，但不能把用户输入静默清空。

交接顺序：

1. 从编辑器捕获固定输入，同时记录草稿操作身份、连接 owner 和当前导航意图。标记提交处理中，锁定本次捕获内容，禁止重复提交同一草稿。
2. 未取得 ID 时调用 `startThread({ cwd: draft.cwd })`；成功立即记住 ID。失败依据 gateway 的 `delivery` 和实际响应证据区分明确未接受与结果未知，不把响应校验失败当作未创建。
3. 在每个 await 返回后、调用 `activate` 前核对操作身份、连接和导航意图。用户已离开新建页或切到其他会话时，只保存已返回的 ID 与草稿，停止自动接续，不抢回查看对象。仍有效时用已知 ID 调用现有 `activate`，复用已加载查询、投影连接和成员持久化流程；初始化失败保留 ID 与输入，显式重试不再创建。不能只依赖 activate 内部的 selection intent，因为它无法识别创建请求等待期间已经发生的导航。
4. 仅在激活结果为 ready，且当前角色的 thread ID、会话实例与 revision 都匹配目标时，向该角色提交捕获输入。若用户在异步期间切换，保留已知 ID 和草稿供显式重试，不从另一个当前角色投递。
5. `composerRole.submit` 返回 `accepted` 表示现有队列持久事务已接管输入，此时结束新建草稿职责，再导航到目标会话。不得等待 `turn/start` 成功才清草稿，否则可能留下重复提交路径。
6. 持久化失败、角色失效或提交被拒绝时，保留尚未交接的输入；队列已接管后发生的发送失败或未知投递由原队列处理，不重新生成新建草稿或自动重发。

保留同一份 `ComposerDraftCapture` 用于尚未接管的重试；该类型不包含消息 ID，队列在 `submitInput` 内生成消息身份，不能由新建 feature 虚构幂等能力。若 `submit` 返回前出现无法判断接管结果的异常，保留输入并停止自动重交，按已有队列状态处理；不能把异常一律解释为未接管并再次提交。

优先只消费现有 `activate`、composerRole 与持久事务返回值，不新增集合级后台定向提交 API。`activeThreadSession`、`composerInputQueue` 的生产机制作为只读依赖；若现有接口无法兑现交接约束，先报告证据并调整计划，不顺手重构 owner。

### 页面与接线

- 新增 `NewSessionPage`，复用 `ComposerEditor` 和现有草稿捕获能力；编辑器的 Lexical 结构是现有编辑功能，不替换成自制输入框。
- `App.tsx`、`AppCapabilities.ts`/context：提供新建 feature 的稳定生命周期和能力。不要用每次 route render 重新创建的 owner 保存草稿。
- `router.tsx`、`guiRouteTarget.ts` 及相关契约测试：注册 `/new` 与判别成员；保持 UUID 和查询参数验证。
- `AppShellTopBar.tsx`：菜单 `Button variant="ghost"`，关闭抽屉并导航；已有草稿直接恢复。缺目录且无草稿时不可新建，给出可理解原因。
- `AppShell.tsx`、`DocumentTitleOwner.tsx`：新建页使用 reading 布局、新建标题；历史菜单的选中态不能把所有非当前任务页面都当作历史。
- `GuiHostConnectionBridge` 和启动路由测试：新建页刷新仍恢复既有会话集合与目录，但不恢复未创建输入，也不能自动创建或发送。
- 新建页主提交按钮使用 HeroUI `primary`，等待态使用现有 pending/disabled 语义；重试为明确动作。错误复用现有 `FailureLayout`/`FailureDiagnosticModal`，不新增全局重复详情。
- 使用 `bg-background`、`bg-surface`、`border-separator`、`text-foreground`、`text-muted`；目录可换行，窄容器不横向溢出。新文案走 Lingui，并为目录、重试结果未知等歧义提供 translator comment。

## 生成、格式化和完整输出边界

| 入口与 cwd | 权威输入 | 完整输出边界与人工编辑限制 |
| --- | --- | --- |
| 根目录 `just write-gui-host-browser-contract` | host Rust browser contract 与 fixture generator | `codex-rs/gui-host/schema/**`；不手写生成常量或 fixtures |
| `codex-gui` 的 `protocol:generate-validators` | app-server schema/json、host schema/json、`APP_SERVER_REQUEST_METHODS` 等选择定义 | `src/generated/appServerProtocol/**`、`src/generated/guiHostContract/**`；全部生成，不手写校验器 |
| `codex-gui` 的 `messages:extract` | `lingui.config.ts`，include `src`，sourceLocale=en | `src/locales/en.po`、`src/locales/zh-CN.po`；人工仅补计划内翻译，source references 和提取注释由源生成 |

每次审查完整生成 diff；重复同一入口必须稳定。允许正确、确定的 source-reference 元数据变化，不用预计 hunk 限制生成器，也不全量接受未知 `msgid`、翻译或注释变化。输出越界、语义漂移或不稳定时停止该生成节点后继并诊断。

前端格式权威由 `package.json` 和 `.github/workflows/codex-gui.yml` 的 `ci` 指向 `format:oxfmt`。修复优先限本次文件；现有 fix script 固定包含 `.`，不能表达仅指定文件时，允许直接使用同一已安装 oxfmt 对精确文件运行 `--write`，然后运行非 fix 检查。不得运行 Prettier 作为另一套前端格式修复。

本计划改 Rust，必须运行仓库 `just fmt` 后 `just fmt-check`，先核对 `scripts/format.py` 所需工具；不得接受无关格式改动，不为通过格式检查移动既有无关代码。纯代码重排如确实需要，必须独立任务、独立提交，不混入行为提交。

## 验证入口与场景

下列命令是计划执行入口，本轮未运行。前端 cwd 为 `/Users/jiangsheng/cnb/codex/codex-gui`，均使用 `/opt/homebrew/bin/fnm exec --using-file pnpm`。已只读确认 fnm、Node v24.17.0、pnpm 10.34.5、just、cargo、nextest、dotslash 及浏览器缓存存在；执行前再次核验实际 pnpm 路径、匹配的浏览器 binary 和工具完整性，不安装任何组件。

### Level 1

- `pnpm run test:unit src/features/newSession src/features/guiHost src/features/browserLaunch src/features/activeThreadSession`：覆盖创建去重点击、目录固定、草稿生命周期、已知 ID 重试、未知结果、持久化拒绝、异步切换与首发归属。必须确认收集到新增用例；不能仅改 mock 调用次数。
- `pnpm run test:browser:parallel src/__tests__/AppNewSession.browser.test.tsx src/__tests__/AppRouting.browser.test.tsx src/__tests__/AppMultiSessionIsolation.browser.test.tsx src/features/newSession src/features/appShell src/features/documentTitle`：覆盖真实 DOM、菜单/标题、目录显示、草稿恢复、旧队列继续及输入交接。
- `PLAYWRIGHT_HTML_OPEN=never /opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e newSession.spec.ts multiSession.spec.ts persistence.spec.ts`：使用既有 headless 配置，在 Chromium/Firefox/WebKit 覆盖首发、刷新不恢复新建草稿、已建会话恢复、后台隔离。新增 `e2e/newSession.spec.ts`/`newSessionHarness.ts`，按需修改已有两个 harness，仅用于明确协议前提，不伪装 Level 2。
- `pnpm run protocol:check-validators`、`pnpm run format:oxfmt`、`pnpm run lint`、`pnpm run type-check`，以及 `pnpm run build` 证明生产前端产物可用。新增代码全部经过既有 checks，不关闭检查或放宽断言。
- Rust 从根目录分别运行 `just test -p codex-gui-host browser_contract_fixtures_match_generated`、`just test -p codex-gui-host browser_current_frontend_thread_requests_reach_backend`、`just test -p codex-gui-host browser_non_allowlisted_request_never_reaches_backend`、`just test -p codex-gui-host prod_root_serves_index_with_security_headers`。对应现有用例扩充创建转发与 `/new` 生产路由断言；保留非法方法、UUID 路由和 Host/Origin 保护。只运行这些命名过滤，不跑 crate 或 workspace 全量测试/lint。

测试覆盖必须区分创建阶段未知与首发阶段未知；模拟创建响应丢失时断言尚未发出 turn/start；已取得 ID 后重试断言不增加 thread/start；队列接管后失败断言不恢复可重复发送的新建草稿。分别覆盖用户在 thread/start 等待期间和 activate 等待期间切换页面：前者的迟到创建结果不得调用 activate，后者不得误投或抢回导航。还需覆盖连接替换、初始化失败、队列持久化失败及导航失败。

生成和提取命令使用上表的 script，并套用同一 fnm 前缀。正常测试/生成允许必要的增量编译，但不主动执行后端或 CLI 的产品构建/运行命令。所有检查通过后只在新增变化或失败证据要求时补跑，不机械扩大范围。

### Level 2 与 Level 3

Level 2 必须针对包含本次 host 变更的真实 runtime。用户本人构建/启动后提供当次完整 GUI URL；不能用旧二进制或猜接 token，也不能让助手运行后端产品构建。验收前明确专用工作目录、允许创建的测试会话和消息；没有这些具体副作用授权时，仅该验收节点等待，不阻塞独立的实现与 Level 1。

使用现有 headless 入口，核对实际 session 的非 headed 状态；验证菜单新建、所属目录、首发、后台运行和 `/new` 生产页面。记录实际创建的会话及运行结果，不自动删除会话、修改目录信任或清理用户状态。未获得当前 runtime/URL 时记为未执行，不能宣称完整验收。

Level 3 不适用，不打开可见浏览器、DevTools、报告或 trace viewer。

## 描述式 DAG、职责与提交

本节是执行依赖的权威表达，不以文档顺序制造串行。节点字段遵循 `$delegating-micro-stages/references/execution-graph.md`；以下通用字段与逐节点行合并构成每个节点记录。

### 通用节点字段

- `executionContext`：当前 `/Users/jiangsheng/cnb/codex` 工作树、执行时核验的当前分支和共享 Git index。不创建 worktree 或 branch，不改变分支。当前请求不授权实现或提交。
- `authorizationGate`：全部执行节点为 pending，等待用户明确确认本计划；Level 2 还等待具体 runtime、URL 和测试状态授权。届时由 action-authorization 为各节点形成最小能力信封，明确 grantSource、读写集合、动作、副作用、negative constraints 和到期条件；本计划本身不越过当前阶段门禁。
- `subdelegation=false`。主代理调度；host 与前端实现分别由边界明确的执行者承担，审查者不修改实现。所有 stage/commit 只有主代理操作共享 index。
- `resourceLocks`：各节点 writeSet 对应的 canonical 文件写锁；Rust runner 取 `codex-rs/target` 写锁，前端 runner 取实际测试产物目录写锁；host schema 写入与前端 generator 对 schema 读取互斥；catalog extraction 独占两个 catalog。Git 节点独占仓库实际 `git rev-parse --git-path index` 指向的 index。
- `stateEffects`：编辑仅声明文件；生成仅上表输出；验证为工具自动测试/构建产物；stage/commit 仅对应任务路径和本地 commit；审查只读。禁止 remote、force、amend、安装、保护规则修改、计划外用户状态操作。
- `commandScope`：编辑用普通源码 patch；生成/验证用本文已核验入口；stage 用精确路径 `git add -- <paths>`，commit 前查完整 staged diff 与 `git diff --cached --check`，再普通本地 commit。没有通配 stage，也不强制提交 ignored 文件。
- `failureDomain`：默认本节点产物和真正依赖它的后继；无依赖分支继续。`replanTriggers`：授权、产品语义、权威接口或输出边界变化；计划内失败进入诊断和修正节点，不以首次失败结束任务。
- `deferralEvidence=无`。运行时若因真实资源争用暂缓，记录具体冲突、被暂缓节点、复查触发和失效条件，不以节点编号或同一仓库为理由串行。

### 编辑与生成节点

| nodeId / taskBoundary / operationKind / owner | hardPredecessors 与 consumes | outcome / produces / completionEvidence | readSet / writeSet | estimatedCost / verification |
| --- | --- | --- | --- | --- |
| D0 / 文档提交 / stage；D1 / 文档提交 / commit，主代理 | D0 等待执行授权；D1 消费 D0 的精确 staged 文档 | 已确认设计和计划的独立本地提交 ID；提交前两份文档可读且不受 ignore | 只读本文和设计；index 仅暂存这两份文档 | 小；staged diff/check，无源码混入 |
| H / host / edit，host 执行者 | D1 的文档提交 ID | allowlist、`/new` 生产入口、契约源和配套现有测试修改；可审查源码 diff | 上述 host 源码、测试；写集合限上述 host 文件及对应测试 | 中；消费设计中的创建/路由契约 |
| HG / host / generate，host 执行者 | H 的契约源 | host browser contract 生成输出，二次生成稳定证据 | 读 host 契约；写 `codex-rs/gui-host/schema/**` | 小；既有 fixture 比对测试 |
| F / 创建与交接 / edit，前端执行者 | D1 的文档提交 ID；无需 H/HG | gateway、方法选择、新建 owner、unit 测试及必要 mock，形成稳定交接接口 | 读现有 role/queue/editor/transport；写 `features/guiHost` 的上述文件、`features/newSession` owner/test、命中 `GuiHostCommands` 类型的现有测试 mock | 中；不修改现有 queue/collection 机制 |
| FG / 创建与交接 / generate，前端执行者 | F 的方法选择；读取 host schema 时不得与 HG 写入重叠 | 前端创建响应校验产物与重复生成稳定证据 | 读上表协议源；写两处前端 generated 目录 | 小；协议生成检查 |
| U / 页面集成 / edit，前端执行者 | HG 的新路由常量、F/FG 的稳定创建接口 | 页面、App 生命周期、导航、路由、布局、标题和相关 Browser/路由测试 | 写 `features/newSession` 页面、App、router、上述 appShell/browserLaunch/documentTitle 文件和对应测试；必要的 Bridge 接线测试 | 中；按单份草稿和多目录场景检查 |
| L / 页面集成 / generate，前端执行者 | U 的最终文案 | 完整提取并补齐计划内翻译，再提取稳定 | 写 `src/locales/en.po`、`src/locales/zh-CN.po`；读 Lingui 源 | 小；逐字段 diff、无缺译 |
| E / 端到端回归 / edit，测试执行者 | U 的真实交互与 RPC 接线 | newSession E2E 及必要 harness 修正 | 写 `codex-gui/e2e/newSession.spec.ts`、`newSessionHarness.ts`，必要的 `multiSessionHarness.ts`、`persistenceHarness.ts` | 中；旧用例保持原检查能力 |

### 验证、审查与提交节点

每个任务的格式化节点 `fmt(T)` 消费对应编辑/生成完成的稳定源码，operationKind=format，owner=主代理，writeSet 仅该任务源文件，生成文件只按 owner 入口；Rust 全局 formatter 运行时暂停与其管理文件冲突的编辑。随后 `verify(T)` 为 operationKind=verification，读取该任务产物并运行本文相应范围，产出真实命中测试的结果。二者 estimatedCost 为小至中。

- `verify(host)` 消费 H/HG；`verify(创建与交接)` 消费 F/FG；`verify(页面集成)` 消费 U/L；`verify(端到端回归)` 消费 E/U/L。不同测试 runner 仅在产物/端口资源不冲突时并行。
- 各任务 `review(T)` 为只读独立审查，等待该任务稳定 diff 与验证证据；consumes 为设计、本文、完整任务 diff 和验证结果，produces/completionEvidence 为可追溯审查结论。发现问题由原任务追加 edit/verify 节点，不由审查者直接改代码。
- `stage(T)` 等待该任务 review/verify 完成，主代理只暂存该任务精确文件；`commit(T)` 消费 staged diff/check，形成独立本地提交。任务边界分别为 host、创建与交接、页面集成、端到端回归。共享 index 串行，其余无依赖工作不等 commit。
- `V` 为最终 verification，owner=主代理，consumes=全部集成后的源码、生成物和四个任务提交，readSet=完整计划范围，writeSet=验证自动产物；执行最终协议/格式/lint/type/build 和必要组合回归。已经覆盖同一稳定组合且没有变化的验证证据可复用。
- `R` 为 Level 2 verification，等待 V、用户提供的当前 runtime 和具体测试状态授权；writeSet/stateEffects=授权测试目录下的真实会话及消息、headless 验收记录，禁止自动清理用户数据；耗时取决于用户前置。未满足时只暂停 R 及最终完整验收声明。
- `Z` 为 fan-in，owner=主代理，等待所有任务、本轮发现的计划内修正、V 和适用 R；只读汇总最终状态、提交及分层验收。不能把预算、测试数或中间提交完整性当作完成条件。

### 调度审计

执行授权后初始 ready set 为 D0；D1 完成后 H 与 F 同时 ready，分别处理互不相交的 Rust host 与前端 owner。HG 与 FG 仅在 host schema 读写冲突期间互斥；U 真正依赖新路由常量和创建接口。U 完成后 L 与 E 可并行，写集合为 catalogs 和 E2E，互不重叠；测试等待实际消费的产物。

粗粒度关键路径为文档提交、F/FG、U、E、组合验证、真实验收、Z；H/HG 是 U 的另一个前置分支。每个任务提交只约束自己的 staged 快照，不作为其他不相关分支的全局栅栏。

不使用 worktree，避免新增项目外目录和配置；同一工作树中依靠明确文件集合、生成锁、runner 锁和唯一 index owner 隔离。中间提交可以尚未完成全部集成，不为中间绿灯增加临时 adapter、双路径或 fallback。

## 完成与停止边界

计划确认前只创建本文，不实现或提交。确认执行后先独立提交设计与计划，再按上述依赖完成修改、验证、独立审查和任务提交；保留所有提交身份，不 amend、squash 或操作远程。

工具缺失时停止依赖动作并提供用户安装建议，助手不安装。真实验收缺少前置时记录未执行并等待具体输入，不把 Level 1 作为替代。计划内失败必须持续闭环；只有需要改变目标、产品结果、授权或风险边界时才请求新决策。

完成报告列出设计行为、精确提交、Level 1/2/3 结果，以及实际并行、关键路径和未启动 ready 节点。全部必要节点与计划内修正完成后结束本轮，不主动追加另一轮任务。
