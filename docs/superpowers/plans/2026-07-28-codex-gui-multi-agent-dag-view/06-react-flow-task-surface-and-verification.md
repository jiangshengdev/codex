# React Flow 任务视图与跨层验证实施计划

日期：2026-07-28

状态：待确认

对应设计：`docs/superpowers/specs/2026-07-28-codex-gui-multi-agent-dag-view-design.md`

总计划：`docs/superpowers/plans/2026-07-28-codex-gui-multi-agent-dag-view/00-overview.md`

## 前置门禁

- `01`–`05` 必须已经按顺序完成聚焦验证并各自产生独立本地提交；缺少任一完成出口时不得开始本任务。
- 开始实现前只读确认 `04` 实际导出的稳定 scene/load/diagnostic selectors，以及 `05` 实际导出的 `open(rootThreadId)`、`retry(rootThreadId)` 和持久 runtime owner。若实际文件名或公开 interface 与本计划引用不同，只允许把下文 import 调整到等价的已确认 interface；若语义不同，停止并更新计划，不在 UI 层补适配语义。
- `@xyflow/react` 当前不在 `codex-gui/package.json`；依赖变更必须由 pnpm 生成。受仓库“助手禁止安装依赖”规则约束，执行到依赖步骤时由用户本人运行本计划给出的唯一命令，助手不得代为安装或手写 lockfile。
- 本任务只消费 `04`/`05` 已稳定的 scene 与 runtime 状态；不得为让 UI 测试通过而修改 projection、因果排序、batch merge、activation、lane、颜色或多 Thread ingestion。

## 唯一目标

把 `04` 的稳定 `AgentDagScene` 与 `05` 的 runtime/load/error 状态接入任务内 React Flow DAG panel，完成聊天/DAG 切换、会话 viewport、高亮、HeroUI 状态与工具栏、只读 pan/zoom、可见元素渲染，并以 Browser Mode 和 dense Chromium 视觉/规模回归固定用户可感知行为。

## 非目标

- 不修改 app-server、生成协议、projection、`AgentDagSource`、因果 replay、布局 reducer 或 runtime 队列语义。
- 不把 React Flow `Node` / `Edge`、viewport、hover 或 locked highlight 写入 `agentDag` Redux scene。
- 不新增独立 DAG route、URL search、可分享链接；刷新仍默认聊天。
- 不增加 Minimap、默认 React Flow Controls、background grid、详情面板、搜索、节点导航、节点拖拽、连线创建、删除、动画 edge 或布局持久化。
- 不增加 ELK、Dagre、D3、虚拟列表、Canvas、WebGL、颜色库或第二个 production dependency。
- 不修改 transcript chunk、chat projection、现有 sticky-bottom 算法或单 Thread coordinator。
- 不运行后端、原生程序或 CLI build，不安装依赖，不操作 Git 远程。

## 权威边界与只读输入

- `04` 的前端领域 scene 是节点、边、坐标、颜色、标签、diagnostic 和 `latestEventNodeId` 的唯一权威来源；React Flow adapter 只机械映射，不排序、不布局、不猜边。
- `05` 的 load state 与 runtime interface 是 discovering/history/replay/caught-up/source-error 和 retry 的唯一权威来源；React 不能本地推断 `caughtUp`。
- task identity 使用现有 `BrowserLaunchParams.threadId`；`TaskSurfaceSession` 只按 root Thread ID 保存应用会话内 UI 状态。
- `TaskSurfaceSession` 是 mode、`rootThreadId -> Viewport` 与 locked highlight 的 owner；Redux 不拥有这些临时交互状态。
- `@xyflow/react` 只负责 viewport transform、pan/zoom、visible element rendering、自定义 node/edge host 和 imperative viewport commands。

## 精确文件边界

### 依赖与全局样式

- 修改 `codex-gui/package.json`：只新增 production dependency `@xyflow/react`。
- 由 pnpm 生成 `codex-gui/pnpm-lock.yaml`：只接受 `@xyflow/react` 及其实际传递依赖造成的 importer/resolution 变化。
- 修改 `codex-gui/src/index.css`：导入安装版本公开的 React Flow 基础样式；增加 DAG palette 的 light/dark CSS variables，以及 node、edge、highlight、full-width canvas 所需的项目样式；不得出现 background grid 或硬编码白色。

### Task surface 与会话状态

- 新增 `codex-gui/src/features/taskSurface/taskSurfaceSession.ts`：定义 `"chat" | "dag"` mode、按 root Thread ID 的 viewport、locked node ID 和纯状态转换。
- 新增 `codex-gui/src/features/taskSurface/TaskSurfaceSessionContext.ts`：暴露最小的读取/更新 mode、viewport 和 locked highlight interface。
- 新增 `codex-gui/src/features/taskSurface/TaskSurfaceSessionProvider.tsx`：持久保存 session state；默认 chat；不持有 scene、projection item、React element、DOM 或 subscription handle。
- 新增 `codex-gui/src/features/taskSurface/TaskSurface.tsx`：使用 HeroUI v3 controlled `Tabs` `secondary` variant 挂载 Chat/DAG 两个同级 panel；Chat panel拥有现有 transcript、bottom sentinel 与 Composer，DAG panel拥有全宽 `AgentDagView`；DAG panel 激活时不渲染 Composer。
- 修改 `codex-gui/src/features/appRuntime/AppRuntimeLayout.tsx`：把 `TaskSurfaceSessionProvider` 与现有 `ChatUiSessionProvider` 同级放在 `<Outlet />` 外；不得移动或重建 `GuiHostConnectionBridge`。
- 修改 `codex-gui/src/features/appShell/AppShell.tsx`：把现有 task content 组合交给 `TaskSurface`；保留 host error notice、现有 chat capture-before-settings 行为和 task connection lifetime。

### React Flow adapter 与可见 UI

- 新增 `codex-gui/src/features/agentDag/agentDagReactFlowAdapter.ts`：用 `04` 的稳定 ID、位置、kind、颜色和 label 生成 controlled React Flow nodes/edges；保持未变化 DTO 引用稳定；禁止把 React Flow DTO 写回 Redux。
- 新增 `codex-gui/src/features/agentDag/agentDagHighlight.ts`：从 scene edge identity 计算直接相邻 node/edge 集合，合并 hover 与 locked selection，输出纯视觉 emphasis；不隐藏或删除非关联元素。
- 新增 `codex-gui/src/features/agentDag/AgentDagNode.tsx`：渲染五类事件、merge 菱形和 unresolved placeholder；正文严格使用 scene 的“最短唯一代理名 · 事件类型”；为测试和可访问交互提供项目拥有的稳定属性/accessible name，不暴露 payload。
- 新增 `codex-gui/src/features/agentDag/AgentDagEdge.tsx`：只根据 scene edge kind、端点和颜色画自定义平滑 SVG curve；lifecycle/identity 无箭头，operation 使用 target 颜色和小箭头；不得解析代理关系或重算路径语义。
- 新增 `codex-gui/src/features/agentDag/AgentDagToolbar.tsx`：使用四个 HeroUI `Button`（`ghost`、`isIconOnly`）与 `Tooltip`，通过 React Flow imperative API 实现放大、缩小、适应视口、回到 `latestEventNodeId`；使用现有 Lucide icons。
- 新增 `codex-gui/src/features/agentDag/AgentDagStatus.tsx`：使用 `ProgressBar accent` 表达 discovering/history/replay，使用 `Alert warning` 表达 unresolved count，使用 `Alert danger` + `Button primary` 表达 source error/retry；Tooltip 只显示 projection diagnostic reason。
- 新增 `codex-gui/src/features/agentDag/AgentDagView.tsx`：组合 selectors、runtime、React Flow adapter、node/edge types、toolbar/status 和 session；开启 `onlyRenderVisibleElements`，禁止拖动/连接/删除，关闭 Minimap/background；实现普通滚轮纵向 pan、`Ctrl/Cmd + wheel` zoom、背景拖动 pan、首次定位 latest、按 task 恢复 viewport、hover/click/Esc/空白取消高亮，以及 replay 中禁用 highlight 但保留 pan/zoom。

### 测试与生成物

- 新增 `codex-gui/src/features/taskSurface/__tests__/taskSurfaceSession.test.ts`：完整 state 等值测试默认 mode、按 root viewport 隔离、locked highlight 和 task 切换恢复。
- 新增 `codex-gui/src/features/agentDag/__tests__/agentDagReactFlowAdapter.test.ts`：完整 nodes/edges 等值与引用稳定测试；固定 controlled DTO、node/edge type 映射和无布局语义泄漏。
- 新增 `codex-gui/src/features/agentDag/__tests__/agentDagHighlight.test.ts`：固定 hover/lock/clear 与直接邻接集合，确认非关联元素仅降低强调。
- 新增 `codex-gui/src/features/agentDag/__tests__/agentDagBrowserTestSupport.ts`：只构造前端 scene/load/session fixture；dense fixture 为 50 Threads、49 spawn edges、315 turns、248 replies，并包含子子代理、batch merge、lane/颜色复用和 unresolved warning。
- 新增 `codex-gui/src/features/agentDag/__tests__/AgentDagView.browser.test.tsx`：覆盖 React Flow panel 的用户交互、visible rendering、状态展示和 dense 规模断言；复用 `renderWithProviders`，使用项目拥有的 role/label/data attribute，不断言 React Flow 私有 class 或 SVG path 字符串。
- 修改 `codex-gui/src/__tests__/App.browser.test.tsx`：覆盖聊天/DAG Tabs、Composer 显隐、切换不重连、DAG 隐藏期间 scene 继续更新、首次 latest 定位和切回 viewport 恢复。
- 修改 `codex-gui/src/features/appRuntime/__tests__/AppRuntimeLayout.browser.test.tsx`：确认 task surface 切换及 settings route 仍共用一个 `GuiHostConnectionBridge` 和持久 runtime/session。
- 修改 `codex-gui/e2e/app.spec.ts`：扩展既有 GUI host WebSocket mock 到 `02`/`05` 已有的 DAG RPC，并新增 Chromium `@visual` dense DAG 用例；所有合法协议对象继续使用生成类型及共享 projection builders。
- 由 Playwright 生成 `codex-gui/e2e/app.spec.ts-snapshots/dense-agent-dag-chromium-darwin.png`；不得手工编辑图片。
- 由 Lingui 生成/更新 `codex-gui/src/locales/en.po` 与 `codex-gui/src/locales/zh-CN.po`，覆盖 Tabs、工具栏、进度、warning、source error、retry 与 accessible labels；动态代理名、协议 diagnostic 和服务端错误不翻译。

除上述文件及 `04`/`05` 已存在的公开 import 路径外，不修改其他文件。若实现证明必须新增文件，先确认它只是上述文件的机械拆分；若承担新职责或扩大用户结果，停止并更新计划。

## 实施步骤

### 1. 先建立测试失败面

1. 在 `taskSurfaceSession.test.ts` 写 session 的完整 state 等值测试，固定默认 chat、root 级 viewport 隔离和 locked highlight 清理规则。
2. 在 `agentDagReactFlowAdapter.test.ts` 写 scene 到 React Flow DTO 的完整映射与引用稳定测试；用 `04` 的真实 scene builders/selectors，不复制 scene DTO。
3. 在 `agentDagHighlight.test.ts` 写 hover、click lock、Esc/blank clear、replay disabled 的纯函数测试。
4. 在 `AgentDagView.browser.test.tsx` 先写用户可感知失败用例：
   - 五类节点、merge 和 unresolved glyph/Tooltip；
   - discovering indeterminate、history/replay determinate、source error + retry；
   - 普通 wheel pan、修饰键 wheel zoom、背景 drag pan；
   - 四项工具栏；
   - node 不可拖动/连接；
   - hover、click lock、Esc、空白取消；
   - replay 期间 highlight 禁用但 pan/zoom 可用；
   - dense scene 全逻辑节点仍在 scene，而项目拥有的 rendered-node 标记显著少于 scene node 数。
5. 在 `App.browser.test.tsx` 与 `AppRuntimeLayout.browser.test.tsx` 写失败用例，固定一次 GUI host connection、Tabs/Composer 显隐、隐藏期间更新和 viewport/session 恢复。
6. 不因测试夹具缺失去修改 `01`–`05` 逻辑；若公开 test builder 不足，只能在本任务的前端 UI fixture 文件中构造合法 scene/load/session 输入。

### 2. 由用户生成唯一依赖变更

1. 助手先只读运行 `/opt/homebrew/bin/fnm exec --using-file pnpm --version`，确认 pnpm 不来自 `/Users/<user>/.cache/codex-runtimes/`。
2. 助手停止并请用户在 `codex-gui` 目录亲自运行：

   ```bash
   /opt/homebrew/bin/fnm exec --using-file pnpm add @xyflow/react
   ```

3. 用户明确通知完成后，助手只读检查 `package.json` 与 `pnpm-lock.yaml`：直接 production dependency 只能新增 `@xyflow/react`；lockfile 只能包含该包及 pnpm 解析出的传递变化。
4. 若命令要求修改 `pnpm-workspace.yaml`、其他 package manifest、Node/pnpm 版本、install policy，或带入第二个直接依赖，停止并报告；不得手改绕过。
5. 从实际安装包的 exports/types 确认 stylesheet 入口、`Viewport`、controlled nodes/edges、`useReactFlow`、自定义 edge 和 visible rendering API；缺失设计所需公开 API 时停止，不使用私有 DOM/内部 module。

### 3. 实现 session 与 task surface

1. 先实现 `taskSurfaceSession.ts` 的纯状态转换，使 viewport 以 root Thread ID 分桶，mode 默认 chat；locked highlight 只属于当前 root。
2. 实现 context/provider，并在 `AppRuntimeLayout` 的两个现有 session providers 层级挂载；不得让切换 panel 或 settings 重建 host bridge/runtime。
3. 实现 controlled HeroUI `Tabs`：
   - `Tabs variant="secondary"`；
   - `Tabs.List` 有可翻译的 accessible label；
   - 两个 `Tabs.Tab` / `Tabs.Panel` ID 稳定；
   - Chat panel 保留现有 `max-w-3xl` transcript、sentinel、Composer 和 settings capture；
   - DAG panel 使用可用 viewport 全宽，不渲染 Composer。
4. 切到 DAG 时调用 `runtime.open(rootThreadId)`；切回 chat 不 dispose DAG runtime。只有 task/connection owner 销毁时才由 `05` 的 owner dispose。
5. 修复步骤 1 的 session/App 集成测试至绿，不改下层 scene/runtime 语义。

### 4. 实现 React Flow 机械 adapter

1. 从 `04` selectors 取得 normalized scene/revision；建立稳定 nodeTypes/edgeTypes 常量，不在 render 内重建。
2. 把每个 event、merge、diagnostic placeholder 映射成独立 node；使用 scene position，禁止 fit/layout 后写回位置。
3. 把 lifecycle、identity、operation、merge、continuation 映射为自定义 edge；edge component 只消费已给 kind/color/端点。
4. 为 unchanged scene entities 保持 React Flow DTO 引用稳定；UI-only hover/lock 更新只改变 emphasis 所需对象，不重新生成全 scene 或移动节点。
5. 修复 adapter/highlight unit tests 至绿。

### 5. 实现 DAG canvas、状态与交互

1. 用安装版本公开 API配置 controlled React Flow：`onlyRenderVisibleElements`；nodes 不可拖动、连接、删除；不挂载 Background、MiniMap 或默认 Controls。
2. Node 外观只使用 scene color token 与项目 CSS variables：
   - sender 三类与 started/interacted/interrupted 使用实心圆；
   - MESSAGE 空心圆；FINAL_ANSWER 实心圆；
   - batch merge 为中性空心菱形且无文本；
   - unresolved placeholder 有 warning glyph，Tooltip 只含 diagnostic reason。
3. Edge 使用项目自定义平滑 SVG curve；禁止根据 React Flow node position 再推断 lane/父子/batch。
4. 使用 HeroUI：
   - Tabs `secondary`；
   - 四个 Button `ghost` + `isIconOnly`，每项都有 accessible label 与 Tooltip；
   - ProgressBar `accent`：discovering `isIndeterminate`，history/replay 使用 value/maxValue；
   - Alert `warning`：unresolved count；
   - Alert `danger`：source error，内含 `primary` retry Button。
   - 容器和强调状态使用现有 background、surface、border、foreground、muted、accent、warning、danger 语义 token；agent palette 只通过 light/dark CSS variables 映射，不使用 ad hoc 文本/背景颜色。
5. 首次打开 root：在 node measurement/scene ready 后以常规缩放定位 `latestEventNodeId`，不得调用全图 fit；没有 latest 时保持默认 viewport。
6. 已有 viewport：从 TaskSurfaceSession 恢复，切离/viewport change end 时保存；恢复后 live append 不自动跳最新。工具栏“最新事件”是唯一显式回到 latest 的入口。
7. 普通 wheel 纵向 pan；`Ctrl/Cmd + wheel` zoom；背景 drag pan。测试必须使用 Vitest Browser `userEvent.wheel`/keyboard/pointer 或 locator actions，不手工 dispatch React synthetic event。
8. hover 临时高亮；click 锁定；Esc 或空白取消；非关联元素只降低强调。load phase 为 replay 时忽略 hover/click highlight 并清除临时 hover，pan/zoom 不禁用；caughtUp 自动恢复。
9. 修复 `AgentDagView.browser.test.tsx` 至绿；异步 DOM 断言使用 `await expect.element(locator)`，不使用固定 sleep，不断言私有 class/path。

### 6. 完成跨层与 dense 回归

1. 扩展 App Browser Mode fixture，使 `05` runtime 可被可控 source/notification 驱动；验证切换不新建 host connection、不丢隐藏期间更新、settings route 往返仍恢复各自 session。
2. dense fixture 必须确定性生成 50 Threads、49 spawn edges、315 turns、248 replies；包含多个一级代理、子子代理、同 author 多回复、跨分支 operation、batch merge、lane/颜色复用、reactivation 与 unresolved warning。
3. Browser Mode 规模断言不使用墙钟阈值：
   - replay 至少跨多个 fake frame；
   - 完整 scene node/edge 数正确；
   - live append 前后的旧 node position 和稳定引用不变；
   - viewport 内项目 node 标记数量明显小于完整 scene node 数。
4. 在既有 `e2e/app.spec.ts` WebSocket harness 中响应 `02` 已生成的 DAG RPC，加载同量级 dense 历史，切换 DAG 后生成一个 Chromium `@visual` 基线；不在截图测试里手写协议镜像或断言 SVG path。
5. 视觉基线必须同时覆盖 root、多一级代理、子子代理、batch merge、lane 复用、warning、工具栏、无背景网格、纵向最新在上；只生成 `dense-agent-dag-chromium-darwin.png`，Firefox/WebKit 继续只跑行为测试。
6. 运行 Lingui 原生命令生成 catalog，补齐 `zh-CN` 翻译，再以 clean extract 确认无 stale message；不得手写 message ID。

## 验证命令

所有 `pnpm` 命令都在 `codex-gui` 目录使用 fnm-backed 入口。若工具缺失或解析到 Codex runtime shim，停止，禁止安装。

### 聚焦红绿循环

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/taskSurface/__tests__/taskSurfaceSession.test.ts src/features/agentDag/__tests__/agentDagReactFlowAdapter.test.ts src/features/agentDag/__tests__/agentDagHighlight.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run src/features/agentDag/__tests__/AgentDagView.browser.test.tsx src/__tests__/App.browser.test.tsx src/features/appRuntime/__tests__/AppRuntimeLayout.browser.test.tsx
```

### 生成翻译与视觉基线

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract:clean
/opt/homebrew/bin/fnm exec --using-file pnpm exec playwright test e2e/app.spec.ts --project=chromium --grep '@visual' --update-snapshots
/opt/homebrew/bin/fnm exec --using-file pnpm exec playwright test e2e/app.spec.ts --project=chromium --grep '@visual'
```

截图生成后直接查看新 PNG，确认上述视觉覆盖；发现错误则修代码/fixture 并重新由 Playwright 生成，不手工修图、不更新基线掩盖错误。

### 最终前端验证

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt package.json src/index.css src/features/taskSurface src/features/agentDag/AgentDagView.tsx src/features/agentDag/AgentDagNode.tsx src/features/agentDag/AgentDagEdge.tsx src/features/agentDag/AgentDagToolbar.tsx src/features/agentDag/AgentDagStatus.tsx src/features/agentDag/agentDagReactFlowAdapter.ts src/features/agentDag/agentDagHighlight.ts src/features/agentDag/__tests__/AgentDagView.browser.test.tsx src/features/agentDag/__tests__/agentDagBrowserTestSupport.ts src/features/agentDag/__tests__/agentDagReactFlowAdapter.test.ts src/features/agentDag/__tests__/agentDagHighlight.test.ts src/features/appRuntime/AppRuntimeLayout.tsx src/features/appRuntime/__tests__/AppRuntimeLayout.browser.test.tsx src/features/appShell/AppShell.tsx src/__tests__/App.browser.test.tsx e2e/app.spec.ts --write
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run
/opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e
/opt/homebrew/bin/fnm exec --using-file pnpm run build
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators
```

- 不再额外运行聚合 `ci`：它覆盖的 format、lint、type-check 与 unit 已显式执行；其独有的 `protocol:check-validators` 已单独列出，因此不存在重复验证。
- 只闭环本任务引入的失败；预存或无关失败只读记录并停止，不新增 ignore、skip、豁免、静默 fallback、宽松断言或基线掩盖。
- 全部前端验证完成后，按根仓库规则在 `codex-rs` 运行 `just fmt`；它不是后端 build。此后不重跑测试，只运行 `git diff --check` 和范围检查。

## 独立暂存与提交边界

本任务是 `06` 的唯一独立提交。只有上述实现、生成物和全部验证完成后才能暂存。

允许暂存：

- `codex-gui/package.json`
- `codex-gui/pnpm-lock.yaml`
- `codex-gui/src/index.css`
- `codex-gui/src/features/taskSurface/**`
- 本计划列出的 `codex-gui/src/features/agentDag/` UI/adapter/test 文件；不得暂存 `01`–`05` 已有领域/runtime 文件的新变化
- `codex-gui/src/features/appRuntime/AppRuntimeLayout.tsx`
- `codex-gui/src/features/appRuntime/__tests__/AppRuntimeLayout.browser.test.tsx`
- `codex-gui/src/features/appShell/AppShell.tsx`
- `codex-gui/src/__tests__/App.browser.test.tsx`
- `codex-gui/e2e/app.spec.ts`
- `codex-gui/e2e/app.spec.ts-snapshots/dense-agent-dag-chromium-darwin.png`
- `codex-gui/src/locales/en.po`
- `codex-gui/src/locales/zh-CN.po`

提交前必须：

1. `git status --short` 区分用户既有变化与本任务变化。
2. 只对上面允许范围逐路径 `git add`，禁止 `git add .`。
3. 检查 `git diff --cached --stat`、`git diff --cached --check` 和完整 staged diff。
4. 确认没有 Rust、generated app-server contract、projection、runtime、其他截图或额外 dependency 进入 staged diff。
5. 创建本地提交，建议信息：

   ```text
   feat(gui): add multi-agent DAG task surface
   ```

不得 push、fetch、pull 或操作任何远程。提交成功即满足 `06` 提交出口。

## 完成出口

- `@xyflow/react` 是本功能唯一新增直接依赖，且 package/lock 由用户运行 pnpm 原生命令生成。
- Chat/DAG 共用 `/` route；刷新默认 chat；切换不重连，DAG 隐藏时 runtime/scene 继续更新，DAG 模式不显示 Composer。
- scene 到 React Flow 是单向机械 adapter；React Flow 不拥有排序、布局、颜色、edge 语义或 Redux source of truth。
- 只读 pan/zoom、普通 wheel pan、修饰键 zoom、四项 HeroUI 工具栏、首次 latest 定位、按 root 会话 viewport 恢复全部可用。
- 五类事件、merge、warning placeholder 和边样式按 scene 渲染；无 grid、Minimap、拖拽、连接、删除或自动布局。
- hover/click lock/Esc/blank clear、高亮 replay 降级、loading、warning、source error/retry 均通过三浏览器 Browser Mode。
- dense 50-Thread fixture 验证逻辑完整、跨帧 replay、旧节点稳定和 visible rendering；Chromium 视觉基线已审阅且复跑通过。
- format、lint、type-check、unit、三浏览器 Browser Mode、三浏览器 E2E、build、`protocol:check-validators`、仓库格式化和 diff 检查全部通过。
- 只暂存本任务文件并创建建议本地提交。

## 停止条件

发生任一情况立即停止，不通过 UI 层兜底：

- `01`–`05` 任一完成出口或提交缺失；scene/runtime 公开 interface 尚不稳定。
- `@xyflow/react` 需要第二个直接依赖、修改 workspace/install policy，或公开 API 无法满足 controlled scene、visible rendering、自定义 edge、imperative viewport。
- 必须修改 projection、协议、生成 artifacts、排序、batch、activation、lane、颜色、runtime ingestion 或现有 transcript state 才能继续。
- 必须增加 route/search、布局持久化、Minimap、详情/搜索/导航、Worker、自动布局、Canvas/WebGL 或其他未确认用户行为。
- 需要将 React Flow DTO、DOM、subscription handle、payload 或 plaintext message 放入 Redux/session。
- 合法测试输入只能靠手写权威协议镜像、`unknown` assertion、私有 React Flow DOM/class/path 或墙钟阈值表达。
- 用户应运行的 pnpm 依赖命令尚未完成，或 pnpm/tool/browser binary 缺失；助手不得安装。
- 验证失败来自预存/无关问题，修复需要计划外文件；只报告，不扩大范围。
- staged diff 含本任务外文件、第二个 dependency、非目标生成物或用户既有变化。

## 任务终止

完成上述验证、范围检查和 `06` 独立本地提交后，六份计划全部结束。本轮立即终止，不追加 review、测试、修复、生成、验证或新的提交；后续发现只读汇报，等待用户发起新任务。
