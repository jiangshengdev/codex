# Codex GUI 消息排队与引导实施计划

日期：2026-08-04

状态：待确认

实施分支：`dev`

实施基线：`dev` @ `6a751d4aeedb2b72e20100d17c9d322a372cf5fd`

对应设计：[Codex GUI 消息排队与引导设计](../../../../specs/2026/08/04/2026-08-04-codex-gui-message-queue-and-steering-design.md)

现有基线：[Composer Turn Control 设计](../../../../specs/2026/06/17/2026-06-17-yolo-single-session-chat-performance-v2/07-composer-turn-control/design.md)

## 目标

为当前 Codex GUI 增加页面内、当前对话内的 20 条有界 FIFO 消息队列，并在 active turn 中通过正式
`turn/steer` 提供“引导”。最终实现只有一条权威链路：

```text
app-server v2 schema
  → generated descriptor / validator
  → GUI Host 精确 allowlist
  → GuiHostCommands
  → Composer queue controller
  → HeroUI Composer controls
```

队列内容只由 Composer feature-local 状态机拥有；`threadRuntime` 只补充 accepted live terminal
outcome；queued message 只有在 `turn/start` 成功后才移除，并继续只通过 projection 成为 committed
transcript。

## 当前代码证明

实施由当前代码的实际缺口直接推出：

- `ComposerTurnControl.tsx` 只有 `draft`、`isSending`、`isStopping`，active turn 时 `canSend` 为
  `false`，发送只调用 `commands.startTurn`；
- `composerTurnControlModel.ts` 没有 FIFO、容量、暂停、Undo 或 queue availability；
- `threadRuntimeSlice.ts` 在任意 live `turnCompleted` 后只清空匹配的 `activeTurnId`，没有保留
  `completed`、`interrupted`、`failed` 与 commit identity；
- `APP_SERVER_REQUEST_METHODS`、generated request descriptor 和 `GuiHostCommands` 都没有
  `turn/steer`；
- `codex-rs/gui-host/src/filter.rs` 当前明确断言拒绝 `turn/steer`；
- app-server v2 schema 已有 `TurnSteerParams` / `TurnSteerResponse`，因此不需要修改 app-server API；
- `GuiHostTransportSession` 已产生 `rpc | missingResult | malformedResult | send | unavailable`
  failure source，但 command consumer 目前只收到普通 rejection；
- `AppShell.tsx` 已有 macOS browser-runtime 判断和全局 `Toast.Provider`，不需要新增 platform owner 或
  Toast provider；
- `package.json` 已有 HeroUI、Lingui、Vitest、Browser Mode、protocol generator、catalog generator、
  format、lint、type-check 和 CI 脚本，不新增依赖或 package script。

## 权威来源、HeroUI 与非目标

- request/response、`TurnStatus` 与 `UserInput` 继续直接来自 generated `@codex-protocol`；不得手写 wire
  DTO、validator、字符串 union 或解析 JSON-RPC error 文案；
- `turn/steer` descriptor/validator 必须由现有 protocol generator 从 app-server schema 生成；
- GUI Host 只新增精确的 `turn/steer` request allowlist 项，不开放 notification 或任意 request proxy；
- `threadRuntime` 只拥有 thread、subscription、active turn 和 latest accepted live completion；
- composer-local queue state machine 只拥有 FIFO、20 条上限、paused/running、waiting/starting 和单步
  Undo；
- HeroUI v3 使用 `ButtonGroup`、`Button`、`Dropdown`、`Label`、`Description`、`Modal`、`TextArea`、
  `Toast`；队列使用语义 `section` / `ol`，因为它不是 selection widget；
- split button 使用统一 `outline` variant，`Stop` 保持 `danger-soft`；删除 menu item 使用 danger
  variant，其余编辑、继续、清空为普通或 dismissive action；
- 样式只使用 `bg-surface`、`border-border`、`text-muted` 等 semantic token，不新增硬编码颜色；
- 不修改 app-server/core/TUI/transcript/projection ingress contract，不统一 GUI/TUI 队列或定义客户端优先级；
- 不持久化到 URL、Redux、localStorage、rollout 或 server，不做 optimistic transcript append；
- 不新增依赖、E2E、screenshot baseline、配置项、拖动排序、多步 Undo 或跨页面恢复。

## 执行约束

- 本计划确认前不修改产品代码，不运行 generator、formatter、lint、type-check、test 或 build，不 stage 或
  commit 任何文件。
- 计划确认后严格执行 Task 1 → 2 → 3 → 4 → 5 → 6；每个 Task 分别完成修改、focused
  verification、stage、staged diff 审查和一个独立本地提交，再进入下一 Task。
- 六个 Task 各自产生一个行为提交。测试与 generated artifacts 跟随产生对应行为的 Task，不新增
  cleanup-only、validation-only 或 catch-all 提交。
- 不在行为提交中顺手移动或重排 import、声明、字段、函数、分支或组件。当前证据不需要纯顺序调整；若
  实施中确实需要，停止并更新计划，不把它混入行为提交。
- generated descriptor 中由 generator 决定的新增方法/validator 排序属于 contract 生成结果，不是手工
  code order 调整。
- 不保留旧新 command、queue owner、completion owner、双写、双读、fallback、adapter 或兼容层；允许中间
  commit 尚未完成最终 UI 集成，但最终只能保留一条实现路径。
- 前端命令从 `/Users/jiangsheng/cnb/codex/codex-gui` 运行，使用
  `/opt/homebrew/bin/fnm exec --using-file pnpm ...`。
- 不安装或更新 Node、pnpm、dependency、Playwright browser binary、Rust tool 或其他程序。必要工具缺失时
  停止，由用户自行安装并明确通知后继续。
- 普通 TS/TSX/Rust 内容编辑使用 `apply_patch`；generated artifacts 和 PO source/message structure 必须由
  项目 generator 更新；本计划不移动或删除文件。
- 每个前端 Task 先用 `oxfmt` 只格式化该 Task 的 TS/TSX allowlist，再运行 package-wide
  `format:oxfmt` 非 fix 检查。
- 每个 Task 提交前检查累计 diff 大小；非机械总变更超过 800 行或复杂逻辑超过约 500 行时停止并更新
  计划，不通过省略测试或弱化断言缩小 diff。
- 本设计与本计划若实施时仍未提交，始终排除在六个产品 Task 的 stage allowlist 外；是否单独提交项目
  文档由用户另行指示。
- 永远不执行 Git 远程操作。

## 实施 preflight

计划确认后、Task 1 编辑前逐项执行只读核对：

```text
git branch --show-current
git rev-parse HEAD
git merge-base --is-ancestor 6a751d4aeedb2b72e20100d17c9d322a372cf5fd HEAD
git diff --name-only 6a751d4aeedb2b72e20100d17c9d322a372cf5fd..HEAD -- codex-gui codex-rs
git status --short --branch
test -x /opt/homebrew/bin/fnm
test -d /Users/jiangsheng/cnb/codex/codex-gui/node_modules
/opt/homebrew/bin/fnm env --shell zsh
/opt/homebrew/bin/fnm exec --using-file which pnpm
/opt/homebrew/bin/fnm exec --using-file pnpm --version
command -v just
command -v cargo
```

preflight 必须满足：

- 当前仍在 `dev`，HEAD 包含实施基线；
- 基线之后没有未纳入本计划的 `codex-gui/**` 或 `codex-rs/gui-host/**` 行为差异；
- worktree 中用户变更与当前 Task 无重叠；允许保留本轮项目文档；
- `package.json` 仍存在 `protocol:generate-validators`、`protocol:check-validators`、
  `messages:extract:clean`、`format:oxfmt`、`lint`、`type-check`、`test:unit`、`test:browser` 和 `ci`；
- fnm-backed pnpm 可用且不位于 `/Users/jiangsheng/.cache/codex-runtimes/`；
- `just` 与 `cargo` 已存在；助手不安装缺失工具；
- app-server schema 仍已有 `turn/steer` 且 `expectedTurnId` 必填，当前 owner 与精确文件仍和计划一致。

若 HEAD、schema、script、HeroUI API、generated artifact 集合或 owner 已变化，先重新核验计划，不照搬旧
路径。

## Task 1：精确开放 GUI Host `turn/steer`

依赖：preflight 通过。

提交：`feat(gui-host): allow turn steer requests`

### 精确文件

- 修改 `codex-rs/gui-host/src/filter.rs`
- 修改 `codex-rs/gui-host/src/host.rs`

### 实施与不变量

1. 在 client request allowlist 只增加精确字符串 `turn/steer`。
2. 把现有“拒绝 `turn/steer`”断言改为接受；保留未知 request、`gui/authenticate` 与全部 client
   notification 的拒绝断言。
3. 扩展现有 browser composer forwarding test，发送带 `expectedTurnId` 的 `turn/steer`，证明通过
   authentication 和 filter 后原样到达 backend；不新建另一套 host test harness。
4. 不修改 app-server protocol、browser contract、WebSocket proxy、server notification allowlist 或其他
   Rust crate。

### 验证与提交

从 `codex-rs` 运行窄测试；不得运行 crate-wide 或 workspace-wide测试：

```text
just fmt
just test -p codex-gui-host client_allowlist_contains_current_gui_frontend_requests
just test -p codex-gui-host browser_composer_requests_reach_backend
git diff --check -- gui-host/src/filter.rs gui-host/src/host.rs
```

只 stage `codex-rs/gui-host/src/filter.rs` 与 `codex-rs/gui-host/src/host.rs`，执行：

```text
git diff --cached --name-only
git diff --cached --check
git diff --cached
```

确认只有精确 allowlist 和对应断言后提交。随后用
`git diff-tree --no-commit-id --name-status -r HEAD` 与 `git status --short --branch` 核对边界。

## Task 2：生成 `turn/steer` contract 并建立 typed command failure

依赖：Task 1 已提交。

提交：`feat(gui): add typed turn steer command`

### 精确文件

生产与生成物：

- 修改 `codex-gui/src/features/guiHost/appServerProtocol.ts`
- 修改 `codex-gui/src/features/guiHost/guiHostCommandGateway.ts`
- 修改 `codex-gui/src/features/guiHost/guiHostClient.ts`
- 由 generator 更新 `codex-gui/src/generated/appServerProtocol/requestDescriptors.ts`
- 由 generator 更新 `codex-gui/src/generated/appServerProtocol/appServerPayloadValidators.d.ts`
- 由 generator 更新 `codex-gui/src/generated/appServerProtocol/appServerPayloadValidators.js`
- 由 generator 更新 `codex-gui/src/generated/appServerProtocol/appServerPayloadValidators.raw.js`

测试与共享 support：

- 修改 `codex-gui/src/features/guiHost/__tests__/generatedAppServerProtocol.test.ts`
- 修改 `codex-gui/src/features/guiHost/__tests__/guiHostGeneratedProtocol.test.ts`
- 修改 `codex-gui/src/features/guiHost/__tests__/guiHostCommandGateway.test.ts`
- 修改 `codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts`
- 修改 `codex-gui/src/__tests__/appBrowserTestSupport.ts`

### 实施与不变量

1. 将 `turn/steer` 加入 frontend 选定 request method 集合，然后用现有 generator 产生 descriptor 和
   `TurnSteerResponse` validator；禁止手写 generated 文件。
2. `GuiHostCommands` 增加 `steerTurn`，其 params/response 通过
   `RequestParams<"turn/steer">` / `RequestResponse<"turn/steer">` 机械引用权威 contract。
3. command gateway 以 GUI-local typed `Error` 保存现有 transport settlement callback 的 failure source；
   `guiHostClient` 只重导出这一 command-domain 类型/判断 seam。错误 message 原样保留，
   consumer 通过类型/字段判断 `rpc`，不得解析 message 字符串或复制 JSON-RPC error DTO。
4. start、steer、interrupt 都继续服从 inactive → ready → invalidated 生命周期；RPC error 只拒绝对应
   command，不把 socket 升级为 terminal failure。
5. request params 原样发送；`turn/steer` response 必须经过 generated validator；missing/malformed/send/
   unavailable 的分类保持穷尽。
6. test support 为新增 command 提供 typed mock，不放宽 `GuiHostCommands` 类型或使用 assertion 补洞。

### Interface 覆盖

- 正确 steer params 与 response；
- RPC rejection 的 source 和原始 message；
- missing result、malformed result、send、unavailable；
- inactive、ready、invalidated gateway；
- `turn/start` 与 `turn/interrupt` 现有行为不变；
- generated descriptor 确实引用 `v2/TurnSteerParams` / `v2/TurnSteerResponse`。

### 验证与提交

从 `codex-gui` 先运行原生 generator，再只格式化手写 TS：

```text
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:generate-validators
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/guiHost/appServerProtocol.ts src/features/guiHost/guiHostCommandGateway.ts src/features/guiHost/guiHostClient.ts src/features/guiHost/__tests__/generatedAppServerProtocol.test.ts src/features/guiHost/__tests__/guiHostGeneratedProtocol.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/__tests__/appBrowserTestSupport.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/guiHost/__tests__/generatedAppServerProtocol.test.ts src/features/guiHost/__tests__/guiHostGeneratedProtocol.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
```

只 stage 本 Task 精确文件及 generator 实际产生 diff 的上述 artifact，检查 staged 文件、`diff --check` 和
完整 staged diff。确认没有手写 generated 内容、schema/API 修改、额外 request method 或项目文档后提交，
再核对 commit 文件清单与 worktree。

## Task 3：记录 accepted live terminal outcome

依赖：Task 2 已提交。

提交：`feat(gui): expose live turn completion outcome`

### 精确文件

- 修改 `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- 修改 `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`

### 实施与不变量

1. 在 `ThreadRuntimeRecord` 增加 latest live completion fact，保存 generated turn status 机械收窄后的
   `completed | interrupted | failed`、`turnId` 与 projection `commitId`。
2. attach 原子替换 runtime 时将 completion 重置为 `null`。
3. 只有 accepted `replay: "live"` 的 `turnCompleted` 更新 completion；`snapshotDuplicate`、wrong thread、
   item event 和 delta 都不更新。
4. active turn 清理仍只作用于匹配的 turn；completion fact 不接管 queue、请求或 transcript。
5. 导出 selector；`commitId` 作为一次性消费 identity，selector 不生成新对象或派生 English 文案。

### Interface 覆盖

- completed、interrupted、failed 三种 live completion；
- snapshot duplicate no-op；
- nonmatching turn 不清除 active turn，但仍只按当前 ingress 接受规则记录合法 live fact；
- attach 重置旧 completion；
- repeated selector 调用保持同一 state-owned reference。

### 验证与提交

```text
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/threadRuntime/threadRuntimeSlice.ts src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
```

只 stage 两个精确文件，检查 staged 文件、`diff --check` 和完整 staged diff。确认没有 queue、transcript、
projection ingress 或 generated contract 变更后提交并核对边界。

## Task 4：建立有界 queue state machine

依赖：Task 3 已提交。

提交：`feat(gui): add composer message queue state machine`

### 精确文件

- 新建 `codex-gui/src/features/composerTurnControl/composerMessageQueue.ts`
- 新建 `codex-gui/src/features/composerTurnControl/__tests__/composerMessageQueue.test.ts`

### 实施与不变量

1. 建立 feature-private reducer/state machine，保存稳定 `{id,text}` FIFO、`running | paused`、
   `waitingTurnId`、`startingItemId`、last consumed completion commit 和单个 pending Undo。
2. 对外提供小而完整的 typed transition surface：push back、guide rejection push front、begin/succeed/fail
   queued start、consume completion、pause、continue、edit、delete、clear、undo 和 connection unavailable。
3. 所有 membership mutation 先结算旧 Undo；`items.length <= 20` 在每个 transition 后成立。
4. 第 20 条允许入队，第 21 条及满队列 guide fallback 被 availability 阻止；不覆盖尾项、不临时超限。
5. queued start 成功后才 pop front；失败保持队首并暂停；同一时刻最多一个 `startingItemId`。
6. completion 只在 `turnId` 匹配且 `commitId` 未消费时生效：completed 允许启动一条，interrupted/
   failed 保留并暂停，duplicate/no-match no-op。
7. 编辑按稳定 ID 原位替换；starting item 不可编辑/删除；delete/clear Undo 恢复原 ID、文本和顺序且不
   产生重复 identity。
8. module 不导入 React、HeroUI、Redux、GuiHostCommands、Toast、Lingui 或 wire DTO。

### Interface 覆盖

- FIFO push back / pop front；20/21 容量；push front fallback；
- starting single-flight 与成功/失败；
- completed/failed/interrupted/duplicate/nonmatching completion；
- Stop/unavailable pause 与显式 Continue；
- edit/delete/clear/Undo identity 与顺序；
- membership mutation 结算旧 Undo且永不超限。

### 验证与提交

```text
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/composerTurnControl/composerMessageQueue.ts src/features/composerTurnControl/__tests__/composerMessageQueue.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/composerTurnControl/__tests__/composerMessageQueue.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
```

只 stage 两个新文件，检查 staged 文件、`diff --check` 和完整 staged diff。确认没有 React/UI、第二 owner、
持久化或协议 DTO 后提交并核对边界。

## Task 5：集成 drain、Guide、Stop、快捷键与 split button

依赖：Task 4 已提交。

提交：`feat(gui): queue and steer composer messages`

### 精确文件

生产文件：

- 新建 `codex-gui/src/features/composerTurnControl/useComposerMessageQueue.ts`
- 修改 `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- 修改 `codex-gui/src/features/composerTurnControl/composerTurnControlModel.ts`
- 修改 `codex-gui/src/features/appShell/AppShell.tsx`
- 由 Lingui 更新 `codex-gui/src/locales/en.po`
- 由 Lingui 更新 `codex-gui/src/locales/zh-CN.po`

测试文件：

- 修改 `codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts`
- 修改 `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
- 修改 `codex-gui/src/__tests__/App.browser.test.tsx`

### 实施与不变量

1. hook 组合 queue reducer、latest live completion、connection state 与 `GuiHostCommands`；Composer 只编排
   draft snapshot、IME、快捷键和可见 controls，不把所有 transition 堆入 TSX。
2. active turn 中普通提交 push back 并记录 `waitingTurnId`；入队不调用 RPC、不创建 transcript item。
3. completed completion 只发起一个队首 `turn/start`；请求成功才删除该项并等待 response turn ID/权威
   active turn，失败或 unavailable 保留并暂停。
4. manual Stop 先同步 pause 再调用 `turn/interrupt`；后续 completion 不自动恢复。
5. steer 使用当前 `threadId`、`activeTurnId` 作为 `expectedTurnId`、`clientUserMessageId: null` 和现有
   `buildPlainTextInput`；不传可选 consumer default。
6. steer 成功只在 draft 仍等于 submitted snapshot 时清空；typed `rpc` rejection 才 push front 并显示
   “当前运行无法引导，消息已加入队列”；其他 source 保留草稿且不复制消息。
7. draft 清理采用 snapshot equality，异步请求期间的新编辑不得被清空。
8. idle 保持普通 `Send`；active 使用 HeroUI `ButtonGroup` split button：主 `Queue`，icon-only Dropdown
   trigger，单项 `Guide` + `Send after the next tool call`；两个直接 Button 使用统一 `outline` variant。
9. 队列满时 Queue 和 Guide 同时 disabled，并暴露 `Queue is full`；pending queued start、steer、Stop 和
   普通 send 都无重复 command 旁路。
10. IME guard 优先；Shift+Enter 换行；idle Enter 发送；active Enter 排队；AppShell 的既有 browser
    runtime 判断作为单一 prop 决定 macOS Meta+Enter 或其他平台 Ctrl+Enter 引导，不在 Composer 重复解析
    User-Agent。
11. 按钮与快捷键调用同一 handler 和 availability predicate。
12. 新增固定文案使用 Lingui macro；用户文本与 command error detail 保持原文。

### Interface 覆盖

- idle Send 与 active split button 切换；
- Enter/Meta+Enter/Ctrl+Enter/Shift+Enter/IME；
- queue 与 steer params；
- completed 单条 drain，failed/interrupted/Stop/unavailable pause；
- RPC rejection push front 与不确定 failure no-duplicate；
- 满 20 条禁用 Queue/Guide；
- pending single-flight 和 draft snapshot equality；
- queued message 在 projection 前不出现在 committed transcript。

### 验证与提交

先用 Lingui generator 更新 catalog structure，补齐 `zh-CN` 翻译，再重新 clean extract；只格式化本 Task
TS/TSX allowlist：

```text
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract:clean
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/composerTurnControl/useComposerMessageQueue.ts src/features/composerTurnControl/ComposerTurnControl.tsx src/features/composerTurnControl/composerTurnControlModel.ts src/features/appShell/AppShell.tsx src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/__tests__/App.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts src/features/composerTurnControl/__tests__/composerMessageQueue.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser --run src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/__tests__/App.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
rg -n -e '^#, fuzzy$|^msgstr(?:\[[0-9]+\])? ""$' src/locales/zh-CN.po
```

最后一个 `rg` 只允许 PO header 的空 `msgstr`。只 stage 本 Task 精确文件，检查 staged 文件、
`diff --check` 和完整 staged diff。确认没有 queue management panel、持久化、transcript 修改、手写 wire
contract 或项目文档后提交并核对边界。

## Task 6：实现队列列表、编辑、删除、清空与 Undo

依赖：Task 5 已提交。

提交：`feat(gui): manage queued composer messages`

### 精确文件

生产文件：

- 新建 `codex-gui/src/features/composerTurnControl/ComposerMessageQueuePanel.tsx`
- 修改 `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- 由 Lingui 更新 `codex-gui/src/locales/en.po`
- 由 Lingui 更新 `codex-gui/src/locales/zh-CN.po`

测试文件：

- 修改 `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
- 修改 `codex-gui/src/__tests__/App.browser.test.tsx`

### 实施与不变量

1. 在 Composer `Surface` 内、主 `TextArea` 上方挂载 feature-local queue panel；空队列不渲染。
2. panel 用 `section` + `ol` 表达 FIFO；固定高度最多显示 3 条，更多只滚动 panel，不改变 transcript 的
   window scroll/sticky-bottom owner。
3. 每项显示有界 preview 与 `…` Dropdown；`Edit` 打开 HeroUI `Modal`，用 item ID 定位，TextArea 保留
   原文本，trim 为空禁用保存，保存后保持原 FIFO 位置。
4. starting item 的 Edit/Delete disabled；其他 Delete 立即执行并用 HeroUI Toast action 提供单步 Undo。
5. 标题显示计数、paused 状态、`Continue` 和 `Clear`；Clear 立即执行并用 Toast action 恢复完整有序
   snapshot。
6. 后续 membership mutation 已由 state machine 结算旧 Undo；Toast dismissal 不成为第二个 undo owner。
7. `Continue` 只在 paused queue 可用，idle 时从队首开始一个请求，active 时恢复等待当前 turn outcome；
   重连本身不自动继续。
8. `Clear` 是 dismissive action，Delete menu item 为 danger，Edit/Continue 为普通 action；所有控件使用
   HeroUI compound API、`onPress` 与完整 accessible name。
9. 使用 semantic tokens；测试只锁定“最多 3 条可见且区域可滚动”这一稳定产品约束，不锁定 padding、gap、
   颜色、阴影等数值。
10. 新增固定文案使用 Lingui；queued text、draft 与动态 error 逐字保留。

### Interface 覆盖

- 1/3/4/20 条列表、顺序、preview 和局部滚动；
- item menu、Edit Modal、原位保存、空白禁止保存、starting item 禁用；
- Delete/Undo 与 Clear/Undo 的稳定 ID、文本和顺序；
- 新 membership mutation 关闭旧 Undo 且不超限；
- Stop/failed/interrupted/unavailable 后 paused + Continue；重连不自动 drain；
- App vertical slice 中 queue 不污染 committed transcript，正常 completion 一次只发送队首。

### Focused 与最终验证

先生成 catalog、补齐 `zh-CN` 翻译并重新 clean extract；只格式化 Task 6 手写 TSX：

```text
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract:clean
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/composerTurnControl/ComposerMessageQueuePanel.tsx src/features/composerTurnControl/ComposerTurnControl.tsx src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/__tests__/App.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser --run src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/__tests__/App.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
rg -n -e '^#, fuzzy$|^msgstr(?:\[[0-9]+\])? ""$' src/locales/zh-CN.po
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser --run
```

最后一个 `rg` 只允许 PO header 的空 `msgstr`。所有前端测试完成后，从 `codex-rs` 运行项目要求的最终
formatter，不在其后重跑测试：

```text
just fmt
git diff --check
```

若 final `just fmt` 修改 Task 1–5 已提交文件或计划外文件，停止并报告，不把范围外格式化混入 Task 6。
只 stage Task 6 精确文件，检查 staged 文件、`diff --check` 和完整 staged diff。确认没有 CSS 数值测试、
第二 scroll owner、第三方内部文案翻译、项目文档或计划外 formatter diff 后提交，并核对 commit 文件清单与
worktree。

## 最终合并状态验收

六个提交合并后的最终状态必须同时满足：

- Rust GUI Host 只新增 `turn/steer` request 权限，未知 request 与全部 client notification 仍拒绝；
- frontend descriptor/validator 从 app-server schema 机械生成，`GuiHostCommands.steerTurn` 使用 generated
  params/response；
- command consumer 不解析 error message，只有 typed `rpc` rejection 触发自动 push front；
- thread runtime 只增加 accepted live terminal fact，snapshot duplicate 不触发 queue drain；
- queue reducer 始终满足 FIFO、20 条、single-flight、pause、Undo 和 stable identity 不变量；
- idle Send、active Queue/Guide、平台快捷键、Stop pause、Continue 和连接失败语义符合设计；
- HeroUI ButtonGroup/Dropdown/Modal/Toast 交互、队列 3 条局部滚动和 Lingui 中英文文案均有 Browser Mode
  覆盖；
- queued message 在 `turn/start` 成功并由 projection 提交前不进入 transcript；
- 不存在 server-side queue、TUI 修改、跨客户端优先级、持久化、optimistic transcript 或第 21 条消息；
- 六个提交分别只包含对应 Task allowlist，不包含设计/计划文档或 Git 远程操作。

## 后续门禁

本计划当前为“待确认”。用户明确确认前不得修改产品代码、生成 artifacts、运行 formatter/验证、stage 或
commit。计划确认后按六个 Task 连续实施、验证并为每个 Task 创建独立本地提交；只有需要改变已确认产品
行为、协议/数据/安全边界、计划外文件或授权范围时才暂停。
