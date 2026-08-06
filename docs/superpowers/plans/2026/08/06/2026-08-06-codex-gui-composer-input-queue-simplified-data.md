# Codex GUI Composer 输入队列简化数据实施计划

状态：已确认

日期：2026-08-06

实施基线：`dev @ 7eb4c18f03bc00261492c9bc32c60fb8af061637`

对应设计：[Codex GUI Composer 输入队列简化数据设计](../../../../specs/2026/08/06/2026-08-06-codex-gui-composer-input-queue-simplified-data-design.md)

设计确认：用户已在聊天中明确确认对应设计。计划获得确认后，Task 0 才同步设计与计划文档的状态并创建文档提交。

## 目标

在不推翻第二版既有产品决策的前提下，实现 ordinary next-turn queue 的最小纯数据闭环：以稳定消息 identity、opaque start claim、single-flight、权威 runtime/commit 事实和 recovery effect 保持 owner 守恒，同时把 steer、管理、UI 和真实接线整体延期。

最终交付是一个低于 500 行的 `composerInputQueue` 生产 Module 及其公开 Interface 序列测试。该交付只证明数据状态机语义，不声称 GUI 产品路径已经可达。

## 架构摘要

### Module seam

状态机位于“决定数据 transition/effect”和“外部 consumer 执行 effect”之间。公开面最终只有：

- `createComposerInputQueue({ activeTurnId })`；
- `submit(message)`；
- `settleStart(settlement)`；
- `observe(observation)`。

每个操作统一返回完整的 `{ result, effects }`。effect 只有：

- `performStart`，携带只拥有一条消息的 opaque `StartClaim`；
- `recover`，携带保留逐条 identity、消息边界与 FIFO 顺序的 `RecoveryBatch`。

### 内部责任

Module 内部独占以下机制：

- ordinary FIFO 与当前 active turn；
- 单一 pending start 及 `issuing`、`acceptedAwaitingStart`、`deliveryUnknown` 三阶段；
- known message identity 与唯一 owner 守恒；
- settlement、runtime、commit 的双向乱序归并；
- fixed-size 最近记录窗口内的 exact replay、stale、foreign/ownership mismatch 分类；
- `completed`、`failed`、`interrupted` 与 start definite rejection 的不同 owner 释放和 drain/recovery 行为。

最近记录窗口使用生产代码内部常量，不能成为公开配置，也不能无限累积历史事实。窗口淘汰后的旧事实只能安全分类，不得再次产生 effect 或改变 owner。

### 权威契约

协议字段的权威来源是 `@codex-protocol/v2`。Task 2 从 `ThreadItem`、`ThreadProjectionEventNotification` 和 `Turn` 使用 `Extract`、indexed access、`Exclude` 等机械派生需要的字段类型：

- turn identity 从 `Turn["id"]` 派生；
- terminal status 从 `Turn["status"]` 排除 `inProgress` 派生；
- commit identity 从 `ThreadProjectionEventNotification["commitId"]` 派生；
- user message client identity 从 `Extract<ThreadItem, { type: "userMessage" }>` 派生。

不得手写协议 string union，不得依赖 Redux slice 的 `ThreadRuntimeLiveTurnCompletion`，也不得通过 `unknown`、宽泛 record 或断言重新构造协议契约。

## 精确范围

允许创建或修改：

- `docs/superpowers/specs/2026/08/06/2026-08-06-codex-gui-composer-input-queue-simplified-data-design.md`，仅 Task 0 同步状态；
- `docs/superpowers/plans/2026/08/06/2026-08-06-codex-gui-composer-input-queue-simplified-data.md`，仅 Task 0 同步状态；
- `codex-gui/src/features/composerInputQueue/composerInputQueue.ts`；
- `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueue.test.ts`。

代码范围包括：

- ordinary FIFO、unbounded-by-product-semantics 入队；
- 空白与 duplicate identity 分类；
- opaque 单消息 `StartClaim` 与 single-flight；
- accepted、definitely-not-accepted、delivery-unknown settlement；
- runtime start、user message commit、terminal completion observation；
- completed/failed 单条 drain；
- interrupted 和 definite rejection 的纯数据 recovery；
- 有界 replay/stale/ownership mismatch 分类；
- 只通过公开 Interface 驱动的 Node/Vitest 序列测试。

## 非目标

- 不实现 steer，且不预留 steer intent、claim、attempt、effect、状态或 fallback。
- 不实现 edit、delete、clear、undo、manage 或 view。
- 不实现 React、Redux、UI、effect runner、command caller、runtime adapter 或 recovery consumer。
- 不修改 Composer、gateway、thread runtime、projection ingress、app-server 协议或生成产物。
- 不实现附件、容量上限、持久化、页面切换、刷新恢复或跨 thread 迁移。
- 不新增 browser、E2E、build 或 snapshot 验证。
- 不运行或生成 protocol validator；CI 只运行既有 `protocol:check-validators` 检查。
- 不安装、升级或删除任何依赖、运行时、浏览器或工具。
- 不操作 Git 远程。

## Preflight

计划确认并进入实现后，先在仓库根目录逐项只读核验：

```bash
git branch --show-current
git rev-parse HEAD
git status --short
git diff -- docs/superpowers/specs/2026/08/06/2026-08-06-codex-gui-composer-input-queue-simplified-data-design.md docs/superpowers/plans/2026/08/06/2026-08-06-codex-gui-composer-input-queue-simplified-data.md
git diff --cached --name-only
git check-ignore -v -- docs/superpowers/specs/2026/08/06/2026-08-06-codex-gui-composer-input-queue-simplified-data-design.md
git check-ignore -v -- docs/superpowers/plans/2026/08/06/2026-08-06-codex-gui-composer-input-queue-simplified-data.md
```

要求：

- 当前分支为 `dev`，实施起点为 `7eb4c18f03bc00261492c9bc32c60fb8af061637`；若 HEAD 已变化，先核验变化是否影响计划证据和文件范围，不盲目继续。
- 记录并保留用户已有变更；任何范围内预存修改都先报告，不覆盖。
- 两份文档不得被 ignore；禁止强制暂存被 ignore 的文件。
- Task 1 前确认两个代码目标文件不存在；若已经出现，停止并核验来源，不覆盖未知变更。
- 检查 `/opt/homebrew/bin/fnm`、fnm 选定的 Node/pnpm 与 `codex-gui/node_modules` 是否可用。缺失时停止，告知用户自行安装或准备；助手不得安装。

在 `codex-gui` 目录执行：

```bash
/opt/homebrew/bin/fnm exec --using-file node --version
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

## 工具链与编辑约束

- 所有 pnpm/Node 命令的 cwd 均为 `codex-gui`。
- 所有 pnpm 命令使用 `/opt/homebrew/bin/fnm exec --using-file pnpm ...`，避免 Codex runtime shim。
- 普通 TypeScript 源码没有更高层生成或迁移工具可表达时，才使用 `apply_patch` 编辑。
- 格式化只使用仓库现有 `oxfmt`；先限定目标文件 `--write`，随后用非 fix 检查和全树 `format:oxfmt` 验证。
- 不运行依赖安装命令，不更新 lockfile，不生成 protocol validator。
- 合法、完整的 projection fixture 若后续确有需要，必须复用或扩展 `src/features/projection/__tests__/projectionFixtures.ts` 与 `projectionTestBuilders.ts`；但本计划不允许修改这些文件，因此当前测试应优先直接构造 queue 自身的 domain observation。
- 测试必须整体验证 `{ result, effects }`，只从 effect 获取 claim/recovery 数据；不得读取内部 state、增加 `view` 或添加 test-only production helper。
- 每个代码 Task 的 changed lines 目标低于 500 行。若该 Task 的 staged numstat 达到或超过 500 行，停止实现并回到计划拆分，不能为了行数删减断言、压缩可读性或机械拆空文件。
- 行为改动提交不得夹带 import、声明、字段、函数或分支的纯顺序调整；若出现纯重排需求，必须作为独立计划任务重新确认，不能塞入 Task 1/2。
- Task 1 中间状态可以尚未具备 `observe`，但必须通过自身 focused test 与 type-check；不得为了中间完整性添加临时 compat、stub、空入口、fallback、双路径或占位状态。

## 失败闭环

- 当前 Task 引入的 focused test、lint、type-check、format 或 CI 失败，必须在同一 Task 的精确文件和行为边界内修正并重新验证，然后才可提交。
- 禁止通过 ignore、skip、豁免、断言放宽、静默兜底、基线修改或删除覆盖来消除失败。
- 若失败证明需要修改计划外文件、改变公开行为、扩展协议/数据语义或新增交付物，停止实施，报告证据并回到计划确认。
- 预存或无关失败只记录和报告，不借本任务修复。
- 若最终生产 Module 达到或超过 500 行，停止并重新拆分设计/计划；不得机械分文件掩盖同一状态机复杂度。

## Task 0：确认文档状态

### 文件

- 修改 `docs/superpowers/specs/2026/08/06/2026-08-06-codex-gui-composer-input-queue-simplified-data-design.md`。
- 修改 `docs/superpowers/plans/2026/08/06/2026-08-06-codex-gui-composer-input-queue-simplified-data.md`。

### 修改

- 计划获得用户明确确认后，把设计状态从“设计草案，待确认”改为“设计已确认”。
- 同时把本计划状态从“待确认”改为“已确认”。
- 除两处状态外不修改正文，不顺手格式化或重排文档。

### 检查与提交

在仓库根目录执行：

```bash
git diff --check -- docs/superpowers/specs/2026/08/06/2026-08-06-codex-gui-composer-input-queue-simplified-data-design.md docs/superpowers/plans/2026/08/06/2026-08-06-codex-gui-composer-input-queue-simplified-data.md
git add -- docs/superpowers/specs/2026/08/06/2026-08-06-codex-gui-composer-input-queue-simplified-data-design.md docs/superpowers/plans/2026/08/06/2026-08-06-codex-gui-composer-input-queue-simplified-data.md
git diff --cached --name-only
git diff --cached --check
git diff --cached --numstat
git diff --cached
git commit -m 'docs(gui): design simplified composer input queue'
```

提交前 staged 文件必须恰好为上述设计与计划文档。

提交信息：`docs(gui): design simplified composer input queue`

## Task 1：实现 ordinary queue 与 start settlement 核心

### 文件

- 新建 `codex-gui/src/features/composerInputQueue/composerInputQueue.ts`。
- 新建 `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueue.test.ts`。

### 测试先行范围

先通过公开 Interface 编写本 Task 的序列测试，但不强制人为保留 RED 提交：

- idle submit 只产生一个单消息 `performStart`；
- active/pending/busy submit 进入 ordinary FIFO 且没有 outbound effect；
- 空白消息和本地仍被持有的 duplicate identity 不改变 owner；
- accepted 保持 single-flight，exact replay 不重复 effect，冲突 settlement 为 stale，foreign claim 为 ownership mismatch；
- delivery unknown 继续持有 owner并阻塞自动 drain；
- definitely not accepted 只 recovery 当前 claim，同时只为剩余 FIFO 队首产生一个新 start；
- recovery 与下一 start 的 owner 不重叠，消息 identity 在转交 recovery 后可被新的 submit 使用。

测试可以定义仅存在于测试文件的 message、effect extraction 辅助函数，但不得在生产 Module 添加 test-only API。

### 实现范围

- 建立 `createComposerInputQueue`、`submit`、`settleStart`；本 Task 不声明或放置空的 `observe`。
- 建立 immutable `ComposerQueueMessage`、opaque 单消息 `StartClaim`、`RecoveryBatch`、`Result`、`Effect` 和 `Transition`。
- 内部维护 ordinary FIFO、known identity、active turn、单一 pending start 和有界最近 settlement 记录。
- accepted 进入 `acceptedAwaitingStart`；delivery unknown 进入阻塞状态；definite rejection 释放 claim、产生 recovery 并安全 drain 一条。
- 不加入 steer、manage、view、Redux、adapter、协议 observation 或未来 optional callback。

### 验证

在 `codex-gui` 目录执行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/composerInputQueue/composerInputQueue.ts src/features/composerInputQueue/__tests__/composerInputQueue.test.ts --write
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --check src/features/composerInputQueue/composerInputQueue.ts src/features/composerInputQueue/__tests__/composerInputQueue.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/composerInputQueue/__tests__/composerInputQueue.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxlint src/features/composerInputQueue/composerInputQueue.ts src/features/composerInputQueue/__tests__/composerInputQueue.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec eslint src/features/composerInputQueue/composerInputQueue.ts src/features/composerInputQueue/__tests__/composerInputQueue.test.ts --cache
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
```

### 暂存与提交

在仓库根目录只暂存本 Task 两个文件：

```bash
git add -- codex-gui/src/features/composerInputQueue/composerInputQueue.ts codex-gui/src/features/composerInputQueue/__tests__/composerInputQueue.test.ts
git diff --cached --name-only
git diff --cached --check
git diff --cached --numstat
git diff --cached
git commit -m 'feat(gui): add ordinary composer input queue core'
```

提交前检查：

- staged 文件恰好为两个新文件；
- staged changed lines 低于 500；
- diff 不含 `observe` stub、steer、management、Redux/adapter 或纯代码顺序调整；
- focused test、focused lint、type-check 和 format 已通过。

提交信息：`feat(gui): add ordinary composer input queue core`

## Task 2：实现 runtime 收敛与 terminal recovery

### 文件

- 修改 `codex-gui/src/features/composerInputQueue/composerInputQueue.ts`。
- 修改 `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueue.test.ts`。

### 测试先行范围

继续只经公开 Interface 添加序列测试：

- `turnStarted`、`userMessageCommitted`、terminal 在 settlement 前后到达时等价收敛；
- accepted awaiting start 与 matching runtime fact 完成交接，foreign turn 不替换 owner；
- delivery unknown 只由 matching start/commit/terminal 权威事实收敛，无事实时不 recovery、不重试、不 drain；
- completed 与 failed 释放 matching owner，并只启动 ordinary FIFO 队首一条；
- interrupted 把全部 ordinary 消息按原 identity、边界和 FIFO 转入一个 `RecoveryBatch`，只产生 recover、不 start；空 ordinary 不产生空 recovery；
- terminal replay 不重复 drain，recovery 不重复产生；
- commit replay、同 commit identity 指向不同 message/turn、迟到 terminal 和 foreign claim/turn 分别得到安全分类，且错误事实不改变 owner；
- 一段覆盖 submit、settlement、runtime、commit、terminal、recovery 的固定长序列证明每条消息至多一个 owner且每个 transition 至多一个 start。

测试优先直接构造 queue domain observation。只有确实需要合法完整 projection payload 时，才复用既有 projection fixture/builder；本计划不允许为此扩大文件范围。

### 实现范围

- 在现有对象上加入最终第四个公开入口 `observe`，不新增其他公开入口。
- 从 `@codex-protocol/v2` 的 `ThreadItem`、`ThreadProjectionEventNotification`、`Turn` 机械派生 observation 字段类型。
- 实现 runtime/commit 与 settlement 的双向乱序事实暂存和归并。
- 实现 completed/failed 单条 drain、interrupted 纯 recovery、delivery unknown 权威收敛。
- 以内部常量限制最近 terminal、commit、settlement/replay 分类窗口；窗口不得公开配置或无限增长。
- 不依赖 `ThreadRuntimeLiveTurnCompletion`，不手写 terminal status 等协议 string union。
- 不加入 UI、Redux、adapter、effect runner、consumer、steer 或 management。

### 验证

在 `codex-gui` 目录执行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/composerInputQueue/composerInputQueue.ts src/features/composerInputQueue/__tests__/composerInputQueue.test.ts --write
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --check src/features/composerInputQueue/composerInputQueue.ts src/features/composerInputQueue/__tests__/composerInputQueue.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/composerInputQueue/__tests__/composerInputQueue.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxlint src/features/composerInputQueue/composerInputQueue.ts src/features/composerInputQueue/__tests__/composerInputQueue.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec eslint src/features/composerInputQueue/composerInputQueue.ts src/features/composerInputQueue/__tests__/composerInputQueue.test.ts --cache
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
wc -l src/features/composerInputQueue/composerInputQueue.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
```

`pnpm run ci` 包含 `protocol:check-validators`、全树 `format:oxfmt`、lint、type-check 和 unit tests。本 Task 不运行 `protocol:generate-validators`。

### 暂存与提交

在仓库根目录只暂存本 Task 两个文件：

```bash
git add -- codex-gui/src/features/composerInputQueue/composerInputQueue.ts codex-gui/src/features/composerInputQueue/__tests__/composerInputQueue.test.ts
git diff --cached --name-only
git diff --cached --check
git diff --cached --numstat
git diff --cached
git commit -m 'feat(gui): complete composer queue runtime convergence'
```

提交前检查：

- staged 文件恰好为两个代码文件；
- 本 Task staged changed lines 低于 500；若达到或超过 500，停止并拆分计划；
- 最终 `composerInputQueue.ts` 严格低于 500 行；
- diff 不含协议 union 镜像、`ThreadRuntimeLiveTurnCompletion`、steer/management、临时兼容路径、stub、空文件拆分或纯代码顺序调整；
- focused 与完整 CI 均通过。

提交信息：`feat(gui): complete composer queue runtime convergence`

## 最终验收

- 恰好产生三个按任务独立的本地提交，顺序为 Task 0、Task 1、Task 2；不得合并任务提交。
- Task 0 只包含设计与计划状态同步；Task 1/2 各只包含两个 queue 文件。
- 最终公开面和 effect 与设计一致，没有未来扩展点。
- ordinary FIFO、single-flight、owner 守恒、三阶段 pending start、乱序收敛与有界安全分类均由公开 Interface 序列测试覆盖。
- failed 继续一条；interrupted 只 recovery；definite rejection recovery 当前 claim 后继续一条。
- 协议字段保持机械派生，协议不兼容变化能在 type-check/CI 暴露。
- 生产 Module 严格低于 500 行，两个代码 Task 各自 changed lines 低于 500。
- 没有 UI、Redux、真实接线、browser/E2E/build/snapshot、安装、生成或 Git 远程操作。
- 所有计划内验证和本次变更引入的问题已闭环；预存或无关问题仅报告。
