# Codex GUI 父任务子代理活动 TUI 对齐展示实施计划

日期：2026-08-02

状态：待确认

实施分支：`dev`

实施基线：`dev` @ `2301a5f5ce438f25920161d516c1836bfc45d75f`

对应设计：[Codex GUI 父任务子代理活动 TUI 对齐展示设计](../../../../specs/2026/08/02/2026-08-02-codex-gui-parent-subagent-activity-tui-parity-design.md)

关联 research：

- [父任务中的子代理活动展示与 Rust 接口调查](../../../../research/2026/07/26/2026-07-26-tui-parent-subagent-activity-display/current-findings.md)
- [Codex GUI 可扩展 ThreadItem transcript 模型评估](../../../../research/2026/07/31/2026-07-31-codex-gui-extensible-thread-item-transcript-evaluation.md)

架构依据：[Codex GUI 可扩展 ThreadItem transcript 重构设计](../../../../specs/2026/07/31/2026-07-31-codex-gui-extensible-thread-item-transcript-refactor-design.md)

历史计划：[2026-07-26 父任务子代理活动展示实施计划](../../07/26/2026-07-26-codex-gui-parent-subagent-activity-display.md)

## 目标

在当前重构后的 `transcriptState` 架构中，显示父任务已有的 `subAgentActivity` 和
`collabAgentToolCall`，第一版按当前 TUI 的动作词、状态详情、可见时机和截断规则展示；继续由
现有 transcript state 独占 identity、顺序、placement、chunk、count、revision、scroll 和 stable
view，不建立 activity 专属状态或缓存。

最终实现只保留一条权威路径：generated `ThreadItem` → typed policy → 中央 state implementation →
stable selector view → 唯一 renderer。

## 当前代码证明

实施需要由当前代码缺口直接推出，而不是从旧计划恢复旧模块：

- `transcriptItemPolicy.ts` 当前在 started 和 completed 两个穷尽 switch 中都显式忽略
  `collabAgentToolCall` 与 `subAgentActivity`，这是两类 item 被过滤的唯一协议解释 seam。
- `TranscriptEntry` / `TranscriptStoredEntry` / `TranscriptEntryView` 当前只有 message、status 和
  agent-message live 形状，不能保存两类 activity 的独立 typed facts 或稳定 view。
- `appendStartedTranscriptItem` 当前只处理 agent message hidden reserve；它还不能让 `resumeAgent` /
  `wait` 的 in-progress item 成为可见 middle entry。
- `projectCompletedTranscriptItem` 已同时被 realtime completion 与 snapshot rebuild 调用；新增 terminal
  materialization 后可直接得到两条路径等价，不需要第二 materializer。
- `classifyNewEntry` 已把非 leading/final 的 presentation 默认放入 middle；activity policy 不需要也
  不得新增 placement 分支。
- `transcriptStateSelectors.ts` 已是 stored entry 到 stable view 的唯一穷尽转换和 WeakMap cache owner。
- `CommittedTranscriptSurface.tsx` 已是唯一 entry renderer，并已拥有 100-entry chunk 边界和
  `Intermediate updates` 的 final 前展开、final 后折叠及隐藏不挂载行为。
- `transcriptProjection.ts` 已统一处理 started/completed/replay；started 调用目前未透传事件
  `commitId`。只有在 Task 3 机械补传该值，中央 implementation 才能让首次可见 transient 使用既有
  committed scroll key，且 projection 本身仍不判断 activity variant。

因此不恢复旧 `transcriptActivityMaterialization.ts`、`transcriptCommittedProjection.ts`、
`TranscriptActivityCard.tsx` 或 activity 专属 order/cache/lifecycle owner。

## 权威输入、UI 与非目标

- 所有协议类型直接使用 `@codex-protocol/v2` 的 generated `ThreadItem`，只允许用 `Extract`、indexed
  access 等机械方式收窄；禁止手写 wire DTO、literal union、validator 或 fallback。
- stored entry 保存有界、前端拥有的 typed facts；`collabAgentToolCall.status`、
  `agentsStates[*].status`、`SubAgentActivity.kind` 与 projection lifecycle 保持为四个不同维度。
- renderer 使用 HeroUI v3 `Card variant="transparent"`、`Card.Header`、`Card.Title` 和条件式
  `Card.Description`；`article` 语义与 accessible name 由 title 提供。
- UI 只使用 HeroUI 默认 surface/text semantic tokens；不新增自定义成功/失败色、图标、badge、
  spinner、avatar、tooltip、popover、button、link 或焦点目标。
- 不修改 CSS、package dependencies、package scripts、generated protocol、validator、GUI Host、
  WebSocket、threadRuntime、Rust、导航、agent picker、mailbox、子线程 transcript 或 liveness。
- 不查询 nickname、role 或跨线程 metadata；collab 只使用 item 内的 `receiverThreadIds`，
  sub-agent 只使用 item 内的 `agentPath`。
- 不添加 screenshot snapshot 或 E2E；Browser Mode 通过 role locator 与可重试的
  `await expect.element(...)` 断言可访问性、顺序、折叠和单 identity 行为，不锁定 HeroUI 内部 DOM、
  CSS class、padding、颜色或阴影。

## 执行约束

- 本计划确认前不修改 `codex-gui/**`、不运行格式化、lint、type-check 或测试、不 stage/commit 本计划。
- 计划确认后严格执行 Task 1 → Task 2 → Task 3；每个 Task 的编辑、验证、stage、staged diff 审查和
  commit 使用边界明确的串行微阶段。
- 每个 Task 只产生一个行为提交，测试跟随产生该行为的提交；不增加 fixture-only、补测试、
  validation-only 或 catch-all 提交。
- 不在行为提交中顺手重排既有 import、声明、字段、函数或组件。若实现确实需要纯顺序移动，停止并
  更新计划，不能混入下述三个提交。
- 不保留临时 adapter、双写、双读、旧新路径、fallback 或兼容层；中间 Task 只增加自身可 type-check
  的垂直切片。
- 所有前端命令从 `/Users/jiangsheng/cnb/codex/codex-gui` 运行，并使用
  `/opt/homebrew/bin/fnm exec --using-file pnpm ...`。
- 不安装或更新 Node、pnpm、依赖或 Playwright browser binary。缺少工具或现有 browser binary 时停止，
  由用户自行安装后再继续。
- 普通源码编辑使用 `apply_patch`；格式化优先使用已有 `oxfmt`，先限定到当前 Task 文件，再用
  `format:oxfmt` 非 fix 模式核验。
- 每个 Task 提交前检查累计 diff 大小；若非机械总变更超过 800 行或复杂逻辑超过约 500 行，停止并按
  当前真实依赖重新拆分，不以省略测试、放宽断言或隐藏问题缩小 diff。
- 当前计划文件若在实施时仍未提交，始终排除在三个代码 Task 的 stage allowlist 之外；是否单独提交
  计划文档由用户另行指示。

## 实施 preflight

计划确认后、Task 1 编辑前逐项运行只读核对：

```text
git branch --show-current
git rev-parse HEAD
git merge-base --is-ancestor 2301a5f5ce438f25920161d516c1836bfc45d75f HEAD
git diff --name-only 2301a5f5ce438f25920161d516c1836bfc45d75f..HEAD -- codex-gui codex-rs
git status --short --branch
test -x /opt/homebrew/bin/fnm
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

preflight 必须满足：

- 当前仍在 `dev`，HEAD 包含实施基线；
- 基线之后没有未计划的 `codex-gui/**` 或 `codex-rs/**` 行为差异；
- worktree 中的用户变更与当前 Task 无重叠；本计划文件是唯一允许保留的本轮未提交文档；
- `codex-gui/package.json` 仍存在 `format:oxfmt`、`lint`、`type-check`、`test:unit`、
  `test:browser` 和 `ci` 脚本；
- fnm-backed pnpm 可用，且不解析到 Codex runtime shim。

若 HEAD、generated `ThreadItem` 字段、脚本名或当前 owner 已变化，先重新核对计划；不得照搬旧路径。

## Task 1：接入 `SubAgentActivity` completed/snapshot 垂直切片

依赖：preflight 通过。

提交：`feat(gui): display subagent activity entries`

### 精确文件

生产文件：

- 修改 `codex-gui/src/features/transcriptState/transcriptStateModel.ts`
- 修改 `codex-gui/src/features/transcriptState/transcriptItemPolicy.ts`
- 修改 `codex-gui/src/features/transcriptState/transcriptStateSelectors.ts`
- 修改 `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`

测试与 builder：

- 修改 `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`
- 新建 `codex-gui/src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts`
- 修改 `codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts`
- 修改 `codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts`
- 修改 `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`
- 修改 `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`

### 实施与不变量

1. 从 generated `ThreadItem` 派生 `SubAgentActivity` builder 和 policy 输入，不在测试或生产代码中手写
   协议镜像。
2. 给 stored entry 与 stable view 各增加独立 `subAgentActivity` discriminant。stored entry 只保留
   `activityKind`、`agentPath`、identity 和 revision；不保存原始 `ThreadItem`，不使用
   `agentThreadId` 形成文案或导航。
3. started policy 对 `subAgentActivity` 保持 `ignore`；completed policy 形成一个 typed entry。
   snapshot 与 realtime completion 继续共用 `projectCompletedTranscriptItem`。
4. selector 穷尽生成三种 TUI 对齐标题：`Started \`{agentPath}\``、
   `Interacted with \`{agentPath}\``、`Interrupted \`{agentPath}\``，details 固定为空。
5. 在唯一 renderer 内建立被两类 activity 复用的纯视觉 shell，并增加
   `subAgentActivity` 分支：transparent Card、只读 `article`、title accessible name、装饰性 bullet，
   无空 description、无交互或 liveness。
6. 继续由 `classifyNewEntry` 默认放入 middle；activity 不能进入 leading/final。若原始
   `Turn.items[0]` 是 activity，后续 user message 仍在 middle。
7. selector cache 继续按 stored entry identity/revision 工作；未变化 entry/chunk view 引用稳定。

### Interface 覆盖

- 三种 kind 的 title、空 details、反引号和原始 `agentPath`；`agentThreadId` 不进入 view。
- `itemStarted` 不产生 view/count；同 ID `itemCompleted` 只产生一条 middle entry。
- completed-only realtime 与 snapshot 得到相同 settled view；顺序、leading/final 和 middle count 正确。
- 100-entry chunk owner、message/status view 和现有 user/assistant Card variant 不变。
- Browser 以 `article` role + accessible name 查找三种活动；无空 description、无新增焦点目标；final 前
  活动可见，final 后折叠时不挂载，展开后顺序恢复。

### 验证与提交

先对本 Task 的 TS/TSX 文件运行限定格式化，再执行：

```text
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

只 stage 本 Task 精确文件，然后检查：

```text
git diff --cached --name-only
git diff --cached --check
git diff --cached
```

确认没有 collab terminal、started lifecycle、纯顺序调整或计划文档后创建本地提交。提交后运行
`git diff-tree --no-commit-id --name-only -r HEAD` 和 `git status --short --branch`。

## Task 2：接入 `CollabAgentToolCall` terminal 垂直切片

依赖：Task 1 已提交且 worktree 只剩允许的计划文档。

提交：`feat(gui): display collaboration activity entries`

### 精确文件

生产文件：

- 修改 `codex-gui/src/features/transcriptState/transcriptStateModel.ts`
- 修改 `codex-gui/src/features/transcriptState/transcriptItemPolicy.ts`
- 修改 `codex-gui/src/features/transcriptState/transcriptStateSelectors.ts`
- 修改 `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`

测试与 builder：

- 修改 `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts`
- 修改 `codex-gui/src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts`
- 修改 `codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts`
- 修改 `codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts`
- 修改 `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`
- 修改 `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`

### 实施与不变量

1. 增加独立 `collabAgent` stored/view discriminant，不与 `subAgentActivity` 抹平成通用
   `{title, details}` 权威 record。
2. stored facts 保留 tool、tool-call status、必要的 receiver 总数与有序有界前缀、prompt preview、
   model/reasoning effort 和有序有界 agent-state summaries；tool status 与 agent status 不互相覆盖。
3. prompt 在进入 Redux 前 `trim()` 并按 grapheme 截到 160；completed/error message 先折叠空白，
   分别截到 240/160。使用目标运行时的 `Intl.Segmenter` grapheme segmentation，不增加 code-unit
   fallback 或依赖。
4. receiver/state detail presentation 最多 64 条，包含最后一条确定性的 omitted-count 摘要；超过上限
   只保存生成这些 presentation 所需的有界前缀和总数，不把无界 raw collection 放进 Redux。
5. terminal `completed` / `failed` 按当前 TUI 同一动作词解释五种 tool；`failed` 不生成统一
   `Failed to ...`，也不虚构错误原因。
6. selector 实现以下 terminal 语义：
   - spawn：有 receiver 为 `Spawned {receiver}`，按 authoritative model/effort 追加说明并可有 prompt；
     无 receiver 为 `Agent spawn failed`；
   - send：有 receiver 为 `Sent input to {receiver}` 并可有 prompt；无 receiver不可见；
   - resume：有 receiver 为 `Resumed {receiver}`，显示 state 或
     `Error - Agent resume failed`；无 receiver 不可见；
   - wait：`Finished waiting`，按 receiver 顺序后接剩余 key 字符串排序的 state details；无有效 state
     为 `No agents completed yet`；
   - close：有 receiver 为 `Closed {receiver}`；无 receiver 不可见。
7. 七种 agent state 文案、completed/error message、wait 排序与 spawn model/effort 规则严格按设计；
   item ID、sender thread ID、nickname、role 不进入 view。
8. renderer 只增加 `collabAgent` 穷尽分支并复用 Task 1 的 activity shell；不新增第二 renderer
   sequence、CSS 或生产模块。

### Interface 覆盖

- 五种 tool 的 terminal `completed` / `failed` 共 10 个单元格及缺 receiver 分支。
- 七种 agent status、resume fallback、wait 空 state、receiver-first + remaining-key sort。
- prompt 160、completed 240、error 160 的边界、超限、组合 grapheme 和不同空白规则。
- 0/1/多 receiver、64 条 detail 上限、omitted count、raw thread ID 与不暴露 sender/item ID。
- completed-only realtime、snapshot、placement、count、chunk 和 stable selector view 等价。
- Browser 断言 title/details 顺序、无 details 时不生成空 description、无焦点目标，并确认已有 message
  Card 与 `Intermediate updates` 行为不变。

### 验证与提交

先对本 Task 的 TS/TSX 文件运行限定格式化，再执行：

```text
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

只 stage 本 Task 精确文件，执行 `git diff --cached --name-only`、`git diff --cached --check` 和
`git diff --cached`。确认没有 started lifecycle、projection wiring、纯顺序调整或计划文档后提交；随后
核对提交文件清单与 worktree 状态。

## Task 3：统一 activity started → terminal 生命周期

依赖：Task 1、Task 2 均已提交，terminal presentation 已稳定。

提交：`feat(gui): preserve agent activity lifecycle`

### 精确文件

生产文件：

- 修改 `codex-gui/src/features/transcriptState/transcriptProjection.ts`
- 修改 `codex-gui/src/features/transcriptState/transcriptItemPolicy.ts`
- 修改 `codex-gui/src/features/transcriptState/transcriptStateImplementation.ts`

测试文件：

- 修改 `codex-gui/src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts`
- 修改 `codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts`
- 修改 `codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts`
- 修改 `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts`
- 修改 `codex-gui/src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts`
- 修改 `codex-gui/src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts`
- 修改 `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts`
- 修改 `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`

### 实施与不变量

1. started policy 完成五种 tool × 三种 status 的完整矩阵：只有 in-progress `resumeAgent` 和 `wait`
   返回可见 typed presentation；in-progress spawn/send/close 和所有 `subAgentActivity.itemStarted` 保持
   ignore；terminal 继续使用 Task 2 的 authoritative materialization。
2. `transcriptProjection.ts` 只把 started event 的 `notification.commitId` 机械传给中央 implementation，
   不检查 item type/status，也不改变 replay/dedup 路由。
3. 泛化 `appendStartedTranscriptItem`：agent message 仍建立既有 hidden reserve；可见 activity 直接通过
   中央 classify/upsert 进入 middle；不可见 started 不建 entry、count、chunk 或 scroll signal。
4. 同一 `(turnId,itemId)` 的可见 transient 与 terminal 共用一个 stored entry、chunk 和 index。
   terminal 完整替换 started payload，不合并 started-only receiver、model、prompt 或旧 state。
5. duplicate started、相同 commit、snapshot duplicate 和 replay 完整 no-op；completed-without-started 在
   首次观察位置直接形成 settled entry；同 raw item ID 跨 turn 继续隔离。
6. terminal `ignore/remove` 能删除同 identity 的可见 activity transient；没有既有可见 entry 的 filtered
   completion 不产生 count/chunk/scroll 变化。
7. 第一次可见 activity started 与实际改变 DOM 的 terminal update/removal 推进
   `committedScrollCommitKey`；它们不推进 `liveScrollPulse`。隐藏/重复 started 和无可见变化的 completion
   不发 scroll signal。
8. 原位 settlement 只替换目标 entry 并递增其 revision 与所属 chunk revision；不移动位置、不增加第二次
   `middleEntryCount`、不使未受影响 chunk view 失效。
9. 不修改 model/view/renderer 语义，不修改 `transcriptStateSlice.ts`、threadRuntime、projection contract
   或现有 agent-message delta lifecycle。

### Interface 覆盖

- 完整 15-cell tool/status policy 矩阵，明确 failed 沿用 terminal 动作词。
- resume/wait started 立即可见；中间追加其他 entry 后 terminal 仍原位更新；terminal 后只剩一张 Card。
- V2 空 wait 从 `Waiting for agents` 原位变为 `Finished waiting` +
  `No agents completed yet`，count 不增加。
- terminal payload 不保留 started-only receiver/请求字段；completed-without-started 正常显示。
- activity first 的 leading 规则、100/101 chunk 边界、scroll key、selector reference、snapshot/realtime
  等价、replacement attach、snapshot duplicate、commit dedup 和跨 turn identity。
- 现有 agent-message live reserve/delta/settlement、status entry、manual reconnect、sticky-bottom 输入信号和
  message renderer 回归通过。
- Browser 在 Chromium、Firefox、WebKit 中断言 started → terminal 只有一个 `article`，final 前展开、
  final 后隐藏不挂载、展开后原顺序恢复。

### Focused 与最终验证

先对本 Task 的 TS/TSX 文件运行限定格式化，然后依次执行：

```text
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run src/features/transcriptState/__tests__/transcriptItemPolicy.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser
```

全部前端验证通过后，从 `/Users/jiangsheng/cnb/codex/codex-rs` 运行：

```text
just fmt
```

按项目规则，`just fmt` 之后不再重跑测试；只检查 `git diff --check`、累计 diff、Task 3 精确文件和
worktree 状态。预期 `just fmt` 不产生 Rust diff；若产生计划外修改，不 stage、不修复，停止并报告。

只 stage Task 3 精确文件，执行 staged diff 三项检查，确认没有 Task 1/2 遗漏、纯顺序调整、Rust、
generated 文件或计划文档后提交。提交后核对提交清单和 worktree，不追加第四个 catch-all 提交。

## 验收标准

- 父任务显示当前 V2 的 `Started`、`Interacted with`、`Interrupted` 和 wait 生命周期。
- V1、V2 与历史 snapshot 中五种 collab tool 按已确认矩阵解释。
- `failed` 沿用当前 TUI 动作摘要，不新增统一失败标题或虚构原因。
- `SubAgentActivity.itemStarted` 不可见，同载荷 completed 只形成一条活动。
- resume/wait started 可见并与 terminal 按同 identity 原位收敛；realtime、snapshot、replay、reattach
  结果等价。
- activity 只使用 `receiverThreadIds` / `agentPath`，不查询 metadata、mailbox 或子线程。
- activity 始终属于 middle；leading/final、100-entry chunks、count、revision、selector reference、
  scroll 和 disclosure 语义保持当前重构约束。
- UI 只有 TUI 已有标题与详情，使用 transparent HeroUI Card，没有图标、badge、导航、交互或 liveness。
- prompt/message、receiver/state collections 都有硬上限；Redux 和 DOM 不保存或展开无界 raw payload。
- `pnpm run ci`、三浏览器 `test:browser`、`just fmt` 和 Git diff 检查全部通过。
- 最终只有三个计划内行为提交；计划文件是否另行提交不混入行为提交。

## 停止条件

出现以下任一情况，停止实施并回到计划确认，不自行扩大范围：

- 当前 generated contract 缺少设计所依赖字段，或需要修改 Rust/protocol/validator/GUI Host；
- 需要新增 dependency、package script、浏览器 binary 或其他可执行组件；
- 需要新增 activity 专属 order/state/cache/lifecycle/selector sequence、公共 registry 或第二 renderer；
- 需要查询 nickname、role、mailbox、子线程 transcript 或 liveness；
- 需要修改计划外文件、改变 leading/final/chunk/sticky-bottom/reconnect 语义，或保留旧新兼容路径；
- 无法避免与用户现有 worktree 变更重叠；
- 验证失败属于预存或无关问题，或修复会越过当前 Task 文件/行为边界；
- change-size guard 要求新增实施任务或提交。

## 确认门禁

本文件只完成计划落盘，不授权实施、格式化、测试、stage 或 commit 产品代码。

用户明确确认本计划后，下一轮才按 Task 1 → Task 2 → Task 3 连续实施、验证并逐任务本地提交。
