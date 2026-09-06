# Codex GUI HeroUI 反馈展示实施计划

日期：2026-09-06

状态：设计已确认；本计划待确认，尚未执行。

设计依据：[HeroUI 反馈展示设计](../../../../specs/2026/09/06/2026-09-06-codex-gui-heroui-feedback-design.md)。

执行位置：`/Users/jiangsheng/cnb/codex`，当前分支 `dev`。不创建 worktree，不操作 Git 远程。

## 目标与不可改变的边界

修正设计范围内的反馈组合与动作语义；首屏简明说明，原始诊断按需查看；沿用 Pending 队列入口，将 `Review and continue` 明确为“继续发送”。

不新增队列查看按钮、队列检查页面、强制先查看流程或自动发送条件；本次原始诊断的按需查看入口仍按设计新增。不改错误归属、重试优先级、队列状态、未知消息阻塞、协议、持久化格式或底层 `no rollout found`。历史列表和历史读取中不属于本次展示修正的旧问题不顺带清理。禁止用删除断言、放宽断言、隐藏失败、扩大豁免或临时兼容路径通过验证。

本计划包含执行时的独立本地提交。用户当前仅授权计划落盘；以下编辑、生成、测试、stage、commit 和运行时操作均等待后续对计划的明确执行确认。开始实施前先独立提交设计与计划。

## 影响面证据闭包

| 字段 | 当前证据与计划含义 |
| --- | --- |
| 权威入口 | `App.tsx` 挂载 AppShell；路由到 CurrentTaskPage；CurrentTaskReady 挂载 ComposerTurnControl；后者挂载 ComposerPersistenceStatus 和 ComposerPendingInputRegion。历史页通过 ContinueTaskFailureAlert 显示续接失败 |
| 已追踪链路 | AppShell 消费 collection errors；CurrentTaskPage 消费 snapshot/member errors 并保留 retry/retryOperation；ComposerPersistenceStatus 通过 composerRole 调用 retryPersistence/resumeRestored/discardUnknown；PendingInputRegion 按普通队列/Guide 数量挂载现有抽屉 |
| 修改范围 | 只修改反馈组件、文案、组合和对应测试；提取已有诊断 Modal 的纯展示结构，不迁移错误 owner；Lingui 从 `src` 提取到 en/zh-CN 两个 catalog |
| 验证映射 | AppErrorPresentation 覆盖错误归属、同文不同错误、后台失败和重试；ComposerTurnControlPersistence 覆盖保存阻塞、恢复和未知消息；历史续接 Browser 测试覆盖 Modal 焦点、窄屏滚动及卸载；persistence/multiSession E2E 覆盖重载、隔离和继续发送 |
| 排除项 | 活动任务菜单组合、ContextUsagePopover 宽度改动未发现明确偏差；会话、队列和协议 owner 只读；不改变历史读取或列表的既有错误语义；保留原有底部继续任务主操作 |
| 剩余未知 | Level 2 当前完整 GUI URL 和可用真实错误场景尚未取得，不能声称已验证。本会话工具目录未发现 `launch_gui`；执行时重查，缺失则请用户提供当前 `/gui` 返回的完整 URL。此环境前提仅阻塞 Level 2 及完整验收声明，不影响已确定的代码范围与 Level 1 |

验证场景涉及反馈和恢复入口，但不改变恢复状态转换。若实施需要修改 session/queue owner 才能达成结果，应停止相应节点并回到范围确认，不能把它归为展示细节。

## 文件集合与任务边界

下列相对路径以 `codex-gui/` 为根；工作文档路径以仓库根为根。

| 集合 | 精确边界 |
| --- | --- |
| D 文档 | 本计划、对应设计文档 |
| R 纯提取 | 新增 `src/feedback/FailureDiagnosticModal.tsx`；`src/features/threadHistory/ContinueTaskFailureAlert.tsx` |
| F 共享展示 | `src/feedback/FailureDiagnosticModal.tsx`；新增 `src/feedback/__tests__/FailureDiagnosticModal.browser.test.tsx` |
| C 当前任务 | `src/features/currentTask/CurrentTaskPage.tsx`；`src/__tests__/AppErrorPresentation.browser.test.tsx`；`src/__tests__/AppShell.browser.test.tsx`；`src/__tests__/AppMultiSessionIsolation.browser.test.tsx` |
| S 全局反馈 | `src/features/appShell/AppShell.tsx` |
| P 输入区 | `src/features/composerTurnControl/ComposerPersistenceStatus.tsx`；`src/features/composerTurnControl/__tests__/ComposerTurnControlPersistence.browser.test.tsx` |
| H 历史与 E2E | `src/features/threadHistory/__tests__/ThreadHistoryDetailContinuation.browser.test.tsx`；`e2e/persistence.spec.ts`；`e2e/multiSession.spec.ts` |
| L catalogs | `src/locales/en.po`；`src/locales/zh-CN.po` |
| 只读验证与消费者 | `src/features/threadHistory/__tests__/ThreadHistoryDetailRead.browser.test.tsx`、`src/features/appShell/__tests__/ActiveThreadCollectionMenu.browser.test.tsx`、`src/__tests__/AppRouting.browser.test.tsx`、现有 Browser/E2E harness、queue/session 实现、package/config、项目及本地依赖文档 |

任务提交边界：D 为文档提交；R 为纯提取提交；B 为 F/C/S/P/H/L 汇合后的行为提交。R 与 B 分开是现行代码搬移和行为修改的提交约束，并非为测试通过制造中间兼容层。R 提取后立即删除旧局部定义，消费者直接引用唯一实现。

R 只搬移现有 `FailureDiagnosticModal`，保持 props、文案、variant、ARIA、滚动和交互不变，不顺便整理 import 或其他代码顺序。因路径变化产生的 Lingui references 在 B 的权威提取中统一更新；不为了中间提交额外维护旧路径。B 再调整语义及接入新消费者，不混入无关顺序整理。

## 实现内容

### 纯诊断展示边界

将既有 Modal 的展示组件提取到 `src/feedback/FailureDiagnosticModal.tsx`，保留 ReactNode 内容输入。它只拥有 Modal 组合、辅助查看入口、标题、关闭、换行、滚动和焦点行为；不接收会话/队列对象，不解析错误，不负责 retry，不复制错误状态。

行为修正阶段将入口设为 `secondary`，保留 `Modal.CloseTrigger`。调整 translator comments 使之适用于各失败上下文。新增 Browser 覆盖真实 DOM 的入口语义、诊断完整文本、Escape、焦点返回、长文本窄屏内部滚动及卸载清理。已有历史 Modal 场景继续保留，不以共享测试替换历史集成覆盖。

### 任务与全局反馈

CurrentTaskPage 保留现有分支、错误来源和重试调用。已有原始描述移入诊断 Modal，首屏采用与失败上下文一致的简明说明；禁止猜测网络或权限原因。加载失败的主要重试使用 `primary`，操作错误按原动作和上下文确定主次。恢复失败的裸段落改成 Alert。

同一失败的说明、恢复和诊断入口在同一反馈容器中组合，保持间距；用响应式布局让动作在窄屏换行，不将“右侧”写为固定要求。不要在两个响应式副本中复制有状态诊断 Modal。仅有全局集合失败时保留全局错误归属和当前页恢复能力，不为布局重复播报同一诊断。

AppShell 的全局连接/集合反馈首屏简明说明、详情按需显示，保留原有 hasTopNotice、错误键、数量与生命周期。错误严重性继续由 Alert status 表达，按钮不得因错误红色而使用破坏性 variant。

### 输入区与文案

保存失败使用主要恢复按钮，适当分隔描述与动作；已有 persistence error 的原始详情通过同一纯展示 Modal 查看。恢复暂停继续使用 warning；按钮改为 `Continue sending`，中文“继续发送”，保留其调用参数及禁用条件。Pending 入口继续承担查看，打开/关闭抽屉不调用 resumeRestored。

未知消息仍独立展示、仍不自动重发，删除本地记录保留 danger 和既有语义。不修改 ComposerPendingInputDrawer、队列列表、分页、排序或状态机。

测试必须保留对同文不同错误的独立身份、后台与前台隔离、全局与任务归属、恢复后错误清除及未知消息阻塞的约束。旧首屏原始文本断言改为：首屏简明反馈与正确入口存在，点击对应入口后完整诊断出现；不能仅删除旧断言。E2E 的旧恢复按钮名同步更新，并保留原发送次数/恢复次数断言。

## Lingui 生成边界

权威输入为 `lingui.config.ts` 的 `src`，排除配置中的截图和 trace 目录；sourceLocale=en，locales=en/zh-CN。权威入口是 `pnpm run messages:extract`，完整输出仅为 L 两个文件。不运行 clean，不改 locale、配置或锁文件。

所有新增或调整的源文案按 Lingui macro 与 translator context 规则处理。人工仅补充或修正本次文案对应的 en/zh-CN 翻译；不手工塑造 source references。首次提取后按 `#: / #. / msgid / msgstr / fuzzy / obsolete` 审查完整 diff，允许本次替换使旧按钮文案 obsolete，但不接受无关语义漂移。补充翻译后再次执行相同提取，比较两个 catalog 的稳定内容；references、comments、翻译和状态不再漂移才通过。

## 描述式执行 DAG

字段语义遵循 `delegating-micro-stages/references/execution-graph.md`。以下公共字段和节点表共同组成完整节点记录，不渲染成图形。

公共字段：

- `executionContext`：共享 `/Users/jiangsheng/cnb/codex`，branch=dev，index=`/Users/jiangsheng/cnb/codex/.git/index`；不创建隔离副本。R/B 是有提取产物依赖的任务；B 内各写集合可并行。
- `authorizationGate`：所有执行节点 pending；grantSource 为用户后续明确执行确认，执行前由 action-authorization 收紧为节点最小信封。只读计划核验已获当前请求授权，不能转为执行许可。
- `subdelegation=false`；除下述 B-H 的明确暂缓记录外，`deferralEvidence=无`。`replanTriggers`：目标、业务语义、授权、写集合、工具或生成边界失真；计划内失败按原契约新增有界修正节点，不自动结束任务或扩大范围。
- `resourceLocks`：节点 readSet 读锁、writeSet 写锁；源码按实际 canonical 文件计。运行格式化/生成/检查时禁止并发修改其输入。Git index 仅协调 owner 持写锁。Browser runner 使用 `codex-gui` 对应配置及其缓存/报告路径写锁；E2E 另占用实际 Vite 5173 服务和 Playwright 报告目录；Lingui 独占 L。使用 fnm 的运行状态属于命令固有副作用，禁止安装组件。
- `failureDomain`：本节点及消费其产物的传递后继，只有共享输入失效时才扩大；具体测试失败按受影响文件/场景定位。
- `verification`：编辑节点完成以稳定 diff 与交接审查为准；验证节点按下述命令和场景，实际收集目标且通过；不能用代理口头完成替代产物证据。
- `owner`：协调 owner 负责文档、R、生成、格式化、组合验证、stage/commit 和最终汇报；B 的 C、S、P、H 编辑节点可由最小信封子代理分别执行，F 由协调 owner 执行；独立审查由未修改对应产物的代理执行。
- `commandScope`：读取用 rg/cat/Git 本地查询；普通源码用 apply_patch，文件移动用 git mv；生成和检查仅下述核验入口。stage 精确路径，禁止强制；commit 创建独立本地提交，禁止 amend/远程。

| nodeId | taskBoundary / operationKind | hardPredecessors 与原因 | outcome；consumes / produces；completionEvidence | readSet / writeSet；stateEffects | estimatedCost |
| --- | --- | --- | --- | --- | --- |
| D-check | D / 审查 | 无；执行确认后初始节点 | 核对设计计划、分支和 ignore；产出文档差异检查证据 | D、Git 状态 / 无；只读 | 小 |
| D-stage | D / stage | D-check：消费已审查文档 | 只暂存 D；staged allowlist 一致 | D、index / index；暂存 | 小 |
| D-commit | D / commit | D-stage：消费已检查 staged diff | 创建文档提交；记录 commit id | index / Git 对象与分支；本地提交 | 小 |
| R-edit | R / 编辑 | D-commit：实施前文档提交门禁 | 无行为变化的 Modal 提取，旧定义删除；稳定 diff | R、设计 / R；源码编辑 | 小 |
| R-format | R / 格式化 | R-edit：消费完整提取结果 | 限定 R 文件格式化，确认无行为或无关顺序变化 | R / R | 小 |
| R-verify | R / 验证 | R-format：消费稳定提取结果 | formatter check、历史续接 Browser、lint、type-check 通过 | GUI 稳定源码与配置 / 固有检查产物；无修复 | 中 |
| R-stage | R / stage | R-verify：提取验证证据 | 精确暂存 R；检查无行为变化及 staged diff | R、index / index | 小 |
| R-commit | R / commit | R-stage：已审查暂存 | 独立纯提取 commit id | index / Git 对象与分支 | 小 |
| B-F | B / 编辑 | R-commit：唯一公共 Modal 已存在 | Modal 语义和直接 Browser 用例；稳定 diff | F、本地 Modal 文档 / F | 中 |
| B-C | B / 编辑 | R-commit：消费 Modal 接口 | 任务页反馈和归属回归；稳定 diff | C、公共 Modal 的已提交接口、session 只读 / C | 中 |
| B-S | B / 编辑 | R-commit：消费 Modal 接口 | 全局反馈接入；稳定 diff | S、公共 Modal 的已提交接口、collection 只读 / S | 小 |
| B-P | B / 编辑 | R-commit：消费 Modal 接口 | 保存和恢复反馈、独立查看覆盖；稳定 diff | P、公共 Modal 的已提交接口、queue/抽屉只读 / P | 中 |
| B-H | B / 编辑 | D-commit：只消费已确认展示契约，无 Modal 提取产物依赖 | 历史和 E2E 测试迁移，保留原覆盖；稳定 diff | H、已提交源及设计契约 / H | 中 |
| B-fanin | B / fan-in | B-F/C/S/P/H：全部稳定 diff | 汇合写集合，核对调用、文案和测试契约 | F/C/S/P/H / 无 | 小 |
| B-format | B / 格式化 | B-fanin：源不再并发修改 | 对本任务明确文件格式化并复查 diff | F/C/S/P/H / 同集合 | 小 |
| B-extract | B / 生成 | B-format：源引用稳定 | Lingui 首次提取的完整 L diff | src、Lingui 配置 / L | 小 |
| B-translate | B / 编辑 | B-extract：消费提取结果 | 按字段核对并补充本次 en/zh-CN 翻译；保存稳定内容供比较 | L、源文案 / L | 小 |
| B-reextract | B / 生成 | B-translate：消费已补充翻译 | 相同入口再次提取 | src、Lingui 配置、L / L | 小 |
| B-catalog-check | B / 验证 | B-reextract：消费二次产物 | 与补充翻译后内容比较，完整 L 稳定且无范围外语义漂移 | L、生成前后内容 / 无 | 小 |
| B-review | 无提交 / 审查 | B-catalog-check：完整稳定源码与 catalog | 独立审查目标保真、行为/搬移分离、恢复不变；问题列表或无阻塞证据 | B 全部 diff、设计 / 无 | 中 |
| B-L1 | B / 验证 | B-catalog-check：稳定组合状态 | formatter check、lint、type-check、Browser 和两组 E2E 通过 | GUI、测试配置 / 自动缓存及测试报告 | 中 |
| B-L2 | 无提交 / 验证 | B-catalog-check：稳定组合状态；运行时前提门禁 | 当前真实 GUI 反馈/Modal/队列入口验收记录，或精确未执行原因 | 当前 URL、真实运行时、B 稳定源 / 授权的无头浏览器运行状态 | 中 |
| B-stage | B / stage | B-review、B-L1：消费审查及自动回归证据 | 只暂存 F/C/S/P/H/L 实际变更；staged diff 检查 | B allowlist、index / index | 小 |
| B-commit | B / commit | B-stage：已审查暂存 | 创建独立行为提交；commit id | index / Git 对象与分支 | 小 |
| Final | 无提交 / fan-in | B-commit、B-L2：提交与真实验收终态 | 对照提交后的文件身份确认验证仍有效，报告完成或剩余 Level 2 阻塞 | 提交、验证证据、工作树 / 无 | 小 |

不允许生成与源码编辑同时运行。所有 stage 与 commit 分别执行；stage 后运行 `git diff --cached --check` 和 allowlist 审查，再允许 commit。

初始 ready set 在执行授权后只有 D-check；D-commit 是实现门禁，此后 R-edit 与 B-H 的硬依赖均已满足。R-commit 形成公共接口稳定产物后 fan-out 为 B-F/C/S/P。消费者可读取 R-commit 中稳定的 Modal 接口，不能在 B-F 写入时读取该可变文件。B 内各分支不是独立提交，避免共享 index 的多个提交 owner。全部编辑 fan-in 后生成；B-review/B-L1 可对同一不可变源码并行，B-L2 在真实 URL/状态可用且浏览器资源无冲突时启动。

B-H 的 `deferralEvidence`：提前迁移测试可缩短 B 的测试编辑分支，但 H 包含 R-verify 必须读取的 `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryDetailContinuation.browser.test.tsx`。共享工作树中先写入新行为断言会使“纯提取保持旧行为”的基线验证读到后续任务测试；一旦写入，即使释放文件锁，基线也已改变。为这次测试迁移另建 worktree 和独立 index、维护基线副本的协调成本抵消其提前编辑收益。因此只暂缓 B-H 到 R-commit，不将其伪装成产物硬依赖，也不阻塞其他独立分支。R-commit 完成即失效并重调度；若执行上下文变为已授权的独立副本，或证据确认 H 不再改变 R 验证输入，立即复查并解除暂缓。不得回滚测试或添加临时兼容断言维持基线。

预计关键路径为 D 提交、R 提取与验证提交、B 编辑最长分支、生成与组合验证、B 提交和真实验收汇合。Level 2 缺口不阻止 B 自动回归和代码提交，但阻止“完整验证完成”的声明。若真实验收引出代码修正，新增独立修正提交，失效并重跑受影响验证，不能 amend。最终完成以所有计划内修正后的状态为准。

## 验证入口与执行前预检

已只读核对 package scripts、CI consumer、Vitest/Playwright 配置及当前 fnm 工具。Node `v24.17.0`、pnpm `10.34.5`；pnpm 来自 fnm/Corepack 而非 Codex runtime shim；三浏览器所需缓存路径存在。执行前再次核验工具、cwd、输入和测试发现；不安装依赖或浏览器，不运行原生/Rust 构建。

以下 pnpm 命令 cwd 均为 `/Users/jiangsheng/cnb/codex/codex-gui`，使用 `/opt/homebrew/bin/fnm exec --using-file`。格式化以 CI 的 oxfmt 为权威，不双跑 Prettier；不触发仓库 `just fmt`。修改前读取目标目录实际适用 AGENTS；新增/改动翻译消息读取 Lingui 和 translator context skills。

```sh
/opt/homebrew/bin/fnm env --shell zsh
/opt/homebrew/bin/fnm exec --using-file pnpm --version
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

格式化修复使用 `/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write`，其后逐个传入 R 或 F/C/S/P/H 实际修改文件的精确路径。已通过本地 `oxfmt --help` 核对支持 `[PATH]...` 与 `--write`；项目 `format:oxfmt:fix` 固定包含 `.`，不能安全表达本次文件集合，因此采用同一权威 formatter 的直接文件入口，不在命令中使用占位符或省略路径。完成后审查 diff，并通过上面的非 fix 检查。计划不授权无关格式变更。

R-verify 运行已有历史续接文件；B-L1 运行以下精确 Browser 集合（三浏览器、无头、run 模式由现有配置提供）：

```sh
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel src/feedback/__tests__/FailureDiagnosticModal.browser.test.tsx src/__tests__/AppErrorPresentation.browser.test.tsx src/__tests__/AppShell.browser.test.tsx src/__tests__/AppMultiSessionIsolation.browser.test.tsx src/__tests__/AppRouting.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControlPersistence.browser.test.tsx src/features/threadHistory/__tests__/ThreadHistoryDetailContinuation.browser.test.tsx src/features/threadHistory/__tests__/ThreadHistoryDetailRead.browser.test.tsx src/features/appShell/__tests__/ActiveThreadCollectionMenu.browser.test.tsx
PLAYWRIGHT_HTML_OPEN=never /opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e e2e/persistence.spec.ts e2e/multiSession.spec.ts
```

E2E 配置启动或复用 Vite，运行前确认 5173 对应当前 checkout；不误用其他服务。两组 E2E 使用 mock WebSocket，属于 Level 1，不能称为真实 Codex 集成验证。记录实际收集文件、浏览器与最终通过数；不以零收集或成功启动替代测试通过。保留原有测试约束，只迁移因本次确认展示变化而改变的可见文本和交互路径。

Level 2 使用当前 `/gui` 或 outer `launch_gui` 返回的完整 URL，不猜测、拼接、复用旧 token；通过获授权的无头浏览器核实 headless 状态，再测试实际任务页/全局错误、诊断弹窗长文本/焦点/关闭、保存失败与恢复暂停提示以及 Pending 入口和继续发送的独立性。URL 不落入公开文件。仅在已有真实场景或授权内可安全形成场景时执行；不得为制造错误删除数据、修改用户任务或伪装 mock 为真实错误。缺少运行时、URL 或场景时按场景标记未执行，并继续无依赖工作。

Level 3 当前不适用，不打开可见浏览器、DevTools、报告或 trace viewer。

## 独立审查、失败处理与结束

计划落盘前由独立上下文核查范围保真、假依赖、生成集合、测试发现及遗漏消费者；修正稳定文档后才请求执行确认。执行记录由协调 owner 在当前线程维护节点状态、锁、失败、动态修正、提交和验证证据，不在执行中改写本计划，不额外创建过程文档。

失败先吸收为证据，定位最小失败域，继续计划内具体修正与验证；工具缺失时停止依赖动作并提供用户自行安装建议，助手不安装。禁止修改基线、降低检查或新增兼容路径。无关预存问题单独报告，不借机扩大目标。每次已提交代码的修正使用新的独立提交。

终态汇报文档/代码提交、修改范围、Level 1/2/3 结果及尚未完成项，并按执行图契约说明实际并行、关键路径和未启动 ready 节点的具体原因。只有任务、必要修正和最终验证全部满足设计时才宣告计划完成；此后不自行追加新的复审工作。
