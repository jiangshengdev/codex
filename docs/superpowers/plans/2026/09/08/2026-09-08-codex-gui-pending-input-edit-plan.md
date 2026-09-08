# Codex GUI 待发送编辑丢失修复实施计划

日期：2026-09-08。

状态：设计已确认，计划按用户请求落盘，待确认执行。本文不表示代码已修改或验证已完成。

设计：[待发送编辑丢失修复设计](../../../../specs/2026/09/08/2026-09-08-codex-gui-pending-input-edit-design.md)。

问题：QR-B03-001。代码调查基线：`db69543ca`，当前分支 `dev`。计划编写时仅设计文档未跟踪；执行前重新核对状态与基线。

## 目标与边界

正常回复刷新不使待发送编辑失效；真实目标或会话失效仍拒绝保存，但保留本次修改供复制或主动丢弃。关闭编辑面板前，对未保存修改确认丢弃。保持主输入框草稿独立，不增加跨刷新恢复、自动重试、自动发送或草稿恢复入口。

只处理 QR-B03-001。保持队列身份、位置、原消息恢复、单次清理、未知投递及恢复暂停约束。既有检查不能通过豁免、静默兜底或删除覆盖来绕过。

本计划确认执行后，先独立提交设计与计划，再实施、验证并创建行为提交。任何针对已有提交的修正创建新提交；不 amend，不将非行为重排混入行为提交。禁止 Git 远程操作、安装组件、后端构建及可见桌面窗口。本计划不创建 worktree，不修改分支或 workspace 版本。

## 计划前证据闭包

以下源码路径以 `codex-gui/` 为基准。

| 字段 | 已核验结论 |
| --- | --- |
| 权威入口 | `src/App.tsx` 挂载 `AppShell → Outlet`；`CurrentTaskPage.tsx` 挂载 `ComposerTurnControl`；待发送入口经 `ComposerPendingInputRegion`、`ComposerPendingInputDrawer` 调用 `composerPendingInputSession`。 |
| 已追踪链路 | `liveActiveThreadSession.beginPendingInputEdit` 捕获展示 revision，普通 delta 经 `publishTransition` 推进 revision；保存失败取消子 reservation。队列管理拥有目标失效，UI session 的失败与 reconcile 路径清空 edit。Composer 卸载又调用 session.dispose。 |
| 修改范围 | live session 编辑门禁；待发送 session、editor、drawer 的内容保留及关闭语义；App 内稳定挂载与入口接线；相应测试及两种 locale 的 catalog。详见写集合。 |
| 验证映射 | live session 与 queue management 单测验证有效性及结算；pending session 单测验证失败和关闭状态；Browser 验证真实父挂载链、交互和旧 owner 隔离；静态检查与 Lingui 双次提取验证契约和生成物。 |
| 排除项 | queue 已提供目标及 reservation 管理，本次不修改其生产实现；不修改后端或协议生成源。主 Composer 草稿已有独立 owner，不将失败内容写入该草稿。CurrentTaskPage 的正常生命周期保持，通过稳定外层面板承接内容。 |
| 剩余未知 | 当前完整 GUI URL、真实运行时是否加载本次前端、可操作的安全验收线程需执行时取得；这是 Level 2 的运行前提，不影响代码方案。未进行测试或 GUI 验收。若有效路由切换实际卸载 App，必须补齐挂载边界，不能跳过该回归。 |

独立反向审计已经完成，补入：独立挂载 Composer 的测试消费者、trigger 与 overlay 分离、失去原焦点目标后的处理、旧 owner 生命周期通知及延迟注销隔离。

## 实现方案

### 编辑门禁

保留开始编辑时对当前请求 revision 的校验。取得 reservation 后，不再用展示 revision 判断长期编辑有效性；继续核验会话终止、投影可用性及生命周期身份，实际目标和 reservation 结算继续由队列 owner 判断。

修改只针对 pending-edit capability，不全局放宽 `operationUnavailable`，不影响释放、删除、移动或其他能力。清理仍只执行一次；迟到操作的错误原因按当前权威状态返回。

现有单测接受“普通 delta 后 stale 并恢复原文”，应替换为同一场景保存成功及内容、身份、位置断言，并另保留真正失效后的拒绝、原文恢复和单次清理覆盖。这是修正与已确认目标冲突的行为断言，不是弱化检查。

### 稳定的编辑 owner 与面板

在 `AppCapabilitiesProvider` 内、`Outlet` 外挂载唯一的 `ComposerPendingInputProvider`。它拥有既有待发送 session 与稳定 overlay，从开始编辑就位于该挂载点；不得失效后才迁移已经卸载的编辑器。

`ComposerTurnControl` 不再创建或销毁另一份待发送 session；仅连接当前 facts、主输入焦点目标及待发送入口。`ComposerPendingInputRegion` 保留原位置的入口与队列反馈。Drawer 的 trigger 和 overlay 分开，页内入口卸载不等于关闭 overlay。

当前有效 owner 的 facts 持续更新，不能把最后一帧 snapshot 冻结成永久可用能力。绑定使用原 owner 身份及注册代次；旧组件延迟注销不得清除新绑定。原 consumer 确实离开或 owner 不可用时，结束旧可写连接并保留内容，不能让另一个会话的 queue、skills、mutationsEnabled 或回调接管旧编辑。失效内容展示不再依赖可用 composerRole。

`composerPendingInputSession` 是编辑语义的唯一 owner：区分可编辑、失效内容保留、关闭确认及关闭；内容与 reservation 分开持有。使用现有 `ComposerDraftCapture`/`ComposerDraft` 权威类型，保持编辑器内部序列化细节私有，不手写平行 DTO 或持久化 schema。

成功保存结算编辑；空输入等可修正错误保留可编辑状态；真正失效保留内容并禁止保存。复制使用保留内容的文本投影，失败明确反馈并继续保留内容，不能显示虚假复制成功。可选择文本手动复制，不将剪贴板可用性变成保留内容的前提。

关闭请求统一进入 session：关闭按钮、Escape、遮罩，以及应用内离开导致的关闭请求均先判断未保存修改。返回继续查看原编辑，明确丢弃才释放内容。正常未改动编辑关闭沿用取消语义，不制造不必要确认。

应用内已支持路线发生切换时，旧 overlay 保持挂载并请求关闭确认；返回指返回旧编辑面板，不撤销已经完成的导航。关闭后只聚焦仍存在的目标；不得调用已卸载 Composer 或把旧焦点 effect 指向新任务。Provider 提供稳定可聚焦目标作为原触发点不存在时的返回位置。

稳定范围为 App 存活期间的正常有效路由、会话替换和会话失效。根路由错误或未知地址导致整个 App 退出、浏览器刷新及程序退出不属于持久化恢复能力；不声称能够跨这些边界保存内容。必须通过真实父链测试证明正常有效路线转换不会误入 App 卸载路径。

### HeroUI 与翻译

沿用 `Drawer` 的受控打开状态、`Alert` 的 warning 失败提示。关闭确认采用 `AlertDialog`：返回使用 `Button variant="secondary"`，明确丢弃使用 `variant="danger"`；正常保存保留 `primary`，复制使用 `secondary`。使用 `bg-field`、`text-field-foreground`、separator 和现有 surface token，不新增任意颜色。

确认框标题与正文描述“修改尚未保存”，避免误称原队列消息会被删除。确认框默认不因 Escape/遮罩执行丢弃；返回应恢复到保留内容或编辑器。新增及修改消息使用现有 Lingui 宏，短文案添加适当 translator comment。

本地 HeroUI 源码与安装版本均为 3.2.4，已读本地 Drawer、AlertDialog 文档及 AlertDialog 实现。具体 DOM/ARIA、焦点与嵌套 overlay 行为在 Browser 验证，不由文档代替。

## 读写集合

以下集合也是执行能力的上限。普通源码新增或编辑可使用 patch；不手工生成 catalog、schema、锁文件或格式化结果。

### W1：门禁分支

- `src/features/activeThreadSession/liveActiveThreadSession.ts`
- `src/features/activeThreadSession/__tests__/liveActiveThreadSession.test.ts`
- `src/features/composerInputQueue/__tests__/composerInputQueueManagement.test.ts`
- `src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorManagementLifecycle.test.ts`

后两文件仅在缺少本次负向回归时补充，不修改 queue 生产行为。

### W2：编辑生命周期与交互分支

- `src/App.tsx`
- `src/features/composerTurnControl/ComposerPendingInputProvider.tsx`（新增）
- `src/features/composerTurnControl/ComposerTurnControl.tsx`
- `src/features/composerTurnControl/ComposerPendingInputRegion.tsx`
- `src/features/composerTurnControl/ComposerPendingInputDrawer.tsx`
- `src/features/composerTurnControl/ComposerPendingInputEditorAdapter.tsx`
- `src/features/composerTurnControl/ComposerPendingInputEditor.tsx`
- `src/features/composerTurnControl/composerPendingInputSession.ts`
- `src/features/composerTurnControl/__tests__/composerPendingInputSession.test.ts`
- `src/features/composerTurnControl/__tests__/ComposerPendingInputProvider.browser.test.tsx`（新增）
- `src/features/composerTurnControl/__tests__/ComposerPendingInputEditorAdapter.browser.test.tsx`
- `src/features/composerTurnControl/__tests__/ComposerTurnControlPendingInput.browser.test.tsx`
- `src/features/composerTurnControl/__tests__/ComposerTurnControlPendingInputReordering.browser.test.tsx`
- `src/features/composerTurnControl/__tests__/ComposerTurnControlCompaction.browser.test.tsx`
- `src/features/composerTurnControl/__tests__/composerTurnControlBrowserTestSupport.tsx`
- `src/features/composerTurnControl/__tests__/composerTurnControlPendingInputBrowserTestSupport.tsx`
- `src/__tests__/sequential/composer-viewport.browser.test.tsx`
- `src/__tests__/sequential/composerPendingInputCopy.browser.test.tsx`（新增，实际剪贴板测试）
- `src/__tests__/AppPendingInputRecovery.browser.test.tsx`（新增，真实 App 挂载链）

共享测试支撑直接接入生产 provider，不新增仅为旧消费者继续工作的兼容 provider 或两份 session。既有测试文件按实际受影响入口修改，不能机械改写无关断言。

### G：完整生成物边界

`lingui.config.ts` 的 source include 是 `src`，source locale 为 `en`，locales 为 `en`、`zh-CN`；排除 screenshots/traces。权威入口为 `pnpm run messages:extract`，完整写集：

- `src/locales/en.po`
- `src/locales/zh-CN.po`

人工补充仅限本次文案的翻译及必要翻译注释；`#:` 定位由生成器维护。审查两个文件的完整 diff，区分 refs、translator comments、msgid、msgstr、fuzzy/obsolete；非本目标语义漂移不得接受。补齐翻译后再次同入口提取，比较两轮内容身份，须无新增 diff。禁止用 clean 提取或手改行号塑造 diff。

### D：文档及运行记录

- 本计划与已确认设计：仅作为实施前文档提交输入，执行中不回写权威正文。
- `docs/superpowers/reports/2026/09/08/2026-09-08-codex-gui-pending-input-edit-execution.md`：执行时创建，由协调 owner 独占写入事件、提交、失败及验证证据。

允许只读：上述文件的生产调用方、契约、`CurrentTaskPage.tsx`、`routerComponents.tsx`、`guiRouteTarget.ts`、App 测试支撑、相关投影 fixtures、项目配置和本地依赖文档。合法投影负载必须使用共享 builders；若缺少所需合法变体，扩展 `src/features/projection/__tests__/projectionTestBuilders.ts`，由协调 owner 串行管理该共享写集，使用者等待其稳定产物。

不修改 `CurrentTaskPage`、导航按钮、router 或 queue 生产源码。新证据确实需要超出上述边界时，先更新授权与计划判断，不能借实现机制名义自行扩大。

## 验证入口与预检

命令 cwd 为 `/Users/jiangsheng/cnb/codex/codex-gui`，Git 命令 cwd 为仓库根。已核对 package scripts、unit/browser configs 和 `.github/workflows/codex-gui.yml`：unit 排除 Browser 测试，parallel Browser 包含非 sequential 文件，sequential 使用独立入口；共享配置明确 `headless: true`，三引擎为 Chromium、Firefox、WebKit。

本轮只读工具预检：fnm 可用，Node `v24.17.0`，pnpm `10.34.5`，pnpm 来自 fnm 的 Node 安装目录；Playwright CLI 存在，Playwright 1.62.1 对应浏览器缓存目录存在。目录存在不等于启动成功，执行前仍核验实际目标与工具。任何必要组件缺失，由用户安装，助手不得安装。

使用 `/opt/homebrew/bin/fnm env --shell zsh` 核对环境，并使用 `/opt/homebrew/bin/fnm exec --using-file pnpm ...`，不执行 eval。计划落盘阶段不运行下列验证。

### Level 1

1. unit：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/activeThreadSession/__tests__/liveActiveThreadSession.test.ts src/features/composerInputQueue/__tests__/composerInputQueueManagement.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorManagementLifecycle.test.ts src/features/composerTurnControl/__tests__/composerPendingInputSession.test.ts
```

2. 组合 Browser：共享 provider 影响所有独立 Composer 测试，运行该 feature 的 Browser 集合，并覆盖 App 父链与已有多会话隔离：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel src/features/composerTurnControl src/__tests__/AppPendingInputRecovery.browser.test.tsx src/__tests__/AppMultiSessionIsolation.browser.test.tsx src/__tests__/AppActiveThreadSession.browser.test.tsx src/__tests__/smoke/AppComposerQueue.smoke.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:sequential src/__tests__/sequential/composer-viewport.browser.test.tsx src/__tests__/sequential/composerPendingInputCopy.browser.test.tsx
```

两条 Browser 命令分别记录结果；第一条失败不能被描述为第二条也已运行。按真实收集到的文件和测试数量判定命中，不用零测试成功代替验证。实际剪贴板只由 sequential 节点占用，parallel 测试通过注入或 stub 验证复制调用与失败反馈。

3. 静态与格式：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
```

实施前记录 format 非 fix 基线，代码完成后用现有 `format:oxfmt:fix` 入口生成格式结果，再用 `format:oxfmt` 验证。现有 fix 脚本包含 `.`，不是逐文件入口：只有已确认基线通过且无范围外并发修改时运行，并检查完整 diff，确保实际变化仅落在写集；存在范围外基线问题时暂停 formatter 并重新核验有界入口，禁止手工模拟格式化。纯前端/文档不运行 `just fmt`。

翻译使用同一 fnm 入口执行 `pnpm run messages:extract` 两轮。协议没有变化，不新增协议生成或 Rust 验证任务。

### 行为验收矩阵

| 场景 | 成功条件 | 证据入口 |
| --- | --- | --- |
| 一般 delta | 保存成功，新内容写入原消息，身份/位置保持 | live unit、pending Browser、App 父链 |
| 真实目标失效 | 拒绝旧写入，原消息恢复/既有目标结算有效，清理一次 | queue/live unit |
| disposed/projectionUnavailable | 面板仍显示修改，可复制/丢弃，保存不可用 | session unit、App 父链 |
| 未保存关闭 | 关闭按钮、Escape、遮罩先确认；返回保留，丢弃才关闭 | pending Browser |
| 有效路由转换 | 当前任务、历史、新任务、另一个任务间切换不意外销毁旧内容 | App 父链、多会话 Browser |
| 旧 owner 异步清理 | 不重绑新 facts，不取消新 owner，不复活失效保存 | provider Browser、session unit |
| 主草稿与焦点 | 主草稿不变；返回确认回原内容；关闭不聚焦已卸载或错误任务对象 | pending/provider/App Browser |
| 复制 | 实际文本与修改一致；复制拒绝仍保留内容且反馈准确 | sequential copy、parallel 失败 stub |
| 既有编辑 | 空输入保留；取消、移动、队列恢复、独立 Composer 挂载无回归 | unit、feature Browser、viewport |

### Level 2

必须验证当前真实 Codex 运行时与本次前端组合。执行时取得当前完整 GUI URL，保留 route、thread 与 token，不拼接或复用历史 URL；确认页面加载的前端确实对应本次工作树。只使用已可用后端，不构建或重启用户后端。

在用户提供或明确授权的安全测试任务中，验证：真实输出期间编辑待发送消息并保存；未保存修改的关闭确认与复制；可安全构造的原 owner 失效及应用内切换。不得对用户已有任务注入故障或为了造数据发送未授权消息。普通输出、真实失效必须分别记结果。

使用无头入口并确认实际 session 的非 headed 状态。启动本地前端服务如确有必要，仅在该节点预检后运行现有 `pnpm run dev`，记录进程和源码身份；仍需证明真实 GUI URL 实际使用本次前端，不能用另一个模拟页面代替。

当前 URL、运行时、前端绑定或安全状态缺失时，只将对应场景标记未执行，继续 Level 1、审查和本地代码提交，不宣称完全验证。精确运行目标和副作用需要独立授权时，仅等待该节点。真实剪贴板验收按用户本次授权判断，不默认覆盖其桌面剪贴板。

### Level 3

本任务不依赖系统窗口、IME 或跨应用焦点，不适用。不启动可见浏览器或 DevTools。

## 描述式执行 DAG

本节采用节点记录与继承字段表达 DAG，不渲染图形。执行期读取 `$delegating-micro-stages` 执行图契约，运行状态写入执行记录，不改本计划正文。

### 共同字段与能力信封

所有节点继承以下字段，再以表中声明收窄：

- `executionContext`：`/Users/jiangsheng/cnb/codex` 当前 `dev` 工作树，Git index canonical identity 由执行前 `git rev-parse --git-path index` 解析；没有新 worktree 或分支。所有任务本地集成于此。
- `authorizationGate`：当前 `pending`；只有用户确认执行计划后，中央授权 owner 按节点形成 `active` 能力信封。DAG 本身不授予执行权限。
- 信封 `objective` 为 QR-B03-001；`phase` 为 implementation；`grantSource` 为后续计划执行确认；`grantedOperation`、`allowedOperations`、`parameterBounds` 来自节点 operationKind、commandScope 和下列集合；`canonicalTargets` 为仓库根加具体路径；`specialApprovals=[]`、`requiredApprovalIds=[]`，Level 2 的额外目标授权另记录。
- `subdelegation=false`；子代理不得再委派。`lifecycle` 为节点产物返回后到期；越界、目标身份变化或新工具需求触发返回。负面约束为本文目标与禁止动作。
- `estimatedCost` 用小/中/大表达协调预估，不用于缩减验证或停止工作。`deferralEvidence=null`；资源冲突按真实锁调度，不制造依赖。
- `readSet` 默认为节点 consumes 指定的稳定产物及适用规则；编辑节点只读其分支文件、现有共享契约和调用证据，不读取其他正在修改分支。`writeSet` 表中给出；未列出的主动写操作禁止。
- `stateEffects`：编辑只改 writeSet；生成只写 G；验证仅产生程序内部缓存/测试产物；stage 只写 index；commit 写本地 Git 对象/分支；审查不改文件。运行记录由主代理按事件串行写入 D 的执行记录。
- `resourceLocks`：源码路径按 canonical 路径读/写；index 由主代理写独占；Lingui 读取全部 `codex-gui/src`、写两份 catalog；格式化器写独占 `codex-gui`；unit/Browser/type-check 使用的 TypeScript build info 及测试缓存按实际配置核验，同一底层资源写冲突时串行；sequential copy 独占实际剪贴板，不能与 Level 2 复制场景重叠。
- `failureDomain` 默认为本节点及实际消费其产物的后继；`replanTriggers` 为基线漂移、范围或契约证据不成立、需要新授权或改变产品行为。计划内测试失败触发诊断/修正/重验证节点，不默认终止。

### 节点记录

`verification` 与 `completionEvidence` 在同一列记载。每个节点只有一种 operationKind。taskBoundary 为 D0（设计计划提交）、D1（行为提交）、D2（执行记录提交）或无提交。

| nodeId / taskBoundary / owner | operationKind / estimatedCost | hardPredecessors：原因；consumes | outcome / produces | writeSet / commandScope | verification / completionEvidence |
| --- | --- | --- | --- | --- | --- |
| P / 无 / 主代理 | 调查 / 小 | 无；已确认计划与当前树 | 工具、基线、ignore、index、写集及 formatter 基线记录 | 无；本地只读命令和上述非 fix 预检 | 分支、实际状态、工具及精确文件可执行；无覆盖冲突 |
| DS / D0 / 主代理 | stage / 小 | P；设计与计划内容 | 仅两份文档的 staged diff | index；`git add --` 精确两文件、`git diff --cached --check` | staged allowlist 精确匹配，无 ignore 强制 |
| DC / D0 / 主代理 | commit / 小 | DS；已审查 staged 文档 | 独立文档 commit | Git 对象/分支；普通 `git commit` | commit SHA、文件清单匹配 |
| E1 / D1 / 门禁子代理 | 编辑 / 中 | DC；已提交约束及现有契约 | 门禁修正与正负向单测源码 | W1；普通源码 patch、只读核对 | 返回完整 diff 身份及场景映射，不声称测试已通过 |
| E2 / D1 / 主代理 | 编辑 / 大 | DC；已提交设计及现有契约 | 唯一稳定 owner、内容保留、关闭确认、测试入口 | W2；普通源码 patch、只读核对 | 旧本地 session 创建/销毁路径删除，完整消费者接线 |
| G1 / D1 / 主代理 | 生成 / 小 | E1、E2；稳定全部 src，Lingui 扫描包含测试源码 | 第一轮 catalogs | G；`messages:extract` | 全量字段分类 diff 与来源记录 |
| GT / D1 / 主代理 | 编辑 / 小 | G1；新消息 | 本次 en/zh-CN 翻译完成 | G 人工翻译边界；普通文本 patch | 既有翻译和 placeholder 保持 |
| G2 / D1 / 主代理 | 生成 / 小 | GT；已补充翻译 | 二次稳定 catalogs | G；同一 `messages:extract` | 两轮内容比较稳定，无非目标语义漂移 |
| F / D1 / 主代理 | 格式化 / 小 | E1、E2、G2；完整源码与 catalogs | 组合稳定 diff | W1/W2/G 实际格式变化；已预检 fix 入口 | 全量 diff 在范围内，非 fix 通过；记录稳定文件身份 |
| U / D1 / 主代理 | 验证 / 中 | F；组合稳定树 | unit 结果 | 无主动源码写；Level 1 unit 命令 | 命中指定文件且通过，含类型检查结果 |
| B / D1 / Browser 子代理 | 验证 / 大 | F；组合稳定树 | parallel 及 sequential Browser 结果 | 无主动源码写；两条指定 Browser 命令 | 三引擎目标命中、关闭/生命周期/复制/焦点场景通过 |
| Q / D1 / 主代理 | 验证 / 中 | F；组合稳定树 | type-check/lint/format 证据 | 无主动源码写；上述三个非 fix 入口 | 全部通过，不以零目标或跳过替代 |
| R / D1 / 独立审查子代理 | 审查 / 中 | F；稳定完整 diff、设计与验收矩阵 | 独立反向复核 | 无；本地只读源码与 diff | 无未处理的计划内缺陷，覆盖 owner/卸载/契约/旧路径删除 |
| L / 无 / 主代理 | 验证 / 中 | F；本次前端及获授权真实 URL/任务 | Level 2 分场景结果 | 仅已授权测试任务和浏览器运行状态；无头工具、必要前端 dev | 当前 runtime、前端身份及每场景结果；缺前提明确未执行 |
| S / D1 / 主代理 | stage / 小 | U、B、Q、R；组合验证稳定结果 | 精确行为 staged diff | index；`git add --` 实际 W1/W2/G、staged check | 无无关路径、重排、临时兼容或未提交计划内修正 |
| C / D1 / 主代理 | commit / 小 | S；已验证 staged diff | 独立行为 commit | Git 对象/分支；普通 `git commit` | SHA 与内容身份对应；若提交后需修正另建提交 |
| H / 无 / 主代理 | fan-in / 小 | C、L；最终代码及场景状态 | 最终完成或验收缺口判断 | 无；只读核对与对话结果 | 所有计划内修正与验证已闭合；L 未执行时不得报完全验证 |
| ES / D2 / 主代理 | stage / 小 | H；完整执行记录 | 执行记录 staged diff | index、D 执行记录；精确 add/staged check | 无 token/私密 URL 外泄；实际结果与记录一致 |
| EC / D2 / 主代理 | commit / 小 | ES；已审查记录 | 独立执行记录 commit | Git 对象/分支；普通 `git commit` | SHA 与记录路径；最终 status 无遗漏任务变更 |

G1 等待 E1 是真实输入依赖：Lingui 的 source include 为整个 src，E1 的 TypeScript 与测试文件也在扫描范围；不能在可变输入上提取。生成与格式化由唯一 Git owner 执行。

初始 ready set 在执行确认后为 `{P}`；文档 commit 完成后为 `{E1,E2}`，两者同属 D1、写集不相交，可在共享工作树并行。它们不是两个需独立 worktree 的提交任务。根因与 UI 使用现有权威契约，互不等待新接口。

F 后 `{U,B,Q,R,L}` 可同时成为 ready；真实缓存、TypeScript build info、剪贴板及运行时锁决定何者实际运行。read/read 审查可重叠；有写冲突的验证保持 ready 等锁，不插入伪依赖。执行时记录实测冲突，资源释放立即重算；不能按阶段编号形成全局等待。

关键路径预计为 `P → DS → DC → E2 → G1 → GT → G2 → F → B → S → C → H → ES → EC`；E1 与 E2 汇合，U/Q/R 与 B 汇合到 S。Level 2 条件已具备时与自动化独立推进；缺前提只阻其完成声明，不阻代码提交。若需计划内修正，插入有界节点并重验失效证据，不要求每个中间提交独自满足整个计划。

## 执行记录、失败与终态

执行记录由主代理唯一写入，记录 nodeId、开始/完成、锁、稳定产物、失败输出、动态修正、提交身份及各级验收。子代理仅返回结果，不写共享日志或 index。

当前输入不变时不盲目重试。验证发现计划内问题，继续诊断、修正及必要重验证；不得改基线、删覆盖或放宽断言。工具缺失、实际范围越界、需要真实任务或特殊动作授权时，仅暂停相关节点。所有有界可行路径完成或有正面阻塞证据后再报告。

最终报告列出文档/行为/记录提交、实际修改与验证、Level 1/2/3 各自状态，并包含实际并行、关键路径、未启动 ready 节点及原因。所有任务和计划内修正合并后的最终状态满足设计才算实现完成；Level 2 缺失时明确验收未完成。全部完成后结束本轮，不自行开启新一轮审查或扩展工作。
