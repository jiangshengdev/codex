# Codex GUI 浏览器标题优化实施计划

计划状态：已确认

确认日期：2026-08-18

确认原文：`确认计划`

计划日期：2026-08-18

对应设计：
`docs/superpowers/specs/2026/08/18/2026-08-18-codex-gui-browser-title-design.md`

计划分支：`dev`

计划基线：`d8d5fe3cf747298d6b9e5820c2ac92441652ce4d`

## 唯一目标

按已确认设计，为 `codex-gui` 增加唯一的运行时浏览器标题 owner：当前任务和历史详情在匹配的
权威任务数据可用后显示具体任务标题，历史列表和无效路由显示本地化页面标题；所有标题采用
`<内容> · Codex`，完整长度不超过 60 个 Unicode grapheme。

实现不得把连接、运行、失败或未读状态混入标题，不得新增协议、请求、Redux slice、依赖或页面
可见 UI 变化。

## 当前代码为何需要修改

- `codex-gui/index.html:7` 是当前唯一标题来源，所有路由固定为 `codex-gui`。
- `codex-gui/src/router.tsx` 已有完整 route tree，但没有全局 title owner 或 route head。
- 当前任务标题事实已在 `threadRuntime` 中，`AppShellTopBar` 也已证明 thread ID 匹配门禁可行；
  浏览器标题尚未消费该事实。
- 历史详情的完整 `Thread` 只存在于 `ThreadHistoryDetailPage` 的 owner state，必须把只读展示事实
  发布给全局 owner，不能搬入 live runtime 或重复请求。
- `Thread.preview` 没有协议长度上限，浏览器标题必须在前端按 grapheme 规范化和截断，不能依赖
  浏览器自行省略。

## 实现形状与权威边界

```text
TanStack Router InnerWrap
  -> DocumentTitleOwner（唯一 document.title writer）
     -> 当前 GuiRouteTarget
     -> 匹配 thread ID 的 threadRuntime（当前任务）
     -> 匹配 thread ID + 注册身份的 detail fact（历史详情）
     -> Lingui 页面/回退标签
     -> 纯 document title formatter
     -> document.title
```

- 使用当前 `@tanstack/react-router` 的 `InnerWrap`。它位于 Router context 内，同时 `main.tsx`
  已把 Router 放在 Lingui 与 Redux Provider 下，因此无需修改 `main.tsx` 或新建根 DOM wrapper。
- `DocumentTitleOwner` 是唯一 `document.title` writer；页面组件只能发布事实，不能直接写浏览器
  状态。
- 当前任务继续直接读取生成 `Thread` contract 派生的 runtime record，并校验
  `runtime.threadId === routeTarget.threadId`。
- 历史详情只发布 `{registrationId, threadId, content}`。cleanup 只能删除同一 registration，避免
  StrictMode 或旧 effect cleanup 清除同 thread ID 的新事实。
- owner 只消费与当前 route thread ID 匹配的 detail fact。导航一旦切换，旧 fact 即使尚未 cleanup
  也不能覆盖目标路由的中性标题。
- 标题 formatter 是空白折叠、任务回退、grapheme 计数、60 字截断和 ` · Codex` 拼接的唯一实现；
  不修改 `AppShellTopBar` 或历史详情页面内标题，避免扩大可见 UI 范围。

## 固定文件范围

### 设计与计划文档

- `docs/superpowers/specs/2026/08/18/2026-08-18-codex-gui-browser-title-design.md`
- `docs/superpowers/plans/2026/08/18/2026-08-18-codex-gui-browser-title.md`

### 生产代码

- `codex-gui/index.html`
- `codex-gui/src/features/documentTitle/documentTitle.ts`（新增）
- `codex-gui/src/features/documentTitle/DocumentTitleOwner.tsx`（新增）
- `codex-gui/src/router.tsx`
- `codex-gui/src/features/threadHistory/ThreadHistoryDetailPage.tsx`

### 测试与机械 catalog 更新

- `codex-gui/src/features/documentTitle/__tests__/documentTitle.test.ts`（新增）
- `codex-gui/src/__tests__/AppRouting.browser.test.tsx`
- `codex-gui/src/__tests__/NotFoundPage.browser.test.tsx`
- `codex-gui/src/locales/en.po`（仅 `messages:extract` 产生的 source reference）
- `codex-gui/src/locales/zh-CN.po`（仅 `messages:extract` 产生的 source reference）

标题需要的 `Current task`、`History`、`History detail`、`Untitled task` 和 `Page not found` 均已
存在于两个 catalog。不得新增 msgid、改写翻译或手工编辑 source reference。若
`messages:extract` 不产生 catalog diff，则不为制造变更而触碰 PO 文件。

若实现必须修改 `main.tsx`、`App.tsx`、`AppShellTopBar.tsx`、`NotFoundPage.tsx`、Redux store、
history owner、app-server protocol、GUI Host、生成 contract、依赖或其他生产模块，说明当前计划
接缝不足，必须停止并回到计划确认。

## 非目标与禁止范围

- 不显示连接中、运行中、失败、空闲、未读或完成状态；
- 不增加 favicon badge、动画、系统通知、声音或用户自定义标题设置；
- 不改变页面内 `<h1>`、顶栏、Drawer、Composer、transcript 或历史 Card；
- 不从 transcript 推导标题，不调用模型，不新增详情请求或旁路订阅；
- 不手写或复制 app-server `Thread` DTO，不把生成类型擦除成 `unknown`；
- 不新增 fallback、双写、双读、兼容 adapter、Redux slice 或持久化状态；
- 不新增依赖，不安装工具、浏览器或运行时；
- 不运行 `messages:extract:clean`，不杜撰不存在的 `messages:compile`；
- 不运行 Git 远程命令；
- 不在行为提交中混入纯 import、声明、函数或组件顺序整理。若实现确实需要纯重排，必须暂停并
  新增独立计划任务，不能顺手纳入。

每个 Task 对应一个独立本地提交。中间提交允许暂时依赖后续任务才形成完整最终行为，不得为使
中间状态完整而引入临时路径；最终状态只有一个浏览器标题 owner。

## Preflight（实施前只读）

从仓库根目录运行：

```bash
git status --short --branch
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git log -1 --oneline
test -x /opt/homebrew/bin/fnm
test -d codex-gui/node_modules
test -d ../vitest/docs
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

要求：

- 分支/HEAD 仍为 `dev @ d8d5fe3cf747298d6b9e5820c2ac92441652ce4d`；如有漂移，先只读
  比较本计划与当前代码，不机械使用旧行号。
- 除本设计和计划文档外如有其他工作树变更，逐文件避让并保留用户工作。
- `/opt/homebrew/bin/fnm`、`codex-gui/node_modules` 或本地 Vitest docs 缺失时停止；助手不得安装。
- 所有 pnpm 命令在 `codex-gui` 目录运行，并使用
  `/opt/homebrew/bin/fnm exec --using-file pnpm ...`。当前 `package.json` 已确认下列脚本存在。

## Task 0：确认并提交设计与计划文档

### 修改

- 用户确认本计划后，将计划状态更新为“已确认”，记录确认日期和确认原文。
- 不改写已确认设计的五项产品决策或 60 字规则。

### 验证与提交

```bash
git add -- docs/superpowers/specs/2026/08/18/2026-08-18-codex-gui-browser-title-design.md docs/superpowers/plans/2026/08/18/2026-08-18-codex-gui-browser-title.md
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m 'docs(gui): plan browser titles'
```

staged 文件名必须恰好是上述两份文档。

## Task 1：实现唯一标题文本模型与静态基线

### 修改

- 新增 `documentTitle.ts`，提供纯函数：
  - 对 `name`、`preview` 分别去除首尾空白并把连续 Unicode whitespace 折叠为普通空格；
  - 规范化后按 `name → preview → fallback` 选择内容；
  - 使用平台 `Intl.Segmenter` 的 grapheme granularity 计数，不按 UTF-16 code unit 截断；
  - 固定后缀为 ` · Codex`，完整标题上限 60 grapheme；
  - 内容超过 52 grapheme 时保留前 51 个并追加 `…`，完整保留后缀。
- 新增普通 Vitest 单元测试，比较完整返回值，覆盖：
  - name、preview、fallback 与 whitespace-only 输入；
  - 换行、tab 和连续空白折叠；
  - 完整标题低于、等于和高于 60 grapheme；
  - 中文、emoji ZWJ sequence、组合音标、长 URL 和连续 token 不被拆分；
  - Markdown、路径与标点只作为文本保留。
- 把 `index.html` 静态基线从 `codex-gui` 改为 `Codex`，只影响 React 挂载前或脚本无法启动时。

### 格式化、定向验证与提交

在 `codex-gui` 目录运行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/documentTitle/__tests__/documentTitle.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

只暂存 `index.html`、标题纯函数和单元测试，检查 staged diff 后提交：

```bash
git commit -m 'feat(gui): format browser titles'
```

## Task 2：挂载全局标题 owner 并覆盖路由标题

### 修改

- 新增 `DocumentTitleOwner.tsx`：
  - 作为非 DOM provider 包裹 `children`，符合 TanStack Router `InnerWrap` 约束；
  - 使用现有 `selectGuiRouteTarget`，不复制 route union 或 pathname 判断；
  - 从 Lingui macro `useLingui().t` 获取已有固定标签；不在模块顶层调用 `t`；
  - 当前任务只消费 thread ID 匹配的 `selectThreadRuntimeRecord`；
  - 历史列表使用 `History`，历史详情无 fact 时使用 `History detail`，无效 route 使用
    `Page not found`；
  - 暴露 route-scoped detail fact 发布 context，注册与 cleanup 都携带唯一 registration identity；
  - 只有一个 effect 写 `document.title`。
- 修改 `router.tsx`，让带默认 browser history 与注入 memory history 的两个 `createAppRouter`
  分支都配置同一 `InnerWrap`；不得只修生产 router 而漏掉测试 router。
- 在 `AppRouting.browser.test.tsx` 中用真实 `createAppRouter` 和
  `await expect.poll(() => document.title)` 覆盖：
  - 当前任务初始中性标题；
  - 匹配 projection attach 后更新为任务标题；
  - 错配 runtime thread 不污染当前标题；
  - 导航到 `/history` 后立即变为 `History · Codex`；
  - back/forward 返回时标题与当前 route 同步。
- 在 `NotFoundPage.browser.test.tsx` 的现有 `en`、`zh-CN` 参数化用例中增加完整
  `document.title` 断言，不新建重复的 Not Found harness。
- 运行 Lingui extraction，只接受两个 catalog 的 source reference 机械变化；已有 msgid 和翻译
  必须保持不变。

### 生成、格式化、定向验证与提交

在 `codex-gui` 目录运行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/__tests__/AppRouting.browser.test.tsx src/__tests__/NotFoundPage.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
```

若 extraction 产生新 msgid、翻译变化或范围外 catalog diff，停止并核对实现，不手工删除差异隐藏
问题。只暂存 owner、router、两份 Browser 测试和真实 catalog 输出，检查 staged diff 后提交：

```bash
git commit -m 'feat(gui): own route browser titles'
```

## Task 3：接入历史详情权威标题事实

### 修改

- 在 `ThreadHistoryDetailContent` 附近调用 owner 提供的发布 hook：
  - `state.type === "ready"` 时，从现有 `state.thread` 派生标题并以 `state.thread.id` 发布；
  - loading、error、unmount 或 route thread ID 改变时撤销当前 registration；
  - 不直接写 `document.title`，不修改 `ThreadHistoryDetailOwner`、请求参数或 Redux runtime；
  - 不改变页面内现有 `History detail` / `Untitled task` 标题或只读操作。
- 扩展 `AppRouting.browser.test.tsx` 的真实导航链，覆盖：
  - `/history/:id` 加载期间先显示 `History detail · Codex`；
  - read 成功后显示匹配历史任务标题；
  - read 失败时保留中性标题，不泄漏上一任务；
  - back/forward、StrictMode remount 或迟到 cleanup 不能让旧 detail fact 覆盖当前 route；
  - 空 name/preview 使用本地化 `Untitled task`。
- 不在页面级 `ThreadHistoryDetailPage.browser.test.tsx` 重建全局 title owner；全局标题行为集中在
  已有真实 router integration harness 中。

### 格式化与最终验证

在 `codex-gui` 目录先运行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/__tests__/AppRouting.browser.test.tsx src/__tests__/NotFoundPage.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser
/opt/homebrew/bin/fnm exec --using-file pnpm run build
```

以上验证通过后，从 `codex-rs` 目录运行仓库要求的最终格式化；不在此后重复测试：

```bash
just fmt
```

检查 `just fmt` 实际 diff。GUI-only 变更不应产生 Rust diff；若修改计划外文件，停止并报告，不能
直接纳入提交。

只暂存历史详情接线与对应 `AppRouting.browser.test.tsx` 变化，检查 staged diff 后提交：

```bash
git commit -m 'feat(gui): title history detail tabs'
```

## 最终合并状态核验（不产生提交）

Task 0–3 完成后只做只读核验，不运行 Git 远程命令：

```bash
git status --short --branch
git log -4 --oneline
git diff HEAD~4..HEAD --check
git diff HEAD~4..HEAD --stat
git diff HEAD~4..HEAD --name-only
```

要求：

- 恰好有四个本地提交，对应 Task 0–3，顺序与计划一致；
- 最终 diff 只包含固定范围文件与 `messages:extract` 的真实机械输出；
- 工作树没有本计划遗留变更，预存无关变更保持原样；
- 最终只有一个 `document.title` writer，没有页面级竞争 effect、临时 fallback 或双路径。

## 计划内失败闭环

- 本次变更引入的格式、类型、lint、unit、Browser 或 build 失败，在当前任务固定范围内直接修正并
  重跑该任务必要验证，不新增 ignore、skip、降级断言、兼容路径或静默兜底。
- `messages:extract` 或 formatter 若产生范围外大量 diff，先判断是否由本次变更直接引入；不得
  手工删除真实生成物，也不得把无关 churn 暂存进本任务。
- 三浏览器 Browser 测试使用本地 Vitest 文档确认的 `await expect.poll(...)`；不改成截图、
  `expect.element(document.title)`、`insta` 或 E2E 来绕开异步事实。
- 预存或与本次变更无关的问题只汇报，不借本计划修复。
- 只有需要计划外生产文件、新外部接口、不同标题语义、安全边界变化、新依赖或安装行为时，才
  停止并回到计划确认。

## 完成标准

- 当前任务和历史详情显示匹配任务标题；历史列表与 Not Found 显示本地化页面标题。
- 导航立即清除旧标题，loading/error 保持目标路由中性标题，错配或迟到事实不能污染新路由。
- 所有运行时标题采用 `<内容> · Codex`，完整不超过 60 grapheme；emoji 和组合字符不被拆分。
- 标题不包含运行、连接、失败、未读或完成状态。
- app-server contract、请求、Redux store、页面可见 UI 和历史只读行为保持不变。
- unit、三浏览器定向测试、GUI CI、完整 Browser suite 与 production build 全部通过。
- 四个本地提交与计划 Task 一一对应，工作树无本计划遗留变更。
