# Codex GUI 历史预览与聊天界面 UI 一致性实施计划

计划状态：待确认，尚未执行

编制日期：2026-09-05

工作分支：`dev`

编制时 HEAD：`6ad99764cfd824784b8474e4f848ee658590e9ee`

设计依据：[已确认设计](../../../../specs/2026/09/05/2026-09-05-codex-gui-history-preview-chat-ui-consistency-design.md)。

## 目标与执行边界

落实已确认的紧凑顶栏、共同正文边界和底部卡片外观；保留返回入口、只读标识、二维码、继续任务流程及各自所需的高度和滚动避让。

本次请求仅授权编制并落盘计划。下述编辑、生成、格式化、验证、暂存与提交节点均等待用户确认计划并授权执行。不得提前执行实现节点。

执行时在当前 `/Users/jiangsheng/cnb/codex` 的 `dev` 工作树内完成一个行为修改任务；先创建独立文档提交，再创建行为修改提交。主代理为唯一 Git index 写入和本地提交 owner。不创建 worktree、分支，不执行远程操作、安装或后端构建，不修改 Rust 版本。

实现中的无行为顺序调整不属于行为提交；不安排纯重排任务，也不得为方便中间提交增加双读、同步桥接或临时兼容路径。需要修正已产生的提交时创建新的独立提交，禁止 amend 或 squash。

## 事实与影响面闭包

| 字段 | 当前证据与计划结论 |
| --- | --- |
| 权威入口 | `router.tsx` 的 `InnerWrap: DocumentTitleOwner` 覆盖顶栏和路由内容；历史详情由 `threadHistoryDetailOwner.ts` 唯一读取并校验 threadId；聊天沿用 runtime 来源 |
| 已追踪链路 | ready thread → `ThreadHistoryDetailContent` → 标题 fact 注册与清理 → `DocumentTitleOwner` 按路由 threadId 选择 → 浏览器标题。顶栏增加同一事实的只读消费者；底部保持 `ContinueTaskAction` 高度测量、占位及激活结果分支 |
| 修改范围 | 标题 fact 与顶栏、详情标题区、页面宽度/间距、底部卡片基础样式，以及直接覆盖这些行为的测试和 catalog 定位元数据 |
| 验证映射 | `AppRouting` 覆盖生产挂载与标题生命周期；`AppShellTopBar` 覆盖导航；详情 Read/Continuation 覆盖只读和激活失败；新增跨路由布局测试及既有 composer viewport 覆盖几何和遮挡 |
| 排除项 | 保留历史列表布局和标题；`AppShell.browser.test.tsx` 的固定历史间距断言实际针对列表，不因本任务删除。共用正文 renderer、历史请求与恢复 owner、Rust、协议生成器及 DTO 不修改 |
| 剩余未知 | 具体像素和窄屏最终几何需 Level 1/2 测量；当前有效完整 GUI URL 与真实运行状态需在执行阶段取得，缺失只阻塞 Level 2 及完整验收声明。当前不以截图地址代替运行入口 |

### 标题实现边界

现有 `HistoryDetailDocumentTitleFactPublisher` 发布 `formatTaskDocumentTitle` 结果，其中包含浏览器标签后缀与 grapheme 截断。应改为发布完整展示标题：取详情现有 `resolveThreadHistoryPresentation(...).title`，保留既有注册身份、effect cleanup 和 threadId 过滤。

`DocumentTitleOwner` 在写入 `document.title` 时调用已有 `formatDocumentTitle`，保持浏览器标签的规范化、长度与后缀契约；向顶栏暴露当前历史详情标题的只读 context/hook。不得从 `document.title` 反向解析标题，也不得另建同步状态、历史请求或历史 owner。

顶栏为历史详情显示任务名、返回历史入口和只读标识；加载/错误且没有 ready fact 时显示既有本地化 `History detail`。列表继续显示 `History`，聊天保留 runtime/threadId 匹配。详情正文移除原大标题区，保留加载、空态、错误与重试内容。

返回和菜单使用 HeroUI `Button` 次要操作语义；只读标识用紧凑非交互文字，优先保证窄屏下可见。任务名使用一个页面主标题、完整可访问名称及 CSS 截断，不使用浏览器标签的字符串截断作为 UI 截断。保持菜单入口和返回目的地。

### 布局实现边界

在 `index.css` 声明作用域明确的正文宽度与底部卡片基础样式，仅由历史详情和当前任务消费；不改变 `.app-shell-content-boundary` 对历史列表及公共提示区域的既有含义。

使详情与聊天的有效正文左右边界及顶部节奏相同。具体由详情容器、当前任务正文容器和专用 CSS 协调，不修改消息 renderer。布局样式避免重复配置同一宽度或额外叠加横向 padding。

预览底部采用 HeroUI `Surface` 的 `default` 组合，复用聊天面板的圆角、基础背景、边界、阴影和外侧间距规则。当前面板基于 field 语义 token；只共享基础外观，将输入专属 focus、hover、disabled 状态保留在 composer。继续按钮保留 `primary`，二维码及失败反馈复用原组件。

保留继续操作区较矮的内容高度，允许失败提示自然增高。优先保持现有 fixed 定位、测量和占位机制，仅调整外层透明间距与内部卡片；聊天保留 sticky 定位。移除预览横贯窗口的背景和分隔线时不得移除正文避让，也不得保留透明外层遮挡正文点击的区域。

## 修改集合与生成边界

下列集合是任务写入边界；文件名以仓库相对路径为准。

### T：标题与导航

- `codex-gui/src/features/documentTitle/DocumentTitleOwner.tsx`
- `codex-gui/src/features/appShell/AppShellTopBar.tsx`
- `codex-gui/src/features/threadHistory/ThreadHistoryDetailContent.tsx`
- `codex-gui/src/features/appShell/__tests__/AppShellTopBar.browser.test.tsx`
- `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryDetailRead.browser.test.tsx`
- `codex-gui/src/features/threadHistory/__tests__/threadHistoryDetailBrowserHarness.tsx`
- `codex-gui/src/__tests__/AppRouting.browser.test.tsx`

优先在现有 owner 内提供读取能力；若 React refresh/lint 要求独立模块，可在 `features/documentTitle/` 新建窄 context/hook 模块并直接切换消费者，仍只保留一套 fact 注册。该新模块属于 T，不扩大到通用状态基础设施。

### L：正文与底部布局

- `codex-gui/src/index.css`
- `codex-gui/src/features/threadHistory/ThreadHistoryDetailPage.tsx`
- `codex-gui/src/features/threadHistory/ContinueTaskAction.tsx`
- `codex-gui/src/features/currentTask/CurrentTaskPage.tsx`
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryDetailContinuation.browser.test.tsx`
- 新建 `codex-gui/src/__tests__/HistoryPreviewChatLayout.browser.test.tsx`

布局新测试在真实 App/router 测试宿主下比较两路，不依赖 T 将修改的详情局部 harness。T、L 不并发读取对方正在写入的内容；所需既有接口以开始前只读快照为基准，编辑汇合后再验证组合状态。公共 CSS 由 L 唯一写入，标题所需样式在 T 文件内表达。

### G：Lingui catalog

权威配置是 `codex-gui/lingui.config.ts`：source locale 为 `en`，输入 `src`，排除截图，完整输出集合仅为 `codex-gui/src/locales/en.po` 与 `codex-gui/src/locales/zh-CN.po`。

移动既有 `Back to history`、`Read-only history` 等消息后运行 `messages:extract`，保留消息语义和翻译。默认复用既有消息，不新增文案；仅当可访问名称确需本目标内消息时，允许在两个 locale 内补充对应翻译与准确的 translator comment，并按适用 Lingui skills 核验。

审查完整 catalog diff，分别核对 source references、translator comments、msgid、msgstr、fuzzy/obsolete。只接受可由当前源解释且二次 extraction 稳定的元数据变化；不手工回写旧 references，不使用 clean extraction 清理非目标消息。未知语义漂移或边界外生成暂停 catalog 后继。

若 extraction 审查发现需要补写源码 translator comment，返回其 T/L 编辑 owner 建立修正节点，再经过格式化与 extraction；G 节点本身不写源码，最终稳定性必须针对最后一次源码修改后的结果。

## 验证入口与环境预检

本次已只读核验 `package.json`、Browser configs、`.github/workflows/codex-gui.yml`、Lingui config、formatter 帮助及本地文档。CI 的格式化 owner 是 oxfmt，Browser parallel/sequential 均经共享配置强制 `headless: true`。本地 Node 为 v24.17.0、pnpm 为 10.34.5，pnpm 位于 fnm installation；Playwright 1.62.1 可调用且浏览器缓存存在。执行前仍须验证实际 binary 和目标输入，不把缓存目录存在当作浏览器可运行证据。

本地 HeroUI source 的 React/styles 均为 3.2.4，与锁文件一致；`Surface` 文档与源码支持上述组合。Vitest headless 文档来自本地 `/Users/jiangsheng/cnb/vitest/docs`。使用 `codex-gui-toolchain`、`heroui-react`、`vitest-react-browser-docs` 和 Lingui catalog owner 的适用规则，不安装任何缺失项。

以下命令均在 `/Users/jiangsheng/cnb/codex/codex-gui` 执行，且仅在计划获准执行后运行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/documentTitle/__tests__/documentTitle.test.ts src/features/threadHistory/__tests__/threadHistoryDetailOwner.test.ts src/features/threadHistory/__tests__/threadHistoryPresentation.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel --run src/__tests__/AppRouting.browser.test.tsx src/__tests__/AppShell.browser.test.tsx src/__tests__/HistoryPreviewChatLayout.browser.test.tsx src/features/appShell/__tests__/AppShellTopBar.browser.test.tsx src/features/threadHistory/__tests__/ThreadHistoryDetailRead.browser.test.tsx src/features/threadHistory/__tests__/ThreadHistoryDetailContinuation.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:sequential --run src/__tests__/sequential/composer-viewport.browser.test.tsx
```

extraction 在人工审查/补充后重复运行，比较完整两个 catalog 的内容，证明同输入稳定。parallel 命令应在 Chromium、Firefox、WebKit 中实际收集上述文件；sequential 命令应实际收集 composer viewport 文件。不得把零测试、选错配置或某个项目未执行称为通过。

格式化修复限定 T/L 中实际变更的支持文件，使用现有 oxfmt 工具的显式文件参数。`format:oxfmt:fix` 脚本固定扫描 `.`，无法限定范围，因此使用 `/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write` 后附逐一核实的实际文件路径，不运行全目录 fix；随后使用非 fix 入口检查。不运行第二套 formatter 或根级 `just fmt`。自动 import 排序若产生纯位置调整，必须隔离为独立提交，不混入行为提交。

### 场景与成功条件

| 验证范围 | 必须覆盖的结果 |
| --- | --- |
| 标题生命周期 | loading→ready、错误/重试、X→Y 路由切换、卸载/StrictMode、空标题；不得显示上一任务标题，不增加 readThread 或 attach 次数 |
| 标题与导航 | 顶栏主标题唯一；长标题完整可访问名称和视觉截断；浏览器标签继续规范化及截断；返回、菜单、历史导航归属正常 |
| 共同几何 | 相同任务的预览与聊天正文、底部卡片左右对齐；紧凑顶部间距；窄屏无横向溢出，按钮与只读标识可见 |
| 底部与滚动 | 短/长正文、长错误、诊断展开、卡片增高、页面底部；最后消息可见可操作，键盘焦点不被遮挡，透明外层不阻挡页面点击 |
| 既有行为 | pending 单次激活、不可用、失败/重试、二维码对应预览线程；聊天输入和 composer viewport 不回归；历史列表间距断言继续有效 |

Level 1 为上述自动化；Level 2 必须使用执行时取得的当前完整 GUI URL 与真实任务，在无头模式核验同任务两路的布局、导航、焦点、滚动和继续操作。实施完成后先取得可消费当前前端源码的运行入口，不能拿旧部署验证新代码。不存在可用运行入口时，等待用户提供/启动所需 runtime；助手不构建后端，不复用截图地址，不擅自操作用户可见窗口或已有 Vite 进程。

Level 2 的确切命令由当前入口及 browser owner 的执行预检确定，URL 中 token 不写入普通报告或代码。Level 3 预计不适用，若发现可见桌面依赖则单独确认。计划阶段未执行测试或浏览器验收。

## 描述式执行 DAG

节点采用下列公共字段与逐节点记录合并后的完整语义；未覆盖的能力默认禁止。schema 与调度规则遵循 `delegating-micro-stages/references/execution-graph.md`，能力信封遵循 `action-authorization/references/capability-envelope.md`。

### 公共字段

- `executionContext`：工作树 `/Users/jiangsheng/cnb/codex`，branch `dev`，唯一共享 index `/Users/jiangsheng/cnb/codex/.git/index`。不创建隔离工作树，因为并行编辑属于同一个行为任务且 T/L 写集合不相交。
- `authorizationGate`：当前全部执行节点为 pending；用户明确授权执行后，由主代理按节点动作/集合形成最小信封，禁止只根据本计划存在就标 active。
- `subdelegation`：false；主代理可按本计划委派 T、L 编辑及独立审查，子代理不得继续委派、生成、格式化、stage 或 commit。
- `owner`：除显式指定编辑与独立审查 owner 外，均为主代理；Git index 始终只有主代理写入。
- `readSet`：各节点 consumes 对应集合、适用配置/skills/AGENTS；源码验证可读取整个 `codex-gui`。不得读写范围外私有状态。
- `resourceLocks`：文件按 canonical 路径区分读/写；`.git/index` 在 stage/commit 时独占写；catalog 两文件在 G 时独占写；formatter 不与编辑/生成并发；Browser runner 与真实浏览器会话各自独占，parallel/sequential 两个 Browser 命令不重叠；read/read 检查可并发。
- `estimatedCost`：下表给粗粒度分钟估计，仅辅助关键路径调度，不设终止预算；`deferralEvidence` 初始为空，不因编号或同属仓库制造串行。
- `verification`：由下表 completionEvidence 和前述入口共同定义；只读证据不能冒充测试结果。
- `failureDomain`：该节点产物及其实际消费者；不相交分支继续。`replanTriggers`：授权/目标/产品语义改变、实际读写相交、生成边界失真或未知入口；计划内缺陷插入诊断/修正/复验节点，不降低标准。

### 节点记录

| nodeId / taskBoundary / operationKind | hardPredecessors 与原因 | outcome；consumes → produces；completionEvidence | writeSet / stateEffects / commandScope / owner / estimatedCost |
| --- | --- | --- | --- |
| D-stage / 文档 / stage | 执行授权与当次预检：确认分支、文件内容、无无关已暂存内容 | 已确认设计与计划 → 精确文档 staged diff；只有这两个文件且 staged diff check 通过 | 两份文档的 index entries；`git add --` 精确两文件、`git diff --cached --check`；主代理；1 |
| D-commit / 文档 / commit | D-stage：消费已审查的 staged 内容 | 文档 staged diff → 独立本地文档 commit id；提交文件集合准确 | Git index/objects/当前 branch ref；`git commit -m` 文档消息；主代理；1 |
| T-edit / UI / 编辑 | D-commit：文档提交门禁 | 标题链路与已确认设计 → T 修改；返回精确 diff 和符号/断言映射，待组合验证 | T；普通源码 patch；标题编辑 owner；15–25 |
| L-edit / UI / 编辑 | D-commit：文档提交门禁 | 现有布局与已确认设计 → L 修改；返回精确 diff 和几何/失败反馈断言映射，待组合验证 | L；普通源码 patch；布局编辑 owner；20–30 |
| E-join / UI / fan-in | T-edit、L-edit：消费完整编辑产物 | T+L → 可验证组合快照；无冲突标记、写范围正确、接口直接接通 | 无文件写入；只读 diff/检索；主代理；3 |
| F-format / UI / 格式化 | E-join：格式化消费完整源 | T/L → 格式化稳定源码快照；非 fix 检查及 diff 范围正确 | 实际变更的 T/L 支持文件；上述限定 oxfmt 命令；主代理；2–5 |
| G-extract / UI / 生成 | F-format：catalog references 消费最终源码位置 | 格式化源码快照+Lingui config → 两个 catalog 稳定结果；完整字段审查与二次相同 | G；`messages:extract` 及仅计划内翻译补充；主代理；3–8 |
| V-static / UI / 验证 | G-extract：稳定最终源码和 catalog | 组合快照 → lint、type-check、unit 证据；全部实际目标通过 | 仅工具内部缓存/测试产物；前述 lint/type-check/unit/format 非 fix 命令；主代理调度；5–12 |
| V-browser / UI / 验证 | G-extract：稳定最终源码和 catalog | 组合快照 → Level 1 三浏览器证据；先 parallel 后 sequential，目标收集正确 | 工具内部测试产物；前述两个 Browser 脚本；主代理调度；8–20 |
| R-review / UI / 审查 | G-extract：审查不可变组合快照，不读在写 diff | 设计、计划、完整 diff → 独立检查记录；覆盖生命周期、功能边界、生成链与无豁免 | 无写入；只读源码与 diff；未参与编辑的审查 owner；5–10 |
| V-runtime / UI / 验证 | G-extract 及当前真实入口：只有最终源码被运行入口消费才能证明 Level 2 | 当前源码+真实线程 → 场景观测；headless 身份、两路状态及适用场景完整 | 已授权独立 headless 会话和验收产物；按 browser owner 的当次预检；主代理；10–20 |
| V-join / UI / fan-in | V-static、V-browser、R-review、V-runtime：消费组合质量证据 | 全部适用验证 → 验收结论；问题均修正且受影响证据已更新 | 无写入；只读证据审查；主代理；3 |
| UI-stage / UI / stage | V-join：只提交完整通过的当前任务产物 | T/L/G 精确 diff → 行为 staged diff；无非行为重排、无范围外文件，staged check 通过 | 本任务实际文件的 index entries；`git add --` 精确路径及 staged diff 检查；主代理；2 |
| UI-commit / UI / commit | UI-stage：消费已核实 staged 内容 | 行为 staged diff → 独立 UI commit id；文件集合/最终状态与已验证快照一致 | Git index/objects/当前 branch ref；`git commit -m` 行为消息；主代理；1 |

任何声明的编辑 diff 只是 E-join 的输入，不等于功能验证通过。命令执行记录中的自动缓存/日志遵循能力信封对程序内部副作用的边界，不授权后续主动清理。

### 调度与提交拓扑

初始 ready set 为授权满足后的 D-stage。D-commit 成功后 T-edit 与 L-edit 同时 ready，可由两个边界明确的编辑子代理在同一行为任务内并行完成；没有彼此依赖。

fan-in 为 E-join，之后 F-format 和 G-extract 消费各自前驱的稳定产物。必须先格式化源码再 extraction，避免格式化改变源码位置后 catalog references 失效。G-extract 完成后 V-static、V-browser、R-review 同时 ready；V-runtime 只额外等待真实运行入口，不等待其他无数据依赖的验证。若真实运行与 Browser 回归存在经核验的实际资源争用，用资源锁调度，不以“都是浏览器”虚构硬依赖。

预计关键路径为文档提交、T/L 中较慢分支、格式化/生成、最慢适用验证、V-join 与行为提交。任务提交拓扑仅含文档提交和一个组合行为提交；各编辑节点不单独提交，不为提交制造临时兼容层。

最终源码 fan-in 在 E-join，最终验证 fan-in 在 V-join；UI-commit 后核实 commit 文件与已验证工作树一致及状态即可，不无依据重复整套测试。若验证后有修正，失效对应验证并按消费者重跑，已有提交上的修正创建新提交。

当前计划不包含落盘执行日志文件，主代理在会话中维护节点状态、事件、锁、提交身份、失败域和动态节点，不回写本计划。若需额外持久日志，另行取得文档写入授权。

## 失败、预存问题与完成条件

计划内失败先记录具体证据，再补有界诊断和修正节点，继续不相交工作。禁止通过跳过、放宽断言、静默 fallback、删除覆盖或修改基线使检查通过。

发现测试已因历史列表等其他改动失配时，核实是否属于本任务引入；不能借本计划修复无关功能，也不能把未完成的组合验证报为通过。工具缺失不得安装，后端需更新时由用户构建；当前 URL 缺失只挂起 V-runtime 及其完成声明，其他节点继续。

完成要求：设计全部落地，最终只有一套标题 fact 与一条消息渲染路径，所有适用验证与独立审查闭环，文档和行为形成各自本地提交，最终工作树只保留可说明的范围外既有状态。Level 1、Level 2、Level 3 分别记录实际结果；Level 2 未执行时不得声称完整验收。

执行终态按执行图 owner 简报实际并行、关键路径、未启动 ready 节点及原因。当前仅编制计划，不执行上述节点。
