# Codex GUI 路由内容边界统一实施计划

计划状态：已确认

确认日期：2026-08-28

确认原文：`确认，开始执行`

计划日期：2026-08-28

计划分支：`dev`

计划时 HEAD：`d3acdba518afee9ba19b95d6c28140628499ee6c`

## 对应设计

- [`2026-08-28-codex-gui-route-content-boundary-design.md`](../../../../specs/2026/08/28/2026-08-28-codex-gui-route-content-boundary-design.md)
- 设计状态：已确认
- 确认日期：2026-08-28
- 确认原文：`确认，计划落盘`

## 唯一实施目标

按已确认设计，让同一路由内的顶栏内容、顶部持久 notice 和页面级内容使用同一个 AppShell 路由
内容边界：`historyList` 保持宽布局，`currentTask` 与 `historyDetail` 保持窄阅读布局；消除
`/history` 双错误状态在不同视口下宽度大小关系反转，同时保持当前任务 ready transcript/Composer
的 full-bleed、历史网格、HeroUI `Alert`、路由和数据行为不变。

本计划不修改 Rust、app-server、协议、schema、generated 类型、运行时状态模型、文案、本地化、
历史数据/分页/Card、Composer、transcript、Drawer 或历史详情底部操作条，不新增依赖、兼容路径、
fallback、平行 route contract，也不执行 Git 远程操作。

## 当前事实与执行前提

- 当前分支为 `dev`，计划编写时 HEAD 为
  `d3acdba518afee9ba19b95d6c28140628499ee6c`。
- 计划落盘前工作树只有未跟踪的对应设计文档；本次落盘后预期只有已确认设计和本计划两份文档
  发生变化。执行前若出现其他变更，不把它们纳入本计划的 stage、commit 或格式化范围。
- `GuiRouteTarget` 是权威路由 contract，穷举 `currentTask`、`historyList`、`historyDetail`；由成功的
  TanStack Router 末级 match 产生并通过 `AppCapabilities` 进入 AppShell。实现不得解析 pathname
  来重新推导内容宽度，也不得手写第二套路由 union。
- 当前 `AppShellTopBar` 自行选择 `max-w-3xl`/`max-w-6xl`，`AppShellTopNotices` 固定
  `max-w-3xl` 且无水平 gutter，三条路由页面又各自声明最大宽度和 `px-4`；HeroUI `Alert`
  自身只填满父容器。根因是 route chrome 水平边界有多个 owner。
- 现有 `AppRouting.browser.test.tsx` 已验证 1440px 下历史列表宽于当前任务/历史详情，并验证顶栏与
  路由主体对齐；现有 `AppShell.browser.test.tsx` 保护当前任务 ready `<main>` 不新增 `px-4`。
- `codex-gui/package.json` 当前存在 `format:oxfmt:fix`、`format:oxfmt`、`lint`、`type-check`、
  `test:browser:parallel` 和 `build` 固化入口。所有前端命令从 `codex-gui` 目录通过
  `/opt/homebrew/bin/fnm exec --using-file pnpm ...` 执行；计划时 fnm-backed pnpm 为 `10.34.5`。
- 本地 Vitest 文档确认 `vitest/browser` 的 `page.viewport(width, height)` 会改变测试 iframe 视口；
  几何测试继续使用项目现有 `page.viewport`、`getBoundingClientRect()` 和 `expect.poll`/普通断言
  模式，不引入截图基线。
- 当前 `http://localhost:5173/history` 缺少 launch token，只能建立真实失败态，不能证明正常历史
  网格、历史详情或当前任务 ready 状态。最终真实 GUI 验收必须另取得当前完整 GUI URL；没有可用
  Codex runtime 时，按 `debug-responsive-gui` 要求请用户本人运行精确命令 `j c`，助手不得执行。
- 风险判级为中等且边界明确：改动跨 AppShell 与三个页面、直接影响可见响应式几何，但不改变公共
  接口、协议、数据、安全、生命周期或交互。关键 owner、消费者、验证入口和失败态均已闭合；剩余
  环境未知只影响最终正常态真实 GUI 验收，不阻断计划落盘。

## 实现契约

### AppShell 私有路由布局状态

`AppShell` 从 `useAppCapabilities()` 直接取得 `routeTarget`，以穷尽映射产生私有布局状态：

- `historyList` → `wide`
- `currentTask`、`historyDetail` → `reading`

根容器暴露私有 data attribute；`codex-gui/src/index.css` 将 `wide`/`reading` 分别映射到现有
Tailwind `--container-6xl`/`--container-3xl` token，并以私有 custom property 提供最大宽度。
映射必须保持 TypeScript 穷尽性；新增 `GuiRouteTarget` variant 时必须产生编译失败，不能有 default
fallback。

### 语义内容边界

新增一个 AppShell-owned CSS 语义 class，仅承诺：`w-full`、水平居中、`px-4` 页面 gutter、继承
当前路由最大宽度。以下直接 route chrome owner 消费该 class：

- `AppShellTopBar` 内层内容；
- `AppShellTopNotices` 内层 notice 栈；
- `CurrentTaskPage` 错误态与空态 `<main>`；
- `ThreadHistoryListPage` 主体 `<main>`；
- `ThreadHistoryDetailPage` 主体 `<main>`。

调用点继续拥有 `header`/`main` 语义、grid/flex、纵向 gap、sticky、fixed、z-index 和 bottom space。
测试不得断言私有 attribute、custom property、内部 `reading`/`wide` 字面量或语义 class 名称。

### HeroUI 与视觉语义

- 继续使用 HeroUI v3 `Alert status="danger"` 及现有 `Alert.Indicator`、`Alert.Content`、
  `Alert.Title`、`Alert.Description` 结构；不新增自定义 Alert 或单条 Alert 宽度。
- 继续使用现有 background、surface、separator、field 与 Tailwind container/spacing token；不新增
  硬编码颜色、阴影、字体或图片。
- 当前任务 ready `main`、`Surface`、CommittedTranscript、Composer；历史详情固定底部操作条；
  transcript/Composer/Card 内部的 `max-w-3xl` 均保持原 owner，不接入 route seam。

## Task boundaries 与本地提交

### DOCS：确认后的工作文档提交

用户确认本计划后，先只把本计划状态更新为“已确认”，记录确认日期和确认原文；随后审查并仅暂存
本设计与本计划，创建独立 docs-only 本地提交：

```text
docs(gui): plan route content boundary
```

提交成功且工作树不存在范围外冲突前，禁止开始任何实现编辑、格式化、验证或实现任务提交。该提交
不含代码、测试或格式化变化，不执行 amend、squash、force 或 remote。

### T1：统一路由内容边界并添加几何回归

唯一实现 taskBoundary 的写集合：

- `codex-gui/src/index.css`
- `codex-gui/src/features/appShell/AppShell.tsx`
- `codex-gui/src/features/appShell/AppShellTopBar.tsx`
- `codex-gui/src/features/currentTask/CurrentTaskPage.tsx`
- `codex-gui/src/features/threadHistory/ThreadHistoryListPage.tsx`
- `codex-gui/src/features/threadHistory/ThreadHistoryDetailPage.tsx`
- `codex-gui/src/__tests__/AppShell.browser.test.tsx`

同一 taskBoundary 内先并行完成三个不相交编辑节点：AppShell/CSS 策略、三个页面消费者、Browser
几何回归。三者 fan-in 后由唯一 Git owner 格式化全部写集合并进行组合验证；验证通过后只暂存上述
七个文件，审查 staged diff，再创建一个行为提交：

```text
fix(gui): align route content boundaries
```

该提交同时包含根因修复与其直接回归测试，不包含代码顺序调整、无关重构或其他任务。不存在需单独
提交的 import/声明/组件重排；若自动格式化产生语义无关的范围外重排，恢复该范围而不是混入提交。

## 描述式执行 DAG

### 执行上下文与资源

- 不创建 worktree 或额外 branch；全部节点使用当前 `/Users/jiangsheng/cnb/codex`、`dev` 和单一
  Git index。计划确认不授权创建 worktree。
- T1 三个编辑节点共享工作树但写集合不相交，且均禁止操作 Git index；文件 fan-in 后只有 T1 Git
  owner 能运行 fix formatter、stage 和 commit。
- `GIT-INDEX-W`：`/Users/jiangsheng/cnb/codex/.git/index` 独占写锁，只由 DOCS/T1 stage、commit
  节点依次持有。
- `GUI-SOURCE-W`：上述七个 T1 文件的 canonical 文件写锁，按节点不相交分配。
- `OXFMT-W`：T1 七文件格式化写锁，必须等待三个编辑节点 fan-in。
- `BROWSER-RUNNER-W`：`codex-gui/node_modules/.vite`、Vitest 临时产物与浏览器 provider 的写锁；
  Browser 测试串行占用。
- `ESLINT-CACHE-W`：`codex-gui/.eslintcache` 写锁；与 Browser runner 不相交，可并行验证。

### 节点 D1：记录并审查计划确认

- `nodeId`：`D1`
- `taskBoundary`：`DOCS`
- `operationKind`：编辑
- `outcome`：计划文档状态、确认日期和确认原文与用户确认逐字一致；设计和计划正文无额外变化。
- `estimatedCost`：S
- `deferralEvidence`：无；计划确认后立即就绪。
- `hardPredecessors`：用户明确确认本计划；稳定产物为确认消息。
- `consumes` / `produces`：消费当前计划与确认原文；产生两份可审查工作文档快照。
- `completionEvidence`：`git diff -- docs/superpowers/specs/2026/08/28/2026-08-28-codex-gui-route-content-boundary-design.md docs/superpowers/plans/2026/08/28/2026-08-28-codex-gui-route-content-boundary-plan.md` 只显示确认状态记录与既有落盘内容。
- `readSet` / `writeSet`：读取两份工作文档与 `git status`；只写计划文档状态字段。
- `stateEffects`：允许修改计划文档；禁止代码编辑、格式化、stage、commit 和 remote。
- `commandScope`：`apply_patch`；只读 `git diff -- ...`、`git status --short --branch`。
- `subdelegation`：禁止。
- `executionContext`：主 checkout、`dev`、共享 Git index 只读。
- `resourceLocks`：计划文档 write；Git index read。
- `owner`：DOCS Git owner。
- `verification`：确认原文逐字核对，`git diff --check` 通过。
- `failureDomain`：失败只暂停 `D2` 及所有实现节点。
- `replanTriggers`：确认附带范围变更、文档路径或设计状态漂移。
- `authorizationGate`：当前为 `waiting`；仅用户确认计划后转为 `active`，能力限于本节点声明写集合。

### 节点 D2：暂存并提交工作文档

- `nodeId`：`D2`
- `taskBoundary`：`DOCS`
- `operationKind`：commit
- `outcome`：设计与计划形成唯一 docs-only 本地提交，提交后可取得 commit id。
- `estimatedCost`：S
- `deferralEvidence`：无。
- `hardPredecessors`：`D1`；等待已确认且通过 diff 检查的文档快照。
- `consumes` / `produces`：消费两份文档；产生 `docs(gui): plan route content boundary` commit。
- `completionEvidence`：`git show --stat --oneline HEAD` 只含两份文档，且返回稳定 commit id。
- `readSet` / `writeSet`：读取两份文档、status/diff；写 Git index、本地 `dev` ref 与 commit object。
- `stateEffects`：只允许 stage 两份文档并创建一个普通本地提交；禁止代码、amend、force、squash、remote。
- `commandScope`：`git add -- docs/superpowers/specs/2026/08/28/2026-08-28-codex-gui-route-content-boundary-design.md docs/superpowers/plans/2026/08/28/2026-08-28-codex-gui-route-content-boundary-plan.md`、`git diff --cached --check`、
  `git diff --cached --stat`、`git commit -m 'docs(gui): plan route content boundary'`、只读 `git show`。
- `subdelegation`：禁止。
- `executionContext`：主 checkout、`dev`、共享 Git index 独占写。
- `resourceLocks`：两份文档 read；`GIT-INDEX-W` write；本地 `dev` ref write。
- `owner`：DOCS 唯一 Git owner。
- `verification`：staged allowlist、`git diff --cached --check`、提交后 status 与 commit 文件清单。
- `failureDomain`：失败暂停全部实现节点；不得绕过文档提交门禁。
- `replanTriggers`：范围外 staged 变更、提交失败、HEAD/branch 漂移或文档 canonical identity 改变。
- `authorizationGate`：当前为 `waiting`；用户确认计划并进入实施后，按文档提交门禁取得最小 stage/commit 能力。

### 节点 I1：建立 AppShell 私有路由内容 seam

- `nodeId`：`I1`
- `taskBoundary`：`T1`
- `operationKind`：编辑
- `outcome`：AppShell 以 `GuiRouteTarget` 穷尽产生 `reading`/`wide` 私有布局状态，CSS 语义 class
  统一最大宽度、居中和 `px-4`，顶栏与顶部 notice 消费该 seam。
- `estimatedCost`：M
- `deferralEvidence`：无；`D2` 后与 `I2`、`I3` 同时就绪。
- `hardPredecessors`：`D2`；等待 docs-only commit id 与干净的计划内基线。
- `consumes` / `produces`：消费 `GuiRouteTarget`、Tailwind container/spacing token 与设计契约；产生
  AppShell-owned 路由布局策略和两个 shell 消费者。
- `completionEvidence`：TypeScript 映射无 default fallback，TopBar/TopNotices 不再持有 `max-w-3xl`/
  `max-w-6xl` 或独立 gutter 选择，diff 仅命中声明文件。
- `readSet` / `writeSet`：读取 `guiRouteTarget.ts`、`AppCapabilities` 与现有 CSS；只写 `index.css`、
  `AppShell.tsx`、`AppShellTopBar.tsx`。
- `stateEffects`：允许普通源码编辑；禁止测试、其他页面、格式化、Git index、依赖和 remote 变化。
- `commandScope`：`apply_patch` 与只读 `rg`/`git diff -- <writeSet>`。
- `subdelegation`：禁止。
- `executionContext`：主 checkout、`dev`、共享工作树；Git index 只读。
- `resourceLocks`：三个文件 `GUI-SOURCE-W` write；权威 route/CSS 输入 read。
- `owner`：AppShell/CSS 编辑 owner。
- `verification`：静态检查穷尽映射、属性归属、语义 class Interface 和无额外 DOM。
- `failureDomain`：失败暂停 `F1` 及后继；`I2`、`I3` 可继续形成不相交编辑产物。
- `replanTriggers`：需要新增公共 route DTO、wrapper、额外 DOM、依赖或写集合外 CSS/组件。
- `authorizationGate`：当前为 `waiting`；仅计划确认、`D2` 成功并获得实现授权后转为 `active`。

### 节点 I2：迁移三个页面级 route chrome 消费者

- `nodeId`：`I2`
- `taskBoundary`：`T1`
- `operationKind`：编辑
- `outcome`：当前任务错误/空态、历史列表主体、历史详情主体消费同一语义 class；ready transcript、
  Composer、历史详情底部操作条和嵌套内容宽度不变。
- `estimatedCost`：S
- `deferralEvidence`：无；`D2` 后与 `I1`、`I3` 同时就绪。
- `hardPredecessors`：`D2`；消费计划中已冻结的语义 class Interface，不等待 `I1` 工作树中间态。
- `consumes` / `produces`：消费设计的消费者 allowlist；产生三页面 route-level class 迁移。
- `completionEvidence`：三页只移除 route owner 的 `mx-auto w-full max-w-* px-4` 重复声明；排除项
  的 class 与 DOM 结构无 diff。
- `readSet` / `writeSet`：读取三页面与设计；只写 `CurrentTaskPage.tsx`、
  `ThreadHistoryListPage.tsx`、`ThreadHistoryDetailPage.tsx`。
- `stateEffects`：允许普通源码编辑；禁止 AppShell/CSS、测试、格式化、Git index 和 remote 变化。
- `commandScope`：`apply_patch` 与只读 `rg`/`git diff -- <writeSet>`。
- `subdelegation`：禁止。
- `executionContext`：主 checkout、`dev`、共享工作树；Git index 只读。
- `resourceLocks`：三页面 `GUI-SOURCE-W` write；设计 read。
- `owner`：页面消费者编辑 owner。
- `verification`：逐个检查错误/空态/list/detail 主体；确认 ready main/Surface、Composer、fixed aside 无 diff。
- `failureDomain`：失败暂停 `F1` 及后继；`I1`、`I3` 可继续。
- `replanTriggers`：需要修改 transcript、Composer、Card、底部操作条、路由或数据逻辑。
- `authorizationGate`：当前为 `waiting`；仅计划确认、`D2` 成功并获得实现授权后转为 `active`。

### 节点 I3：添加跨视口双错误几何回归

- `nodeId`：`I3`
- `taskBoundary`：`T1`
- `operationKind`：编辑
- `outcome`：`AppShell.browser.test.tsx` 在 `/history` 同时建立启动错误与历史错误，并在
  400×900、800×900、900×900 比较顶栏内层、notice 内容边界、历史 `<main>` 及两条 Alert 的
  实际左右边界，同时检查无横向 overflow；现有 sticky、DOM 顺序、文案和无 Composer 断言保留。
- `estimatedCost`：M
- `deferralEvidence`：无；`D2` 后与 `I1`、`I2` 同时就绪。
- `hardPredecessors`：`D2`；消费冻结的可见验收条件，不等待私有 class/attribute 实现。
- `consumes` / `produces`：消费 Vitest `page.viewport` 和现有 App harness；产生实现细节无关的几何回归。
- `completionEvidence`：测试只以角色、文案、DOM 关系和 `getBoundingClientRect()` 观测产品结果，
  `finally` 恢复原视口且不引入截图/class/attribute 基线。
- `readSet` / `writeSet`：读取 App harness、现有 routing 几何 helper 与本地 Vitest 文档；只写
  `AppShell.browser.test.tsx`。
- `stateEffects`：允许测试源码编辑；禁止 production、snapshot、baseline、格式化、Git index 和 remote。
- `commandScope`：`apply_patch` 与只读 `rg`/`git diff -- <test file>`。
- `subdelegation`：禁止。
- `executionContext`：主 checkout、`dev`、共享工作树；Git index 只读。
- `resourceLocks`：测试文件 `GUI-SOURCE-W` write；测试/doc inputs read。
- `owner`：Browser 回归编辑 owner。
- `verification`：审查视口恢复、1px 几何容差、alert 身份、overflow 断言与现有测试不弱化。
- `failureDomain`：失败暂停 `F1` 及后继；`I1`、`I2` 可继续。
- `replanTriggers`：需要新增 test-only production API、data selector、截图基线、等待/重试或放宽断言。
- `authorizationGate`：当前为 `waiting`；仅计划确认、`D2` 成功并获得实现授权后转为 `active`。

### 节点 F1：任务 fan-in 与限定格式化

- `nodeId`：`F1`
- `taskBoundary`：`T1`
- `operationKind`：格式化
- `outcome`：三个编辑产物汇合，oxfmt 只规范 T1 七文件且组合 diff 无范围外变化。
- `estimatedCost`：S
- `deferralEvidence`：无。
- `hardPredecessors`：`I1`、`I2`、`I3`；等待全部七文件编辑产物。
- `consumes` / `produces`：消费组合工作树；产生格式化后的 T1 候选快照。
- `completionEvidence`：`format:oxfmt` exit 0，`git diff --check` 通过，write allowlist 无外溢。
- `readSet` / `writeSet`：读写 T1 七文件；读取 `package.json`/oxfmt 配置。
- `stateEffects`：允许 `format:oxfmt:fix` 对 T1 工作树产生格式变化；禁止范围外文件、Git index、remote。
- `commandScope`：从 `codex-gui` 使用项目固化入口
  `/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix`。该 live script 固定格式化 `.`，不能
  用附加参数收窄；运行后必须立即检查实际 diff，若产生 T1 七文件之外的变化则停止并报告，不能
  接受范围外变化、手工恢复用户变更或绕过入口直调 formatter。
- `subdelegation`：禁止。
- `executionContext`：主 checkout 的 `codex-gui`、`dev`、共享 Git index 只读。
- `resourceLocks`：`OXFMT-W` write；七文件 write。
- `owner`：T1 唯一 Git owner。
- `verification`：随后运行同一 allowlist 的 `format:oxfmt` 非 fix 检查和 `git diff --check`。
- `failureDomain`：失败暂停 `V1`、`V2`、`R1`、`C1`；不得以其他 formatter 或手工重写掩盖。
- `replanTriggers`：固化入口不支持限定目标、formatter 修改范围外文件或格式化改变行为。
- `authorizationGate`：当前为 `waiting`；计划确认并获得实现/格式化授权后转为 `active`。

### 节点 V1：Browser Mode 组合验证

- `nodeId`：`V1`
- `taskBoundary`：`T1`
- `operationKind`：验证
- `outcome`：新增双错误几何回归与既有跨路由宽窄/ready full-bleed 保护在完整 parallel 浏览器配置通过。
- `estimatedCost`：M
- `deferralEvidence`：无；`F1` 后与 `V2` 同时就绪，受独立资源锁约束。
- `hardPredecessors`：`F1`；等待格式化后的组合候选快照。
- `consumes` / `produces`：消费七文件与现有 App/route harness；产生目标测试通过证据。
- `completionEvidence`：命令 exit 0 且输出明确收集 `AppShell.browser.test.tsx` 与
  `AppRouting.browser.test.tsx`，不是零测试或错误实例。
- `readSet` / `writeSet`：读取源码、测试、configs、node_modules；只写 Vitest/Vite 临时产物。
- `stateEffects`：允许测试缓存/临时产物；禁止源码 fix、snapshot 接受、baseline、Git index、安装和 remote。
- `commandScope`：从 `codex-gui` 执行
  `/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/__tests__/AppShell.browser.test.tsx src/__tests__/AppRouting.browser.test.tsx`。
- `subdelegation`：禁止。
- `executionContext`：主 checkout 的 `codex-gui`、`dev`、Git index 只读。
- `resourceLocks`：`BROWSER-RUNNER-W` write；源码/测试 read。
- `owner`：Browser 验证 owner。
- `verification`：检查收集文件、三个浏览器实例、exit 0 和无新增 tracked diff。
- `failureDomain`：失败暂停 `R1`、`C1` 与最终真实 GUI 完成结论；`V2` 可继续。
- `replanTriggers`：失败揭示 route seam、测试环境或验证拓扑与计划事实不符。
- `authorizationGate`：当前为 `waiting`；计划确认并获得验证授权后转为 `active`。

### 节点 V2：格式、lint 与类型组合验证

- `nodeId`：`V2`
- `taskBoundary`：`T1`
- `operationKind`：验证
- `outcome`：T1 候选通过非 fix 格式检查、全 GUI lint 与 type-check。
- `estimatedCost`：M
- `deferralEvidence`：无；`F1` 后与 `V1` 同时就绪。
- `hardPredecessors`：`F1`；等待格式化后的组合候选快照。
- `consumes` / `produces`：消费 GUI workspace；产生格式/lint/type 通过证据。
- `completionEvidence`：三个固化入口均 exit 0，且无源码变更。
- `readSet` / `writeSet`：读取 GUI workspace；只允许 eslint cache 与工具临时产物。
- `stateEffects`：允许 cache；禁止 fix、源码、Git index、依赖、安装和 remote。
- `commandScope`：从 `codex-gui` 依次执行 `/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt`、
  `/opt/homebrew/bin/fnm exec --using-file pnpm run lint`、
  `/opt/homebrew/bin/fnm exec --using-file pnpm run type-check`。
- `subdelegation`：禁止。
- `executionContext`：主 checkout 的 `codex-gui`、`dev`、Git index 只读。
- `resourceLocks`：workspace read；`ESLINT-CACHE-W` write；不占 Browser runner。
- `owner`：静态验证 owner。
- `verification`：检查 exit 0、目标入口命中和 `git status` 无新 tracked 文件。
- `failureDomain`：失败暂停 `R1`、`C1` 与最终完成结论；`V1` 可继续。
- `replanTriggers`：类型穷尽性或 CSS/formatter/lint 失败要求超出七文件写集合。
- `authorizationGate`：当前为 `waiting`；计划确认并获得验证授权后转为 `active`。

### 节点 R1：组合 diff 反向审查

- `nodeId`：`R1`
- `taskBoundary`：`T1`
- `operationKind`：审查
- `outcome`：确认最终 diff 只有一个 width owner、没有范围扩大、测试未锁私有实现或弱化既有断言。
- `estimatedCost`：S
- `deferralEvidence`：无。
- `hardPredecessors`：`V1`、`V2`；等待目标 Browser 与静态验证证据。
- `consumes` / `produces`：消费组合 diff 和验证结果；产生可 stage 的精确 allowlist 审查结论。
- `completionEvidence`：逐项对照设计验收/否决条件，`rg` 证明 route-level 旧宽度声明只在排除 owner 中保留。
- `readSet` / `writeSet`：读取七文件、相关排除文件和 Git diff；无写集合。
- `stateEffects`：只读；禁止自动修复、stage、commit 和 remote。
- `commandScope`：`git diff -- codex-gui/src/index.css codex-gui/src/features/appShell/AppShell.tsx codex-gui/src/features/appShell/AppShellTopBar.tsx codex-gui/src/features/currentTask/CurrentTaskPage.tsx codex-gui/src/features/threadHistory/ThreadHistoryListPage.tsx codex-gui/src/features/threadHistory/ThreadHistoryDetailPage.tsx codex-gui/src/__tests__/AppShell.browser.test.tsx`、`git diff --check`、限定 `rg -n 'max-w-(3xl|6xl)|px-4'`。
- `subdelegation`：禁止。
- `executionContext`：主 checkout、`dev`、Git index 只读。
- `resourceLocks`：七文件与 Git diff read。
- `owner`：主协调审查 owner。
- `verification`：核对 production owner、排除项、HeroUI 结构、测试断言与验证输出。
- `failureDomain`：失败暂停 `C1`；计划内问题插入最小修正节点并重新运行受影响验证。
- `replanTriggers`：需扩大行为、接口、写集合、验证范围或新增兼容/fallback。
- `authorizationGate`：当前为 `waiting`；计划确认后只读审查能力转为 `active`。

### 节点 C1：暂存并提交 T1

- `nodeId`：`C1`
- `taskBoundary`：`T1`
- `operationKind`：commit
- `outcome`：七文件形成唯一 `fix(gui): align route content boundaries` 本地提交。
- `estimatedCost`：S
- `deferralEvidence`：无。
- `hardPredecessors`：`R1`；等待通过审查的稳定工作树与验证证据。
- `consumes` / `produces`：消费七文件候选；产生 T1 commit id。
- `completionEvidence`：`git show --stat --oneline HEAD` 只含七文件，commit message 精确匹配。
- `readSet` / `writeSet`：读取七文件/status/diff；写 Git index、本地 `dev` ref 和 commit object。
- `stateEffects`：只允许 stage 七文件并创建普通本地提交；禁止 docs、范围外文件、amend、force、squash、remote。
- `commandScope`：`git add -- codex-gui/src/index.css codex-gui/src/features/appShell/AppShell.tsx codex-gui/src/features/appShell/AppShellTopBar.tsx codex-gui/src/features/currentTask/CurrentTaskPage.tsx codex-gui/src/features/threadHistory/ThreadHistoryListPage.tsx codex-gui/src/features/threadHistory/ThreadHistoryDetailPage.tsx codex-gui/src/__tests__/AppShell.browser.test.tsx`、`git diff --cached --check`、
  `git diff --cached --stat`、`git commit -m 'fix(gui): align route content boundaries'`、只读 `git show`。
- `subdelegation`：禁止。
- `executionContext`：主 checkout、`dev`、共享 Git index 独占写。
- `resourceLocks`：七文件 read；`GIT-INDEX-W` write；本地 `dev` ref write。
- `owner`：T1 唯一 Git owner。
- `verification`：检查 staged allowlist、staged diff、提交身份和提交后工作树状态。
- `failureDomain`：失败暂停最终真实 GUI 验收的“完整完成”结论；不得 amend 或绕过提交边界。
- `replanTriggers`：index 污染、HEAD 漂移、范围外变更或提交失败。
- `authorizationGate`：当前为 `waiting`；计划确认并获得 T1 stage/commit 授权后转为 `active`。

### 节点 G1：真实可见浏览器验收

- `nodeId`：`G1`
- `taskBoundary`：无提交 / 最终验收
- `operationKind`：验证
- `outcome`：Google Chrome for Testing headed 环境中的受影响失败态、正常历史宽布局、窄阅读路由和
  ready full-bleed 均有逐场景通过证据；若 runtime/完整 URL 不可用则明确为“真实 GUI 未验收”。
- `estimatedCost`：M
- `deferralEvidence`：无；`C1` 后立即尝试环境预检，缺 runtime 是授权/外部状态等待，不是暂缓。
- `hardPredecessors`：`C1`；等待 T1 稳定 commit id。
- `consumes` / `produces`：消费当前 commit、完整 GUI URL 与 CFT 环境；产生逐场景验收记录。
- `completionEvidence`：以下场景全部通过或逐项记录未执行原因：
  - `/history` 双错误态在 400px 与 900px 代表视口下，顶栏、两条 Alert、页面主体左右边界一致，
    sticky/垂直顺序/页面滚动正常且无 overflow、clipping、额外横向滚动；
  - 有效 GUI URL 的正常历史列表在窄屏与 1440px 宽屏保持 1/2/3 列既有网格和宽内容区；
  - 当前任务与历史详情在 1440px 保持相同窄阅读边界；
  - 当前任务 ready transcript/Composer 保持 full-bleed 与 sticky-bottom，未出现新 gutter/裁切。
- `readSet` / `writeSet`：读取运行中 GUI、浏览器状态与临时调试状态；不写仓库文件。
- `stateEffects`：允许 headed CFT、DevTools responsive 状态、页面导航/刷新和 `/tmp` 调试状态；禁止
  Computer Use、坐标点击、安装、截图基线、仓库编辑、Git index、remote。
- `commandScope`：先取得当前完整 GUI URL；使用
  `node .codex/skills/debug-responsive-gui/scripts/debug-responsive-gui.mjs --gui-url '<完整当前 URL>'`
  准备环境，再用 `playwright-cli` 语义 locator/脚本查询实际几何。不得手写、拼接或复用旧 token URL。
- `subdelegation`：禁止。
- `executionContext`：主 checkout 对应运行中 Vite/Codex runtime；headed Google Chrome for Testing。
- `resourceLocks`：CFT/DevTools/browser session write；GUI runtime read；仓库只读。
- `owner`：真实 GUI 验收 owner。
- `verification`：逐场景记录 viewport、route/state、左右边界、overflow/scroll/sticky 与通过/失败。
- `failureDomain`：失败只阻止总体“完整完成/真实 GUI 已验收”结论；已形成的代码提交不 amend。
- `replanTriggers`：真实 GUI 发现设计外行为变化、route seam 未覆盖的 owner 或需扩大实现范围。
- `authorizationGate`：当前为 `waiting`；计划确认后允许只读 GUI 验收；若需用户运行 `j c` 或提供
  完整 URL，等待该外部前提，不把当前无 token URL 当正常态证据。

## DAG 拓扑、ready set 与反向审计

- 初始 ready set：计划确认前为空；确认后只有 `D1`。
- 关键路径：`D1 → D2 → (I1/I2/I3 fan-out) → F1 → (V1/V2 fan-out) → R1 → C1 → G1`。
- fan-in：`I1`、`I2`、`I3` 汇入 `F1`；`V1`、`V2` 汇入 `R1`。
- 任务提交拓扑：DOCS commit 必须先于任何实现；T1 只有一个提交边界。G1 不写代码且无提交。
- 最终验证拓扑：自动 Browser 与静态验证在 T1 commit 前 fan-in；真实 GUI 在稳定 T1 commit 后验收。
- `I1`、`I2`、`I3` 的写集合不相交，均消费已确认设计而不是彼此的工作树中间态，因此不存在
  串行硬依赖；`V1` 与 `V2` 的可变缓存资源不相交，可并行。未设置 `deferralEvidence`。
- 未创建跨任务 worktree 是有意的最小作用域：只有一个实现 taskBoundary 和一个最终 commit，不存在
  需要隔离的并行 task commit；同一任务编辑节点由文件锁隔离，Git index 仅 fan-in owner 写。
- 文档顺序、节点编号、agent 复用和最终汇合均不产生额外依赖。若执行时写集合相交、formatter
  实际扩大范围或 runner 使用同一 canonical 可变资源，节点保持 ready 等待资源锁，不伪造新边。

## 最终完成条件

1. 两份工作文档先形成独立 docs-only commit，T1 再形成一个独立行为+回归提交；无 amend、squash、
   force、remote 或范围外 stage。
2. route width 与 gutter 只有 AppShell 一个 owner，并直接穷尽消费权威 `GuiRouteTarget`。
3. `/history` 顶栏、顶部 notice、页面主体和双错误 Alert 在 400/800/900px 自动回归中左右对齐，
   不再发生大小关系反转或横向 overflow。
4. 历史列表仍宽于当前任务/历史详情；current ready transcript/Composer 仍 full-bleed；历史网格、
   bottom action、sticky notice、HeroUI Alert、文案、路由、数据和交互不变。
5. 指定 Browser Mode、format、lint、type-check 全部命中目标且通过；没有 snapshot/baseline 更新、
   忽略、重试、skip、放宽断言或新增 fallback。
6. 所有受影响真实 GUI 场景通过后才能报告完整完成；若完整 URL/runtime 不可用，明确报告
   `真实 GUI 未验收` 和缺失前提，不用当前无 token 页面或自动测试替代。

## 后续门禁

本文件只落盘实施计划，不授权更新计划状态、修改代码/测试/样式、格式化、验证、创建 worktree、
Git 暂存、提交或真实 GUI 操作。用户必须明确确认本计划后，才进入实施；进入实施后先完成 DOCS
提交门禁，再按 DAG 连续执行计划内修改、验证、任务提交和真实 GUI 验收。
