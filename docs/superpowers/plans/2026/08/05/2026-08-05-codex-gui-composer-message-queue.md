# Codex GUI Composer 纯消息队列实施计划

日期：2026-08-05

状态：已确认

实施分支：`dev`

实施基线：`dev` @ `6645f6c5dccc438b2268f96d127969fe48e657cd`

对应设计：[Codex GUI Composer 纯消息队列设计](../../../../specs/2026/08/05/2026-08-05-codex-gui-composer-message-queue-design.md)

关联研究：`docs/superpowers/research/2026/08/05/2026-08-05-codex-gui-reverted-message-queue-state-machine-analysis/current-findings.md`

## 目标

只实现并验证一个 in-process、无 I/O 的 `ComposerInputQueue` 深 Module。它通过公开的
`submit`、`settle`、`observe`、`manage` 与 `view` Interface 管理消息 owner、FIFO、claim、失败恢复和
Undo；不接入 Composer 页面，不产生任何 UI 变化。

最终本批只有以下边界：

```text
public queue intent / settlement / runtime observation
  → ComposerInputQueue
      → transition result
      → performStart / performSteer / recover / report effect
      → read-only view
```

调用 `GuiHostCommands`、订阅 runtime action、把 recovery 写回 composer 或呈现队列，均留给后续独立设计与
计划。

## 当前代码证明

本计划由当前 `dev` 的实际缺口推出：

- `ComposerTurnControl.tsx` 仍只拥有 `draft`、`isSending`、`isStopping`，并在 idle 时直接调用
  `commands.startTurn(...)`；它不是本批修改对象。
- `composerTurnControlModel.ts` 仍以 `activeTurnId == null` 作为 send 条件，没有 queue owner。
- `GuiHostCommandGateway` 已提供 typed `startTurn`、`steerTurn` 与 `interruptTurn`，但只执行 RPC 和 settle
  Promise，不保存消息。
- `threadRuntimeSlice` 已提供权威 `activeTurnId` 和 `{status, turnId, commitId}` live completion；它不拥有
  GUI 本地消息。
- commit `584f505c8` 曾新增浅 reducer，commit `6645f6c5d` 已将其两个文件完整回退；当前 worktree 不存在
  queue implementation。
- 因而当前最小缺失机制不是继续扩展 Composer、gateway 或 runtime，而是先建立一个可独立验证的纯队列
  Module，隐藏 owner 与 phase 组合，并让每个调用返回显式结果。

## 权威来源与边界

- `ThreadRuntimeLiveTurnCompletion` 继续来自
  `src/features/threadRuntime/threadRuntimeSlice.ts`；Module 可以机械引用该 frontend-owned runtime fact，
  不重新声明 status union。
- queue message、claim、settlement、observation、effect、problem 与 view 是新的 frontend domain semantics，
  不是 app-server wire DTO；不得复制 `TurnStartParams`、`TurnSteerParams`、JSON-RPC error 或 generated
  validator。
- Module 不读取 Redux、React、DOM、Toast、transport session 或 projection event buffer，也不执行 RPC。
- RPC rejection 的结构化分类、projection event 到 observation 的转换以及 command effect runner 不在本批；
  public settlement/observation 类型只定义队列所需的领域输入。
- 不修改 `codex-rs/**`、generated protocol、`threadRuntimeSlice`、GUI Host、Composer 页面、locales 或测试
  fixtures。
- 不新增依赖、配置、持久化、URL 生命周期、跨客户端队列、固定容量、paused/Continue 或 UI。

## 执行约束

- 本计划确认前不修改产品代码、测试或配置，不运行 formatter、lint、type-check、test 或 build。
- 计划确认后严格执行 Task 0 → 1 → 2 → 3 → 4；每个 Task 完成修改、focused verification、相关文件
  stage、staged diff 审查和一个独立本地提交后，再进入下一 Task。
- Task 0 与 Task 1 分别提交设计文档和计划文档，满足两份文档都需要本地提交的要求；不得把文档混入代码
  提交。
- 三个代码 Task 允许中间状态尚未覆盖完整最终语义；最终状态只保留一个 Module、一套 owner 和一条
  transition 路径，不增加临时 adapter、fallback、双写或兼容层。
- 行为修改提交中不顺手移动或重排现有代码。新文件内部的首次声明顺序不构成对既有代码的顺序调整；后续
  Task 不做无行为意义的重排。
- 生产实现优先保持在 500 行以内。若完整根因解决需要超过约 500 行复杂逻辑，停止并更新计划，通过私有
  module 边界拆分，而不是压缩语义或弱化测试。
- 前端命令从 `/Users/jiangsheng/cnb/codex/codex-gui` 运行，统一使用
  `/opt/homebrew/bin/fnm exec --using-file pnpm ...`。
- 不安装或更新 Node、pnpm、依赖、浏览器二进制或其他程序。工具缺失时停止并由用户自行安装。
- 普通 TypeScript 内容没有项目生成器或迁移命令可表达，使用 `apply_patch`；格式化使用项目已有 `oxfmt`。
- 永远不执行 Git 远程操作。

## 实施 preflight

计划确认后、Task 0 前执行：

```text
git branch --show-current
git rev-parse HEAD
git merge-base --is-ancestor 6645f6c5dccc438b2268f96d127969fe48e657cd HEAD
git status --short --branch
test -x /opt/homebrew/bin/fnm
test -d /Users/jiangsheng/cnb/codex/codex-gui/node_modules
/opt/homebrew/bin/fnm exec --using-file which pnpm
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

preflight 必须满足：

- 当前仍在 `dev`，HEAD 包含实施基线；
- worktree 中没有与本计划两个文档或 `src/features/composerInputQueue/**` 重叠的用户变更；
- `package.json` 仍存在 `format:oxfmt`、`lint`、`type-check`、`test:unit` 与 `ci`；
- fnm-backed pnpm 可用且不位于 `/Users/jiangsheng/.cache/codex-runtimes/`；
- `ThreadRuntimeLiveTurnCompletion`、typed `startTurn/steerTurn` 与当前 Composer owner 仍和计划证据一致；
- 被回退的 `composerMessageQueue.ts` 没有被其他提交重新引入。

若 owner、Interface 依赖、脚本、HEAD 或重叠改动发生变化，先停止并更新计划，不照搬旧路径。

## Task 0：提交已确认设计

依赖：preflight 通过，计划已确认。

提交：`docs(gui): redesign composer message queue`

### 精确文件

- `docs/superpowers/specs/2026/08/05/2026-08-05-codex-gui-composer-message-queue-design.md`

### 动作与检查

1. 确认设计状态为 `已确认`，内容仍只覆盖纯消息队列。
2. 只 stage 该设计文件。
3. 执行 `git diff --cached --check` 并审查完整 staged diff。
4. 提交后用 `git diff-tree --no-commit-id --name-status -r HEAD` 核对只有该文件。

本 Task 不修改或提交 research、历史设计、旧计划、产品代码或测试。

## Task 1：提交已确认计划

依赖：Task 0 已提交。

提交：`docs(gui): plan composer message queue`

### 精确文件

- `docs/superpowers/plans/2026/08/05/2026-08-05-codex-gui-composer-message-queue.md`

### 动作与检查

1. 把本计划状态从 `待确认` 更新为 `已确认`，不改变已确认范围。
2. 只 stage 本计划文件。
3. 执行 `git diff --cached --check` 并审查完整 staged diff。
4. 提交后核对 commit 文件清单和 worktree，确认没有带入 ignored research 或其他文档。

## Task 2：建立 ordinary FIFO 与 start claim 所有权

依赖：Task 1 已提交。

提交：`feat(gui): add composer input queue ownership core`

### 精确文件

- 新建 `codex-gui/src/features/composerInputQueue/composerInputQueue.ts`
- 新建 `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueue.test.ts`

### 实施与不变量

1. 导出 `ComposerInputQueue` public Interface、创建入口、不可变 message/claim/effect/result/view 类型；内部
   state 与可变集合不导出。
2. 实现 ordinary message 的 idle direct-start、active-turn enqueue、严格 FIFO 与一次最多一个 start claim。
3. claim 是 opaque capability；claim 发出时消息从 ordinary owner 转给 claim owner，settlement 必须使用同一
   claim identity，不能由 caller 直接指定 item ID 完成出队。
4. 实现 accepted-awaiting-start、definitely-not-accepted 与 delivery-unknown 的 start lifecycle：明确拒绝返回
   recovery，结果不确定保留唯一 owner 并阻止 drain。
5. empty text、duplicate message identity、stale settlement、identity mismatch 与 exact replay 返回可区分
   result；不以 unchanged state 代替错误分类。
6. 不设置固定条数上限，也不在 TypeScript 中镜像 Rust 的 `MAX_USER_INPUT_TEXT_CHARS`。单条文本长度继续由
   app-server 的权威校验负责；明确拒绝后，claim 消息进入 recovery，不因超长静默丢失。

### Interface 测试

- idle submit 只产生一个 start claim；
- active submit 按 FIFO 入队；
- pending start 与 delivery unknown 时不重复 drain；
- accepted settlement 等待权威 start/terminal observation，不提前释放 single-flight；
- definite rejection 只 recovery 当前 claim，剩余 FIFO 可继续；
- duplicate、empty、stale、mismatch 与 replay 都返回明确结果；
- 测试只调用 public Interface，不读取或导入内部 state。

### 验证与提交

```text
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write src/features/composerInputQueue/composerInputQueue.ts src/features/composerInputQueue/__tests__/composerInputQueue.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/composerInputQueue/__tests__/composerInputQueue.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
```

只 stage 本 Task 两个文件，检查 staged 文件清单、`git diff --cached --check` 与完整 staged diff 后提交。

## Task 3：加入 steer、terminal outcome 与恢复收束

依赖：Task 2 已提交。

提交：`feat(gui): add composer queue recovery lifecycle`

### 精确文件

- 修改 `codex-gui/src/features/composerInputQueue/composerInputQueue.ts`
- 修改 `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueue.test.ts`

### 实施与不变量

1. 实现 active-turn steer claim 与 pending steer owner，以 message ID 作为 `clientUserMessageId` identity；RPC
   accepted 不能直接认定 server committed。
2. committed user message observation 只有 client ID 匹配时才把 owner 转给 server；文本相同不构成匹配。
3. 实现 non-steerable → rejected FIFO、no-active → start claim、expected-turn mismatch 的受限重试、明确其他
   rejection → recovery、未知 delivery → 保留唯一 owner。
4. `completed` 与 `failed` 都收束尚未 committed 的 pending steer，按 rejected-first 产生至多一个 start
   claim；`failed` 不进入 paused。
5. `interrupted` 原子按 `rejected → pending → ordinary` 生成 recovery batch、清空对应 owner，保留每条消息
   边界且不产生 outbound claim。
6. 旧 turn completion、重复 commit、错序 observation 和 stale claim 不得覆盖新事实；每种情况返回显式
   stale/idempotent/problem result。

### Interface 测试

- steer accepted 后等待匹配 committed client ID；
- non-steerable、no-active 与 mismatch 移动同一条消息且不复制；
- rejected steers 优先于 ordinary queue，并在各 owner 内保持 FIFO；
- `completed` 和 `failed` 都自动继续且只产生一个 start claim；
- `interrupted` 生成稳定 recovery batch、清空 owner、停止自动执行；
- transport/decode unknown 阻止自动重发；
- stale completion、重复 commit、错序 observation 与 claim replay 不破坏当前 owner。

### 验证与提交

重复 Task 2 的定向 `oxfmt`、package format、focused unit test、type-check 与 lint。只 stage 两个 queue 文件，
审查完整 staged diff，确认没有 Adapter、Composer、runtime 或 gateway 改动后提交。

## Task 4：完成管理命令与守恒序列

依赖：Task 3 已提交。

提交：`feat(gui): complete composer queue management`

### 精确文件

- 修改 `codex-gui/src/features/composerInputQueue/composerInputQueue.ts`
- 修改 `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueue.test.ts`

### 实施与不变量

1. 实现 ordinary queued message 的 `edit`、`delete`、`clear` 与一次性 `undo`；locked owner 不能被管理命令
   修改。
2. edit 保持 FIFO 位置；delete/clear 只有在确实移除消息时产生 Undo；后续 membership mutation 使旧 Undo
   明确过期。
3. unknown ID、empty edit、unchanged edit、locked owner、missing/expired/replayed Undo 都返回明确结果。
4. view 只暴露 ordinary 稳定顺序、各类 owner 的必要数量/状态、ordinary item 的可管理性、pending start、
   delivery unknown 与 Undo availability；不暴露 nonce、内部 phase、mutable reference 或历史集合。
5. 增加固定的长事件序列，逐步核对消息守恒、ID 唯一、FIFO、single-flight 和 recovery 原子性；不引入新的
   property-testing 依赖。

### Interface 测试

- ordinary edit/delete/clear/undo 的完整 transition 与 view；
- locked owner 不可管理且消息不丢失；
- clear/undo 不受固定容量影响；
- membership mutation 使旧 Undo 过期；
- 长序列结束后，每条未由用户明确删除的消息恰有一个 owner；
- public view 不泄漏可变引用，caller 不能绕过 Interface 修改队列。

### 验证与提交

重复 Task 2 的定向 `oxfmt`、package format、focused unit test、type-check 与 lint。只 stage 两个 queue 文件，
审查 staged diff 和累计代码规模后提交。

## 最终验证

Task 4 提交后，从 `codex-gui` 运行：

```text
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
git status --short --branch
git log --oneline -5
```

`ci` 已包含 generated validator drift check、全包 format、lint、type-check 与全部 Node unit tests。本批没有
UI、Browser Mode、E2E、snapshot、Rust 或 protocol shape 变化，因此不运行 browser tests、Playwright、Rust
tests、build、generator write 或 snapshot acceptance。

最终核验：

- 设计与计划各有一个独立 docs commit；
- 三个代码 Task 各有一个独立行为 commit；
- 最终生产 diff 仅位于 `src/features/composerInputQueue/**`；
- 现有 Composer 发送行为和页面渲染完全不变；
- no fixed capacity、claim ownership、`failed` continue、`interrupted` recovery、delivery unknown、管理命令与
  显式结果均由 public-interface tests 证明；
- 没有 staged 文件、未解决冲突或本次变更产生的未跟踪生成物。

## 后续门禁

本文档落盘后仍处于计划阶段。用户明确确认计划之前，不得 stage 或 commit 设计/计划文档，也不得修改产品
代码、测试、配置或运行计划验证。计划确认后，必须按 Task 0 → 4 连续执行并在最终验证后终止本轮，不自行
追加 Composer 集成、UI、review 或修复轮次。
