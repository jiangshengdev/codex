# Codex GUI 历史任务响应式网格实施计划

计划状态：已确认

确认日期：2026-08-17

确认原文：`确认计划，开始实现`

计划日期：2026-08-17

对应设计：
`docs/superpowers/specs/2026/08/17/2026-08-17-codex-gui-thread-history-responsive-grid-design.md`

计划分支：`dev`

计划时 HEAD：`fc058917ab00a5d9502e04b919f7d9276d50d021`

## 唯一目标

按已确认设计，把历史列表改为手机 1 列、中等屏幕 2 列、宽屏 PC 3 列的响应式网格，消除超长
文本造成的 Card、网格与页面横向溢出，对标题和摘要分别实施 2 行与 3 行视觉截断，并在两者
`trim()` 后完全相同时隐藏重复摘要；仅历史列表路由同步扩大顶栏内部宽度。

## 当前代码为何需要修改

- `ThreadHistoryListPage` 的 `main` 当前固定为 `max-w-3xl`，历史条目 `section` 只有 `grid gap-4`，
  所有视口都只有一列，宽屏空间未被利用。
- Card、Header、标题与摘要当前没有完整的可收缩约束。真实历史中的长 URL、Markdown 和无空格
  连续字符串已经把网格轨道撑出容器，导致页面出现横向滚动；单独隐藏 overflow 只能掩盖问题，
  不能消除 intrinsic minimum 造成的根因。
- 标题和摘要当前只判断是否非空，`trim(name) === trim(preview)` 时仍连续显示两次相同文本。
- Card 当前没有行数上限，也没有整列高度约束；改成多列后，长短内容会让同一行的 Card 与 Footer
  对齐不稳定。
- `AppShellTopBar` 的内部容器当前对所有路由固定使用 `max-w-3xl`。历史列表主内容加宽后，顶栏与
  网格外沿将不对齐；但历史详情和当前任务仍必须保持原宽度，因此不能全局改宽。

这些改动用于解决布局根因并保持现有检查能力，不通过删除内容、缩小字体、关闭检查或新增
overflow 豁免隐藏问题。

## 权威 contract 与保持不变边界

```text
generated Thread + ThreadHistoryListOwner state
  -> ThreadHistoryListPage route-local rendering
  -> HeroUI Card / Chip / Button / Alert

TanStack Router pathname
  -> AppShellTopBar route-local inner width
```

- generated `Thread`、`ThreadHistoryListOwner` 及其分页状态继续是列表数据与加载状态的权威来源；
  不修改协议、请求参数、cursor、去重、错误恢复、owner 生命周期或 Redux state。
- Card 继续使用 HeroUI v3 `Card variant="default"`，状态继续使用 `Chip variant="soft"`，按钮继续
  使用 `Button variant="secondary"`，错误继续使用 danger `Alert`。
- “查看”继续由 Card Footer 中的明确按钮触发，并保留 `navigate(..., search: true)`；不让整张 Card
  可点击，不改变只读详情或继续任务语义。
- 标题继续使用 `trim(name) || trim(preview) || 本地化默认标题`；最近活动时间继续使用
  `recencyAt ?? updatedAt`，状态映射和现有本地化文案保持不变。
- 顶栏导航选中仍使用 `pathname.startsWith("/history")`，使列表和详情都选中“历史记录”；只有顶栏
  内部宽度使用 `pathname === "/history"` 的精确判断。
- 视觉截断只使用 CSS；完整标题和摘要必须保留在 DOM 中，Card 的 accessible name、按钮可访问名
  与焦点行为保持不变。

## 固定文件范围

### 文档

- `docs/superpowers/specs/2026/08/17/2026-08-17-codex-gui-thread-history-responsive-grid-design.md`
- `docs/superpowers/plans/2026/08/17/2026-08-17-codex-gui-thread-history-responsive-grid.md`

### Task 1

- `codex-gui/src/features/threadHistory/ThreadHistoryListPage.tsx`
- `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx`

### Task 2

- `codex-gui/src/features/appShell/AppShellTopBar.tsx`
- `codex-gui/src/__tests__/AppRouting.browser.test.tsx`

不得新增 helper、CSS 文件、依赖、i18n 文案或生成物，也不得修改协议、state、owner、详情页、当前任务
页面或其他文件。实施证据若要求越出上述范围，停止执行并重新确认范围。

## 非目标与禁止范围

- 不增加搜索、过滤、排序、虚拟列表、网络分页策略、缓存或持久化。
- 不新增展开全文、tooltip、modal、复制按钮、hover-only 交互、图标或图像资产。
- 不修改历史详情、当前任务、Drawer、Composer、恢复任务、app-server 或 generated contract。
- 不对标题做大小写折叠、标点归一化、Markdown 解析、前缀移除或相似度判断；只做 `trim()` 后
  精确相等去重。
- 不把具体 gap、padding、颜色、阴影、圆角或特定设备型号固化为测试约束。
- 不新增或扩大 ignore、skip、豁免、fallback，不放宽断言，不删除覆盖，不修改测试基线。
- 不安装依赖，不运行后端、原生程序或 CLI build/run，不执行任何 Git 远程操作。
- 不在行为提交中混入 import、声明、字段、分支、函数或组件的纯顺序调整。若 formatter 产生范围外
  重排，必须从本任务 diff 中排除；若行为改动确实需要纯重排，停止并另行确认独立任务。

## Preflight（计划确认后、实施前只读）

```bash
git status --short --branch
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git log -1 --oneline
test -x /opt/homebrew/bin/fnm
test -d codex-gui/node_modules
test -d codex-gui/.heroui-docs/react
test -d ../vitest/docs
test -f codex-gui/src/features/threadHistory/ThreadHistoryListPage.tsx
test -f codex-gui/src/features/threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx
test -f codex-gui/src/features/appShell/AppShellTopBar.tsx
test -f codex-gui/src/__tests__/AppRouting.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm --version
rg -n '"(format:oxfmt|lint|type-check|test:browser:parallel|test:browser)"' codex-gui/package.json
```

要求：

- 分支与 HEAD 应为 `dev @ fc058917ab00a5d9502e04b919f7d9276d50d021`。若已漂移，先只读检查
  新 HEAD 与本计划的差异；不能假设计划仍可直接执行。
- 保留所有预存或无关变更。每个任务只暂存计划列出的精确文件，不使用通配符或全仓暂存。
- fnm、`node_modules` 或本地文档缺失时停止，由用户恢复；助手不得安装。
- pnpm 已验证为 `10.33.0`；`package.json` 已验证存在 `format:oxfmt`、`lint`、`type-check`、
  `test:browser:parallel` 与 `test:browser`。若现场事实不同，停止并报告，不修改脚本。
- 以下所有 pnpm 命令都在 `codex-gui` 目录运行，并完整使用
  `/opt/homebrew/bin/fnm exec --using-file pnpm ...`。

## Task 0：确认并提交设计与计划文档

### 目标文件

- `docs/superpowers/specs/2026/08/17/2026-08-17-codex-gui-thread-history-responsive-grid-design.md`
- `docs/superpowers/plans/2026/08/17/2026-08-17-codex-gui-thread-history-responsive-grid.md`

### 修改

- 用户明确确认本计划后，只把本计划的状态改为“已确认”，填写确认日期与用户确认原文。
- 不修改已确认设计语义，不修改生产代码或测试。

### 验证与提交

本任务没有 React 行为变更，不运行 oxfmt、Browser test、lint 或 type-check。先检查文档 diff，再只
暂存两份文档：

```bash
git diff --check -- docs/superpowers/specs/2026/08/17/2026-08-17-codex-gui-thread-history-responsive-grid-design.md docs/superpowers/plans/2026/08/17/2026-08-17-codex-gui-thread-history-responsive-grid.md
git add -- docs/superpowers/specs/2026/08/17/2026-08-17-codex-gui-thread-history-responsive-grid-design.md docs/superpowers/plans/2026/08/17/2026-08-17-codex-gui-thread-history-responsive-grid.md
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m 'docs(gui): plan responsive history grid'
```

`git diff --cached --name-only` 必须恰好是上述两份文档。

## Task 1：实现历史 Card 响应式网格、截断与精确去重

### 目标文件

- `codex-gui/src/features/threadHistory/ThreadHistoryListPage.tsx`
- `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx`

### 先写失败测试

在现有 Browser test 中先增加稳定的用户可感知断言，并运行 focused test 证明新断言在当前实现上
失败：

- 从 `vitest/browser` 使用 `page.viewport(width, height)`，依次用 390、900、1440 宽度代表手机、
  中屏和宽屏；每个用例先记录当前 `window.innerWidth/innerHeight`，并在 `finally` 中恢复原视口，
  避免污染后续测试。视口只代表范围，不绑定设备型号。
- 用 Card 的 `getBoundingClientRect().left` 几何分组分别证明 1、2、3 列，不断言具体断点像素、gap
  或 Card 宽度。
- 构造长 URL、Markdown 与无空格连续字符串，证明 Card 内部宽度不超过分配列宽，且
  `document.documentElement.scrollWidth <= document.documentElement.clientWidth`。
- 通过 `getComputedStyle(...).webkitLineClamp` 分别断言标题为 `2`、摘要为 `3`；标题完整文本通过
  Card accessible name 保留，摘要完整文本通过 DOM `textContent` 和阅读顺序保留，不暗示摘要
  进入 `aria-labelledby`，也不使用 JavaScript 截断后的字符串做断言。
- 覆盖 `trim(name) === trim(preview)` 时摘要不渲染，以及仅部分相似时摘要完整保留。
- 比较同一网格行 Card 的外框高度和 Footer top/bottom 几何，证明同行等高、Footer 对齐。
- 在 append error 与 Load more 状态下比较反馈区域与 grid 左右边界，证明两者跨越完整列宽；保留
  既有 View 导航与 `search: true` 断言。

失败测试命令：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/features/threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx
```

### 实现

- 把历史列表 `main` 改为 `max-w-6xl`，`section` 使用
  `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`。
- 为 grid、Card 及会受 intrinsic minimum 影响的 Card 子容器增加 `min-w-0` 或等价可收缩约束；
  文本使用允许无空格长串安全断行的 CSS/Tailwind 能力，不能仅靠 `overflow-hidden`。
- Card 使用 `h-full` 并让 Footer 保持底部对齐，使同一 grid row 的 Card 等高且操作区对齐。
- 标题使用 `line-clamp-2`，摘要使用 `line-clamp-3`；完整字符串仍直接渲染到 DOM。
- 摘要改为仅在 `name !== "" && preview !== "" && name !== preview` 时渲染。标题回退逻辑不变。
- 为 append error 和 Load more 的直接 grid item 添加 `col-span-full` 容器或等价布局；不改变初始
  loading/error/empty 的页面级语义。
- 保留现有 HeroUI Card/Chip/Button/Alert variant、View Button 与 `search: true`。

### 格式化与验证

仅格式化两个目标文件；先运行 write，再运行 scoped 非 fix check。若 write 产生与本任务无关的纯
重排，排除该部分后再验证：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/threadHistory/ThreadHistoryListPage.tsx src/features/threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx --write
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --check src/features/threadHistory/ThreadHistoryListPage.tsx src/features/threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/features/threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

### 暂存与提交

```bash
git diff --check -- codex-gui/src/features/threadHistory/ThreadHistoryListPage.tsx codex-gui/src/features/threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx
git add -- codex-gui/src/features/threadHistory/ThreadHistoryListPage.tsx codex-gui/src/features/threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m 'feat(gui): add responsive history grid'
```

staged name 必须恰好是本任务两个目标文件；确认没有纯代码顺序调整、范围外格式化或被忽略文件。

## Task 2：仅在历史列表路由对齐顶栏宽度

### 目标文件

- `codex-gui/src/features/appShell/AppShellTopBar.tsx`
- `codex-gui/src/__tests__/AppRouting.browser.test.tsx`

### 先写失败测试

在 routing Browser test 中先增加宽视口的真实路由比较，并运行 focused test 证明当前顶栏内部始终
`max-w-3xl` 的实现不能满足历史列表对齐要求：

- 使用 `page.viewport(1440, height)`，在 `finally` 中恢复原 `window.innerWidth/innerHeight`。
- 依次进入当前任务 `/`、历史列表 `/history` 和真实历史详情 `/history/$threadId`；使用 DOM 几何
  比较顶栏内部容器与对应 `main` 的左右边界。
- 历史列表中两者左右边界必须对齐且比当前任务/详情更宽；当前任务与历史详情的边界保持相等。
- 不断言具体 px、Tailwind class 字符串或单一 gap；继续保留跨路由单连接、View 和 search 保留测试。

失败测试命令：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/__tests__/AppRouting.browser.test.tsx
```

### 实现

- 在 `AppShellTopBar` 新增 `pathname === "/history"` 的精确布尔判断，只让历史列表路由的顶栏内部
  容器使用 `max-w-6xl`，其他路径继续使用 `max-w-3xl`。
- 导航选中继续使用现有 `pathname.startsWith("/history")`；历史详情仍选中历史导航，但不被加宽。
- 不新增 route helper、layout component、CSS、文案或依赖，不修改顶栏高度、Drawer 或导航行为。

### 格式化与验证

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/appShell/AppShellTopBar.tsx src/__tests__/AppRouting.browser.test.tsx --write
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt --check src/features/appShell/AppShellTopBar.tsx src/__tests__/AppRouting.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/__tests__/AppRouting.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

若 formatter 产生范围外或不改变行为的代码顺序调整，排除后重跑 scoped check 与 focused test。

### 暂存与提交

```bash
git diff --check -- codex-gui/src/features/appShell/AppShellTopBar.tsx codex-gui/src/__tests__/AppRouting.browser.test.tsx
git add -- codex-gui/src/features/appShell/AppShellTopBar.tsx codex-gui/src/__tests__/AppRouting.browser.test.tsx
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m 'feat(gui): align history header width'
```

staged name 必须恰好是本任务两个目标文件，且不得混入 Task 1 或预存变更。

## 最终自动化验证

Task 2 提交后，在 `codex-gui` 运行全树非 fix 格式检查、lint、type-check 和完整 Browser suite：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser
```

不得为通过最终验证而修改检查、基线、配置或 package scripts。若失败由本次变更引入且修正仍严格
位于 Task 1 或 Task 2 的固定文件范围内，按 `$managing-work-stages` 直接闭环：只修改必要文件、
运行 scoped oxfmt、重跑受影响 focused test 与全部最终验证，只暂存修正文件并创建独立修正提交。
预存或无关失败只报告，不修改。

## 可见浏览器验证

使用 `$debug-responsive-gui` 在可见 Google Chrome for Testing 中验证，保留当前 `launch_gui` 返回的
完整 URL（包括完整 `threadId` 与 token），不得手写、拼接或复用旧 URL：

- 手机、中屏、宽屏三类视口分别实际显示 1、2、3 列，不绑定具体设备型号；
- 长 URL、Markdown 和无空格连续文本不撑宽 Card、grid 或页面，无横向滚动；
- 标题最多 2 行、摘要最多 3 行，完整内容仍存在；
- 精确重复摘要隐藏，部分相似摘要保留；
- 同行 Card 等高且 Footer 对齐，Load more 与 append error 跨完整网格；
- 历史列表顶栏内部与 grid 左右边界对齐，当前任务与历史详情宽度保持不变；
- View 按钮仍可见、可操作，并进入只读详情且保留当前查询参数。

只记录实际 metrics 与可见结果，不宣称某一设备型号已被验证。

## 最终 Git 检查与完成条件

```bash
git log -3 --oneline
git status --short --branch
```

完成时必须存在以下三个独立本地提交，顺序一致：

1. `docs(gui): plan responsive history grid`
2. `feat(gui): add responsive history grid`
3. `feat(gui): align history header width`

工作区不得遗留本任务未提交变更；预存或无关变更保持原样。不得执行 `git fetch`、`git pull`、
`git push`、`git remote` 或其他远程命令。

## 当前门禁

用户已于 2026-08-17 以“确认计划，开始实现”明确确认本计划，现从 Preflight 和 Task 0 开始连续
执行。
