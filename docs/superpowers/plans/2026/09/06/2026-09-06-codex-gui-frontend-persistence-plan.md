# Codex GUI 前端数据持久化实施计划

日期：2026-09-06

状态：用户已选择仅 sessionStorage、恢复队列统一人工暂停；唯一方案已落盘，实施计划待确认。未实施、未提交。

设计依据：[前端数据持久化设计](../../../../specs/2026/09/06/2026-09-06-codex-gui-frontend-persistence-design.md)。用户于本轮确认设计并要求计划落盘；该授权不包含本轮实施或 Git 提交。

## 1. 交付范围

仅为现有单活动会话增加页面会话内的持久化：活动会话恢复位置、普通输入框草稿、排队消息、发送确认及待恢复记录。后端仍拥有历史和真实运行状态。

不实现多会话激活、后台多会话调度、已激活会话列表、新建会话、后端 QueueStore 接入或后端幂等接口；不新增持久兼容层、双写队列或第二个当前会话 owner。普通草稿跨刷新恢复；队列临时编辑仅恢复最后保存版本。

正文描述未来执行结构。本轮按用户后续选择同步修订设计与计划。执行须获得本计划的明确确认，再独立提交本次设计和计划文档；本次产品选择本身不授权实施。

## 2. 计划前发现的范围决策 D-OWN

### 2.1 已证实的不可区分状态

sessionStorage 的 opener 副本与原存储独立。原页和副本同样保存“消息 M 未发送”时，原页可以持锁保存发送准备并发出请求；原页退出后，副本仍是旧的“未发送”。副本取得 Web Lock 只能证明此刻互斥，不能证明这条消息从未发送。后端历史又可能尚未显示已接收的输入，所以缺席证据不能排除重发。

因此仅 sessionStorage、Web Locks、BroadcastChannel、离页通知或超时，不能同时满足先前的自动恢复与旧副本防重发。用户已据此选择统一人工暂停，替代自动恢复发送。不能把 navigation.type 的未经验证分类作为证明，也不能只覆盖两个页面同时打开的测试。

依据：

- [MDN sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage)：初始复制后两份存储独立，修改不互相传播。
- [Web Locks termination](https://w3c.github.io/web-locks/#termination-of-locks)：agent/document 终止会释放锁，锁不记录过去的业务提交。
- 已确认设计第 7、9 节要求覆盖旧副本后续接管；前端 clientUserMessageId 与后端正向确认的限制见设计第 3 节。

### 2.2 用户已决定的唯一方案

用户选择仅使用 sessionStorage。刷新、从持久记录恢复和浏览器页面会话恢复后的队列统一暂停自动发送，用户检查后决定是否继续。不增加 localStorage、IndexedDB、服务端账本或其他共享防重发元数据。

人工暂停是本实例的恢复 gate，“已继续”许可不持久化；原副本曾经继续过不能授权新页面发送。无论本地记录显示未发送还是后端暂未找到消息，恢复都不得自动发送。没有经历恢复的原页面正常运行不受影响。

人工继续只解除这层暂停，不解除未知发送、待恢复事项、顺序约束和保存失败。两个页面分别得到用户继续操作后的全局恰好一次不在保证范围；不声称这解决了后端幂等问题。

产品决策已闭合；所有实现节点仍 pending，等待本计划的明确执行确认。

## 3. 已闭合的技术判断

### 3.1 持久记录与功能 owner

新增 `features/browserPersistence/`，负责 sessionStorage 的版本化记录读写和明确错误，不接管队列调度。授权 token 和 activeThreadId 继续由 browserLaunch 拥有。业务记录绑定授权上下文，新的授权上下文不能自动接续旧记录。

单次业务转换需要一个原子写入单位：同一会话的普通草稿、队列、恢复信息及发送阶段组成一致记录，以单次 setItem 发布候选快照。入队与源草稿清除不能分散到两个未经事务保护的 key。小型界面状态不写入完整聊天历史。

公共存储层接受功能 owner 生成的版本化数据，负责替换成功或明确失败；不从任意对象反射抓取运行状态。每个 owner 保持唯一运行时权威状态，存储是可恢复表示，不建立另一个持续调度的状态机。

没有跨存储提交或共享所有权账本。恢复实例只操作自身 sessionStorage，人工继续许可只在本实例内存中存在。

### 3.2 草稿和协议值

在 `composerEditor/composerDraft.ts` 及其公共合同增加编辑器拥有的导出、校验导入能力。保存实际 SerializedEditorState 内容，不保存 WeakMap/symbol 句柄。导入重建合法草稿对象，继续使用现有技能节点及输入编译逻辑。

普通会话输入随 Lexical 已提交内容保存，不依赖 beforeunload。排队编辑的未保存内容不覆盖持久 original；刷新后不恢复编辑 reservation、焦点、弹层或未保存修改。

队列持久 input 仍依赖权威 UserInput/TurnStartParams/TurnSteerParams，不能手工镜像其 schema。现有辅助验证器选择入口支持对象 schema：计划选择 `v2/TurnStartParams` 与 `v2/TurnSteerParams`，由已有 schema bundle 生成校验器，并通过符合权威参数结构的包装校验持久 input。不手写 UserInput 联合验证器，也不改 Rust 协议。

### 3.3 队列转换必须先准备再发布

当前 `submitInput` 先修改 queue，`consumeTransition` 再执行 effects；liveManagement 的 save/delete/move 也直接修改 queue 并可能 drain。因此不能用订阅回调、effect 之后的 setItem 或失败后的内存回滚实现持久化。

将可变领域数据与运行能力分开，由各 owner 支持候选转换：准备候选数据和 effects → 持久提交 → 替换有效内存状态、发布结果 → 执行 effects。持久失败时原队列、编辑 reservation、原输入和成功状态保持未提交。网络已经发生后不得假装回滚网络。

必须覆盖：submit、start/steer issue、response settlement、accepted runtime facts、编辑保存/删除/重排、recovery、interrupt 及恢复后 drain。投影与聊天显示不因队列保存失败停止更新，但依赖未保存确认的后继不得发送。

### 3.4 可恢复数据映射

| 原对象 | 持久内容和恢复规则 |
| --- | --- |
| 普通消息 | 稳定消息 ID、内容/草稿、通道、顺序；恢复合法新对象 |
| start | 稳定 clientUserMessageId、操作阶段、已确认 turnId、必要正向事实；issuing 不原样复活，也不重新 issue |
| steer | thread/expectedTurn、稳定 client ID、顺序、source、拒绝及关闭目标信息；保持原有转 start 与恢复策略 |
| recovery batch/transfer | 内容、顺序、原因及必要目标；由 owner 正式导入，不伪造旧 symbol、Set 成员或 claim 引用 |
| 临时编辑 | 导出 original 已保存值；刷新恢复为普通 slot，不消费失效 reservation |
| interrupt | 目标、持久接收结果及已知终止事实；未知时不自动再次 interrupt，不把等待旧 Promise 的 issuing 状态带入新实例 |

发送身份采用一次生成后持久保存的唯一 ID，替换模块级从零计数器；刷新不得复用旧提交 ID。发送准备记录先于 RPC，响应/运行时正向确认先保存再释放后继。缺席证据和超时不能把未知消息变成“未发送”。

### 3.5 初始化、错误与人工处理

恢复数据的校验和人工暂停 gate 必须早于 `liveActiveThreadSession` 初始 projection flush 触发队列 effects；随后按当前路由、授权及快照核对。重建队列、核对完成或新事件均不能自动开放发送。

提供“检查后继续”操作，展示恢复消息及状态，提示检查其他页面与历史。操作消费当前恢复记录 revision；状态已变化时重新呈现再继续。解除暂停前必须完成核对且存储可写。许可不序列化。暂停时新提交只能保存并追加到仍暂停的队列，不能越过恢复消息发送。

gate 位于共同的自动发送 effect 边界，覆盖 initial flush、accepted event、settlement、turn terminal、管理操作及 recover/drain。重新导入持久队列时重新暂停；普通路由切换不凭空算作刷新。pagehide 使许可失效，pageshow/BFCache 恢复先重新暂停并核对，不仅依赖 React 重挂载。用户主动停止后端 turn 仍走原有操作，不属于自动恢复发送。

现有 recover() 只接受 startDefinitelyNotAccepted、steerDefinitelyNotAccepted、userStopped 等 owner 注册批次，不能直接用于跨刷新未知发送。结果未知展示原文并继续收集正向证据；“检查后继续”不得重发未知请求。用户可检查历史、保留原文或明确移除本地恢复项；移除仅放弃本地记录，不停止或撤回后端请求。不能把未知项偷偷转成普通消息或把新操作伪装成旧 recover()。

初版只支持自身明确版本；损坏、未知版本或验证失败保留原记录并显示错误，不自动迁移为空记录。存储失败阻止新提交，保留输入；重新保存成功后才恢复依赖操作。旧授权 token-only/activeThreadId 格式仍由原 owner 正常读取，不强制重置。

UI 使用现有 HeroUI v3 `Alert`（danger 保存失败，warning 恢复暂停或等待核对）、`Button`（primary 检查后继续，secondary 重试，danger 明确移除本地恢复项），采用 surface/foreground/muted/separator 语义 token。不新增全局弹窗或通知体系，不暴露存储键、claim 等实现信息。

## 4. 六字段证据摘要

| 字段 | 当前证据与计划影响 |
| --- | --- |
| 权威入口 | browserAuthorizationSession、GuiHostConnectionBridge、composerDraft、composerInputQueueCoordinator、composerPendingInputLiveManagement、liveActiveThreadSession；后端字段以生成协议和 schema 为准 |
| 已追踪链路 | 启动→新建活动 owner→初始投影→队列；输入→submit→accepted→clearIfCurrent；管理保存/删除/移动→drain；响应/投影→settlement；断线→dispose；草稿 WeakMap 和恢复批次能力对象 |
| 修改范围 | browserPersistence 新目录；上述功能局部实现与合同、测试；guiHost/appServerProtocol 辅助 schema 选择、生成物；Composer UI 错误反馈与 en/zh-CN catalogs |
| 验证映射 | 现有 start/steer/interrupt delivery、management recovery/move、composerDraft、composerTurnApplication、liveActiveThreadSession 单测；App/Composer Browser 测试；新增真实 reload 的 Playwright E2E；最后真实 runtime Level 2 |
| 排除项 | Rust 协议和 QueueStore 只读；聊天历史存储、完整 transcript 持久化、Redux 全量序列化、多会话调度、新建会话、依赖安装均排除 |
| 剩余未知 | D-OWN 已通过用户选择闭合，统一人工恢复规则见第 2、3.5 节。浏览器二进制和真实 runtime 可用性在执行前重检；缺失时阻断对应验证，不以 mock 替代。方案不再依赖未确认的共享存储或后端能力 |

关键代码：`composerInputQueueCoordinator.ts:443,486,505`；`composerInputQueue.ts:590,1096`；`composerPendingInputLiveManagement.ts:242,267,425`；`composerTurnApplication.ts:193`；`liveActiveThreadSession.ts:104,123,484`。行号是本轮导航依据，执行时以符号与实际内容重新核验。

## 5. 写集合与生成边界

以下根路径均相对 `/Users/jiangsheng/cnb/codex`：

| 集合 | 精确目录或文件边界 |
| --- | --- |
| W-store | `codex-gui/src/features/browserPersistence/**`（新增） |
| W-editor | `codex-gui/src/features/composerEditor/composerDraft.ts`、`composerEditorContracts.ts`、`ComposerEditor.tsx`、相关新增草稿持久文件及该 feature 的 `__tests__/**` |
| W-protocol | `codex-gui/src/features/guiHost/appServerProtocol.ts`；`codex-gui/scripts/protocolValidators/**` 中必要的生成类型/选择支持和对应测试 |
| W-queue | `codex-gui/src/features/composerInputQueue/**`；保留 lane、start、steer、interrupt 与 liveManagement 各自语义 owner |
| W-integration | `codex-gui/src/features/browserLaunch/browserAuthorizationSession.ts` 及测试；`features/activeThreadSession/**`；`features/appShell/GuiHostConnectionBridge.tsx`；`features/composerTurnControl/**`；相关 App 集成测试 |
| W-e2e | `codex-gui/e2e/persistence.spec.ts` 及该目录内专用测试支持文件；沿用现有配置，若必须改变配置须给出目标发现证据 |
| W-generated | `codex-gui/src/generated/appServerProtocol/**`、`codex-gui/src/generated/guiHostContract/**`，仅权威入口生成 |
| W-catalog | `codex-gui/src/locales/en.po`、`codex-gui/src/locales/zh-CN.po` |
| W-docs | 本设计、本计划及后续独立执行记录目录；本轮仅同步设计与计划 |

协议生成入口：`pnpm run protocol:generate-validators`。输入为现有 `codex-rs/app-server-protocol/schema/json/{codex_app_server_protocol.schemas.json,client-request-definitions.json,server-notification-definitions.json}`、`codex-rs/gui-host/schema/json/{GuiAuthenticateParams.json,GuiAuthenticateResult.json}`、前端方法和辅助 schema 选择。输入只读，W-generated 是入口完整输出集合；不手改产物。

Lingui 入口：`pnpm run messages:extract`；配置 `lingui.config.ts`，sourceLocale=en，locales=en/zh-CN，源为 src。完整输出为 W-catalog；人工仅补充本次新增消息的翻译。首次完整审查字段 diff，补译后重复 extraction 稳定；既有翻译、消息语义、fuzzy/obsolete 不得借生成名义漂移。注释遵循 enhanced-message-context。

不使用 `just fmt`：本计划不改其管理的 Rust/Python/Bazel 等文件。若实施需要范围外文件或新增依赖，先按实际影响重新核对授权，不自动扩张上述集合。

## 6. 验证入口与环境证据

已只读核对 package.json、GUI workflow、Vitest/Playwright 配置及本地 docs。仓库当前为 dev，基线 HEAD 为 `55ce014b74b5559c70bfd1aa5cd96cc7b9c8c30e`，Git index 为 `/Users/jiangsheng/cnb/codex/.git/index`；本轮未创建 worktree。fnm 调用得到 Node v24.17.0、pnpm 10.34.5，实际二进制均解析到用户 fnm 安装；node_modules 和 oxfmt/vitest/playwright 入口存在。执行前仍要核验浏览器二进制、版本解析、生成输入和测试实际收集。

下列命令均在 `/Users/jiangsheng/cnb/codex/codex-gui` 执行，并统一使用 `/opt/homebrew/bin/fnm exec --using-file`。本轮只检查入口与版本，没有执行测试、lint、生成或构建。

```sh
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:generate-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/browserPersistence src/features/composerEditor src/features/composerInputQueue src/features/composerTurnControl src/features/activeThreadSession src/features/browserLaunch scripts/protocolValidators
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel src/features/composerEditor src/features/composerTurnControl src/features/activeThreadSession src/__tests__/App
PLAYWRIGHT_HTML_OPEN=never /opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e e2e/persistence.spec.ts
```

格式化由 CI 实际使用的 oxfmt 拥有。现有 `format:oxfmt:fix` 脚本硬编码 `oxfmt . --write`，追加文件参数不会移除 `.`，不能作为限定文件的入口。依据用户“已有命令会产生范围外修改时改用安全方式”的规则，使用 `/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write <逐个实际变更文件>`；不得传入 `.` 或空文件列表，再运行上述非 fix 检查。已通过本地 `oxfmt --help` 核验其显式 PATH 列表与 --write/--check 语法，没有执行格式化。已有 unit 配置排除 browser/E2E，Browser parallel 配置收集 browser.test.ts(x)，共享配置明确 headless=true；E2E 配置同样 headless=true。成功必须报告实际测试文件、案例数与退出结果，零收集不算通过。

Level 1 核心场景：reload 后草稿恢复、队列暂停无自动 RPC；人工继续及再次刷新重新暂停；保存失败无 RPC 且输入不清空；各发送窗口；start/steer/interrupt 与临时编辑恢复；唯一 ID；授权切换；损坏格式；复制页面、原页退出后旧副本仍暂停、BFCache 许可失效。断言快照/terminal/管理操作/新消息不能旁路 gate，人工继续不解除未知结果阻塞。E2E 使用既有 WebSocket mock 和真实浏览器 storage，不以单个 React mount 内重建代替 reload。

Level 2：取得当次完整真实 GUI URL，保留 route/thread/token，无头验证真实会话的草稿刷新、受控排队、响应确认、刷新后暂停与人工继续。仅对专用验证会话发送无文件修改要求的消息，不向他人发消息，不对用户在用任务故意制造中断。新验证会话和 URL 遵循实际入口与授权，不编造 URL 或复用历史 token。缺少 runtime 时记录未执行，由用户自行构建；助手不执行后端构建。

Level 3：本轮功能预期不依赖可见桌面，默认不适用；若证据表明需要，单独取得可见窗口授权。无头浏览器不得打开报告或 trace viewer。

## 7. 描述式执行 DAG

### 7.1 公共节点字段

以下默认字段明确应用于每个节点，节点行覆盖差异；它们与节点表合起来构成完整声明，不以任务编号决定顺序。

- `executionContext`：当前 `/Users/jiangsheng/cnb/codex` 工作树、执行前再次核验的 dev 分支及其真实 Git index；不创建 worktree/branch，精确 worktree 创建授权为空。
- `taskBoundary`：除 D、C-doc、R 外均为 T-persistence，同一个完整行为变更提交边界；不拆出为了中间通过而保留的兼容提交。
- `owner`：实现节点 S/E/P/Q/I/T 为各节点有界执行者；G/N/NS/F/V/C-doc/C-code/L 的命令与 Git 由主代理唯一持有；TR 的翻译编辑也由主代理唯一持有，W-catalog 全程只有该写入 owner；R 为独立只读复核者。
- `operationKind`、`outcome`、`estimatedCost`、`hardPredecessors`、`consumes`、`produces`：见节点表。
- `deferralEvidence`：无；出现真实争用后按执行图契约补充，不以同仓库、编号或代理复用伪造依赖。
- `readSet`：设计、最终确认的本计划、适用 AGENTS/skills，以及节点消费集合；只读取必要代码，不读取真实 token、用户历史或数据库。
- `writeSet`：见节点表；编辑节点无 Git index 写权限。
- `stateEffects`：编辑节点只改 W 集合；生成只写 W-generated/W-catalog；验证允许已授权 runner 正常产生的缓存/日志/报告；Git 节点只处理本计划实际 allowlist。
- `commandScope`：编辑使用源码语义 patch，编辑节点不运行测试、开发服务器、生成器或格式化器；生成、格式与测试由对应操作节点使用第 6 节权威入口及明确文件范围；只读核对使用 rg/cat/sed/git status/diff；禁安装、后端构建、远程、amend、force。
- `subdelegation`：false。
- `resourceLocks`：各 writeSet 解析后的 canonical 文件为写锁，消费源码为读锁；主代理独占实际 Git index；生成器独占 W-generated/W-catalog；同一 cwd 的 formatter/runner 与其读取的可变源码互斥；Playwright runner 的项目端口和 artifact 输出独占。不能仅用不同锁名掩盖相同物理资源。
- `completionEvidence`：编辑节点为已核对的稳定 diff/接口，不是口头完成；生成节点为完整 diff 与稳定性；验证节点为实际收集结果；提交节点为 staged 精确范围和 commit ID；详见节点表。
- `verification`：编辑节点消费后续组合验证，局部自检不能替代 V/L；R 仅核对稳定产物；实际命令按第 6 节。
- `failureDomain`：本节点产物及实际消费它的传递后继；无依赖节点继续。
- `replanTriggers`：发现新的产品结果、后端需求、存储生命周期、协议来源变化、范围外写入、工具缺失或验证入口失真；计划内代码问题先诊断修正，不默认停工。
- `authorizationGate`：全部 pending。D-OWN 已解决；用户明确确认本计划执行后，中央授权才为实际节点建立 active 能力信封。本次产品选择与文档更新不激活实现节点。

### 7.2 节点记录

| nodeId / operationKind | outcome；成本 | hardPredecessors 与 consumes | writeSet / produces / completionEvidence |
| --- | --- | --- | --- |
| D / 授权 | 激活已选定范围的执行授权；短；无提交 | 已完成的 D-OWN 决定、本计划及明确执行确认 | 无源码写；有效授权记录；确认前不执行后继 |
| C-doc / commit | 独立提交设计和最终计划；短；独立文档提交边界 | D，消费已确认两份文档及 clean/index 核对 | 仅本设计、本计划和实际 Git index；产生文档 commit ID；ignore 命中则不强制暂存 |
| S / 编辑 | 版本化存储与一致记录接口及其测试；中 | C-doc；消费确定后的 D-OWN 存储边界 | W-store；稳定读写合同、错误和提交语义；不得占有队列策略 |
| E / 编辑 | 草稿导出导入与测试；中 | C-doc；消费现有 editor owner | W-editor 中 codec/合同与测试；有效草稿往返及非法输入拒绝的稳定接口 |
| P / 编辑 | 选择权威请求参数校验器；短 | C-doc；消费现有 schema 和辅助生成逻辑 | W-protocol；稳定的选择配置与必要生成器类型支持；不手写生成物 |
| G / 生成 | 生成并核对协议校验产物；短 | P；消费稳定生成输入 | W-generated；生成完整 diff 与 check 成功，重复生成稳定 |
| Q / 编辑 | 队列可恢复状态与先保存后提交机制；长 | S、E、G；依赖存储提交、草稿和校验接口 | W-queue；所有原有突变/effect 路径被同一合法提交边界覆盖，并扩展对应故障窗口测试 |
| I / 编辑 | 启动恢复、人工继续和编辑器接线；长 | Q、S、E；依赖恢复队列和草稿 API | W-integration 与 W-editor 组件接线；核对和人工继续前不发送，accepted 后才清输入，保存失败可见，页面恢复重置许可 |
| T / 编辑 | reload/复制页 E2E；中 | I；消费实际入口与错误状态 | W-e2e；真实页面 reload 与存储、网络观测；不以 fixture-only 测试代替 |
| N / 生成 | 提取新增 UI 消息；短 | I；消费完整 UI 源码 | W-catalog；完整 extraction 输出与字段分类 |
| TR / 编辑 | 补充本次新增翻译；短 | N；消费新 message identity/context | W-catalog；只补新消息 en/zh-CN 翻译 |
| NS / 生成 | 核对 catalog 稳定；短 | TR；消费补译后的 catalogs | W-catalog；同入口再次 extraction 无漂移 |
| F / 格式化 | 仅格式化实际 allowlist；短 | T、NS、Q、G；消费组合源码稳定状态 | 实际变更源码/测试；oxfmt fix 限定文件，非 fix 验证通过 |
| V / 验证 | 组合 Level 1、lint/types/validators；中 | F；消费完整行为 diff | 无主动源码写；第 6 节实际测试与检查证据 |
| R / 审查 | 独立审查恢复、双副本、提交窗口与范围；中；无提交 | V；消费稳定 diff、设计约束与验证结果 | 无；具体发现及证据。发现计划内问题由修正节点闭环，再更新受影响验证 |
| L / 验证 | 真实 runtime Level 2；中 | V；消费完整实现及可用 runtime/当次 URL | 无主动源码写；专用会话无头验证结果，不能以 Level 1 替代 |
| C-code / commit | 提交完整行为改动；短 | R、L；消费通过复核和适用最终验证的完整 diff | 本计划实际源码/生成/catalog allowlist 与 Git index；独立代码 commit ID |

S/E/P 是文档提交后的初始 ready set，写集合不相交，可在同一 T-persistence 中并行。P 完成即可运行 G，不等待 S/E。Q 需要三者接口才启动；I 消费 Q 的稳定 API。T 与 N 可并行，因为 T 写 E2E，不修改 extraction 所读 src；其余重叠读写不得并行。

关键路径预估：D → C-doc → S/E/G 的最长分支 → Q → I → T/NS 的最长分支 → F → V → R/L 的最长分支 → C-code。R/L 可在稳定源码上并行，但共享 runner/fixture 时按实际资源串行，不创建虚假产物依赖。

最终 fan-in 是 R 与 L 及所有动态修正验证完成。全部行为在一个任务提交中集成，避免独立 worktree 集成成本；这不禁止同任务不相交编辑并行。若实施证明需新的独立任务/worktree，先明确路径、分支、base、写集合与授权，不能临时自建。

## 8. 提交、失败闭环与完成判定

计划经完整确认后，先独立本地提交设计和最终计划；本轮不提交。后续代码行为提交与纯位置重排分离，本计划不主动安排纯重排。既有提交的修正必须新建提交，不 amend/squash，不添加临时双写或 fallback 来让中间状态通过。

每次 stage 前由唯一 Git owner 从实际 diff 建立精确 allowlist，检查 ignore、文件状态和 staged diff。使用 `git add -- <逐个已核实文件>`，然后 `git diff --cached --check` 与完整 staged diff，最后本地 commit；禁止目录级误收无关文件及任何远程操作。设计和计划不能与代码行为放进同一个提交。

执行记录使用独立的 `docs/superpowers/research/2026/09/06/2026-09-06-codex-gui-frontend-persistence-execution.md`，仅在执行授权覆盖后创建，由主代理唯一更新；不回写本计划作为运行日志。记录节点状态、实际重叠、稳定产物、锁、失败/修正和 commit ID。

失败先限定实际影响域并继续诊断与修正，不放宽断言、关闭检查、扩大忽略或删除覆盖。工具/浏览器缺失由用户自行安装；真实 runtime 需要构建时由用户自行执行。Level 2 未执行时不能宣称完全验证或完成本计划。

当前完成的是文档与调查。用户已选择恢复队列统一人工暂停，D-OWN 已闭合；仍须明确确认本计划才进入实施。

此前独立草案复核已检查范围、生成输入、DAG 和命令入口，修正全目录格式化风险及 catalog owner 遗漏。本次按后续选择同步恢复规则后，独立一致性复核未发现必须修正项：sessionStorage 单一方案、统一人工暂停、许可不持久化、未知结果独立阻塞及实施确认门禁一致。文档复核不代表实现验证通过。
