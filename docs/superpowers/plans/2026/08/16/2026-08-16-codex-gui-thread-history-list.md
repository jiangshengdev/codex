# Codex GUI 历史任务列表查看实施计划

计划状态：已确认

确认日期：2026-08-16

确认原文：`确认计划`

计划日期：2026-08-16

对应设计：
`docs/superpowers/specs/2026/08/16/2026-08-16-codex-gui-thread-history-list-design.md`

计划分支：`dev`

计划基线：`b09b58a85220f5bcc99735f0fd208c9a8be44d4c`

## 唯一目标

按已确认设计，为 Codex GUI 增加当前 cwd 下未归档 thread 的历史列表、只读详情和显式继续能力，
并以常驻全宽顶栏中的 HeroUI Drawer 作为当前任务与历史记录的导航入口。

## 当前代码为何必须修改

- `src/router.tsx` 只有 `/`，且 `App` 作为该叶子路由组件；进入新路由会卸载
  `GuiHostConnectionBridge`，关闭连接并丢失 commands、projection coordinator 与 Composer queue。
- `AppShell` 无条件渲染 live transcript 与 Composer，没有公共 chrome 与页面内容槽位。
- `APP_SERVER_REQUEST_METHODS` 和 `GuiHostCommandGateway` 尚未接入 `thread/list`、`thread/read`、
  `thread/resume` 和 `thread/projection/detach`；页面不能绕过生成 validator 直接请求 transport。
- `rebuildTranscriptFromSnapshot` 只会原地写入 live Redux transcript；
  `CommittedTranscriptSurface` 又直接绑定 `useAppSelector`，无法承载隔离的只读 `Thread.turns`。
- `ProjectionApplicationCoordinator` 只有一个 ingress，attach 后立即 dispatch live Redux；它不能直接
  充当 candidate owner。
- `ComposerInputQueueCoordinator.dispose()` 会清空 recovery/deferred 状态并使在途 settlement 失效，
  但公开 snapshot 不能完整判断 queue 是否可安全释放。

因此本次不是单纯增加 Card 页面；必须先建立生成请求面、只读 transcript seam、queue 释放门禁和
transactional thread switch owner，再连接页面。

## 权威 contract 与状态边界

```text
app-server v2 generated ClientRequestDefinition / Thread / Turn
  -> APP_SERVER_REQUEST_METHODS
  -> generated requestDescriptors + runtime validators
  -> GuiHostCommandGateway
  -> page-local list/read owners or connection-scoped thread switch owner
```

- 不修改 Rust app-server 协议、schema 或 generated TypeScript；已有稳定 v2 contract 已覆盖本功能。
- GUI 不手写 `Thread`、`Turn`、status union、request/response DTO 或 validator。
- 列表与只读详情是 route-local owner，不新增 Redux server-cache slice，也不使用 RTK Query。
- live identity/runtime/transcript 仍是 Redux 唯一权威状态；跨 slice 切换由一次共享 action 完成。
- 页面只调用“继续指定 thread”的深接口，不逐步编排 resume、attach、detach 或 queue cleanup。
- 最终只保留一个 live projection owner 和一个 Composer queue owner，不保留兼容双路径。

## 固定范围

### 文档

- `docs/superpowers/specs/2026/08/16/2026-08-16-codex-gui-thread-history-list-design.md`
- `docs/superpowers/plans/2026/08/16/2026-08-16-codex-gui-thread-history-list.md`

### GUI 生产代码

- `codex-gui/src/router.tsx`
- `codex-gui/src/App.tsx`
- `codex-gui/src/features/appShell/**`
- `codex-gui/src/features/currentTask/**`（新增）
- `codex-gui/src/features/threadHistory/**`（新增）
- `codex-gui/src/features/guiHost/appServerProtocol.ts`
- `codex-gui/src/features/guiHost/guiHostClient.ts`
- `codex-gui/src/features/guiHost/guiHostCommandGateway.ts`
- `codex-gui/src/features/composerInputQueue/composerInputQueue.ts`
- `codex-gui/src/features/composerInputQueue/composerInputQueueCoordinator.ts`
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- `codex-gui/src/features/projectionCoordination/**`
- `codex-gui/src/features/threadIdentity/threadIdentitySlice.ts`
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- `codex-gui/src/features/transcriptState/**`
- `codex-gui/src/features/committedTranscriptSurface/**`
- `codex-gui/src/locales/en.po`
- `codex-gui/src/locales/zh-CN.po`

### GUI 生成文件

仅由 `protocol:generate-validators` 更新：

- `codex-gui/src/generated/appServerProtocol/requestDescriptors.ts`
- `codex-gui/src/generated/appServerProtocol/appServerPayloadValidators.d.ts`
- `codex-gui/src/generated/appServerProtocol/appServerPayloadValidators.js`
- `codex-gui/src/generated/appServerProtocol/appServerPayloadValidators.raw.js`

生成器若重建目录但其他文件内容未变化，不将无内容变化文件纳入提交。

### 测试

- `codex-gui/src/__tests__/appBrowserTestSupport.ts`
- `codex-gui/src/__tests__/App.browser.test.tsx`
- `codex-gui/src/features/guiHost/__tests__/**`
- `codex-gui/src/features/composerInputQueue/__tests__/**`
- `codex-gui/src/features/projectionCoordination/__tests__/**`
- `codex-gui/src/features/threadIdentity/__tests__/**`
- `codex-gui/src/features/threadRuntime/__tests__/**`
- `codex-gui/src/features/transcriptState/__tests__/**`
- `codex-gui/src/features/committedTranscriptSurface/__tests__/**`
- 随新增模块放置的 `threadHistory`、`appShell` 与 routing 专项测试。

若实施证据要求修改 Rust、协议源、跨 cwd/归档语义、Composer 产品语义或上述范围外共享模块，
立即停止并回到计划确认。

## 非目标与禁止范围

- 不增加搜索、归档管理、跨 cwd、任务编辑、新建任务、多窗口或常驻侧栏。
- 不引入 `@gravity-ui/icons`、新依赖、HeroUI v2 provider 或 `framer-motion`。
- 不启用 experimental `excludeTurns`，不截断 read/resume/attach 历史。
- 不把历史列表或详情写入 live Redux slice，不伪造 projection attach response 读取历史。
- 不让 Card 整体伪装为交互控件；交互只在 Card Footer 的 HeroUI Button。
- 不用 `queuedCount` 猜测 queue 是否可释放，不静默丢弃 delivery-unknown claim。
- 不通过 skip、ignore、放宽断言、删除覆盖或修改基线隐藏失败。
- 不安装依赖，不运行 Git 远程命令，不运行后端/原生/CLI build 或 run。
- 不在行为提交中混入纯 import/声明/组件顺序整理；若确需纯重排，停止并拆成独立任务。

本功能涉及多个 owner 与页面，预计累计 diff 可能超过单个 800 行审查阈值，因此按下列独立提交
拆分。任一单任务非机械 diff 接近 500 行时优先继续拆 module；任一任务达到 800 行时停止并重新
评估边界，不继续堆叠。

## Preflight（实施前只读）

```bash
git status --short --branch
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git log -1 --oneline
test -x /opt/homebrew/bin/fnm
test -d codex-gui/node_modules
test -d codex-gui/.heroui-docs/react
test -d codex-gui/.redux-toolkit-docs
test -d ../vitest/docs
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

要求：

- 分支/HEAD 仍为 `dev @ b09b58a85220f5bcc99735f0fd208c9a8be44d4c`；若漂移，先只读评估计划。
- 当前预存变更只有本设计目录；后续每个任务只暂存自己的精确文件。
- fnm、node_modules 或本地文档缺失时停止，由用户恢复；助手不得安装。
- 所有 pnpm 命令 cwd 为 `codex-gui`，使用 `/opt/homebrew/bin/fnm exec --using-file pnpm ...`。

## Task 0：确认并提交设计与计划文档

### 修改

- 用户确认本计划后，把计划状态改为“已确认”，记录确认日期与确认原文。
- 不改写已确认设计语义。

### 验证与提交

```bash
git add -- docs/superpowers/specs/2026/08/16/2026-08-16-codex-gui-thread-history-list-design.md docs/superpowers/plans/2026/08/16/2026-08-16-codex-gui-thread-history-list.md
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m 'docs(gui): plan thread history browsing'
```

staged name 必须恰好是这两份文档。

## Task 1：接入生成的历史与切换请求 contract

### 修改

- 在 `APP_SERVER_REQUEST_METHODS` 加入 `thread/list`、`thread/read`、`thread/resume` 和
  `thread/projection/detach`；attach 已存在。
- 扩展 `GuiHostCommands`，从 `RequestParams<M>` / `RequestResponse<M>` 派生 list/read/resume/
  attach/detach 方法；不得手写 payload 类型。
- 运行 `protocol:generate-validators` 更新 descriptor/validator 生成物并检查实际 diff。
- 补齐公共 commands mock；覆盖合法响应、malformed response、RPC failure 与 unavailable gateway。

### 测试与验证

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:generate-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/guiHost/__tests__/guiHostGeneratedProtocol.test.ts src/features/guiHost/__tests__/generatedAppServerProtocol.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

### 提交

只暂存本任务的 protocol/gateway、生成物、公共 mock 和四个测试文件；检查 staged diff 后提交：

```bash
git commit -m 'feat(gui): expose thread history commands'
```

## Task 2：暴露 Composer queue 的安全释放状态

### 修改

- 扩展 `ComposerInputQueueView`，以显式 discriminated state 表达是否存在 ordinary message 或
  unresolved pending start；不得只返回模糊 boolean 或暴露 `StartClaim` 文本。
- coordinator 将 queue view、recovery batch 与 recovering 状态组合为只读 release readiness。
- coordinator 的只读 public handle 同时暴露 owner thread identity，供消费者拒绝 runtime/queue
  identity 不一致的中间态；不暴露消息正文或可伪造 owner setter。
- issuing、accepted-awaiting-runtime、delivery-unknown、ordinary queued、recovery pending、recovering
  都是 blocked；仅上述本地状态全部结清时为 safe。单独 active server turn 不阻止释放。
- `dispose()` 语义保持不变；thread switch 只会在 readiness safe 时调用它。

### 测试与验证

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/composerInputQueue/__tests__/composerInputQueue.test.ts src/features/composerInputQueue/__tests__/composerInputQueueCoordinator.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

覆盖每类 blocked 状态、runtime fact 解除 delivery unknown、active-turn-only safe 与 dispose callback
失效。只暂存 queue 两个生产文件与两个测试文件，提交：

```bash
git commit -m 'feat(gui): guard composer queue disposal'
```

## Task 3：建立 live/read-only 共用的 transcript read seam

### 修改

- 从 `rebuildTranscriptFromSnapshot` 抽出纯 `Thread.turns -> TranscriptState` builder；live reducer
  继续用同一 builder reset Redux，read-only owner 直接持有独立 state。
- 把 transcript state 级 selectors 与 RootState wrapper 分层，保持现有 memoized chunk/page topology。
- 从 946 行的 `CommittedTranscriptSurface.tsx` 抽出 provider/read interface 与较小 renderer module；
  live adapter 使用 Redux selectors，read-only adapter 使用 route-local immutable snapshot。
- 不复制正文、不 flatten 全部 entries、不挂载隐藏 context page，不新增第二个 Redux slice。

### 测试与验证

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts src/features/transcriptState/__tests__/transcriptContextPages.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx src/features/committedTranscriptSurface/__tests__/TranscriptContextPagination.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

新增 read-only adapter Browser 覆盖，证明与 live snapshot 输出一致、只挂载当前 page、无 live event
入口。只暂存 transcript builder/selectors、拆出的 renderer/read interface 和相关测试，提交：

```bash
git commit -m 'refactor(gui): share transcript read surface'
```

此提交是行为保持的 seam/refactor，不混入历史页面行为。

## Task 4：建立常驻路由壳与全宽顶栏

### 修改

- 将 `App` 提升为 root layout：连接 owner、commands、launch params 与 queue controller 跨路由常驻；
  通过窄 React context 向页面提供能力，不复制到 Redux。
- root route 渲染公共 `AppShell` 与 Outlet；新增 `/`、`/history`、`/history/$threadId` 路由骨架。
- 抽出 `CurrentTaskPage` 承接 transcript、sentinel 与 Composer，公共 shell 不再无条件渲染 Composer。
- 新增全宽 fixed banner/top bar；内部内容与 `max-w-3xl` 对齐，统一管理 notices/content 占位。
- 使用 HeroUI `Drawer` compound API、`Drawer.Content placement="left"`、默认 dismiss/backdrop、
  `Drawer.CloseTrigger`；trigger/navigation 使用 `Button` 与 `onPress`。
- trigger `secondary`，导航项 `tertiary`/`secondary`；使用 semantic background/surface/separator token，
  现有 Lucide 图标，禁止新增依赖。

### 测试与验证

新增 `AppShellTopBar.browser.test.tsx` 与 routing Browser 测试，覆盖 banner、标题回退、Drawer dialog/
nav accessible name、Escape、focus return、当前任务/历史 URL，以及导航不卸载 connection owner。

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/features/appShell/__tests__/AppShellTopBar.browser.test.tsx src/__tests__/AppRouting.browser.test.tsx src/__tests__/App.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

只暂存 router、App、AppShell/top bar、CurrentTaskPage、context 与对应 Browser 测试，提交：

```bash
git commit -m 'feat(gui): add persistent history navigation'
```

## Task 5：实现历史列表 page-local owner 与 HeroUI Card 页面

### 修改

- 新增 page-local list owner：首次以固定有界 limit 请求当前 live thread 的 cwd、`archived: false`、
  `sortKey: "recency_at"`、降序；维护 generated `Thread[]`、nextCursor、initial/append/error 状态和
  request generation。
- append 按 `thread.id` 去重并保留首次顺序；陈旧响应不能覆盖新 owner；离开列表即销毁状态。
- 返回 `/history` 时重新请求第一页并滚动到顶部，不恢复 Card/cursor/scroll。
- 每项使用 `Card variant="default"` 与 Header/Title/Description/Content/Footer；状态使用低强调
  `Chip variant="soft"`，只有 `systemError` 使用 danger color。
- Footer “查看”使用 HeroUI `Button variant="secondary"`；加载更多/重试使用 secondary/tertiary，
  pending 使用 `isPending`，错误使用 `Alert status="danger"` 与显式 `role="alert"`。
- 通过 generated `Thread` 派生标题、摘要、`recencyAt ?? updatedAt`、状态文案；时间 formatter 依赖
  当前 Lingui locale，不另存 view model。

### 测试与验证

- owner unit：准确请求参数、追加、ID 去重、陈旧响应、初次/追加失败、重试与 unmount invalidation。
- Browser：Card 四类信息、标题/摘要回退、状态、空状态、完整错误、加载更多 pending/追加/重试。

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/threadHistory/__tests__/threadHistoryListOwner.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/features/threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx src/__tests__/AppRouting.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

只暂存 threadHistory list 模块、必要 routing test 与公共 test support，提交：

```bash
git commit -m 'feat(gui): list current workspace threads'
```

## Task 6：实现 transactional live thread switch owner

### 修改

- 新增 connection-scoped switch coordinator/class，持有 active owner、可选 candidate、subscription
  registry 和显式 prepare/commit/cleanup transition；页面只看到 `continueThread(threadId)`。
- 同 identity 快路径直接返回 current，不 resume/attach，也不替换 queue。
- 第一条 transition 是 queue release readiness gate；blocked 时返回 typed blocked outcome，零
  resume/attach/detach 请求。
- prepare 调用 resume、attach，在 candidate ingress/state 中构建 snapshot/replay index；candidate
  notification 只进入隔离缓冲，旧 owner 仍处理 live 页面与 Composer。
- candidate 完整后形成一个 commit record；commit 同步创建新 queue、dispatch 一个共享 replacement
  action，并通过单一 active-owner handle 发布新 identity/subscription/queue。threadIdentity、
  threadRuntime 与 transcriptState 在同一次 Redux dispatch 中替换；candidate 在 commit 前不拥有
  可被页面使用的 queue。
- `ComposerTurnControl` 必须以 controller owner identity 与 Redux current identity 相等作为可发送
  条件。即使 Redux subscriber 与 React external-store subscriber 调度顺序不同，中间态也只能禁用，
  不能形成“新 runtime + 旧 queue”或“旧 runtime + 新 queue”的可发送窗口。
- 新 active-owner handle 发布完成后，才 dispose 旧 queue/coordinator 并 detach 旧 subscription。
- late old events 由 thread/subscription gate 拒绝；detach failure 不回滚已提交新 owner，但必须返回
  可观测 cleanup failure，不能静默吞掉。
- resume/attach failure 丢弃 candidate，旧 owner 与 queue 不变；不保留 fallback 双路径。

### 测试与验证

unit 覆盖同 identity、queue blocked、queue 变 safe 后重试、resume failure、attach failure、active/
candidate 事件交错、旧 delta 隔离、single-action commit、late callback、detach failure 与唯一 owner。

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts src/features/projectionCoordination/__tests__/projectionApplicationCoordinator.test.ts src/features/threadIdentity/__tests__/threadIdentitySlice.test.ts src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

只暂存 switch coordinator、共享 replacement action、三个 slice/selector 的必要修改与专项测试，提交：

```bash
git commit -m 'feat(gui): switch live thread transactionally'
```

## Task 7：把连接 bridge 切换为 thread owner orchestration

### 修改

- `startGuiHostConnection` 继续拥有唯一 WebSocket/transport，但 notification callbacks 委托给 switch
  coordinator 的 subscription registry，而不是固定闭包中的单 coordinator。
- `GuiHostConnectionBridge` 只管理 connection lifecycle 与 React capability context；初始 handshake
  owner 进入同一 active-owner abstraction。
- queue 仅在 initial attach 或 commit transaction 中创建；candidate prepare 不创建可用 queue；
  bridge 同步发布 identity/subscription/controller 组成的 active-owner handle。
- `ComposerTurnControl` 消费该 handle，并保留 Task 6 的 identity gate；旧 queue 只在新 handle 发布且
  release-safe 后 dispose。
- commands unavailable、unmount 与 terminal error 继续按 connection scope cleanup；旧 async callback
  不能写入新 owner。

### 测试与验证

扩展 guiHost client/bridge/App 集成测试，覆盖连接只建立一次、浏览历史不断线、candidate 不暴露
Composer、commit 后 queue/threadId 同步替换、blocked/failure 保留旧 queue、unmount cleanup。

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/__tests__/App.browser.test.tsx src/__tests__/AppRouting.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

只暂存 guiHost client/bridge、owner context、Composer identity gate、test support 与对应测试，提交：

```bash
git commit -m 'feat(gui): connect thread owner switching'
```

## Task 8：实现只读历史详情与显式继续交互

### 修改

- `/history/$threadId` route-local owner 调用 `thread/read({threadId, includeTurns: true})`；保留 loading、
  empty、完整 error、retry 状态，离开路由销毁。
- read response 进入 Task 3 的独立 transcript owner/adapter；不 dispatch live identity/runtime/
  transcript，不 attach，不显示 Composer。
- 页面底部 fixed action 使用 HeroUI `Button variant="primary"` 与 `isPending`，shell 提供占位避免遮挡
  transcript；返回/重试使用 secondary/tertiary。
- 点击继续调用 Task 6 的深接口；blocked 时不进入 pending，使用明确 `Alert`/说明和“返回当前任务”
  Button，并以 `aria-describedby` 关联原因；同 identity 直接导航 `/`。
- 成功 commit 后导航 `/` 并以 `history.replaceState`/router search 同步新 thread identity，launch token
  不回写 URL；失败保留只读详情和重试。
- 所有可见文本用 Lingui macro：JSX 用 `Trans`，属性/标题 fallback 用 `useLingui`，模块级状态使用
  `msg`；运行 `messages:extract` 并补齐 `en.po`、`zh-CN.po`。

### 测试与验证

- owner unit：read params、空 turns、retry、陈旧响应、unmount、绝不调用 resume。
- Browser：只读 transcript/context pages、无 Composer、fixed action、blocked queue、返回当前任务、
  resume/attach failure、成功切换、浏览器前进/后退与末尾不遮挡。
- 使用有界的合成长历史 fixture 对 read/resume/attach 三段分别测量 payload 字节数、解析时间、
  candidate 重建时间与总切换延迟；不增加生产 instrumentation，不把机器相关耗时固化成测试阈值，
  在最终交付中报告测量结果。若成本不可接受，停止，不截断或启用 experimental 能力。

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/threadHistory/__tests__/threadHistoryDetailOwner.test.ts src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/features/threadHistory/__tests__/ThreadHistoryDetailPage.browser.test.tsx src/__tests__/AppRouting.browser.test.tsx src/__tests__/App.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

只暂存 detail 模块、必要 shell/routing 接线、两个 catalog 与对应测试，提交：

```bash
git commit -m 'feat(gui): browse and resume thread history'
```

## 每个代码任务的格式、lint 与 staged 门禁

每个 Task 1-8 在本任务测试通过后：

1. 对本任务精确文件运行
   `/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --write <files>`。
2. 对同一精确文件运行
   `/opt/homebrew/bin/fnm exec --using-file pnpm exec oxlint <files>` 与
   `/opt/homebrew/bin/fnm exec --using-file pnpm exec eslint --cache <files>`。
3. 运行 `git diff --check -- <files>`。
4. 只 `git add -- <files>`，再运行 `git diff --cached --check`、`git diff --cached --name-only` 和
   `git diff --cached`。
5. staged 集必须只含当前任务；确认没有纯重排、计划外文件或手写生成物后提交。

格式化、验证、stage 和 commit 在实施时按 `$delegating-micro-stages` 分成独立微阶段；主代理负责
审查与最终判断。

## 最终验证（全部任务提交后）

先执行完整前端检查与 Browser matrix：

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser
```

随后使用可见 Chrome 对桌面与窄屏做人工检查：顶栏全宽、Drawer focus/close、Card 单列、加载更多、
只读详情、底部 action、queue blocked 提示、成功切换和末尾内容不被遮挡。若执行该检查，按
`$debug-responsive-gui` 使用仓库既有浏览器工具，不安装浏览器。

所有测试完成后，按项目根规则最后运行：

```bash
cd codex-rs
just fmt
```

`just fmt` 后不再运行测试。若它产生 GUI 任务范围外 diff，停止并报告，不提交无关格式化。

最后检查：

```bash
git status --short --branch
git log --oneline -9
```

确认 Task 0-8 各自一个本地提交、无未提交的本次计划变更、不含 Git 远程操作。

## 验收标准

- 常驻全宽顶栏与 HeroUI Drawer 在三个路由中可用，连接不会因历史导航重建。
- `/history` 只查询当前 cwd 未归档 threads，Card 信息、cursor 追加、去重与错误恢复符合设计。
- `/history/$threadId` 使用独立 read-only owner，保留 context page/chunk 性能边界且没有 Composer。
- queue 不安全时零 resume/attach/detach、消息状态不丢失；安全后可重试。
- 成功继续后 identity/runtime/transcript/queue 原子切换，最终只有一个 live owner。
- generated contract 链、完整错误、Lingui、可访问性、响应式和全部验证通过。

## 后续门禁

本文只落盘实施计划，不授权修改代码、运行生成/格式化、stage 或 commit。

用户明确确认本计划后，下一轮才按 Task 0-8 连续实施、验证并逐任务创建本地提交。
