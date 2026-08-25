# Codex GUI Browser 验证拓扑设计

日期：2026-08-25

状态：已确认

确认日期：2026-08-25

确认原文：`确认设计，计划落盘`

设计分支：`dev`

设计时 HEAD：`ee703c905e5f6ef03b0a2a12417dd84b85a3d06a`

## 唯一主目标

为 Codex GUI 建立分层的 Browser 验证拓扑：默认 `ci` 通过 Chromium smoke 快速发现关键交互回归，
每个 PR 仍由完整 parallel/sequential × Chromium/Firefox/WebKit 矩阵阻止不合格变更合并；同时按
职责收窄 App 总成测试边界，并让生产代码继续唯一拥有 browser authorization session 的 storage
契约。

本设计只定义测试架构、CI 接线和测试支撑边界，不修改产品行为，不是 implementation plan，也不
授权实施代码。

## 关联问题与历史边界

- Issue：
  `docs/superpowers/issues/2026/08/24/2026-08-24-01-codex-gui-current-code-problems/2026-08-24-08-gui-browser-verification-topology.md`
- 既有测试重复设计：
  `docs/superpowers/specs/2026/06/23/2026-06-23-codex-gui-test-duplication-refactor-design.md`
- 既有大测试文件拆分设计：
  `docs/superpowers/specs/2026/06/30/2026-06-30-codex-gui-large-test-files-split-design.md`

2026-06-30 的设计把 `App.browser.test.tsx` 排除在当时第一批拆分之外，理由是其 App 级 mock 与
滚动 helper 尚未形成安全边界。这是当时批次的范围决定，不是永久禁止拆分。当前文件已经继续
扩展到路由、projection、Composer queue、线程切换和 connection lifecycle；本设计依据当前 owner
与 mock 隔离重新划分职责，但仍不以文件行数作为拆分理由。

## 当前事实与根因

### 默认入口没有浏览器运行时反馈

`codex-gui/package.json` 的 `ci` 当前依次执行协议生成物检查、格式、lint、TypeScript typecheck 和
unit tests，没有 Browser Mode 或 E2E。`test:browser` 则依次运行 parallel 与 sequential 两套配置，
两套都启用 Browser Mode typecheck，并在 Chromium、Firefox、WebKit 中运行。

这形成两个不合适的极端：默认入口无法发现真实 DOM、路由、storage 和跨 owner 交互回归；完整
入口保留了必要覆盖，但日常反馈成本更高。根因是缺少一个有明确、稳定测试集合的中间层，不是
parallel/sequential 分层或三浏览器覆盖本身有错。

### 本地脚本还没有形成 PR 合并门禁

`.github/workflows/blocking-ci.yml` 是当前 PR 阻塞检查的唯一入口，并通过 `required` job 汇合所有
必须成功的 reusable workflows。该文件目前没有 `codex-gui` job，`required.needs` 也没有 GUI
结果。因此，只新增 `package.json` 脚本无法满足“每个 PR 完整矩阵必过”；必须同时接入阻塞 workflow
和最终汇合点。

### 总成测试的失败域过宽

`App.browser.test.tsx` 同时装配 RootApp、router、GUI Host connection、projection、Redux、Composer
queue 和 thread session，并覆盖普通发送、排队与恢复、transcript、backpressure、StrictMode 和线程
切换。一个文件内共享的 module mock、spy 和 page 会让失败定位与未来迁移相互牵连。

问题不是文件超过某个行数，而是多个 owner 的装配、事件驱动和断言集中在同一个失败域。拆分必须
跟随 owner、mock 隔离与用户行为职责，不能为缩短文件而抽出隐藏事件顺序的大型 helper。

### 测试准备逻辑复制生产 storage 契约

生产 `browserAuthorizationSession.ts` 私有拥有：

- `codex-gui.browserAuthorizationSession.v1` storage key；
- fragment 消费与 refresh 恢复；
- `{ token }` / `{ token, activeThreadId }` 序列化；
- 严格解析、UUID 校验和错误传播。

`appBrowserTestSupport.ts` 目前重新声明同一 key，并自行 `removeItem`、拼装对象和 `JSON.stringify`。
这使测试准备代码成为第二个 writer；生产 shape 演进时，测试可能漂移或绕开真实消费路径。

## 已确认的产品决策

设计访谈共完成 3 项实质决策：

1. 默认快速层采用 Chromium + 独立关键 smoke 集合，不运行全部 Browser tests，也不在快速层启动
   Firefox/WebKit。
2. smoke 同时覆盖核心成功路径和一个关键恢复路径：启动/路由、普通发送、活动 turn 排队后继续、
   原子线程切换，以及候选 attach 失败后保留原会话。
3. 完整 parallel/sequential × 三浏览器矩阵在每个 PR 上运行并作为合并门禁；它不是 nightly 或手动
   补充检查。

## 分层验证拓扑

```text
开发者或 PR
├─ GUI quick（无前置依赖）
│  └─ pnpm run ci
│     ├─ 协议/格式/lint/type-check/unit
│     └─ Chromium smoke
└─ GUI full browser（无前置依赖）
   └─ pnpm run test:browser
      ├─ parallel：Chromium + Firefox + WebKit
      └─ sequential：Chromium + Firefox + WebKit

GUI quick ─────────┐
                   ├─ blocking-ci / CI required
GUI full browser ──┘
```

quick 与 full browser 不建立 `needs`。两者验证对象不同且没有产物依赖：quick 负责尽早提供高价值
失败信号，full browser 负责合并前完整覆盖。把 full browser 串在 quick 后面会延迟完整结果，并把
“快速反馈”误变成整个完整矩阵的前置阶段。

## 脚本与 Browser 配置设计

### 三个权威入口

`package.json` 保持三个清晰入口：

- `ci`：现有检查后运行 `test:browser:smoke`，成为开发者默认入口和 GUI quick job 的唯一命令。
- `test:browser:smoke`：只运行明确 smoke 目录，只创建一个 Chromium instance。
- `test:browser`：保持现有语义，依次运行 `test:browser:parallel` 与
  `test:browser:sequential`，继续覆盖三种浏览器。

不得让 workflow 展开一套与 `package.json` 不同的 Vitest 测试选择逻辑。workflow 只负责环境准备并
调用上述固化脚本；本地与 CI 因此使用同一测试入口。

### 共同配置只有一个来源

新增 smoke 配置后，三套配置共同使用的 Vite merge、root、headless、Playwright provider 与 Browser
tsconfig 路径应由一个窄的 Browser 配置 builder 提供。各调用方仍显式声明会改变验证语义的字段：

- smoke：smoke 目录、Chromium 单实例、不启用额外 Browser typecheck；
- parallel：普通 `*.browser.test.*`、排除 sequential、三浏览器、Browser typecheck；
- sequential：sequential 目录、`fileParallelism: false`、三浏览器、Browser typecheck。

smoke 不重复运行 Browser Mode typecheck，不等于关闭检查。默认 `ci` 在它之前执行 `type-check`，而
根 `tsconfig.json` 已引用 `tsconfig.vitest.browser.json`，会检查全部 Browser test；完整 parallel 与
sequential 配置也继续保留现有 typecheck。这里消除的是同一默认链中的重复工作，不是豁免失败。

不得使用 test name filter、`skip`、retry、弱化断言或关闭完整矩阵检查来制造“快速”结果。

## Smoke 测试集合

smoke 采用独立目录和显式文件，不通过测试名称筛选。五个场景从现有用例移动，不复制第二套断言：

| 职责文件 | 现有证据 | 锁定的行为 |
| --- | --- | --- |
| `AppRouting.smoke.browser.test.tsx` | `AppRouting.browser.test.tsx:174-204` | startup 原子发布前保持原路由且 Composer 不可用；发布后 replace 到权威 active thread |
| `AppComposerQueue.smoke.browser.test.tsx` | `App.browser.test.tsx:1277-1385` | 普通发送只启动一次；active turn 中输入先排队，terminal event 后只启动一次并清空 pending |
| `AppThreadSwitch.smoke.browser.test.tsx` | `App.browser.test.tsx:3306-3422,3458-3486` | 候选完成后 session/Redux/projection/queue owner 原子切换；候选 attach 失败后原会话保持可用 |

这些文件位于普通 Browser Mode 的 include 范围内、位于 sequential 目录之外。因此：

- smoke 配置只在 Chromium 运行它们；
- 完整 parallel 配置会自然再次发现同一文件，并在 Chromium、Firefox、WebKit 重跑；
- 不产生只属于快速层、从未接受完整矩阵验证的平行测试。

现有 sequential 用例继续只覆盖剪贴板、visual viewport 和窄屏响应式等需要共享页面或视口隔离的
行为。它们不属于已确认的五个 smoke 场景，不迁入快速层，也不改为并行。

## App 总成职责边界

最终测试结构按失败 owner 划分，而不是按行数切块：

- App shell 与 host lifecycle：壳层装配、host 状态、capabilities、skills、授权失败和 cleanup。
- Projection 与 transcript：attach baseline、delta batching、replay、backpressure、committed/live
  transcript 和滚动语义。
- Composer queue：普通输入、steer、排序、编辑、recovery、Stop 与 terminal drain。
- Active thread session：StrictMode owner、candidate、线程切换、失败回滚和 owner release。
- Routing：startup publication、history/current-task 路由及 browser history 行为。

`App.browser.test.tsx` 和 `AppRouting.browser.test.tsx` 中的既有用例按上述职责移动，保留原测试事件
顺序、断言和 Browser 行为。行为迁移本身不得顺手改生产逻辑、放宽断言或新增兼容路径。

共享层保持薄且按职责分级：

- `appBrowserTestSupport.ts` 只负责 GUI Host 命令、projection response、connection callback、deferred
  attach 等跨 App 场景基础设施；
- App render harness 只装配 RootApp、router 与 Provider，不拥有 queue 或 thread-switch 状态机语义；
- routing 的 hoisted active-thread-session mock 留在 routing 测试边界；
- Composer queue spy、thread-switch probe 和 owner 断言留在各自职责文件，不提升到万能 support。

Vitest Browser Mode 在同一测试文件内共享 page，文件才是隔离边界。需要不同 module mock 或不同
页面级环境的职责必须放在不同文件，不能仅用多个 `describe` 假装隔离。

## Browser authorization session 契约

生产模块继续是 storage contract 的唯一 owner；不导出私有 storage key、serializer 或 raw writer，
也不新增 `*ForTest`、测试专用 clear API 或旧新格式兼容逻辑。

`seedBrowserAuthorizationSession` 改为调用现有生产行为：

1. 使用生成契约的 `TOKEN_FRAGMENT_KEY` 构造带非空 fragment 的合成 URL。
2. 以 `window.sessionStorage` 调用 `consumeBrowserAuthorizationSession()`，让生产
   `writeStoredSession()` 写入 token 并执行真实序列化。
3. 需要 active thread 时，对返回的 `BrowserAuthorizationSession` 调用
   `commitActiveThread(threadId)`。

`resetAppBrowserTestSupport` 只重置 mocks、deferred attach 和 connection 计数，不再直接删除生产
storage key。App 总成测试必须在 render 前显式建立新 fragment 或调用上述 seed，从而覆盖前一测试
的 session 基线；不能依赖上一个 test 的 storage 状态。

缺失、畸形、额外字段、storage 读写异常等契约测试继续留在
`browserAuthorizationSession.test.ts`，使用注入的隔离 Storage 直接验证生产解析和错误传播。这些
断言是在验证权威 writer/reader，不是重复实现契约，不能为了去重而删除。

## PR workflow 设计

新增一个 Codex GUI reusable workflow，由 `blocking-ci.yml` 调用。它包含两个无依赖 job：

- GUI quick：在 `codex-gui` 自有 workspace 中按 `pnpm-lock.yaml` 安装依赖，只准备 Chromium，运行
  `pnpm run ci`。
- GUI full browser：在独立 runner 中安装同一锁定依赖，准备 Chromium、Firefox、WebKit，运行
  `pnpm run test:browser`。

两者不得复用仓库根 `pnpm install` 的结果。根 workspace 不包含 `codex-gui`，GUI 有独立
`pnpm-workspace.yaml` 与 lockfile。

`blocking-ci.yml` 同时完成两处接线：

1. 增加 reusable workflow 调用；
2. 将其结果加入 `required.needs`。

只做第一处会让测试显示在 Actions 中却不阻止合并，属于隐藏问题而非修复。用户已经确认每个 PR
都执行完整矩阵，因此 workflow 不增加 path filter。

当前仓库没有可复用的 GUI Playwright browser provisioning 入口，公共 `setup-ci` 也不准备 Browser
binaries。后续计划必须只读核验并列出与锁定 Playwright 版本匹配的精确 CI 准备方式；不能假设
runner 预装版本可用，也不能用自动下载失败后的静默 fallback。该事实不改变上述 workflow 拓扑。

## 失败归属与反馈

| 失败位置 | 表示的问题 | 是否阻止合并 |
| --- | --- | --- |
| GUI quick 的既有静态/unit 检查 | 协议、格式、lint、类型或单元行为错误 | 是 |
| Chromium smoke | 五个关键纵向行为之一回归 | 是 |
| full parallel | 普通 Browser Mode 或跨浏览器回归 | 是 |
| full sequential | 需要串行隔离的剪贴板、viewport、响应式等回归 | 是 |
| Browser provisioning | CI 环境无法建立锁定的真实浏览器运行条件 | 是；不得跳过或降级 |

smoke 失败只说明快速核心路径失败，不能替代 full browser 的诊断；full browser 失败也不能因 smoke
通过而降级为非阻断。两个 job 分别报告结果，最终由 `CI required` 汇合。

## 预计实现范围

设计涉及以下范围：

- `codex-gui/package.json`；
- Browser Mode 共同配置来源、现有 parallel/sequential 配置和新增 smoke 配置；
- `codex-gui/src/__tests__` 下的 App/Routing 测试、smoke 文件和薄 test support；
- `codex-gui/src/features/browserLaunch/browserAuthorizationSession.ts` 的现有生产 API 消费方，不要求
  修改其 storage contract 或公开表面；
- 新 Codex GUI reusable workflow；
- `.github/workflows/blocking-ci.yml` 的 workflow 调用和 required 汇合。

具体文件迁移、CI browser provisioning 命令、验证命令和提交拓扑属于后续 implementation plan，
不在本设计中展开。

## 非目标

- 删除 Firefox 或 WebKit 覆盖。
- 合并 parallel/sequential 配置，或把必须串行的测试改为并行。
- 把 E2E 加入默认 `ci`；当前缺口由 Browser Mode smoke 解决。
- 用 test name filter、skip、retry、弱断言、关闭 typecheck 或 path filter 缩短反馈。
- 复制五个代表性测试形成独立 smoke 断言。
- 因文件长度机械拆分测试，或抽取隐藏事件顺序和 owner 语义的万能 helper。
- 导出 production storage key/serializer，新增 test-only production API，或添加兼容读写路径。
- 修改 GUI 产品行为、协议、projection、Composer queue 或 active-thread 状态机。
- 更新关联 issue 状态、创建计划文档、实施代码或操作 Git 远程。

## 风险与约束

### smoke 漂移成第二套完整测试

smoke 只允许五个已确认纵向场景。新增场景必须证明它属于默认反馈必须阻断的核心行为，不能因为
某个测试重要就全部加入。更广的分支覆盖继续归 full browser。

### 配置漂移

第三套配置如果复制 provider、headless、Vite merge 或 tsconfig 路径，会重现当前测试 support 的
双 owner 问题。共同配置必须机械复用，验证语义字段必须在各 config 中显式可审计。

### 测试迁移改变行为

文件级 module mock 与 page 隔离会影响 Browser tests。迁移必须保持职责文件所需的 hoisted mock、
beforeEach 基线和原断言；不能把“拆文件后通过”当成可以删除不稳定断言的理由。

### CI 环境成本

每个 PR 运行完整三浏览器矩阵会增加 runner 成本，这是已确认选择。quick 与 full browser 并行，
让快速失败尽早可见；不得通过降低完整覆盖抵消成本。

## 完成标准

只有以下条件同时满足，后续实现才符合本设计：

1. `pnpm run ci` 确实运行 Chromium smoke，且 smoke 集合只包含已确认的五个纵向行为。
2. smoke 测试由现有用例移动而来，没有复制、名称过滤、skip、retry 或弱化断言。
3. `pnpm run test:browser` 继续运行 parallel 与 sequential，并在 Chromium、Firefox、WebKit 中覆盖
   原有测试和 smoke 文件。
4. PR 中 GUI quick 与 GUI full browser 无依赖并行运行，二者结果都进入 `CI required`，任何失败
   都阻止合并。
5. App 测试按 shell/lifecycle、projection/transcript、Composer queue、active thread session 和
   routing 职责隔离；拆分依据不是文件行数。
6. production `browserAuthorizationSession.ts` 仍唯一拥有 key、解析和序列化；测试 seed 通过现有
   `consumeBrowserAuthorizationSession` 与 `commitActiveThread` 建立状态。
7. 缺失/畸形 storage 的生产契约测试保留，Browser 总成不再手写 key 或 JSON shape。
8. 没有修改产品行为、协议或状态机，没有新增 fallback、豁免或检查降级。

## 反向审计结论

独立反向审计确认已选拓扑可行，并发现三项必须纳入设计的遗漏风险：

- 只改 `package.json` 不会形成 PR 门禁，必须接入 `blocking-ci` 和 `required.needs`；
- `clearActiveThread()` 不是删除 session，不能据此设计测试清理 API；测试应通过生产消费入口覆盖
  写入基线；
- 默认 `type-check` 已覆盖 Browser tsconfig，smoke 不应重复 typecheck，但完整 Browser 配置必须保留
  原检查。

审计未发现需要新增产品决策的范围变化。
