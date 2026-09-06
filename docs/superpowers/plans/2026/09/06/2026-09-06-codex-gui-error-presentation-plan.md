# Codex GUI 错误展示归属与任务菜单实施计划

日期：2026-09-06

状态：计划已落盘，等待用户确认执行；不代表已经授权产品修改或执行本计划中的提交。

基线：`dev`，`c83dfed63`；编制时仅本次设计文档未跟踪。执行前重新核验工作树，保留所有范围外变更。

设计：[错误展示归属与任务菜单设计](../../../../specs/2026/09/06/2026-09-06-codex-gui-error-presentation-design.md)。

## 1. 目标与硬边界

落实已确认设计：全局展示连接／鉴权／集合错误，任务页展示单任务错误；菜单任务项只显示标题（无标题时 UUID）、异常红点和更多操作下拉，移出操作保留原安全门禁；同一次失败不重复显示详情，独立失败不丢失。

不修复正文 `retryError` 通用提示覆盖原始详情，不处理底层 `no rollout found`，不改 Rust、协议、依赖、锁文件、配置和存储格式，不增加自动重连、自动重发、新建任务或强制移出。移除菜单重试时必须迁移现有能力，不能顺带删除恢复入口。

仅在当前 checkout、`dev` 执行；不创建 worktree 或分支。不操作 remote，不 amend，不强制暂存 ignore 文件。所有有头窗口均不在本计划授权内。

## 2. 纵向证据闭包

| 字段 | 已核验依据与计划结论 |
| --- | --- |
| 权威入口 | `src/App.tsx` 挂载 Bridge、路由同步和 AppShell；`guiHostClient.ts` 拥有握手与连接状态，`activeThreadSession.ts` 拥有集合及成员生命周期 |
| 已追踪链路 | commands ready 创建集合；activate/retry/remove 发布成员与集合快照；Bridge 把首次激活错误写入全局状态；AppShell、CurrentTaskPage、historyList/detail、菜单消费这些状态。断连 dispose 集合，不能虚构逐会话连接失败 |
| 修改范围 | 状态归属与错误投影、App 能力接线、全局和正文展示、菜单结构与红点、直接依赖的测试 fixture、翻译 catalog；具体集合见第 4 节 |
| 验证映射 | unit 覆盖错误归属和生命周期；App Browser 覆盖同屏组合与路由；菜单 Browser 覆盖 Drawer 内下拉、焦点和安全移出；multiSession E2E 覆盖刷新与并行任务；真实 runtime 无头验收覆盖最终 UI |
| 排除项 | 合法协议 payload 继续消费已有 `@codex-protocol/v2` 和共享 builders；没有协议字段变更，因此不改生成 validators/schema。会话持久化格式、安全释放与 Composer 恢复业务逻辑沿用现状；只验证不重写 |
| 剩余未知 | 实施后的当次真实 GUI URL、实际加载资产和可安全验收的任务状态需在 Level 2 前取得；不影响代码方案与 Level 1，缺失时不得宣称真实集成已验证。当前没有需用户新增产品选择的关键未知 |

独立反向审计纳入两个已核验遗漏：`removeMember` 的 selection/membership 保存失败目前仅写 `member.error`；菜单 Retry 还支持 ready + statusUnknown。不能只搬运 `collection.error`，也不能删除菜单 Retry 后让后者失去入口。

## 3. 实现约定

### 3.1 错误来源与恢复

- 连接状态只来自连接生命周期；去掉首次 activation failure/warning 对连接状态的写入，消除 `activeThreadStartupError` 的重复展示 owner，迁移所有生产及测试消费者。
- 在既有会话集合 owner 中补齐必要的错误归属信息；公开类型由 `activeThreadSessionCollectionContracts.ts` 唯一拥有。状态中记录实际操作来源和所属任务，展示及红点从该权威状态派生，不另存去重列表或已读状态。
- 枚举并覆盖集合读取、成员加入保存、查看项保存、移出 selection 保存、移出 membership 保存；这些失败归全局，不能由于当前代码将其存为 member.error 而误归单任务。
- resume/attach、任务清理及 detach 失败归所属任务；主体和 cleanupError 都保留。失败的移出操作不能在关闭菜单后失去错误详情。操作被安全门禁拒绝不是一个新的底层失败；禁用项提供无障碍原因，不在任务行增加说明。
- 菜单原先承接的导航 rejection、remove thrown error 也必须按操作来源交给既有页面／会话错误边界，不静默丢弃，不为展示后台失败而强制导航。blocked/unavailable 通过最新能力状态表达，不伪装为新的任务失败；真实异常应有可访问的详情去向。
- 显示归属变化不改变 reservation、detach 确认、成员保留和重试调用的业务语义。任务页承接原菜单具有的状态查询重试入口，包括 ready + statusUnknown，调用既有 retry；不修改已排除的通用 retryError 优先级。
- 全局集合提示直接来自活状态；成功清除仅清除相应操作已经解决的异常，其他会话的成功不得清除未解决异常。正常重新请求的 loading 不应残留首次错误，晚到旧实例结果不得覆盖新状态。
- 当前任务及历史页面不复制全局错误详情；独立的历史读取失败、任务错误和清理失败仍显示。页面缺少上下文时可以保留功能受限说明及既有恢复路径。

### 3.2 菜单与红点

- 任务标题直接取会话 name；无有效标题使用 threadId，删除 preview 回退。不显示状态文字、当前查看文字、错误段落、重试、移出说明及阻塞说明。
- `ButtonGroup` 中标题入口负责切换，独立图标按钮打开 `Dropdown`，下拉包含“移出列表”。使用现有图标依赖，不引入参考代码中的图标包或远程头像。
- 保持原生无障碍当前项、独立按钮名称、键盘可达和禁用原因。更多操作不得触发标题导航；下拉 Escape 应先关闭下拉，再由 Drawer 自己处理关闭与焦点恢复。
- `Badge.Anchor` + `Badge color="danger" size="sm"` 用于入口和异常任务项；不显示数量。全局集合异常只点亮入口，不点亮全部任务。
- 红点从现有异常状态派生：成员失败及未解决操作错误、投影不可用、会话持久化错误、明确的任务 systemError，以及消息失败／结果未知的恢复状态。正常 initializing、removalPending、普通运行／空闲、等待用户或审批、单纯 restoredPaused 不自动算异常；不能复用状态文案或“非 idle”作为错误判断。
- 无错误但状态暂未可用不虚构错误；仍保留其状态查询恢复能力和移出限制。历史 transcript 中已经结束的失败不建立新的通知状态。
- 已有 Composer／投影错误的详情仍由其现有任务页组件负责，不新增第二张卡。全局真实连接失败可点亮入口摘要，但不伪造逐任务失败。

HeroUI 本地源码 `/Users/jiangsheng/cnb/heroui` 与安装的 react/styles 均为 `3.2.4`。已核验本地 badge、button-group、dropdown 文档及对应源码支持组合 API、disabledKeys/onAction；详细 DOM 行为用 Browser 验证。样式使用组件 variant 与 danger/separator 等语义 token。

## 4. 精确工作集合

以下路径均相对 `codex-gui/`；目录集合只允许与上述行为直接相关的文件，不授权相邻重构。

| 集合 | 写范围 | 原因 |
| --- | --- | --- |
| S-owner | `src/features/activeThreadSession/activeThreadSession.ts`、`activeThreadSessionCollectionContracts.ts`、该目录 `__tests__` 中直接对应集合/生命周期测试及 harness | 错误归属、移出失败及恢复状态；不改持久格式 |
| S-page | `src/App.tsx`；`src/features/appShell/AppCapabilities.ts`、`GuiHostConnectionBridge.tsx`、`AppShell.tsx`；`src/features/currentTask/CurrentTaskPage.tsx`；`src/features/threadHistory/ThreadHistoryListPage.tsx`、`ThreadHistoryDetailPage.tsx`、`ThreadHistoryDetailContent.tsx` | 删除重复启动 owner、呈现全局错误、任务详情和受限页面；承接恢复入口 |
| S-menu | `src/features/appShell/ActiveThreadCollectionMenu.tsx`、`AppShellTopBar.tsx`、`activeThreadCollectionMessages.ts`；可新增同目录 `activeThreadCollectionPresentation.ts` | 紧凑任务行、异常派生与更多操作；展示 helper 不拥有业务状态 |
| S-tests | `src/__tests__/AppShell.browser.test.tsx`、`AppActiveThreadSession.browser.test.tsx`、`AppRouting.browser.test.tsx`；`src/features/appShell/__tests__`、`src/features/threadHistory/__tests__` 中受影响测试/能力 fixture；`src/__tests__/sequential` 中受影响导航测试；可新增 `src/__tests__/AppErrorPresentation.browser.test.tsx` 和展示 helper unit test | 组合去重、路由、状态恢复、菜单与无障碍回归 |
| S-e2e | `e2e/multiSession.spec.ts`、`e2e/multiSessionHarness.ts`；`e2e/persistence.spec.ts` 中直接依赖菜单定位的断言 | 最终多会话与恢复路径；保持既有覆盖，不改协议语义 |
| S-i18n | `src/locales/en.po`、`src/locales/zh-CN.po` | 新增可见／无障碍文案和删除旧菜单文案的 extraction 结果 |

只读范围包含以上调用链、现有协议/fixture、Composer 与 projection 的公开状态、package/config/CI、适用 AGENTS 与本地组件文档。不得修改 Rust、协议生成物、依赖、锁文件、构建配置或项目外资源。

文档集合 D：本计划和关联设计；执行记录可由主代理在 `docs/superpowers/research/2026/09/06/2026-09-06-codex-gui-error-presentation-execution.md` 创建并维护，仅用于本计划执行记录，不强制提交 ignore 文件，不回写计划作为动态日志。

## 5. 描述式 DAG 与提交边界

节点字段按 `$delegating-micro-stages/references/execution-graph.md` 展开。以下公共字段与节点表合并构成每个节点的完整定义，不用表格顺序制造依赖。

公共字段：`executionContext` 为 `/Users/jiangsheng/cnb/codex`、分支 dev、共享 `.git/index`，无 worktree；`subdelegation=false`；`deferralEvidence=无`；`authorizationGate.status=pending`，来源为用户后续对本计划的明确执行确认，届时由 action-authorization 为节点收紧只读/编辑/验证/Git 能力；`replanTriggers` 为范围外文件、产品语义变化、存储／协议变化、工具缺失或证据失效。普通计划内失败按执行图新增诊断、修正与复验节点，不扩大目标。

`owner` 默认主代理，独立审查节点交由只读子代理。主代理唯一拥有格式化、生成、runner、浏览器、执行记录、stage 和 commit；编辑子代理只获得指定写集合，禁止 Git。`readSet` 为节点所消费的第 4 节集合及直接证据；`writeSet` 为节点 produces 指定文件，验证／审查无源码写入；`commandScope` 为限定 read、普通源码 apply_patch 或第 6 节相应固化命令；Git 仅使用 status/diff/add/commit。`stateEffects` 为指定文件编辑、正常测试产物或明确提交，不含其他动作。

`resourceLocks`：编辑对自身第 4 节绝对文件集合 write，验证对组合源码 read 并独占当前 package runner，生成对两个绝对 catalog write，格式化对本轮源码/catalog write；所有 Git 节点独占 `/Users/jiangsheng/cnb/codex/.git/index`。真实浏览器只锁本次创建的无头会话。不同锁和不相交写集合可并行；不改变用户已有进程或浏览器。

`failureDomain` 默认该节点及消费其产物的传递后继；一个支线失败不阻塞独立支线。`verification` 与 `completionEvidence` 为节点表中的可观察证据，不能用代理口头完成代替。

| nodeId / taskBoundary / operationKind | hardPredecessors 与原因 | consumes / produces / outcome | completionEvidence / verification | estimatedCost |
| --- | --- | --- | --- | --- |
| D / C-doc / commit | 执行确认；先固化已确认文档 | D 文件 / 独立设计计划提交 | 精确 staged diff、whitespace 检查和 commit id | 短 |
| R / C-ui / 编辑 | D，依赖已提交设计计划 | 旧行为和设计 / S-tests、S-owner 中正式回归测试 | 测试覆盖本次明确症状，等待 R-red 验证 | 中 |
| R-red / 无 / 验证 | R，测试为稳定输入 | 新测试、旧生产代码 / 预期失败证据 | 定向 unit/Browser 实际命中重复详情及菜单旧行为；工具错误不算红 | 短 |
| O / C-ui / 编辑 | R-red，保留修复前证据 | S-owner / 权威错误归属与公开合同 | 定向 owner 测试通过、明确合同及 diff；解锁 UI 消费者 | 中 |
| P / C-ui / 编辑 | O，消费稳定错误合同 | S-page / 全局与页面接线、迁移 fixture | 不再复制启动错误，独立错误与恢复入口保留 | 中 |
| M / C-ui / 编辑 | O，消费稳定错误合同 | S-menu / 菜单结构及红点 | 标题/UUID、更多移出和红点规则；不写 S-page | 中 |
| T / C-ui / 编辑 | P、M，依赖最终组合界面 | S-tests / 完整回归断言与 fixture 调整 | 保留安全、焦点、恢复覆盖；无放宽断言 | 中 |
| E / C-e2e / 编辑 | P、M，依赖最终交互合同 | S-e2e / 多会话错误与下拉 E2E | 三引擎用例可收集，等待 V | 中 |
| G / C-ui / 生成 | T，源码文案稳定 | S-page/S-menu/S-tests / S-i18n extraction | 完整 catalog diff 已分类 | 短 |
| L / C-ui / 编辑 | G，依赖生成消息 | S-i18n / 精确中英文翻译补充 | 无新增缺译或意外既有译文变化 | 短 |
| G2 / C-ui / 生成 | L，检验人工补充稳定 | S-i18n / 重复 extraction | 两次结果稳定，不接受无法解释 drift | 短 |
| F / C-ui、C-e2e / 格式化 | G2、E，避免覆盖仍在写入的文件 | 本轮文件 / 官方格式化输出 | 实际 diff 仅本轮范围，非 fix 检查通过 | 短 |
| V / 无 / 验证 | F，读取组合稳定状态 | 最终源码与测试 / Level 1、静态检查证据 | 第 6 节全部所需检查通过、实际收集数量明确 | 中 |
| Q / 无 / 审查 | F，审查同一稳定 diff；可与 V 并行 | 最终源码及设计 / 独立审查结果 | 无未解决设计、实现或覆盖发现 | 中 |
| C1 / C-ui / commit | V、Q，完整行为已核验 | S-owner/S-page/S-menu/S-tests/S-i18n / 行为提交 | 精确 staged diff 和 commit id | 短 |
| C2 / C-e2e / commit | C1，测试提交依赖最终行为提交 | S-e2e / E2E 提交 | 精确 staged diff 和 commit id | 短 |
| H / 无 / 验证 | F，另需当次真实环境输入；可与独立审查并行 | 最终资产和真实任务 / Level 2 证据 | 第 6 节真实场景通过或精确标记未执行 | 中 |
| Z / 无 / fan-in | C2、V、Q、H 的结果，所有计划内修正闭环 | 提交及验证结果 / 最终交付 | 工作树范围核对、验证层级和实际调度摘要 | 短 |

初始 ready set 在执行授权后为 D。关键路径预计为 D、R、R-red、O、P/M、T、G/L/G2、F、V/Q、C1、C2、Z；H 的环境准备可能成为实际关键路径。

P 与 M 的生产写集合不相交，可由边界明确的两个子代理并行；T 与 E 可在 UI 合同稳定后并行。只有共享公共合同 O 是硬前置，不因同属一仓库串行化它们。Q 与 V 可并行读取稳定状态。生成、格式化和测试不得读取正在变更的共享输入。

若 R 所在 fixture 与消费者迁移发生编辑冲突，由主代理负责该公共测试文件，子代理只报告所需改动；不因此增加 worktree。测试新增 fixture 必须复用现有协议 builders。

形成三个本地提交：C-doc、C-ui、C-e2e。允许中间提交尚未完全集成，不增加双读双写或临时 adapter；最终组合状态决定完成。已有提交的修正形成新的独立提交，禁止 amend。没有纯位置重排任务，行为提交不得夹带无关 import/声明/函数顺序调整。

## 6. 验证入口与生成边界

所有 pnpm 命令 cwd 为 `/Users/jiangsheng/cnb/codex/codex-gui`，使用 `/opt/homebrew/bin/fnm exec --using-file pnpm`。编制时已确认 fnm 可用、pnpm 为 `10.34.5`，HeroUI 版本匹配；fnm 按 package engines 解析环境，无需创建版本文件。执行前重新检查工具与实际目标，不安装任何依赖或浏览器。

package.json 的 `ci` 以 oxfmt、lint、type-check、unit 和 browser smoke 为固化链，CI 的独立 Browser job 调用完整 Browser 入口。这里按受影响范围使用同一 scripts，不绕过为直接 runner。Browser 配置和 Playwright 配置均 headless，Browser 覆盖 Chromium、Firefox、WebKit。

以下命令前均加上述 fnm 前缀：

```text
pnpm run test:unit src/features/activeThreadSession src/features/appShell src/features/sessionCollection src/features/browserLaunch
pnpm run test:browser:parallel src/__tests__/App src/features/appShell src/features/currentTask src/features/threadHistory src/__tests__/smoke
pnpm run test:browser:sequential src/__tests__/sequential
pnpm run protocol:check-validators
pnpm run type-check
pnpm run lint
pnpm run format:oxfmt
```

R-red 只选择本轮新增的测试文件或用例；V 使用上述最终组合范围。验证失败后按受影响证据复验，已通过且未失效的检查不重复扩大。运行后的实际收集数和结果必须记录，零目标不算通过。

E2E 使用已核验的本地 Vite 启动／复用配置：

```sh
PLAYWRIGHT_HTML_OPEN=never /opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e e2e/multiSession.spec.ts e2e/persistence.spec.ts
```

复用前核对 5173 服务来源；不杀用户服务，不自动打开报告。有端口冲突或工具缺失时只暂停受影响验证，不修改配置或安装组件。

格式化以 `pnpm run format:oxfmt:fix` 为权威入口。现有脚本显式包含 `.`，执行前确认可安全限定范围；若无法限定且工作树存在范围外需格式化内容，停止该全目录 fix，按工具链确认安全等价入口后再执行，禁止手写格式化补丁。纯前端/文档不触发根级 `just fmt`。

Lingui 输入为 `lingui.config.ts` 定义的 src，输出全集仅 `src/locales/en.po` 和 `src/locales/zh-CN.po`。G/G2 使用 `pnpm run messages:extract`，不使用 clean。允许人工补充新消息译文及必要翻译注释；生成 metadata 由 extraction 拥有，不手工模拟。审查完整 diff 后重复 extraction，要求稳定；新增 locale、配置或输出边界变化即停止对应后继。

Level 1 核心断言：同一错误详情在整个 App 只出现一次；多个独立错误仍可访问；失败目标尚无成员时集合错误可见；selection/membership/detach 失败分别有归属和恢复位置；新旧实例晚到结果不串线；菜单关闭时入口红点、展开后对应行红点；无标题 UUID 且不退回 preview；更多操作点击不导航；禁用移出不能执行；Escape、焦点恢复、窄菜单容器下长标题及下拉可达；单纯刷新暂停不点亮异常；恢复一个任务不清除另一个异常。

Level 2：实施后取得当次完整 GUI URL、前端源码／资产加载证据及至少两个可安全操作的专用会话，默认无头验证首次失败仅一次详情、后台异常定位、菜单下拉、安全移出、切换与恢复清除。不得拼接或复用历史 token；不为制造故障停止后端或破坏存储，无法安全准备的真实失败场景标记未执行，由 Level 1 覆盖不等于真实验收通过。缺少真实输入时继续所有无依赖工作和已授权提交，仅保留 H 与最终完整验证声明待完成。

Level 3 不适用。不能把测试环境 E2E 当成真实 runtime 验收，也不能在 H 未执行时宣布本计划全部验证完成。

## 7. 完成与授权

用户确认执行后，先独立提交本次设计和计划，再进入正式回归测试及产品实现。当前“计划落盘”仅授权创建本文；本轮不运行产品测试、格式化、生成、stage 或 commit。

完成标准为所有任务最终合并状态符合设计、所需检查和计划内修正闭环、提交身份明确。终态报告区分 Level 1 / Level 2 / Level 3，并按执行图记录实际并行、关键路径、未启动 ready 节点及原因。执行记录由主代理唯一维护，不把历史设计或计划改成动态日志；任务完成后不自行开启新一轮修复。
