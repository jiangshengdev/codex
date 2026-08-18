# Codex GUI URL 规范重设计实施计划

计划状态：已确认

确认日期：2026-08-17

确认原文：开始进行

范围修订日期：2026-08-17

范围修订确认原文：确认扩大计划范围

Task 2 范围与行为修订日期：2026-08-17

Task 2 范围与行为修订确认原文：

```text
Go back home

调整到列表页面
```

验证顺序修订日期：2026-08-17

验证顺序修订原因：行为在 Task 5 才存在

Task 3 范围修订日期：2026-08-17

Task 3 范围修订确认原文：确认扩大 Task 3 范围

计划日期：2026-08-17

对应设计：
`docs/superpowers/specs/2026/08/17/2026-08-17-codex-gui-url-contract-redesign.md`

计划分支：`dev`

计划基线：`573e417efbb731d174f08920fb13ddf774bb7b63`

## 唯一目标

按已确认设计，把 Codex GUI 的规范页面 URL 原子切换为 `/task/<uuid>`、`/history` 和
`/history/<uuid>`，使每个页面最多包含一个任务 UUID；同时实现 route-aware 启动、同 tab 授权恢复、
纯只读历史二维码启动、显式继续、旧 URL 拒绝和生产 Host 深层 SPA 刷新。

本计划不保留 `?threadId=` 兼容路径，不新增历史列表二维码，不改变历史列表范围、只读 transcript、
Composer queue 产品语义或 app-server v2 wire API。

## 当前代码为何必须修改

- Rust GUI Host 与生成的 browser contract 仍以 `THREAD_QUERY_KEY = "threadId"` 构造
  `/?threadId=<uuid>#token=...`；所有正式 launcher、二维码和前端测试仍引用该 contract。
- `consumeBrowserLaunchParams` 把 query thread identity 与 fragment/session token 合并成同一个
  `{threadId, token}`，没有 route target，也没有与 token 同会话的可选 active-owner 恢复值。
- `GuiHostHandshakeController` 固定执行 authenticate → initialize → projection attach；commands 直到
  attach 成功后才可用，所以 `/history/<uuid>#token=...` 无法保持纯只读。
- `GuiHostConnectionBridge` 假定每次连接都有 launch thread 和初始 live owner，无法表达 history list
  恢复、后台 live owner + read-only detail、以及没有 live owner 的纯只读详情三种模式。
- Router、Topbar、历史列表和详情继续把 `/` 当当前任务并用 `search: true` 保留 query UUID；继续任务
  成功后也写回 `/?threadId=<uuid>`。
- QR builder 固定生成根路径 query URL，QR 只挂在 Composer；历史详情无法分享当前可见只读页面。
- 详情页 owner 在 React StrictMode 检查性 cleanup 中被永久 dispose，真实页面会停在“正在加载任务
  历史…”。新规范要求只读 URL与二维码入口可实际完成加载，因此该已定位生命周期缺口是计划内前置，
  不能靠放宽 Browser test 隐藏。
- 生产 Host 只为 `/` 返回 SPA index；`/task/<uuid>`、`/history` 和 `/history/<uuid>` 的直接打开与
  刷新会落到静态文件 404。

因此不能只批量替换 URL 字符串。必须先分离 route target、授权会话、initialized commands 和 live
projection owner，再切导航与二维码；最终由 Rust Host 与生产 fallback 收口同一 browser contract。

## 权威 contract 与状态边界

```text
Rust gui-host browser contract
  -> generated schema/typescript/browserContract.ts
  -> TanStack route grammar / QR URL builder

pathname route target
  -> current task | history list | history detail
  -> connection startup coordinator
      -> authenticated + initialized commands
      -> optional live owner
      -> optional route-local history owner

session bootstrap record
  -> host token + optional active thread recovery id
  -> never owns runtime/transcript/cwd/queue
```

- Rust browser contract 是跨 Rust/TypeScript 的 path segment、token fragment key 和 WebSocket path 的
  唯一来源；不得在两端各手写一份字符串集合。
- pathname 是页面目标的唯一权威来源；query 不承载 task identity，非空 legacy `threadId` query 必须
  在任何 WebSocket 或业务请求前被拒绝。
- session bootstrap record 只用于刷新重建。运行中的 active owner 仍是 live task identity 的唯一权威；
  attach/switch commit 后才更新 recovery id。
- command gateway 在 initialize 后可用；是否存在 live projection 是上层 owner 状态，不是 transport
  command readiness。
- live owner、history list owner 与 history detail owner 继续相互隔离，不把 `thread/read` 写入 Redux
  live transcript。
- 新 fragment token 表示一次显式启动：先建立新的 session bootstrap record，不能沿用旧 active recovery
  把外部只读链接意外升级成后台 live 会话。

## 固定范围

### 文档

- `docs/superpowers/specs/2026/08/17/2026-08-17-codex-gui-url-contract-redesign.md`
- `docs/superpowers/plans/2026/08/17/2026-08-17-codex-gui-url-contract-redesign.md`

### Rust GUI Host 与生成 contract

- `codex-rs/gui-host/src/browser_contract.rs`
- `codex-rs/gui-host/src/browser_contract_fixtures.rs`
- `codex-rs/gui-host/src/url.rs`
- `codex-rs/gui-host/src/host.rs`
- `codex-rs/gui-host/src/assets.rs`（仅当 index/static seam 必须下沉）
- `codex-rs/gui-host/tests/browser_contract_fixtures.rs`
- `codex-rs/gui-host/tests/dev_proxy.rs`（只更新依赖旧 query URL 的 origin helper）
- `codex-rs/gui-host/tests/prod_serves_hashed_asset.rs`（只更新依赖旧 query URL 的 origin helper）
- `codex-rs/gui-host/schema/**`（只由生成命令更新）
- `codex-rs/app-server/src/gui_launch_service.rs`（只更新受新 URL contract 影响的断言）
- `codex-rs/app-server/src/gui_launch_service_tests.rs`（只更新受新 URL contract 影响的断言）
- `codex-rs/app-server/src/gui_host.rs`（只更新 URL origin helper 与旧 URL 断言）
- `codex-rs/app-server/src/in_process.rs`（只更新受新 URL contract 影响的断言）
- `codex-rs/app-server-client/src/gui.rs`（只更新锁定旧 URL 的测试 fixture 与断言）
- `codex-rs/app-server-client/src/lib.rs`（只更新受新 URL contract 影响的断言）

### Codex GUI 生产代码

- `codex-gui/src/router.tsx`
- `codex-gui/src/App.tsx`
- `codex-gui/src/NotFoundPage.tsx`
- `codex-gui/src/features/browserLaunch/**`
- `codex-gui/src/features/guiHost/guiHostClient.ts`
- `codex-gui/src/features/guiHost/guiHostHandshakeController.ts`
- `codex-gui/src/features/guiHost/guiHostCommandGateway.ts`（只在 initialize-ready seam 需要最小调整时）
- `codex-gui/src/features/appShell/AppCapabilities.ts`
- `codex-gui/src/features/appShell/AppCapabilitiesContext.tsx`
- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
- `codex-gui/src/features/appShell/AppShellTopBar.tsx`
- `codex-gui/src/features/currentTask/CurrentTaskPage.tsx`
- `codex-gui/src/features/threadHistory/ThreadHistoryListPage.tsx`
- `codex-gui/src/features/threadHistory/ThreadHistoryDetailPage.tsx`
- `codex-gui/src/features/threadHistory/threadHistoryDetailOwner.ts`（仅在 lifecycle owner 本身需要调整时）
- `codex-gui/src/features/projectionCoordination/threadSwitchCoordinator.ts`
- `codex-gui/src/features/qrAccess/**`
- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- `codex-gui/src/locales/en.po`
- `codex-gui/src/locales/zh-CN.po`

### 测试与测试支撑

- `codex-gui/src/__tests__/appBrowserTestSupport.ts`
- `codex-gui/src/__tests__/App.browser.test.tsx`
- `codex-gui/src/__tests__/AppRouting.browser.test.tsx`
- `codex-gui/src/__tests__/NotFoundPage.browser.test.tsx`
- `codex-gui/src/features/browserLaunch/__tests__/**`
- `codex-gui/src/features/guiHost/__tests__/guiHostHandshakeController.test.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostCommandGateway.test.ts`
- `codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts`（仅在删除
  `onProjectionAttached` 与旧 test support 后，同步验证 terminal protocol errors、commands
  invalidation 和 pending rejection）
- `codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts`
- `codex-gui/src/features/appShell/__tests__/AppShellTopBar.browser.test.tsx`
- `codex-gui/src/features/threadHistory/__tests__/**`
- `codex-gui/src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts`
- `codex-gui/src/features/qrAccess/__tests__/**`
- `codex-gui/e2e/app.spec.ts`

若实现必须修改 app-server protocol/schema、历史列表 cwd 语义、token 权限模型、跨 tab 普通复制、
长期 storage、Composer queue 数据，或上述范围外生产模块，立即停止并回到计划确认。

## 非目标与禁止范围

- 不兼容、迁移、重定向或双读任何 `?threadId=` URL。
- 不把 token 放进 query、pathname、cookie、`localStorage` 或服务端 share session。
- 不使普通复制的规范 URL在无授权浏览器中可用；只有显式二维码链接携带 fragment token。
- 不给历史列表增加二维码或扩大到所有 cwd。
- 不在纯只读启动时 resume、attach、创建 Composer queue 或伪造 active owner。
- 不改变 app-server v2 request/response、generated validator 或 GUI Host method allowlist。
- 不把 session recovery id 当作第二份 live identity，不保存 cwd、transcript、queue 或历史详情。
- 不使用通配“所有 404 返回 index.html”的 SPA fallback。
- 不新增依赖、不安装工具或浏览器、不运行 Git 远程命令。
- 不运行后端/原生/CLI build 或 run；本计划中的 Rust test、format 和 browser contract 生成属于明确允许
  的测试/格式化/生成流程。
- 不在行为提交中混入纯 import、声明、字段、函数或组件顺序整理；如确需纯重排，停止并新增独立计划
  任务，不能顺手夹入。

每个任务以一个独立本地提交结束。中间提交允许暂时不完整，但不得为此加入 legacy adapter、双路径、
fallback 或临时兼容层；最终状态只能保留新 contract。

## Preflight（实施前只读）

```bash
git status --short --branch
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git log -1 --oneline
test -x /opt/homebrew/bin/fnm
test -d codex-gui/node_modules
test -d ../vitest/docs
/opt/homebrew/bin/fnm exec --using-file pnpm --version
just --list
```

要求：

- 分支/HEAD 仍为 `dev @ 573e417efbb731d174f08920fb13ddf774bb7b63`；如漂移，先只读评估计划与
  当前代码差异，不机械执行旧行号。
- 当前预存变更应只有本设计和计划文档；若出现其他变更，逐文件避让，禁止覆盖用户工作。
- fnm、pnpm、node_modules、Vitest 本地文档、just、cargo-nextest 或既有浏览器二进制缺失时停止；助手
  不得安装。
- 所有 pnpm 命令 cwd 为 `codex-gui`，使用
  `/opt/homebrew/bin/fnm exec --using-file pnpm ...`。
- Rust test 使用精确名称 filter；不得运行 crate-wide `just test -p ...`、workspace `just test` 或
  `cargo test`。

## Task 0：确认并提交设计与计划文档

### 修改

- 用户确认本计划后，把计划状态更新为“已确认”，记录确认日期与确认原文。
- 不改写已确认设计语义。

### 验证与提交

```bash
git add -- docs/superpowers/specs/2026/08/17/2026-08-17-codex-gui-url-contract-redesign.md docs/superpowers/plans/2026/08/17/2026-08-17-codex-gui-url-contract-redesign.md
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m 'docs(gui): plan canonical URL contract'
```

staged name 必须恰好是这两份文档。

## Task 1：原子切换 Rust browser URL contract

### 修改

- 在 Rust `browser_contract` 中删除 `THREAD_QUERY_KEY`，增加 current-task 与 history 的权威 path
  segment/prefix contract；Rust URL builder 与生成 TypeScript 必须机械引用同一来源。
- 把 GUI Host 正式 launch URL 改为 `/task/<percent-encoded-thread-id>#token=<token>`；token 继续只在
  fragment，URL 中只有一个 UUID/任务 identity。
- 运行 `just write-gui-host-browser-contract` 更新 JSON/TypeScript fixtures；禁止手改生成文件。
- 只更新 app-server、app-server-client 与 gui-host 中锁定旧 URL 字符串的测试断言；不改变 launcher
  API、token 生命周期、advertised-host 排序或 loopback/LAN 选择。
- 不保留旧 query constant、旧 URL builder 或 compatibility overload。

### 验证

```bash
just write-gui-host-browser-contract
just test -p codex-gui-host launch_url_uses_current_task_path_and_fragment_token
just test -p codex-gui-host launch_urls_use_advertised_hosts_in_order
just test -p codex-gui-host browser_contract_fixtures_match_generated
just test -p codex-gui-host proxy_preserves_method_path_query_and_end_to_end_request_headers
just test -p codex-gui-host prod_serves_hashed_asset_from_package_root
just test -p codex-app-server launch_service_returns_urls_for_thread
just test -p codex-app-server app_server_gui_launch_service_returns_tool_urls
just test -p codex-app-server launch_url_reuses_same_host_for_manager_lifetime
just test -p codex-app-server in_process_launch_gui_for_thread_uses_app_server_service
just test -p codex-app-server-client gui_launch_urls_expose_entries
just test -p codex-app-server-client in_process_launch_gui_for_thread_returns_loopback_url_entry
just test -p codex-app-server-client in_process_launch_gui_uses_app_server_service
just test -p codex-app-server-client in_process_launch_gui_reuses_same_host_for_multiple_threads
```

只有实际受旧 URL 断言或 origin helper 影响的 filter 才运行；若 live test 名不同，先用 `rg` 核对后替换为
当前精确名称，不扩大到 crate。

### 提交

只暂存 browser contract 源、生成物、URL builder 与受影响的精确 Rust 测试文件；检查 staged diff 后
提交：

```bash
git commit -m 'feat(gui): define canonical task launch URL'
```

## Task 2：建立 pathname route target 与 tab 授权会话

### 修改

- 新增 frontend-owned route target seam，从 TanStack 匹配结果表达：
  `currentTask(threadId)`、`historyList`、`historyDetail(threadId)`；path segment 必须引用生成 browser
  contract，不手写第二份跨端字符串。
- Router 原子切换为 `/task/$threadId`、`/history`、`/history/$threadId`；不保留 `/` index route。
- 任何非空 query，尤其旧 `threadId` query，在建立连接或发业务请求前进入 invalid URL 页面；不删除后
  继续，不 redirect。
- NotFound 页保留 `Go back home` 操作，但目标改为规范 `/history`；本任务只保证用户显式操作进入该规范
  路径，不用 mock 伪造尚未接入 App/Bridge 的历史列表上下文行为。authorization session 有 token 但没有
  active recovery 时的 fail-closed 行为归 Task 5 实现与验证。
- 用 browser authorization session 取代 `{threadId, token}` launch params：保存 host token 与可选
  active thread recovery id，作用域保持 `sessionStorage`/当前 tab。
- fragment token 优先并覆盖旧 session；显式 fragment 启动先把 active recovery 置空，保证历史详情
  二维码不会继承旧 live owner。消费后只清 fragment，保留规范 pathname。
- active recovery 只能通过显式 commit API 写入或清除；parser 不保存 cwd、transcript、queue 或历史内容。
- storage 缺失/读失败、token 缺失、非法 route/query 全部 fail closed。

### 测试

- route target unit 覆盖三种规范 pathname、缺 UUID、额外 segment、旧 `/` 和所有非空 query。
- authorization session unit 覆盖 fragment 首次消费、同 tab token/recovery 恢复、新 fragment 清 recovery、
  storage failure 与 fragment 清理顺序。
- NotFound Browser test 覆盖旧 URL不自动导航、不发 commands，并覆盖用户显式点击 `Go back home` 后进入
  规范 `/history`；本任务不通过 mock 断言尚未存在的 App/Bridge 历史列表启动行为。

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/browserLaunch/__tests__
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/__tests__/NotFoundPage.browser.test.tsx
```

### 提交

本次 Task 2 范围与行为修订及验证顺序修订必须先形成独立文档提交，不得与 Task 2 或 Task 5 的前端行为
修改混合。

只暂存 router、browserLaunch 模块、生成 TypeScript fixture 的消费调整和对应测试，提交：

```bash
git commit -m 'feat(gui): parse canonical route targets'
```

## Task 3：把 initialize、commands ready 与 projection attach 解耦

### 修改

- `GuiHostHandshakeController` 只编排 `gui/authenticate → initialize`，不接收 thread ID，不自动
  `thread/projection/attach`。
- initialize 成功后激活并发布一个稳定 `GuiHostCommands` handle；`thread/read`、`thread/list`、显式
  attach 等 allowlisted commands 此时可用。
- `attached` 不再是 transport handshake 的必经状态；只有上层 live startup attach 成功后才发布 live
  attached 状态。纯只读连接在 initialized 状态必须能调用 `thread/read`。
- WebSocket close、terminal protocol failure 和 cleanup 继续 invalidate commands 并拒绝 pending request；
  不改变 request validator、delivery classification 或 allowlist。
- client 接受已经解析的 authorization/token，不再消费 URL 或把 route thread 注入 handshake。

### 测试

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts
```

覆盖严格 RPC 顺序、initialize 后 read/attach 可用、零自动 attach、initialize 前与 terminal failure 后不可用、
cleanup 拒绝 pending commands；`guiHostProtocolErrors.test.ts` 在删除 `onProjectionAttached` 与旧 test
support 后继续同步验证 terminal protocol errors、commands invalidation 和 pending rejection。

### 提交

本次 Task 3 范围修订必须先形成独立文档提交，不得与 Task 3 的前端行为修改混合。

只暂存 handshake/client/gateway seam、test support 与对应 unit tests（包括上述限定范围内的
`guiHostProtocolErrors.test.ts`），提交：

```bash
git commit -m 'refactor(gui): separate commands from live attach'
```

这是启动 seam 的行为重构，不混入路由 UI、二维码或代码顺序整理。

## Task 4：建立 route-based connection startup coordinator

### 修改

- 新增 connection-scoped 深模块，输入 `GuiRouteTarget`、authorization session 和 initialized commands，
  输出可选 active owner、route capability/error 与 cleanup；避免继续扩张 `GuiHostConnectionBridge`。
- `/task/<id>`：显式 attach pathname ID；snapshot/identity完整后创建唯一 projection、runtime、queue 与
  switch owner，再提交 active recovery ID。
- `/history`：有 recovery ID 时恢复同一后台 live owner，再由列表使用其 cwd；缺 recovery ID 时返回
  typed “history context unavailable”，零 list/attach 猜测。
- `/history/<detail-id>`：有 recovery ID 时只 attach recovery task，detail ID只供页面 read；无 recovery
  ID 时保持纯只读，零 attach/queue/伪 active owner，但 commands 保持可用。
- 新 fragment 启动的 history detail 即使旧 session 曾有 active ID也必须走纯只读分支。
- route target 与 attach response identity 不一致时不提交错误 owner；完整失败保留规范 pathname并暴露原始
  error，不回退其他 task。
- startup coordinator 与现有 `ThreadSwitchCoordinator` 共享 active-owner 形状，不建立第二套 projection
  apply 或 queue 创建路径。

### 测试

- 新 coordinator unit 覆盖三种 target、history 两种恢复分支、详情有/无后台 owner、identity mismatch、
  attach/readiness failure、dispose 与 session commit 时机。
- 测试整个对象或 transition record deep equality，不逐字段拼断言。

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/appShell/__tests__/routeConnectionStartupCoordinator.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

### 提交

只暂存新 coordinator、最小 shared owner seam、authorization commit hook 与 unit test，提交：

```bash
git commit -m 'feat(gui): coordinate route-based startup'
```

## Task 5：把 App/Bridge 接入三种启动模式

### 修改

- `App`/root layout 从 Router 取得权威 route target并传给常驻 bridge；整个 SPA 生命周期只建立一条
  WebSocket，页内导航和 Back/Forward 不重连。
- Bridge 使用 Task 4 coordinator，不再维护 `launchThreadId` 或可变 `{threadId, token}` launch params。
- `AppCapabilities` 分离 authorization token、commands、可选 active owner 和 continue capability；历史页面
  不把 detail ID冒充 active identity。
- `/task/<id>` attach 成功后展示 current transcript/Composer；URL 与最终权威 owner 不一致时只用 replace
  收敛为 `/task/<权威 id>`。
- `/history` 无恢复上下文时用 Lingui `Trans`/`t` 显示明确错误，不扩大到所有 cwd；运行
  `messages:extract` 更新 catalog，再补 `zh-CN` 翻译，禁止手写未提取的 message id。
- authorization session 有 token 但没有 active recovery 时，必须通过真实 App/Bridge 行为显示历史列表
  上下文不可用，零 `thread/list`、不猜测 cwd、不重定向；不得用页面 mock 伪造该结果。
- `/history/<id>` 在纯只读模式下即使 active owner 为 null 也保留 commands 给 detail owner，且不渲染
  Composer。
- Back/Forward 只改变 route surface；connection coordinator 与 live owner 不因普通页面切换重建。

### 测试与本地化

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/__tests__/App.browser.test.tsx src/__tests__/AppRouting.browser.test.tsx src/features/threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

覆盖 task attach、history list 有/无恢复、detail 后台/纯只读、一次 connection、旧 URL零请求、错误可访问
名称和中文 catalog。其中“有 token、无 active recovery”必须由 App/Bridge Browser test 断言上下文不可用、
零 `thread/list`、不猜测 cwd且不重定向，不得由 NotFound/page mock 代替。只暂存
App/Bridge/capabilities、页面最小接线、catalog 与对应 tests，提交：

```bash
git commit -m 'feat(gui): start from canonical routes'
```

## Task 6：闭环只读详情生命周期与无旧 owner 的继续流程

### 修改

- 让 `ThreadHistoryDetailOwnerBound` 在 React StrictMode 检查性 cleanup 后仍能 settle 当前 read；真实卸载
  仍必须 dispose 并拒绝陈旧响应。复用列表页已证明的延迟 disposal/cancel 语义，不放宽 loading 断言。
- 纯只读详情使用 initialized commands 调用精确
  `thread/read({threadId: routeId, includeTurns: true})`，成功/失败都必须退出 loading；不 resume、不 attach。
- 扩展 connection/thread activation 深接口，使 `continueThread(routeId)` 能从“没有旧 active owner”开始
  prepare：resume、attach、构建 runtime 与 queue，全部可用后首次 commit live owner。
- 有旧 active owner 时继续沿用现有 queue release gate 与 transactional switch；不得为无旧 owner 分支复制
  第二份 resume/attach/commit 实现。
- 成功后更新 session recovery并 replace `/task/<权威 id>`；失败/blocked 保留详情、只读内容与
  `/history/<route id>`。

### 测试

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/threadHistory/__tests__/threadHistoryDetailOwner.test.ts src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/features/threadHistory/__tests__/ThreadHistoryDetailPage.browser.test.tsx src/__tests__/AppRouting.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Browser test 必须显式用 `<StrictMode>` 覆盖 loading→ready/error；继续测试覆盖无旧 owner成功/失败、已有
owner blocked/success、replace history length 与零自动 resume/attach。

### 提交

只暂存 detail lifecycle、统一 activation/switch seam、session commit 和对应测试，提交：

```bash
git commit -m 'fix(gui): activate tasks from read-only history'
```

本任务是已确认 URL设计可用性的必要行为闭环；不借机修改只读 transcript UI、queue 产品语义或页面样式。

## Task 7：原子切换导航与 route-aware 二维码

### 2026-08-18 范围扩大

Task 7 额外纳入以下 3 个直接依赖测试文件：

- `codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts`
- `codex-gui/src/__tests__/sequential/composer-viewport.browser.test.tsx`
- `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`

范围扩大原因：三者仍使用已删除的 GUI Host status `attached`；后两个文件还必须随 Task 7 从旧
`launchParams` prop 直接迁移到 `routeTarget` + `authorizationToken`。本次只迁移对应 fixture 与 prop，
不扩大 Composer queue/control 产品语义，也不新增或保留兼容字段。

### 修改

- Topbar 当前任务导航从 active owner 构造 `/task/<id>`；纯只读外部会话没有 active owner 时，该导航项
  不猜 UUID并保持不可用。
- 历史列表 View、详情返回、Back/Forward 与继续结果全部移除 `search: true`、`THREAD_QUERY_KEY` 和
  query 断言；当前 task、list、detail URL分别只有 1/0/1 个 UUID。
- QR builder 接受当前可见 `GuiRouteTarget` 与 token，生成：
  `/task/<active id>#token=...` 或 `/history/<detail id>#token=...`；只在 fragment 放 token。
- 当前任务继续在 Composer action surface 使用既有 HeroUI v3 QR Popover；历史详情在固定底部 action
  surface 复用同一 `QrAccessPopover`，与“继续此任务”并列但不改变主次语义。
- 历史详情 QR严格使用 pathname detail ID，即使后台 active owner 不同；历史列表不新增 QR。
- QR 文案继续说明它携带 GUI Host 访问凭据；如无需新文案，不制造 catalog churn。

### 测试

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/qrAccess/__tests__/qrAccessUrl.test.ts src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/features/qrAccess/__tests__/QrAccessPopover.browser.test.tsx src/features/appShell/__tests__/AppShellTopBar.browser.test.tsx src/features/threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx src/features/threadHistory/__tests__/ThreadHistoryDetailPage.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx src/__tests__/AppRouting.browser.test.tsx src/__tests__/App.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:sequential -- src/__tests__/sequential/composer-viewport.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

覆盖 QR raw URL、token fragment、可见 UUID、列表无模块、Back/Forward 一条连接、继续 replace 和任意规范
页面最多一个 UUID。

### 提交

只暂存 navigation、QR、current/detail action 接线与对应 tests，提交：

```bash
git commit -m 'feat(gui): share canonical route URLs'
```

## Task 8：为生产 Host 增加受控 SPA deep-link fallback

### 修改

- 生产 router 显式把 `/task/{thread_id}`、`/history`、`/history/{thread_id}` 交给现有 index responder。
- `/ws` 继续独立；真实静态文件继续由 `ServeDir` 提供。
- 只匹配合法页面 grammar，不使用全局 fallback；未知 `.js`/`.css`、非法额外 segment 和未知路径必须
  继续 404，避免用 index 隐藏构建或资源错误。
- Dev Vite 与生产 Host 对三类 pathname 使用同一 browser contract segment。

### 测试

在现有临时 dist harness 中同时断言三个合法页面返回 index/security headers、已知 asset 正常、未知 asset
与非法 route 404：

```bash
just test -p codex-gui-host prod_known_spa_routes_serve_index
just test -p codex-gui-host prod_unknown_asset_returns_not_found
```

若采用现有 test 名扩展而非新建 filter，执行前用 `rg` 确认精确名称，不运行整个 crate。

### 提交

只暂存 Host route/assets seam 与对应 focused tests，提交：

```bash
git commit -m 'feat(gui): serve canonical SPA routes'
```

## 最终验证与格式化

所有任务提交完成后，先验证合并状态；不得用跳过、ignore、放宽断言、修改基线或兼容 fallback 让验证
变绿。

### GUI contract 与静态检查

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run protocol:check-validators
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

`messages:extract` 若在最终状态产生新 diff，必须只包含计划内 catalog 机械更新；检查后作为引入该消息的
任务修正提交，不另建“验证修复”大提交。

### GUI focused tests

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit -- src/features/browserLaunch/__tests__ src/features/guiHost/__tests__/guiHostHandshakeController.test.ts src/features/guiHost/__tests__/guiHostHandshake.test.ts src/features/guiHost/__tests__/guiHostCommands.test.ts src/features/guiHost/__tests__/guiHostCommandGateway.test.ts src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts src/features/qrAccess/__tests__/qrAccessUrl.test.ts src/features/threadHistory/__tests__/threadHistoryDetailOwner.test.ts src/features/projectionCoordination/__tests__/threadSwitchCoordinator.test.ts src/features/appShell/__tests__/routeConnectionStartupCoordinator.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- src/__tests__/App.browser.test.tsx src/__tests__/AppRouting.browser.test.tsx src/__tests__/NotFoundPage.browser.test.tsx src/features/appShell/__tests__/AppShellTopBar.browser.test.tsx src/features/qrAccess/__tests__/QrAccessPopover.browser.test.tsx src/features/threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx src/features/threadHistory/__tests__/ThreadHistoryDetailPage.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run test:e2e -- e2e/app.spec.ts
```

Browser Mode locator 断言使用本地 Vitest 文档推荐的 `await expect.element(locator)` 重试语义；不以固定
sleep、DOM tag 猜测或放宽 timeout 隐藏异步错误。E2E 缺少既有浏览器二进制时停止并报告，不安装。

### Rust focused tests

```bash
just test -p codex-gui-host launch_url_uses_current_task_path_and_fragment_token
just test -p codex-gui-host launch_urls_use_advertised_hosts_in_order
just test -p codex-gui-host browser_contract_fixtures_match_generated
just test -p codex-gui-host prod_known_spa_routes_serve_index
just test -p codex-gui-host prod_unknown_asset_returns_not_found
just test -p codex-app-server launch_service_returns_urls_for_thread
just test -p codex-app-server app_server_gui_launch_service_returns_tool_urls
just test -p codex-app-server-client in_process_launch_gui_for_thread_returns_loopback_url_entry
```

只运行实际存在且受 diff 影响的精确 filter。不得替换为 crate-wide/workspace-wide test，也不运行
`cargo test`。

### 格式化与最终状态检查

所有测试、lint 和类型检查完成后运行仓库要求的格式化；按项目规则，格式化后不重跑测试：

```bash
just fmt
git diff --check
git status --short
git log --oneline -13
```

检查 `just fmt` 实际 diff；若触及计划外文件，停止并报告，不自动纳入提交。计划内格式化修正归入引入该
文件的对应任务提交，不创建混合行为的兜底提交。

## 完成判定

只有以下条件全部成立，实施才完成：

- 设计和计划文档、8 个实现任务分别形成独立本地提交；
- 本次计划范围修订形成独立本地提交，不与 Task 1 的 Rust 行为修改混合；
- 本次验证顺序修订形成独立文档提交，不与 Task 2 或 Task 5 的行为修改混合；
- 本次 Task 3 范围修订形成独立文档提交，不与 Task 3 的前端行为修改混合；
- Rust/TypeScript browser contract 不再存在 `THREAD_QUERY_KEY` 或旧 URL builder；
- current/list/detail 规范 URL分别为 1/0/1 个 UUID，所有 legacy query URL明确失败；
- initialize 后 commands 可用，但纯只读详情零自动 attach/resume/Composer；
- 同 tab 刷新正确区分后台 live 历史详情与纯只读外部详情；
- history list 缺恢复上下文时 fail closed，不扩大 cwd；
- StrictMode 下只读详情成功或失败都退出 loading；
- 无旧 owner 与有旧 owner 的“继续此任务”都只在完整 commit 后进入 `/task/<uuid>`；
- 当前任务与历史详情二维码分享当前可见页面，历史列表没有二维码；
- 生产 Host 只为合法 SPA pathname fallback，未知资源继续 404；
- 所有 focused 验证通过，format 后无计划外 diff，worktree 不残留未提交的本次变更；
- 未执行安装、Git 远程、crate/workspace-wide Rust test 或 lint。
