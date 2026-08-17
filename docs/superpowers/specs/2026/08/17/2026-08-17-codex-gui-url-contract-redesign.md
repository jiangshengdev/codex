# Codex GUI URL 规范重设计

设计状态：已确认

确认日期：2026-08-17

设计日期：2026-08-17

设计分支：`dev`

设计时 HEAD：`573e417efbb731d174f08920fb13ddf774bb7b63`

关联文档：

- 历史任务列表：`docs/superpowers/specs/2026/08/16/2026-08-16-codex-gui-thread-history-list-design.md`
- 二维码访问：`docs/superpowers/specs/2026/06/27/2026-06-27-codex-gui-qr-access-design.md`

本设计只取代上述文档中的 URL、浏览器启动、刷新恢复与二维码目标规范。历史列表范围、只读详情、
显式“继续此任务”、线程切换安全性、页面组件和视觉语义继续遵守原设计。

## 唯一主目标

重新设计 Codex GUI 的 URL 规范，使当前任务、历史列表和只读历史详情的地址只表达用户可见的页面
资源与模式，不再暴露 GUI Host 的连接实现；同时保留同一授权浏览器会话内的刷新恢复、显式二维码
启动和安全的任务切换。

本设计定义规范 URL、启动 URL、路由身份、授权会话、刷新、二维码、只读启动、旧 URL 拒绝规则和
验证边界。它不是 implementation plan，不定义任务顺序、提交拆分或执行命令，也不授权修改产品代码。

## 当前实现与为什么需要改动

### URL 混合了页面资源与连接身份

当前前端路由为 `/`、`/history` 和 `/history/$threadId`：

- `codex-gui/src/router.tsx:18-34`

浏览器启动另外强制从 query 读取 `threadId`。该值并不是当前路由资源，而是握手完成后首次
`thread/projection/attach` 的目标：

- `codex-gui/src/features/browserLaunch/browserLaunchParams.ts:19-44`
- `codex-gui/src/features/guiHost/guiHostClient.ts:68-78`
- `codex-gui/src/features/guiHost/guiHostHandshakeController.ts:58-125`

历史页面导航使用 `search: true` 保留这个连接身份：

- `codex-gui/src/features/appShell/AppShellTopBar.tsx:22-25`
- `codex-gui/src/features/threadHistory/ThreadHistoryListPage.tsx:162-170`
- `codex-gui/src/features/threadHistory/ThreadHistoryDetailPage.tsx:130-134`

因此只读详情会形成：

```text
/history/<正在查看的任务 UUID>?threadId=<后台当前任务 UUID>
```

pathname UUID 表示用户正在查看的只读任务；query UUID 只表示同一 GUI 连接最初 attach 的任务。
一个地址同时暴露两个不同任务身份，无法从 URL 本身判断哪一个是页面资源，也把连接实现泄漏进了
导航历史、复制地址和书签。

### `threadId` 不是鉴权凭据

GUI Host 的 WebSocket 地址固定为同源 `/ws`。服务端认证只比较 `gui/authenticate` 中的 launch
token，不读取、不验证，也不把 token 绑定到 URL 中的 `threadId`：

- `codex-rs/gui-host/src/ws.rs:62-121`
- `codex-rs/gui-host/src/browser_contract.rs:6-15`

当前 query `threadId` 只在认证和 `initialize` 之后用于首次 projection attach。因此把连接身份移出
query 不会削弱 token 鉴权；真正需要重构的是“路由目标、命令可用和 live projection attach 必须同时
发生”的启动流程。

### 当前刷新依赖地址栏保留连接 UUID

fragment token 首次消费后会写入 `sessionStorage["codex-gui.launchToken"]`，并立即从地址栏清除；
但启动任务 UUID 没有内部会话恢复位置，刷新仍要求 query 中存在 `threadId`：

- `codex-gui/src/features/browserLaunch/browserLaunchParams.ts:8-52`
- `codex-gui/src/features/browserLaunch/__tests__/browserLaunchParams.test.ts:47-127`

这使“只删除 `search: true`”成为隐藏问题而非解决问题：同一 SPA 内导航暂时看似正常，但刷新历史页面
会在创建 WebSocket 前失败。新规范必须把授权会话恢复与规范 URL 分离。

### 生产 Host 不支持深层 SPA 刷新

生产 GUI Host 当前只为 `/` 显式返回 `index.html`；其他 pathname 交给静态文件服务，而构建产物没有
`/history/**` 或 `/task/**` 物理文件：

- `codex-rs/gui-host/src/host.rs:137-155`
- `codex-rs/gui-host/src/assets.rs:32-40`

因此新规范不能只改 TanStack Router。`/task/<uuid>`、`/history` 和 `/history/<uuid>` 的直接打开及
刷新还要求 Host 提供受控的 SPA index fallback，同时继续把真实静态资源 404 与页面路由分开。

## 术语与身份边界

本设计区分三类身份：

| 名称 | 含义 | 是否进入规范 URL |
| --- | --- | --- |
| 路由任务身份 | 当前页面表示的 task/thread 资源 | 是；仅资源页面包含一个 UUID |
| 活动任务身份 | 当前 GUI 中唯一可接收 live projection 和 Composer 操作的任务 | 只在 `/task/<uuid>` 中等同于路由身份；历史页面不暴露 |
| 授权凭据 | GUI Host 实例级 launch token | 只在用户显式生成的启动 URL fragment 中短暂出现 |

历史详情的路由任务身份不自动成为活动任务身份。只有“继续此任务”成功后，两者才收敛为同一个 UUID。

## 已确认的规范 URL

### 页面 URL

| 页面 | 规范 URL | UUID 数量 | 语义 |
| --- | --- | ---: | --- |
| 当前任务 | `/task/<thread-id>` | 1 | 当前唯一 live task |
| 历史列表 | `/history` | 0 | 当前工作目录的未归档历史列表 |
| 只读历史详情 | `/history/<thread-id>` | 1 | 只读查看指定 task |

规范 URL 不使用 `?threadId=`，也不使用 query、fragment 或第二个 path segment 携带后台活动任务 UUID。
任意页面地址最多包含一个 task UUID。

### 显式启动 URL

用户主动打开二维码时，启动 URL 在对应规范 URL 后附加 token fragment：

```text
/task/<当前任务 UUID>#token=<launch-token>
/history/<正在查看的 UUID>#token=<launch-token>
```

fragment 只承担一次启动授权。前端成功消费后必须立即用 `history.replaceState` 清除整个 fragment，
地址栏回到对应规范 URL。token 不得转入 query、pathname、TanStack Router search state 或浏览器 history
的新条目。

历史列表没有二维码模块，不生成 `/history#token=...`。

## 路由与启动状态机

### 共同前置阶段

三类页面启动都先执行：

1. 按路由 grammar 解析 pathname；不从 query 推导 task identity。
2. 从 fragment 读取新 token，或从当前 tab 的授权会话恢复 token。
3. 有 fragment token 时写入当前 tab 的 session storage，并立即清除 fragment。
4. 创建同源 `/ws`，执行 `gui/authenticate` 和 `initialize`。
5. 根据路由模式进入 live attach、history list 或 read-only detail 分支。

“已认证并初始化”必须成为独立于“已 attach live projection”的连接阶段。命令 gateway 的可用边界必须允许
只读分支调用受 allowlist 约束的 `thread/read`，不能继续把所有命令能力绑定到首次 attach 成功之后。

### 当前任务启动

打开 `/task/<thread-id>` 时：

1. pathname 中唯一 UUID 是初始活动任务身份；
2. 认证和初始化成功后 attach 该 thread 的 projection；
3. attach snapshot 成为唯一 live runtime、transcript 和 Composer owner；
4. 当前 tab 的授权会话记录该活动任务身份，供无 UUID 的历史列表刷新恢复使用。

URL 与 live owner 必须一致。若 pathname UUID 与最终权威 active owner 不一致，应用必须以一次
`replace` 导航收敛到 `/task/<权威 active owner UUID>`，不得在后台保留不一致的地址。

### 当前会话内打开历史列表

`/history` 只在当前已授权浏览器会话内使用，不是二维码或跨设备入口。

- 从当前任务页进入时继续复用现有 WebSocket 和 live owner；
- 列表仍按活动任务的 `cwd` 调用 `thread/list`；
- 列表路由不携带活动任务 UUID；
- 同 tab 刷新时，从授权会话恢复活动任务身份，再建立原 live owner，随后加载列表；
- 若授权会话缺少活动任务身份，不得改成列出所有工作目录，也不得从任意历史记录猜测 cwd；应显示明确的
  启动上下文不可用错误。

活动任务身份的会话恢复属于 browser-session bootstrap state，不是第二份业务真相。运行中仍以权威
active owner 为准；任务切换 commit 后必须同步更新该恢复值。

### 当前会话内打开只读详情

从已连接 GUI 进入 `/history/<thread-id>` 时：

- 继续复用现有 WebSocket 和后台唯一 live owner；
- pathname UUID 只传给 `thread/read({ threadId, includeTurns: true })`；
- 不调用 `thread/resume`，不 attach 该历史 thread，不替换 live runtime、Composer queue 或 transcript；
- 刷新时可以从授权会话恢复后台活动任务，但它仍不得出现在 URL 中。

### 二维码打开只读详情

新浏览器或设备打开 `/history/<thread-id>#token=...` 时没有既有活动任务上下文。该模式必须：

1. 使用 fragment token 完成认证和初始化；
2. 在不 attach projection 的情况下启用只读所需命令；
3. 调用 `thread/read({ threadId, includeTurns: true })`；
4. 只创建 history detail owner，不创建 Composer queue 或伪造 live owner；
5. 保持 URL 为 `/history/<thread-id>`。

打开这个启动链接本身不得调用 `thread/resume`，也不得把 `thread/projection/attach` 当作读取历史的必要
步骤。否则“只读打开”会变成隐式运行状态切换。

## 刷新、复制与授权会话

### 同一授权浏览器会话

同一 tab 的授权会话必须支持刷新：

- `/task/<uuid>` 从 pathname 恢复目标，从 session token 恢复认证；
- `/history` 从 session token 与内部活动任务恢复值恢复列表上下文；
- `/history/<uuid>` 从 pathname 恢复只读目标，并在存在活动任务恢复值时恢复后台 live owner；
- 由二维码直接启动、从未建立 live owner 的只读详情刷新后，继续保持纯只读模式。

实现必须能区分“有后台活动任务的历史详情”和“只有只读详情的外部会话”，不得因为都使用同一路由就
在刷新后自动制造 live owner。

### 普通复制不是授权分享

清除 fragment 后复制的规范 URL不承诺在新标签页、新浏览器或新设备中直接可用。若目标环境没有同一
授权会话，应显示缺少启动授权的错误，不得从 URL 猜 token、回退到匿名模式或自动连接其他 Host。

只有用户显式打开二维码时，系统才重新把 token 编入启动 URL。二维码属于授权传递操作，不等同于普通
地址复制。

## 二维码规范

二维码模块只出现在：

- 当前任务页：生成 `/task/<当前活动任务 UUID>#token=...`；
- 只读历史详情页：生成 `/history/<当前查看 UUID>#token=...`。

二维码始终分享当前可见页面。历史详情二维码不得退回分享后台活动任务；当前任务二维码不得分享此前
查看的历史任务。历史列表页本身没有二维码模块。

二维码继续使用当前 origin，不在本设计中增加 LAN 地址发现。二维码 UI 必须明确这是携带 GUI Host
访问凭据的启动入口，而不是无授权的公开链接。

## “继续此任务”与 URL 收敛

历史详情中的“继续此任务”继续遵守已有安全切换设计：只有显式点击才允许 resume/attach；旧 queue 不可
安全释放时必须阻止；不同 task 采用 prepare / commit / cleanup owner replacement。

成功结果统一执行 replace 导航：

```text
/history/<thread-id>
→ /task/<权威 active owner thread-id>
```

同时更新当前 tab 的活动任务恢复值。浏览器 Back 不应返回一个已经通过“继续”转成 live task 的旧只读
详情项。失败或阻止时保留原 `/history/<thread-id>`，不得提前修改 URL。

二维码直接打开的纯只读会话没有旧 live owner。点击“继续此任务”时仍走同一公开操作，但 prepare 阶段
从“无旧 owner”开始；只有 resume、attach、runtime 与 Composer owner 全部可用后才进入
`/task/<thread-id>`。

## 旧 URL 拒绝规则

本设计明确不提供兼容处理。以下旧格式均为无效输入：

```text
/?threadId=<uuid>
/?threadId=<uuid>#token=...
/history?threadId=<uuid>
/history/<查看 UUID>?threadId=<连接 UUID>
/history/<查看 UUID>?threadId=<连接 UUID>#token=...
```

前端不得读取旧 query、把旧地址重定向到新地址、静默删除多余 UUID 后继续，或保留 legacy parser、fallback
和 adapter。GUI Host、二维码生成器、测试 fixture 和所有正式启动入口必须原子切换到新格式。

无兼容意味着新代码落地后，旧书签、旧二维码、旧 CLI 输出和旧测试 URL立即失效。这是已确认的产品结果，
不得在实施阶段为了降低改动风险重新加入双读或迁移路径。

## 权威来源与所有权

### Route target

pathname 是页面目标与页面模式的唯一权威来源：

```ts
type GuiRouteTarget =
  | { type: "currentTask"; threadId: string }
  | { type: "historyList" }
  | { type: "historyDetail"; threadId: string };
```

具体类型名是实现细节。实现必须从 TanStack Router 的匹配结果机械获得目标，不得同时维护第二份 query
target 或用当前 Redux identity 反推用户访问的页面。

### Authorization session

browser-session bootstrap state 只保存重建连接所需的授权和可选活动任务恢复信息。它不拥有 transcript、
thread status、cwd、queue 或只读详情内容，也不得覆盖运行中 active owner 的权威事实。

token 与活动任务恢复值必须同属当前 tab 会话边界。不得为实现跨标签页普通复制而升级到长期
`localStorage`、cookie 或服务端共享 session；跨设备授权只通过用户显式生成的 fragment token 启动链接。

### Live owner 与 history owner

- live owner 唯一拥有当前 projection、runtime、Composer 与 queue；
- history list owner 唯一拥有当前路由实例的分页列表；
- history detail owner 唯一拥有 `thread/read` 返回的只读 transcript；
- URL 不成为上述运行状态的镜像存储，只表达路由目标。

## 失败语义

- 路由 grammar 无效或缺少必需 UUID：显示无效页面地址，不发起猜测性请求。
- 无 fragment token 且授权会话没有 token：显示缺少启动授权，不创建 WebSocket。
- `/history` 缺少活动任务恢复值：显示历史列表上下文不可用，不扩大到所有 cwd。
- 只读启动认证或初始化失败：保留当前规范 pathname，显示完整 host 错误。
- `thread/read` 失败：显示完整读取错误与允许的 Retry；Retry 不 resume、不 attach。
- live attach 失败：不得把 `/task/<uuid>` 渲染成只读详情，也不得回退到另一个 task。
- 继续任务失败：保留 `/history/<uuid>` 和原只读内容。

错误处理不得通过恢复旧 `?threadId=`、追加第二个 UUID、自动选择任意 loaded thread 或静默跳转 `/` 来隐藏
缺失状态。

## 生产 Host 路由边界

生产 GUI Host 必须把已知页面路由交给 SPA index：

```text
/task/<uuid>
/history
/history/<uuid>
```

fallback 只能覆盖合法页面 pathname。`/ws`、真实静态资源、未知文件扩展和非法路径继续走各自现有处理或
明确 404；不得把所有资源错误无条件返回 `index.html`，以免隐藏构建产物缺失。

Dev Vite 与生产内嵌 Host 必须共享同一可刷新 URL contract，不能只在 dev history fallback 下通过。

## 安全约束

- token 继续放在 fragment，避免作为 query 随普通 HTTP 请求、代理日志和 Referer 传播；
- token 消费后立即从地址栏与浏览器 history 当前项清除；
- 规范 URL 永不包含 token；
- 二维码只在用户主动打开后展示，不常驻暴露；
- `threadId` 不是鉴权凭据，不得把“隐藏 UUID”描述为安全控制；
- 纯只读外部会话不创建 live projection 或 Composer，避免凭据传递顺带扩大运行权限；
- session 恢复失败时 fail closed，不回退到任意 thread。

## 非目标

- 不提供旧 URL 迁移、重定向、双读或兼容期。
- 不让普通复制的规范 URL成为跨标签页、跨浏览器或跨设备授权链接。
- 不为历史列表增加二维码模块。
- 不把 token 改为 query、cookie、长期 localStorage 或 URL pathname。
- 不新增公开分享、撤销单条分享链接、短链接或服务端 share session。
- 不改变历史列表“当前 cwd、未归档、最近活动优先”的范围。
- 不改变只读详情 transcript 展示、context pagination 或“继续此任务”的产品语义。
- 不在 URL 中编码 cwd、cursor、列表滚动、Composer draft、queue 或 projection subscription。
- 不创建 implementation plan，不修改产品代码。

## 验证边界

后续 implementation plan 必须覆盖以下可观察 contract，但本设计不规定测试文件拆分或执行命令：

1. GUI Host、二维码和测试入口只生成新格式，不再生成 `?threadId=`。
2. `/task/<uuid>#token=...` 消费 token 后收敛到 `/task/<uuid>`，并 attach 同一 UUID。
3. `/history/<uuid>#token=...` 消费 token 后收敛到 `/history/<uuid>`，只调用 `thread/read`，不
   resume、不 attach、不创建 Composer。
4. 已授权会话在 `/task/<uuid>`、`/history`、`/history/<uuid>` 刷新后恢复正确模式。
5. 普通复制的不含 token URL在无授权会话中 fail closed。
6. 当前任务和历史详情二维码分别包含当前可见页面的唯一 UUID与 fragment token。
7. 历史列表不渲染二维码模块。
8. “继续此任务”成功后 replace 为 `/task/<权威 UUID>`；失败时保留原只读 URL。
9. 所有旧 `?threadId=` URL被明确拒绝，没有重定向或兼容读取。
10. 生产内嵌 Host 对三类合法页面 pathname 提供 SPA index，对未知静态资源继续正确 404。
11. 浏览器 Back/Forward 不重建第二条 WebSocket，也不让 URL target 与 live/history owner 交叉。
12. 任意规范页面 URL 中 task UUID数量不超过一个。

## 完成标准

本设计在以下条件同时满足时才算实现完成：

- 三类规范页面 URL与两类二维码启动 URL全部落地；
- query `threadId` 从浏览器 contract、GUI Host URL 生成、前端解析、导航和测试中完全删除；
- 当前任务、历史列表和纯只读详情都能按各自模式启动和刷新；
- 只读二维码启动不会 resume 或 attach；
- 历史列表没有二维码模块，也不扩大 cwd 范围；
- 旧 URL明确失效且没有兼容路径；
- Dev 与生产 Host 的深层路由行为一致；
- URL、授权会话、live owner 和 history owner 各自只有一个权威来源。
