# Codex GUI 历史界面紧凑卡片与日期分组实施计划

计划状态：待确认，尚未执行

日期：2026-09-05

执行目录：`/Users/jiangsheng/cnb/codex`

执行分支：`dev`

核验时 HEAD：`48b7475b9e8b6eef92aa0f8ff546238687706807`

关联设计：[已确认设计](../../../../specs/2026/09/05/2026-09-05-codex-gui-history-compact-cards-date-groups-design.md)

## 目标与授权边界

实现已确认的四项设计：按本地日期分组的响应式紧凑多列卡片；今天、昨天和更早日期标题；标题及摘要各最多两行；整卡导航与可见“查看”提示。

本轮只编写计划。用户确认本计划后，执行范围包含：先独立提交本次设计与计划，再完成下述源码、测试、本地化、验证及本地任务提交。未确认前不暂存、不提交、不实现。

采用当前 checkout 的 `dev`，不创建 worktree 或分支，不进行远程操作。既有未跟踪 `history-layout-comparison.html` 是对比示意，不进入文档或代码提交，不清理。其他后来出现的无关变更同样保留。执行前重新核验分支、HEAD 和精确文件状态；若用户已改变工作上下文，先按实际冲突收敛范围。

不修改 Rust、协议、路由定义、历史 owner 或其他页面。不安装依赖，不启动后端构建，不启动可见窗口。`codex-rs/Cargo.toml` 版本约束保持原样。

## 当前证据与实现选择

- 页面入口：`codex-gui/src/features/threadHistory/ThreadHistoryListPage.tsx`。
- 当前列表 owner 已按 `recency_at` 降序请求并保留分页返回顺序；展示时间取 `recencyAt ?? updatedAt`。分组只是展示派生，继续使用权威 `Thread` 类型。
- `Card.Content` 默认纵向伸展，当前 `justify-between` 分散时间与状态；去除独立伸展区域，重新组合文字区和紧凑底部。
- 现有 `resolveThreadHistoryPresentation` 保持唯一标题摘要规则，不清洗用户原文。
- 使用 TanStack Router 的 `Link`、`HISTORY_DETAIL_ROUTE_PATH` 和 `params.threadId`，整卡只保留一个导航入口。当前根路由拒绝 query，已有测试明确要求 `search = {}`、`hash = ""`，不能复活旧设计的 `search: true`。
- 卡片可保留语义 `article` 外壳，由真正链接承担整个可见 Card 表面。按本地 Card 文档使用 `@heroui/styles` 的 Card 样式和 `Card.Header`、`Card.Title`、`Card.Description`、`Card.Footer` 组合；禁止嵌套交互控件。底部“查看”为文字提示。
- 日期组使用语义 section 与标题，组内保留 1/2/3 列拓扑。组键由本地年月日产生，标签独立格式化；不能用 UTC 字符串截取或固定 24 小时减法判断昨天。
- 日期派生集中在历史 feature 的小型纯函数中，输入直接使用 `Thread` 或其机械派生类型；格式器遵循当前 locale。日期标签在页面渲染时按当前本地日期计算，本次不引入后台计时器。
- 同一天追加到已有组，保留组内原顺序和 ID；不引入第二套持久状态、前端重新排序或兼容路径。

### HeroUI 组件与样式语义

Card 使用 default 层级；状态使用现有 soft Chip，systemError 使用 danger；分页保持 secondary Button；错误保持 danger Alert。使用 surface、foreground、muted、圆角和间距语义 token，以及明确的 focus-visible 样式。真实链接与日期 section 承担导航和文档语义，属于设计允许的语义元素，不引入自制按钮。

## 文件边界

| 集合 | 文件与用途 |
| --- | --- |
| D | 本次设计 Markdown 与本计划 Markdown，只用于实施前文档提交 |
| S | `codex-gui/src/features/threadHistory/ThreadHistoryListPage.tsx`：日期区块、卡片密度、整卡链接 |
| H | 新建 `codex-gui/src/features/threadHistory/threadHistoryDateGroups.ts`：本地自然日与分组派生 |
| U | 新建 `codex-gui/src/features/threadHistory/__tests__/threadHistoryDateGroups.test.ts`：时间边界与分组契约 |
| B | `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx`：更新并扩展现有界面行为覆盖 |
| L | `codex-gui/src/locales/en.po`、`codex-gui/src/locales/zh-CN.po`：完整 extraction 输出边界 |

只读依赖包含历史 owner/presentation、router、Browser harness、GUI 配置、生成协议与 fixtures、适用技能及本地依赖文档。不因为读取而取得修改权限。

## 本地化生成契约

权威入口为 `codex-gui` 下 `pnpm run messages:extract`。配置 `lingui.config.ts` 的 sourceLocale 为 en，locales 为 en、zh-CN，include 为 src，exclude 为截图目录；完整输出为 L。

为新增相对日期文案提供准确的 translator comment。首次提取后逐字段审查完整 L diff；允许正确且稳定的 source references 更新，不限定到预计行号。人工仅补充本次新增文案的英文源文与中文翻译，不手工修改 references、message identity 或清理 obsolete。再次执行相同提取入口，要求 catalog 结构、comments、翻译和状态不再漂移。

计划外 msgid/msgstr、fuzzy/obsolete、输出集合或既有翻译变化暂停 catalog 后继并调查；禁止因为文件是生成物而全量接受。实施时使用 Lingui best practices、enhanced-message-context 和 catalog workflow。

## 执行 DAG 与提交拓扑

以下节点表和继承字段共同组成权威 DAG；节点编号不构成依赖。执行时按 `delegating-micro-stages/references/execution-graph.md` 将节点编译为运行记录，在对话执行上下文维护，不回写本计划。

### 所有节点的公共字段

- `executionContext`：上述 checkout、dev、`/Users/jiangsheng/cnb/codex/.git/index`；不使用额外 worktree。
- `authorizationGate`：当前 pending；计划获确认后由 action-authorization 为各节点建立最小能力信封，按节点操作、文件集合和副作用逐一激活。文档提交节点也必须等待计划确认。
- `subdelegation`：false。主代理直接调度明确节点，不允许子代理继续委派。
- `deferralEvidence`：无。共享读写冲突使用资源锁表达，不伪造依赖或等待编号。
- `resourceLocks`：readSet 中实际 canonical 文件为读锁，writeSet 为写锁；stage/commit 独占上述 Git index。生成独占两个 PO 文件，格式化独占指定源码文件。验证期间相关源码保持稳定。
- `stateEffects`：编辑仅改变 writeSet；生成仅显式输出 L；格式化仅显式目标；验证允许已授权程序自动产生必要缓存/测试产物；stage 仅写 index；commit 仅形成本地提交与分支状态。主动清理产物不在授权内。
- `failureDomain`：本节点及消费失败产物的传递后继；不扩大到无依赖节点。
- `replanTriggers`：输入缺失、范围/产品语义/协议变化、生成漂移或资源事实失效。计划内实现错误按证据补充修正和必要复验，不因首次失败停工，不降低检查标准。
- `commandScope`：只读核验使用 rg、cat、sed、git status/diff/show；其他操作仅使用本节节点动作和后文验证入口。普通内容编辑用 patch；格式化和生成使用工具，不手工模拟。
- `completionEvidence`：编辑为完整文件 diff 与契约自检；生成另需重复提取稳定证据；验证为非零收集的测试结果/检查结果或实际运行观察；stage 为精确 staged diff；commit 为提交 ID。所有证据绑定稳定输入状态。
- `verification`：节点指定的检查加 `git diff --check`；不得用零测试或基线等价失败代替通过。
- `estimatedCost`：见表，表示粗粒度工作量，不作为停止条件。

### 节点记录

| nodeId / operationKind | taskBoundary / owner / estimatedCost | hardPredecessors 与 consumes | readSet / writeSet | outcome、produces 与专属检查 |
| --- | --- | --- | --- | --- |
| D1 / stage | 文档任务 / 主代理 / 小 | 计划确认，消费 D | D、index / index | 仅暂存 D，检查 staged scope 与 whitespace |
| D2 / commit | 文档任务 / 主代理 / 小 | D1，消费已核对 index | D、index / 本地 Git | 独立文档提交 ID，作为实现前统一门禁 |
| E1 / 编辑 | 功能任务 / 主代理 / 中 | D2，消费确认设计和现有入口 | S、owner/presentation、协议与配置 / S、H、U | 完成日期分组、整卡布局导航与纯函数测试；无旧新双路径 |
| E2 / 编辑 | 功能任务 / 测试子代理 / 中 | D2，消费确认设计和 D2 中稳定的既有测试/实现快照 | 设计、通过 git show D2 读取的 S/B/harness / B | 更新 Browser 契约，不读取 E1 的可变源码，不运行测试或操作 index |
| F1 / 格式化 | 功能任务 / 主代理 / 小 | E1、E2，消费合并后的源码 | S、H、U、B / S、H、U、B | 仅格式化源码目标，冻结 source references 的输入位置 |
| G1 / 生成 | 功能任务 / 主代理 / 小 | F1，消费格式化后的稳定源集合 | src、lingui 配置 / L | 首次 extraction，完整字段 diff 审查 |
| E3 / 编辑 | 功能任务 / 主代理 / 小 | G1，消费新 message 集合 | L、新文案 source / L | 仅补本次英文/中文翻译，保持 ICU 与 comments |
| G2 / 生成 | 功能任务 / 主代理 / 小 | E3，消费补齐翻译的 catalogs | src、配置、L / L | 同入口再次 extraction，结构和翻译稳定 |
| V1 / 验证 | 功能任务 / 主代理 / 中 | G2，消费稳定源码与 L | GUI 源码、配置、协议、fixtures / 无主动源码写 | 格式检查、lint、类型检查、日期及既有 history 单元测试通过 |
| V2 / 验证 | 功能任务 / Browser 验证子代理 / 中 | G2，消费同一稳定源码与 L | GUI 源码、配置、协议、fixtures / 无主动源码写 | 目标 Browser 文件三引擎通过，保留几何与导航覆盖 |
| R1 / 审查 | 功能任务 / 独立审查子代理 / 小 | G2，消费冻结后的完整功能 diff | S、H、U、B、L、设计 / 无 | 独立核对设计契约和 diff；不得自行修改 |
| V3 / 验证 | 功能任务 / 主代理 / 中 | G2，另需当前有效 URL/运行时，消费相同源码 | 当前 GUI 与运行入口 / 无主动源码写 | Level 2 场景证据；运行时缺口只阻塞本节点和最终完成声明 |
| S1 / stage | 功能任务 / 主代理 / 小 | V1、V2、R1，消费组合验证通过状态 | S、H、U、B、L、index / index | 精确 allowlist 暂存与 staged diff 检查 |
| C1 / commit | 功能任务 / 主代理 / 小 | S1，消费确认 staged 状态 | index / 本地 Git | 独立功能提交 ID；V3 缺口不阻止已验证代码形成可审查本地提交 |
| Z1 / fan-in | 无提交 / 主代理 / 小 | C1、V3，消费全部必要证据 | 提交、检查与验收记录 / 无 | 最终状态符合设计且验证证据对应最终提交 |

初始 ready set 为计划确认后的 D1；D2 完成后 E1、E2 同时 ready，写集合不相交且 E2 只读稳定快照。G2 完成后 V1、V2、R1、具备运行入口的 V3 可并行；主代理可先启动子代理验证/审查，再执行自己负责的检查。V1 与 V3 共用主代理调度槽位不构成硬边；可在命令运行中推进无冲突检查。

关键路径预计为文档提交、编辑 fan-out/fan-in、格式化、本地化生成闭环、验证 fan-out/fan-in、任务提交与最终验收。E2 不等待 E1，是因为其测试根据确认设计和稳定基线编写；运行测试须等待组合源码稳定。G1 扫描整个 src，因此通过 F1 等待两个编辑节点及其格式化完成，避免读取移动中的测试文件或保留过时行号。G2 后若再次改变源码，必须使相应提取稳定证据失效并重新闭环。

本计划只有一个功能任务提交，E1/E2 在同一工作树的不相交文件编辑，不需要额外 worktree。所有 Git 写操作、生成和格式化仅主代理负责。实际锁冲突释放后立即重算 ready set，不等待整批无关节点。

若审查/验证发现问题，先插入范围内修正与必要生成、格式化及复验节点，使消费旧状态的证据失效。已提交后的修正形成新的独立提交，禁止 amend。行为实现中不顺手重排无关 imports、声明或组件；纯顺序调整若确实需要，单独任务与提交，不制造临时兼容层。

## 验证入口与预检证据

已读取 package.json、Vitest 配置、Lingui 配置与 `.github/workflows` 的 GUI CI：CI 使用 format:oxfmt、lint、type-check、unit 和 Browser 入口。Oxfmt 是本任务格式化 owner，Prettier 不作为第二套串行格式门禁。正常 frontend 修改不运行 repository `just fmt`。

计划编写时 fnm 下 Node 为 v24.17.0，pnpm 为 10.34.5，均来自用户 fnm 安装目录；Vitest、Oxfmt、Lingui、TypeScript、ESLint、Oxlint 与 Chromium/Firefox/WebKit 可执行文件存在。此结果不等于测试通过，执行前必须重新预检。

以下命令的 cwd 均为 `/Users/jiangsheng/cnb/codex/codex-gui`。所有 pnpm 调用使用 `/opt/homebrew/bin/fnm exec --using-file` 前缀，禁止切换 Codex runtime shim。

```sh
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/threadHistory/__tests__/threadHistoryDateGroups.test.ts src/features/threadHistory/__tests__/threadHistoryListOwner.test.ts src/features/threadHistory/__tests__/threadHistoryPresentation.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel src/features/threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx
```

`test:browser:parallel` 配置收集该目标文件，并通过共享配置明确启用 headless，实例为三种浏览器。不得用 sequential 或默认 unit 入口运行 Browser 文件，也不得忽略零收集。日期 helper 新文件属于计划产物，在 E1 完成前不运行其测试。

`format:oxfmt:fix` 固定扫描整个 `.`，不能安全限定本次修复；因此 F1 使用同一 Oxfmt 原生工具的精确文件入口：

```sh
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/threadHistory/ThreadHistoryListPage.tsx src/features/threadHistory/threadHistoryDateGroups.ts src/features/threadHistory/__tests__/threadHistoryDateGroups.test.ts src/features/threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx
```

随后使用上述非 fix 格式入口复核。禁止手工格式化或修复无关基线。lint 失败只对有证据属于本次修改的目标执行项目对应自动修复，实际 diff 必须检查并再次非 fix 验证。

### 关键断言

- 日期：本地午夜、昨天跨月/跨年、同年和跨年标签、recencyAt 为空、本地日与 UTC 日不同、同日跨页合组、顺序保持；测试时间固定且构造本地日期，不依赖运行当天或时区恰好为 UTC。
- 卡片：1/2/3 列、同行对齐、两行上限、长文本与完整原文、缺少摘要、不同状态、紧凑底部不遮挡。保留现有几何检查能力，调整其日期分组 DOM 定位，不能直接删除。
- 导航：正确 href，点击标题/摘要/卡片空白进入详情，Tab 与 Enter、可见焦点、只有一个链接且无嵌套按钮，路径 UUID 一次、search 为空、hash 为空。
- 回归：加载、空、错误、重试、加载更多及末页；日期组不让反馈区只占一张卡片位置。

### Level 2 与 Level 3

Level 2 执行前取得当前完整且有效的 GUI 入口，核验运行时、目标路由及代码版本，再按 codex-gui-toolchain 与适用浏览器 skill 使用无头方式检查真实历史记录。不得复用截图旧 URL、占用用户已有 Vite 进程或凭空拼接 token。工具/运行时缺口先报告，禁止安装或后端构建。

本次计划允许实施阶段在工具齐备时启动任务专属前端开发服务及对应无头验收会话；只停止自己启动且身份可确认的进程。真实后端必须使用用户已提供或已运行的有效入口。若当前入口不能证明最终源码，V3 标记未执行或未通过，继续 V1/V2/R1 和本地提交，不宣称完整验收。

Level 3 预计不适用；若出现依赖可见桌面的新场景，单独说明窗口影响并取得授权，不能用无头结果替代。

## 完成与提交核验

文档提交只包含 D；功能提交只包含 S/H/U/B/L。均先检查 `git diff --cached --check` 与完整 staged scope，禁止强制暂存 ignored 文件。不提交示意 HTML、截图、测试报告、无关文件或用户隐私到范围外路径。

最终检查设计全部条件、本地提交身份和工作树范围。V1/V2/V3 分级报告，不重复运行已绑定最终状态且仍有效的检查。所有计划内修正完成后才能结束；最终汇报列出实际并行、关键路径及未启动 ready 节点的实际原因。
