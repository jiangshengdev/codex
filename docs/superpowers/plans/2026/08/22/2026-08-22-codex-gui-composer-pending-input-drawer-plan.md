# Codex GUI Composer 待处理输入抽屉实施计划

状态：已确认

日期：2026-08-22

对应设计：`docs/superpowers/specs/2026/08/22/2026-08-22-codex-gui-composer-pending-input-drawer-design.md`

## 目标

在不改变 ordinary 与 steer 两条 FIFO、优先级、交付确认和失败恢复语义的前提下，把 Composer 附近的正常待处理状态收敛为一个只显示 `引导 N` 与 `排队 N` 的紧凑入口，并通过同一个 HeroUI v3 右侧 Drawer 有界、分组地读取逐条预览；截断文本按稳定 key 按需展开，异常和可操作状态继续内联显示。

## 当前代码证据与实施必要性

- `ComposerPendingInputRegion.tsx` 当前把正常 pending/queued steer 逐条铺在 Composer 附近，而 ordinary 只有 `queuedCount`；信息密度不统一来自投影形状，不是间距样式。
- `ComposerInputQueueImpl.ordinary` 和 `composerSteerQueueState` 分别持有两条 lane 的完整权威 payload；React 不应复制队列，详情必须从该 owner 只读派生。
- `composerInputQueueProjection.ts` 与 coordinator snapshot 当前复制全部正常 steer preview，并用完整 snapshot 参与发布比较；只给 Drawer 换 JSX 不能消除无界热路径。
- `projectComposerInputPreview` 已把单条文本限制为 160 grapheme，但尚未公开 `truncated`，也没有按当前 key 读取完整显示文本的边界。
- coordinator 已由 active thread owner 创建并在替换时 dispose；新读取边界必须把 cursor/key 绑定到不可跨 owner 复用的实例 capability，再结合 revision 使旧 cursor、旧 key 与旧展开结果失效，不需要新增 Redux、app-server 或全局生命周期 owner。
- ordinary、pending steer、queued steer、rejected-first、recovery 与 delivery unknown 的当前迁移会影响详情成员或分类；revision 必须覆盖这些既有状态迁移，不能由 React 猜测队列变化。

## 已核验的纵向路径

```text
Composer submit
  -> ComposerInputQueueImpl / composerSteerQueueState（唯一发送 owner）
  -> bounded overview + revision
  -> ComposerInputQueueCoordinator controller（当前 thread 生命周期）
  -> ComposerTurnControl
  -> ComposerPendingInputRegion（正常入口 + 异常内联）
  -> ComposerPendingInputDrawer（有界分页 + 按需完整文本）
```

权威输入类型继续从生成的 `TurnStartParams["input"]` / `UserInput` 机械派生。详情读取不新增 wire DTO、runtime validator、gateway、allowlist 或协议生成物；公开结果只包含显示 key、lane、preview、`truncated`、cursor/revision 与只读文本详情，不返回可重发 `UserInput[]`、claim、path、message identity 或 turn identity。

## 跨任务硬约束

- ordinary 与 steer 继续独立 FIFO；Drawer 的分组、读取和渲染顺序不得改变发送调度、promotion、claim、commit 或 recovery。
- `引导 N` 只统计正常 pending + queued steer；`排队 N` 只统计尚未取得 start ownership 的 ordinary。rejected-first、recovery、pending start 不进入两项计数；steer unknown 仍属于正常 steer owner并继续计入 `引导 N`。
- 热 snapshot 最终不得保留正常 `pendingSteers` / `queuedSteers` 详情数组；rejected、unknown、interrupt、recovery 与 release blocker 的现有内联事实保持可用。
- owner 强制固定分页上限；cursor 对 React 不透明并同时绑定 owner instance capability 与 revision。foreign-owner cursor 或 revision 改变后 UI 丢弃全部旧页并从首屏重读，不在本地拼接新旧队列。
- React 只缓存当前 Drawer 的有界显示页和展开结果，不成为发送 owner；Drawer 关闭、打开、翻页或 Disclosure 展开不得迁移任何 queue claim。
- 完整详情只允许当前仍存在且文本 preview 被截断的 key；结构化输入保持机械摘要，不新增结构化详情 renderer。
- rejected-first、`引导状态未知`、`未发送`和`继续发送`继续在现有待处理区域内联；动作区现有 interrupt `Stop failed` 保持原位。所有异常都不迁入正常 Drawer，也不新增 ordinary pending-start unknown 文案。
- 最终只保留新的正常详情读取路径。禁止留下旧 snapshot 数组、双读、fallback、adapter、双写或兼容分支。
- 不修改 app-server、生成协议、Redux、transcript、RPC 顺序、client identity、持久化、编辑/删除/重排/重试能力。
- HeroUI v3 使用本地文档证明的 compound API，不新增依赖、Provider、自定义 overlay、focus trap、scroll lock 或 Disclosure 状态机。
- 不用固定 padding、gap、颜色、阴影或圆角断言锁定视觉调参；测试稳定的计数、内容边界、可访问性、焦点和溢出约束。

## HeroUI 与可访问性落点

- 单一入口：`Button variant="secondary"`；内部两个非交互 `Chip size="sm"` 分别显示 guide 与 ordinary 数量，完整 accessible name 同时包含当前可见计数。
- 详情层：受控 `Drawer.Backdrop isOpen/onOpenChange`、`Drawer.Content placement="right"`、`Drawer.Dialog`、`Drawer.CloseTrigger`、`Drawer.Header`、`Drawer.Heading`、`Drawer.Body`。
- 长文本：仅 `truncated=true` 的文本使用 HeroUI `Disclosure`；展开时按 key 向当前 controller 读取完整文本，失效后关闭该条内容。
- 分页：使用 `Button variant="tertiary"` 的明确“显示更多”操作；每次新增 DOM 数量受 owner 上限约束，`Drawer.Body` 负责滚动。
- 分组继续使用语义 `section`、heading 与 list；这些承载文档结构，不用无对应语义的组件替代。
- Drawer 正常关闭后焦点回到入口。若打开期间两项计数归零或 owner 被替换，则先关闭 Drawer、清除旧页，并把焦点安全转回 Composer 编辑器后再隐藏失效入口；revision 或队列更新不得自动打开 Drawer、抢走既有编辑焦点或保留旧线程详情。

## 执行规则与提交序列

用户确认本计划前不得实施。确认后先把本设计和本计划作为独立本地文档提交，再按以下任务逐个修改、定向验证、只暂存相关文件、审查 staged diff 并创建独立本地提交。任何修正另建新提交，禁止 amend；不操作 Git 远程。

1. `docs(gui): record composer pending input drawer design`
2. `feat(gui): add bounded composer pending input reads`
3. `feat(gui): expose bounded pending input controller reads`
4. `feat(gui): add composer pending input drawer`
5. `test(gui): verify pending input drawer integration`

行为提交不得顺手移动或重排 import、声明、字段、分支、函数或组件；若自动工具产生无关顺序变化，应撤出。普通源码没有能表达该语义的项目自动化工具，使用精确 patch；Lingui catalog 只通过 `messages:extract` 生成后补译，不运行 `messages:extract:clean`，不手写生成流程。

每个源码任务完成普通 TS/TSX 编辑后，只对该任务 handwritten 文件运行 scoped：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write <task-files>
```

然后检查实际 diff，并运行该任务列出的非 fix 验证。所有 pnpm 命令均在 `codex-gui` 下通过 `/opt/homebrew/bin/fnm exec --using-file pnpm ...` 执行；不安装依赖或浏览器，不主动运行后端或原生构建。

## 任务 1：提交已确认设计与实施计划

**文件**

- `docs/superpowers/specs/2026/08/22/2026-08-22-codex-gui-composer-pending-input-drawer-design.md`
- `docs/superpowers/plans/2026/08/22/2026-08-22-codex-gui-composer-pending-input-drawer-plan.md`

**实施**

- 用户确认计划后，把本计划状态改为“已确认”。
- 只提交这两份工作文档，不夹带源码或其他工作树变更。
- 该提交成功前禁止开始任务 2。

**验证**

```bash
git diff --check -- docs/superpowers/specs/2026/08/22/2026-08-22-codex-gui-composer-pending-input-drawer-design.md docs/superpowers/plans/2026/08/22/2026-08-22-codex-gui-composer-pending-input-drawer-plan.md
git diff --cached --check
```

## 任务 2：在 queue owner 建立有界只读详情

**文件**

- 修改：`codex-gui/src/features/composerInputQueue/composerInputQueueContracts.ts`
- 修改：`codex-gui/src/features/composerInputQueue/composerInputPreview.ts`
- 修改：`codex-gui/src/features/composerInputQueue/composerSteerQueueState.ts`
- 修改：`codex-gui/src/features/composerInputQueue/composerInputQueue.ts`
- 修改测试：`codex-gui/src/features/composerInputQueue/__tests__/composerInputPreview.test.ts`
- 修改测试：`codex-gui/src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts`
- 修改测试：`codex-gui/src/features/composerInputQueue/__tests__/composerInputQueue.test.ts`

**实施**

- 从 authoritative `UserInput` 机械定义 overview、lane、稳定 display key、分页请求/结果、stale/unavailable 与完整文本详情结果；不复制 wire union。
- preview 明确携带 `truncated`，完整文本投影复用同一 grapheme 规范化；结构化输入只保留现有机械摘要。
- steer state 增加直接在内部数组上进行 pending-then-queued 的有界读取和按 key 查找，禁止先调用会复制完整数组的 `state()` 再 `slice()`。
- queue facade 作为唯一组合 owner，提供 steer 与 ordinary 两条独立分页；固定最大 page size，cursor 绑定不可跨 owner 复用的实例 capability 与单调 detail revision，所有改变正常详情成员或顺序的 enqueue、promotion、issue、commit、terminal 与 recovery restore 均推进 revision。
- 按 key 只返回当前仍存在的规范化文本，不返回 payload、claim 或发送能力。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/composerInputQueue/__tests__/composerInputPreview.test.ts src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts src/features/composerInputQueue/__tests__/composerInputQueue.test.ts
```

测试必须证明 160-grapheme/truncated、两 lane FIFO、pending-before-queued steer、超额 limit 仍被 owner 截断、cursor 连续访问全部条目、revision 后旧 cursor stale、foreign-owner cursor 被拒绝、已移除 key 不可读取，以及公开页/详情不含可重发 payload。

## 任务 3：切换 coordinator 热快照与只读 controller

**文件**

- 修改：`codex-gui/src/features/composerInputQueue/composerInputQueueProjection.ts`
- 修改：`codex-gui/src/features/composerInputQueue/composerInputQueueCoordinator.ts`
- 修改测试：`codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts`

**实施**

- 将热 snapshot 一次性切换为 `guidingCount`、`ordinaryQueuedCount`、detail revision 和现有异常/recovery/rejected/release 摘要；删除正常 `pendingSteers` / `queuedSteers` 数组及其无界 projection。
- controller 暴露只读 `readPendingInputPage` 与 `readPendingInputDetail`（最终名称可按文件惯例等价调整），直接委托 queue owner，不复制第二份详情。
- disposed controller 返回 unavailable；旧 revision/cursor 返回 stale。controller 实例继续天然绑定当前 thread owner 与 generation，不新增 lifecycle owner。
- 保持 release/readiness blockers、unknown、rejected-first、recovery、interrupt 和 delivery classification 语义不变。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts
```

测试必须证明 snapshot 不含正常正文/完整 payload、两项 count 分类口径正确、分页委托有界、旧 revision 与 dispose 失效，以及 unknown/rejected/recovery/release blocker 没有被隐藏或重分类。本任务切换公开契约后允许下游 UI 测试暂时待任务 4 同步，但不得保留旧字段作为兼容路径。

## 任务 4：接入 HeroUI 待处理入口与统一 Drawer

**文件**

- 修改：`codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- 修改：`codex-gui/src/features/composerTurnControl/ComposerPendingInputRegion.tsx`
- 新增：`codex-gui/src/features/composerTurnControl/ComposerPendingInputDrawer.tsx`
- 修改测试：`codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
- 机械更新并补译：`codex-gui/src/locales/en.po`
- 机械更新并补译：`codex-gui/src/locales/zh-CN.po`

**实施**

- `ComposerTurnControl` 只向当前匹配 thread 的 region 传递 snapshot 与 controller 只读能力；不匹配或已 dispose owner 不提供详情。
- `ComposerPendingInputRegion` 只组合单一正常入口与现有 rejected、unknown、recovery 内联区域；正常逐条列表迁出。动作区现有 interrupt `Stop failed` 保持在 `ComposerTurnControl` 原位置，不迁入 region。
- 新 Drawer 私有组件使用上述 HeroUI compound API，两个独立 Chip、两个分组、受限“显示更多”与按需 Disclosure；不承担 queue owner 或发送动作。
- Drawer 打开期间 revision 改变时清空旧页/旧展开文本并从首屏重读；条目移除时不显示陈旧内容。两项计数归零或 owner 替换时关闭 Drawer，焦点安全转回 Composer 编辑器后再隐藏失效入口；其他正常关闭路径仍把焦点返回单一入口。
- 运行 `messages:extract` 机械更新 catalog，再只补目标中文翻译；不运行 clean，不扩大 catalog 删除范围。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.parallel.config.ts src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
```

全项目 `type-check` 延后到任务 5 完成旧 App 测试消费者迁移后执行，避免把预期的跨任务不完整状态伪装成任务 4 失败。Browser 测试通过 render 返回的 baseElement locator 查询 portal，使用 role/name、`await expect.element(...)` 和 locator 交互；覆盖单 Trigger、零值隐藏、两个 Chip、分组 FIFO、分页、展开/收起、revision/owner 失效、异常继续内联、正常关闭焦点返回 Trigger，以及打开期间归零/owner replacement 时关闭 Drawer 并把焦点转回 Composer 编辑器。不得只查询 React container，也不新增固定间距断言。

## 任务 5：验证 App 纵向语义与窄屏响应式行为

**文件**

- 修改测试：`codex-gui/src/__tests__/App.browser.test.tsx`
- 修改测试：`codex-gui/src/__tests__/sequential/composer-viewport.browser.test.tsx`

**实施**

- 把 App 测试对旧 snapshot 正常 steer 数组的直接读取迁移为 controller 只读详情，不保留旧字段断言。
- 纵向证明 ordinary 入队可在 Drawer 读取但不乐观进入 transcript；steer 越过 ordinary 且 RPC/client identity 不变；matching commit 和 ordinary drain 后对应条目消失。
- 证明 unknown/mismatch 阻塞后继且异常内联，rejected-first/recovery 不进入正常两项计数，old owner replacement 后 foreign cursor 被拒绝、旧详情不可见且焦点返回 Composer 编辑器。
- 把现有窄屏铺开列表预期改为紧凑入口 + 右侧 Drawer；验证 390×700 下入口、关闭控件、长文本、连续长 token、结构化摘要和 Drawer 内容无横向溢出。
- 不扩展 Playwright E2E：现有 App Browser harness 已覆盖真实 Composer→coordinator→RPC/commit 路径，而 E2E fake 当前没有 steer 分支，扩展会重复造协议路径。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.parallel.config.ts src/__tests__/App.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.sequential.config.ts src/__tests__/sequential/composer-viewport.browser.test.tsx
```

## 最终验证与收尾

任务 5 提交前，在全部任务合并后的最终状态运行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/composerInputQueue/__tests__/composerInputPreview.test.ts src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts src/features/composerInputQueue/__tests__/composerInputQueue.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.parallel.config.ts src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/__tests__/App.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.sequential.config.ts src/__tests__/sequential/composer-viewport.browser.test.tsx
```

再使用 `$debug-responsive-gui` 在可见 Google Chrome for Testing 中核验桌面与窄屏：单一入口不挤压 Composer 主操作、Drawer 可滚动且无横向溢出、Disclosure/关闭控件可键盘操作、异常与恢复仍无需打开 Drawer 即可发现。只记录可复现步骤与截图证据，不把主观 spacing 数值写入测试。

所有代码和前端验证完成后，从 `codex-rs` 运行仓库要求的格式化入口：

```bash
just fmt
```

该命令不是后端构建；运行后只检查格式化 diff，不再重跑测试。若它产生本计划范围外修改，停止并报告，不夹带提交；若它修改已提交任务 2–4 的计划内文件，必须创建新的独立纯格式化修正提交，禁止并入任务 5 或 amend。最终执行 `git diff --check`、相关 staged diff 审查并提交任务 5；确认全部任务提交合并后的工作树没有本任务未提交变更。

## 排除项的当前代码依据

- 不改 app-server/protocol/generated validators：Drawer 详情完全来自 GUI 本地 queue 已拥有的 generated `UserInput` payload，没有新增 wire surface。
- 不改 Redux/transcript：待处理输入仍由 current thread queue owner 管理，只有现有权威 commit 才进入正式 transcript。
- 不改 `composerStartQueueState.ts`：pending start 不属于普通 `排队 N` 或正常 Drawer 分组。
- 不改 active owner/thread switch 行为：`activeThreadOwner.ts` 已集中创建、替换并 dispose coordinator；只读 controller 复用该生命周期。
- 不新增 E2E：App Browser 测试已有 active owner、command、commit 与 replacement harness，可覆盖本次纵向行为。
- 不新增依赖或 HeroUI Provider：`@heroui/react`、`@heroui/styles` 已安装，现有 App 已使用同版组件。

## 完成标准

- Composer 附近只有一个正常待处理入口，并分别显示 `引导 N` 与 `排队 N`；两项均为零时入口隐藏。
- 同一个右侧 Drawer 有界、分组地展示两条 lane，所有条目可按 FIFO 访问；截断文本可展开和收起。
- 正常正文和完整 payload 不进入热 snapshot，React 不成为第二份发送 owner；旧 cursor、旧 key、dispose 与 thread replacement 均安全失效。
- rejected-first、unknown、recovery 与 interrupt 等异常/可操作状态继续内联，ordinary/steer 执行与 commit/recovery 语义不变。
- HeroUI 负责 overlay、焦点、键盘、滚动与 Disclosure；Lingui 中英文和 accessible name 完整。
- 定向 unit、三浏览器 Browser Mode、App 纵向、390×700 响应式、format、lint、type-check、可见 GUI 与最终 `just fmt` 全部通过。
- 最终只有一个正常详情读取路径，没有兼容层、旧热数组、双写、双读、fallback 或计划外变更。
