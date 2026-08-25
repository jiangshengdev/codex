# Codex GUI Browser 验证拓扑实施计划

日期：2026-08-25

状态：已确认

确认日期：2026-08-26

确认原文：`确认计划`

计划分支：`dev`

计划时 HEAD：`ee703c905e5f6ef03b0a2a12417dd84b85a3d06a`

## 对应设计

- `docs/superpowers/specs/2026/08/25/2026-08-25-codex-gui-browser-verification-topology-design.md`
- 设计状态：已确认
- 确认日期：2026-08-25
- 确认原文：`确认设计，计划落盘`

## 唯一实施目标

按已确认设计实现 Codex GUI 分层 Browser 验证：默认 `ci` 运行 Chromium smoke；每个 PR 的
`blocking-ci` 同时运行 quick 与完整 parallel/sequential × 三浏览器检查；App Browser 测试按 owner
拆分；测试 session seed 只通过生产 authorization session API 写入 storage。

本计划不修改 GUI 产品行为、协议或状态机，不更新关联 issue 状态，不执行 Git 远程操作。

## 当前基线与实施前提

- 当前分支为 `dev`，计划编写时 HEAD 为
  `ee703c905e5f6ef03b0a2a12417dd84b85a3d06a`。
- 当前唯一 workspace 变更是已确认设计文档与本计划文档；实施前必须先把两份工作文档提交为
  独立 docs-only commit。
- `codex-gui/package.json` 当前存在并固定以下入口：`ci`、`format:oxfmt:fix`、
  `format:oxfmt`、`lint`、`type-check`、`test:unit`、`test:browser`、
  `test:browser:parallel`、`test:browser:sequential`。
- 本机由 fnm 管理的 pnpm 为 `10.33.0`，Vitest 为 `4.1.10`，Playwright 为 `1.62.1`。
- `playwright install --list` 已确认本机存在 Playwright 1.62.1 对应 Chromium 1234、Firefox 1538、
  WebKit 2336 与 FFmpeg 1011。实施不得在本机安装或更新依赖、运行时或浏览器；若执行时缺失，
  停止受影响验证并请用户自行安装。
- 本地 Vitest checkout 当前工作树版本不是项目锁定版本；Browser 配置事实以同一 checkout 的
  `v4.1.10` tag 文档和项目安装的 Vitest 4.1.10 为准。
- 根 `pnpm-workspace.yaml` 不包含 `codex-gui`；GUI workflow 必须在 `codex-gui` 独立 workspace
  使用其自身 lockfile。
- `blocking-ci.yml` 是 PR 阻塞入口，只有加入 reusable workflow call 并同时加入
  `required.needs` 才构成合并门禁。

## 权威接口与纵向路径

### 验证入口

```text
codex-gui/package.json
├─ ci
│  └─ test:browser:smoke -> vitest.browser.smoke.config.ts -> Chromium + smoke files
├─ test:browser:parallel -> vitest.browser.parallel.config.ts -> 普通 files × 3 browsers
└─ test:browser:sequential -> vitest.browser.sequential.config.ts -> sequential files × 3 browsers

.github/workflows/codex-gui.yml
├─ quick -> pnpm run ci
└─ full-browser -> pnpm run test:browser

.github/workflows/blocking-ci.yml
└─ codex-gui reusable call -> required.needs -> CI required
```

### Storage 契约

`browserAuthorizationSession.ts` 继续唯一拥有 storage key、parse、validation 和 serialize。
`appBrowserTestSupport.ts` 只通过以下生产行为建立测试 session：

```text
TOKEN_FRAGMENT_KEY
  -> 独立合成 URL
  -> consumeBrowserAuthorizationSession(window.sessionStorage, no-op replaceState)
  -> 可选 BrowserAuthorizationSession.commitActiveThread(threadId)
```

不得把当前测试路由交给 seed 的 `replaceState` 修改，也不得导出 production key/serializer 或新增
test-only API。

### Smoke 与完整覆盖

五个既有测试先纯移动到 `src/__tests__/smoke/**`，再由后继配置节点选择。现有 parallel glob 会自然
继续发现这些文件，因此同一份测试在 quick 中只跑 Chromium，在完整矩阵中跑三浏览器。

## Worktree 预配授权

用户确认本计划后，以下四个工作树创建动作获得精确授权。所有 worktree 必须在 docs-only commit
成功后创建，并在任何实施编辑、格式化、测试或任务提交前全部通过预配屏障。

### 路径核验

- repo 请求路径与 canonical path：`/Users/jiangsheng/cnb/codex`
- worktree root 请求路径与 canonical path：`/Users/jiangsheng/cnb/codex/.worktrees`
- Vitest 请求路径：`/Users/jiangsheng/cnb/vitest`
- Vitest 请求路径的 direct link target：`/Users/jiangsheng/GitHub/vitest`
- Vitest fully resolved physical target：`/Users/jiangsheng/GitHub/vitest`
- 现有共享 link：
  `/Users/jiangsheng/cnb/codex/.worktrees/vitest -> /Users/jiangsheng/cnb/vitest`
- 共享 link fully resolved physical target：`/Users/jiangsheng/GitHub/vitest`

现有共享 link 的 direct mapping 与脚本 `normalize_path_preserving_leaf` 产生的目标完全一致，无需迁移。
四个目标目录和四个本地 branch 已只读核验为不存在；所有默认 sparse path 与 CI 额外 `.github`
路径已确认存在于 `dev` Git tree。

### WT-S：storage contract consumer

```bash
bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-browser-storage-contract \
  --branch codex/gui-browser-storage-contract \
  --base dev \
  --repo-root /Users/jiangsheng/cnb/codex \
  --worktree-root /Users/jiangsheng/cnb/codex/.worktrees \
  --vitest-root /Users/jiangsheng/cnb/vitest
```

Canonical worktree：`/Users/jiangsheng/cnb/codex/.worktrees/gui-browser-storage-contract`

```text
/Users/jiangsheng/cnb/codex/.worktrees/gui-browser-storage-contract/codex-gui/node_modules
  -> /Users/jiangsheng/cnb/codex/codex-gui/node_modules
/Users/jiangsheng/cnb/codex/.worktrees/gui-browser-storage-contract/codex-gui/.heroui-docs/react
  -> /Users/jiangsheng/cnb/codex/codex-gui/.heroui-docs/react
/Users/jiangsheng/cnb/codex/.worktrees/gui-browser-storage-contract/codex-gui/.redux-toolkit-docs/redux
  -> /Users/jiangsheng/cnb/codex/codex-gui/.redux-toolkit-docs/redux
/Users/jiangsheng/cnb/codex/.worktrees/gui-browser-storage-contract/codex-gui/.redux-toolkit-docs/toolkit
  -> /Users/jiangsheng/cnb/codex/codex-gui/.redux-toolkit-docs/toolkit
/Users/jiangsheng/cnb/codex/.worktrees/vitest
  -> /Users/jiangsheng/cnb/vitest
```

### WT-T：Browser test architecture

```bash
bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-browser-test-architecture \
  --branch codex/gui-browser-test-architecture \
  --base dev \
  --repo-root /Users/jiangsheng/cnb/codex \
  --worktree-root /Users/jiangsheng/cnb/codex/.worktrees \
  --vitest-root /Users/jiangsheng/cnb/vitest
```

Canonical worktree：`/Users/jiangsheng/cnb/codex/.worktrees/gui-browser-test-architecture`

```text
/Users/jiangsheng/cnb/codex/.worktrees/gui-browser-test-architecture/codex-gui/node_modules
  -> /Users/jiangsheng/cnb/codex/codex-gui/node_modules
/Users/jiangsheng/cnb/codex/.worktrees/gui-browser-test-architecture/codex-gui/.heroui-docs/react
  -> /Users/jiangsheng/cnb/codex/codex-gui/.heroui-docs/react
/Users/jiangsheng/cnb/codex/.worktrees/gui-browser-test-architecture/codex-gui/.redux-toolkit-docs/redux
  -> /Users/jiangsheng/cnb/codex/codex-gui/.redux-toolkit-docs/redux
/Users/jiangsheng/cnb/codex/.worktrees/gui-browser-test-architecture/codex-gui/.redux-toolkit-docs/toolkit
  -> /Users/jiangsheng/cnb/codex/codex-gui/.redux-toolkit-docs/toolkit
/Users/jiangsheng/cnb/codex/.worktrees/vitest
  -> /Users/jiangsheng/cnb/vitest
```

### WT-C：Browser validation config

```bash
bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-browser-validation-config \
  --branch codex/gui-browser-validation-config \
  --base dev \
  --repo-root /Users/jiangsheng/cnb/codex \
  --worktree-root /Users/jiangsheng/cnb/codex/.worktrees \
  --vitest-root /Users/jiangsheng/cnb/vitest
```

Canonical worktree：`/Users/jiangsheng/cnb/codex/.worktrees/gui-browser-validation-config`

```text
/Users/jiangsheng/cnb/codex/.worktrees/gui-browser-validation-config/codex-gui/node_modules
  -> /Users/jiangsheng/cnb/codex/codex-gui/node_modules
/Users/jiangsheng/cnb/codex/.worktrees/gui-browser-validation-config/codex-gui/.heroui-docs/react
  -> /Users/jiangsheng/cnb/codex/codex-gui/.heroui-docs/react
/Users/jiangsheng/cnb/codex/.worktrees/gui-browser-validation-config/codex-gui/.redux-toolkit-docs/redux
  -> /Users/jiangsheng/cnb/codex/codex-gui/.redux-toolkit-docs/redux
/Users/jiangsheng/cnb/codex/.worktrees/gui-browser-validation-config/codex-gui/.redux-toolkit-docs/toolkit
  -> /Users/jiangsheng/cnb/codex/codex-gui/.redux-toolkit-docs/toolkit
/Users/jiangsheng/cnb/codex/.worktrees/vitest
  -> /Users/jiangsheng/cnb/vitest
```

### WT-W：GitHub workflow

```bash
bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-browser-ci \
  --branch codex/gui-browser-ci \
  --base dev \
  --repo-root /Users/jiangsheng/cnb/codex \
  --worktree-root /Users/jiangsheng/cnb/codex/.worktrees \
  --vitest-root /Users/jiangsheng/cnb/vitest \
  --include .github
```

Canonical worktree：`/Users/jiangsheng/cnb/codex/.worktrees/gui-browser-ci`

```text
/Users/jiangsheng/cnb/codex/.worktrees/gui-browser-ci/codex-gui/node_modules
  -> /Users/jiangsheng/cnb/codex/codex-gui/node_modules
/Users/jiangsheng/cnb/codex/.worktrees/gui-browser-ci/codex-gui/.heroui-docs/react
  -> /Users/jiangsheng/cnb/codex/codex-gui/.heroui-docs/react
/Users/jiangsheng/cnb/codex/.worktrees/gui-browser-ci/codex-gui/.redux-toolkit-docs/redux
  -> /Users/jiangsheng/cnb/codex/codex-gui/.redux-toolkit-docs/redux
/Users/jiangsheng/cnb/codex/.worktrees/gui-browser-ci/codex-gui/.redux-toolkit-docs/toolkit
  -> /Users/jiangsheng/cnb/codex/codex-gui/.redux-toolkit-docs/toolkit
/Users/jiangsheng/cnb/codex/.worktrees/vitest
  -> /Users/jiangsheng/cnb/vitest
```

## Task boundaries 与独立提交

### DOCS：确认后的工作文档提交

只更新本计划的状态、确认日期和确认原文，然后把已确认设计与计划作为独立提交：

```text
docs(gui): plan browser verification topology
```

提交成功且主 `dev` worktree clean 前，不得创建上述 worktree 或开始实施。

### S1：测试 seed 复用生产 writer

写集合仅为：

- `codex-gui/src/__tests__/appBrowserTestSupport.ts`

修改：

- 删除测试侧 storage key 与 raw JSON writer；
- 使用 `TOKEN_FRAGMENT_KEY` 构造独立合成 URL；
- 调用 `consumeBrowserAuthorizationSession`，传入 `window.sessionStorage` 与 no-op
  `replaceState`；
- 有 `activeThreadId` 时调用返回 session 的 `commitActiveThread`；
- `resetAppBrowserTestSupport` 不再 `removeItem`；
- 保持 `BrowserAuthorizationSessionSeed` 与 helper 调用表面不变。

明确只读：production `browserAuthorizationSession.ts` 及其 unit test、所有 App Browser files。

提交：

```text
test(gui): seed browser auth through production session
```

### T1：纯移动五个 smoke 用例

写集合：

- `codex-gui/src/__tests__/App.browser.test.tsx`
- `codex-gui/src/__tests__/AppRouting.browser.test.tsx`
- 新增 `codex-gui/src/__tests__/appBrowserRenderHarness.tsx`
- 新增 `codex-gui/src/__tests__/smoke/AppRouting.smoke.browser.test.tsx`
- 新增 `codex-gui/src/__tests__/smoke/AppComposerQueue.smoke.browser.test.tsx`
- 新增 `codex-gui/src/__tests__/smoke/AppThreadSwitch.smoke.browser.test.tsx`

只移动以下五个现有测试及其唯一消费者 helper，不修改断言、事件顺序或 production：

- `AppRouting.browser.test.tsx:174-204`
- `App.browser.test.tsx:1277-1344`
- `App.browser.test.tsx:1346-1385`
- `App.browser.test.tsx:3306-3422`
- `App.browser.test.tsx:3458-3486`

smoke 文件在此提交仍由现有 parallel glob 发现；尚未增加默认 smoke 入口。

同一 taskBoundary 内先并行执行两个不相交的编辑节点：

- routing 节点只写 `AppRouting.browser.test.tsx` 与 `AppRouting.smoke.browser.test.tsx`；
- App 节点只写 `App.browser.test.tsx`、render harness 与另外两个 smoke files。

两者 fan-in 后由 T1 唯一 Git owner 统一格式化、验证、stage 和 commit。

提交：

```text
test(gui): promote critical app browser smoke cases
```

### T2：纯拆分剩余 App Browser 职责

T2 等待 T1 的稳定 commit，因为两者都写原 App 文件。三个新增 owner 文件先由独立编辑节点从
`T1C` immutable Git tree 读取原测试内容并并行生成，分别只写：

- `AppProjectionTranscript.browser.test.tsx`；
- `AppComposerQueue.browser.test.tsx`；
- `AppActiveThreadSession.browser.test.tsx`。

三个节点 fan-in 后，T2 唯一 Git owner 才在共享 worktree 执行 `git mv`：

```text
App.browser.test.tsx -> AppShell.browser.test.tsx
```

该移动节点只做 `git mv`；其 unavoidable index effect 由后续正式 stage 节点统一覆盖和核验。移动完成
后进入独立源码编辑节点，从 `AppShell.browser.test.tsx` 删除已经进入三个 owner 文件的用例，并完成
import/helper 收敛：

- `AppShell.browser.test.tsx`：shell、host lifecycle、skills、authorization 与 cleanup；
- 新增 `AppProjectionTranscript.browser.test.tsx`：projection、transcript、scroll 与 backpressure；
- 新增 `AppComposerQueue.browser.test.tsx`：普通/steer queue、编辑、排序、recovery 与 Stop；
- 新增 `AppActiveThreadSession.browser.test.tsx`：StrictMode owner、thread candidate、switch 与 release；
- `AppRouting.browser.test.tsx`：保留 routing/history 职责。

`appBrowserRenderHarness.tsx` 只装配 RootApp、router 与 Provider；queue spy、thread-switch probe、scroll
helper 和 routing hoisted mock 留在各自唯一职责文件。`appBrowserTestSupport.ts` 在 T1/T2 中只读。

提交：

```text
test(gui): split app browser suites by owner
```

### C1：行为不变的 Browser 共同配置

写集合：

- 新增 `codex-gui/vitest.browser.shared.ts`
- `codex-gui/vitest.browser.parallel.config.ts`
- `codex-gui/vitest.browser.sequential.config.ts`

共同 builder 只集中 Vite merge、root、watch、headless 与 Playwright provider，并接收完整语义参数后
一次生成最终配置。parallel/sequential 继续显式声明 include/exclude、instances、typecheck 和
`fileParallelism`。

不得把语义数组放入 shared config 后再依赖 `mergeConfig` 覆盖；Vite 会拼接数组，可能扩大测试集合
或浏览器矩阵。

提交：

```text
refactor(gui): share Browser Mode config
```

### C2：新增 smoke 与默认 CI 行为

C2 只等待 T1 与 C1 的稳定提交。WT-C 在 C1 commit 后执行：

```text
git merge --no-ff --no-edit <T1_COMMIT_ID>
```

该依赖 merge 只消费五个 smoke files；不等待 T2、S1、W1 或主 `dev` 总汇合。merge 失败时先检查
`MERGE_HEAD`：存在才执行 `git merge --abort`，不存在则直接核验 pre-merge HEAD 与 clean status；
不能转为手工兼容接线。

写集合：

- 新增 `codex-gui/vitest.browser.smoke.config.ts`
- `codex-gui/package.json`

精确语义：

- smoke include 仅为 `src/__tests__/smoke/**/*.browser.test.ts` 与 `*.tsx`；
- instance 仅 `{ browser: "chromium" }`；
- smoke config 不额外启用 Vitest Browser typecheck；
- 新增 `test:browser:smoke`：`vitest --config=vitest.browser.smoke.config.ts`；
- `ci` 在既有 `test:unit` 后追加 `pnpm run test:browser:smoke`；
- `test:browser`、parallel 与 sequential 现有入口保持不变；
- 不修改 lockfile。

smoke config 与 `package.json` 由两个不相交编辑节点并行完成，fan-in 后由 C2 唯一 Git owner 统一
格式化、验证、stage 和 commit。

提交：

```text
test(gui): add Chromium browser smoke entrypoint
```

### W1：PR 阻塞 workflow

写集合仅为：

- 新增 `.github/workflows/codex-gui.yml`
- `.github/workflows/blocking-ci.yml`

reusable workflow：

- `on: workflow_call`，`permissions: contents: read`；
- quick 与 full-browser 两个 job 都使用 `ubuntu-24.04`、`timeout-minutes: 30`，二者无 `needs`；
- 使用仓库现有固定 SHA 的 checkout、pnpm/action-setup 与 setup-node；Node 22；
- setup-node cache 指向 `codex-gui/pnpm-lock.yaml`；
- 两个 job 都在 `codex-gui` 执行 `pnpm install --frozen-lockfile`；
- quick 执行 `pnpm exec playwright install --with-deps chromium` 后运行 `pnpm run ci`；
- full-browser 执行
  `pnpm exec playwright install --with-deps chromium firefox webkit` 后运行
  `pnpm run test:browser`；
- 两个 job 最后都以 `always() && !cancelled()` 调用现有 clean-worktree action；
- 不加 path filter、fallback、retry 或 allow-failure。

`blocking-ci.yml` 按字母序新增 `codex-gui` reusable call，并把同一 call job 加入
`required.needs`。父 workflow 不直接引用 reusable workflow 内部 job。

新 reusable workflow 与 `blocking-ci.yml` 由两个不相交编辑节点并行完成，fan-in 后由 W1 唯一
Git owner 统一格式化、验证、stage 和 commit。

提交：

```text
ci(gui): add blocking browser verification
```

## 格式化与验证命令

所有本地 GUI 命令都在对应 worktree 的 `codex-gui` 目录运行，并使用：

```text
/opt/homebrew/bin/fnm exec --using-file pnpm ...
```

### S1

```text
pnpm run format:oxfmt:fix
pnpm run format:oxfmt
pnpm run lint
pnpm run type-check
pnpm run test:unit -- src/features/browserLaunch/__tests__/browserAuthorizationSession.test.ts
pnpm run test:browser:parallel
```

### T1 与 T2

每个提交边界分别执行：

```text
pnpm run format:oxfmt:fix
pnpm run format:oxfmt
pnpm run lint
pnpm run type-check
pnpm run test:browser:parallel
```

T1 验证 smoke tests 只有一次定义；T2 验证所有 App/Routing cases 仍被发现且原数量、断言和结果没有
减少。任何删除、skip、retry、弱化断言或 production diff 都视为失败。

### C1

```text
pnpm run format:oxfmt:fix
pnpm run format:oxfmt
pnpm run lint
pnpm run type-check
pnpm run test:browser:parallel
pnpm run test:browser:sequential
```

### C2（已同步集成基线）

```text
pnpm run format:oxfmt:fix
pnpm run format:oxfmt
pnpm run lint
pnpm run type-check
pnpm run test:browser:smoke
pnpm run ci
pnpm run test:browser
```

必须从输出证明 smoke 只创建 Chromium project，完整入口仍依次执行 parallel/sequential 且各有三种
浏览器。

### W1

在 WT-W 根目录运行固化格式入口：

```text
/opt/homebrew/bin/fnm exec --using-file pnpm run format:fix
/opt/homebrew/bin/fnm exec --using-file pnpm run format
git diff --check
```

格式化后若出现两份声明 workflow 之外的 diff，使用 `git restore` 恢复范围外文件并重新运行非 fix
检查；不得把范围外格式变化纳入提交。当前没有 `actionlint`，不得虚构本地 Actions schema 验证。

静态审查必须证明：两个内部 job 无 `needs`；working directory、lockfile cache、browser provisioning
与 package scripts 匹配；`blocking-ci` 同时存在 call 与 `required.needs`。

## 权威执行图

### 所有节点共同字段

以下字段由每个节点继承，节点表中的覆盖值优先：

- `deferralEvidence`：无。就绪节点只能因 canonical resource lock 暂时等待，不能以编号、agent 复用
  或习惯制造串行。
- `replanTriggers`：写集合扩大；base/branch/worktree 冲突；脚本或测试选择事实变化；需要修改产品、
  protocol、production storage API、lockfile 或计划外文件；验证发现范围外问题。
- `authorizationGate`：计划确认前所有写入、worktree、格式化、测试、stage、commit、merge 与 cleanup
  节点均未授权；用户确认本计划后，仅精确授权本计划列出的本地非 force、非远程动作。
- `executionContext`：每个 task branch 使用独立 worktree、branch 与 Git index；主 `dev` 只承担
  docs commit、稳定提交集成和最终审查。
- `resourceLocks`：一律按下列 canonical path 与访问模式判冲突；未列出的源码读取均为 read：
  - `REGISTRY-W`：`/Users/jiangsheng/cnb/codex/.git/worktrees`，worktree create/remove write；
  - `DEV-GIT-W`：`/Users/jiangsheng/cnb/codex/.git/index` 与
    `/Users/jiangsheng/cnb/codex/.git/refs/heads/dev`，stage/commit/merge write；
  - `S-GIT-W`：`/Users/jiangsheng/cnb/codex/.git/worktrees/gui-browser-storage-contract/index`
    与 `/Users/jiangsheng/cnb/codex/.git/refs/heads/codex/gui-browser-storage-contract`，write；
  - `T-GIT-W`：`/Users/jiangsheng/cnb/codex/.git/worktrees/gui-browser-test-architecture/index`
    与 `/Users/jiangsheng/cnb/codex/.git/refs/heads/codex/gui-browser-test-architecture`，write；
  - `C-GIT-W`：`/Users/jiangsheng/cnb/codex/.git/worktrees/gui-browser-validation-config/index`
    与 `/Users/jiangsheng/cnb/codex/.git/refs/heads/codex/gui-browser-validation-config`，write；
  - `W-GIT-W`：`/Users/jiangsheng/cnb/codex/.git/worktrees/gui-browser-ci/index`
    与 `/Users/jiangsheng/cnb/codex/.git/refs/heads/codex/gui-browser-ci`，write；
  - `TS-CACHE-W`：`/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.tmp`，type-check write；
  - `VITE-CACHE-W`：`/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.vite`，Vitest write；
  - `BROWSERS-R`：`/Users/jiangsheng/Library/Caches/ms-playwright`，本地浏览器验证 read；
  - 每个 worktree 自己的 `codex-gui/browser-tests` 与 `codex-gui/test-results`，其验证节点 write。
  - `MAIN-BROWSER-ARTIFACTS-W`：`/Users/jiangsheng/cnb/codex/codex-gui/browser-tests` 与
    `/Users/jiangsheng/cnb/codex/codex-gui/test-results`，最终主 worktree Browser 验证 write。
  `TS-CACHE-W` 与 `VITE-CACHE-W` 是四个 worktree 通过共享 `node_modules` 指向的同一 physical
  位置，因此相关验证即使位于不同 worktree 也必须串行获锁；`BROWSERS-R` 可并发读取。
- `owner`：每个 taskBoundary 只有一个 Git owner；编辑/验证代理不得 stage 或 commit；共享执行记录
  只有主协调 owner 写。
- `failureDomain`：默认只暂停失败节点及传递后继；无依赖分支继续。共享基线、授权或安全边界失效
  才扩大暂停。

### 节点表

| nodeId | taskBoundary / operationKind | outcome 与 completionEvidence | estimatedCost | hardPredecessors（稳定产物原因） | consumes → produces | readSet / writeSet | executionContext / resourceLocks | owner / verification | failureDomain 与特殊 replan |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A0 | 无提交 / 授权 | 用户明确确认本计划；证据为确认原文 | S | 无 | 待确认计划 → 实施授权 | plan / 无 | 对话 / 无 | 主协调；核对确认语义 | 全部后继 |
| D1 | DOCS / 编辑 | 计划状态、确认日期、确认原文写入 | S | A0：等待确认事实 | 确认原文 → finalized docs | design+plan / plan | 主 dev，index 不动 / plan write | docs editor；只改确认元数据 | D2-D4 与全部实施 |
| D2 | DOCS / 验证 | 两文档 `git diff --check` 通过，status 仅两文档 | S | D1：等待 finalized docs | docs → docs evidence | 两文档 / 无 | 主 dev / docs read | docs verifier；审查完整正文 | D3-D4 与全部实施 |
| D3 | DOCS / stage | cached names 精确为 design+plan，cached check 通过 | S | D2：等待验证证据 | docs evidence → staged docs | 两文档 / 主 index | 主 dev / `DEV-GIT-W` | DOCS Git owner | D4 与全部实施 |
| D4 | DOCS / commit | `docs(gui): plan browser verification topology`；commit tree 仅两文档，dev clean | S | D3：等待 staged diff | staged docs → docs commit id | cached diff / dev ref+index | 主 dev / `DEV-GIT-W` | DOCS Git owner；`git show` 审查 | 四 worktree 与全部实施 |
| WS/WT/WC/WW | PREP / 集成准备 | 四个精确 worktree、branch、sparse/link/status 全部通过 skill post-check | S each | D4：base 必须含 docs commit | docs commit+精确命令 → 四 worktree/index | D4 tree / 各 path+branch+index | 主 repo / `REGISTRY-W` + 各精确 branch ref write；四节点同时 ready但逐个获锁 | 各 worktree owner；HEAD=dev、clean | 仅失败 prep、PB 与其实施后继 |
| PB | PREP-BARRIER / fan-in | 四 worktree 都从同一 D4 commit 创建且 clean | S | WS+WT+WC+WW：统一预配屏障 | 四份 post-check → barrier evidence | metadata / 无 | 主协调 / metadata read | 调度 owner | 全部实施节点 |
| S1E | S1 / 编辑 | support 不再复制 key/JSON writer，调用表面不变 | M | PB | production API语义 → S1 diff | production/session tests/support / support | WT-S / support write | S editor；不写 production | S1V-S1C、IS、final |
| S1F | S1 / 格式化 | fix 后仅 support diff | S | S1E | S1 diff → formatted diff | GUI tree / GUI tree formatting | WT-S / formatter+tree write | S Git owner；format fix | S1V-S1C |
| S1V | S1 / 验证 | S1 六条命令全通过 | L | S1F | formatted S1 → verification evidence | S1 tree / local caches+artifacts | WT-S / `TS-CACHE-W` + `VITE-CACHE-W` + `BROWSERS-R` + WT-S test artifacts write | S verifiers；按 S1 命令 | S1S-S1C、IS、final |
| S1S | S1 / stage | staged file 仅 support，cached check 通过 | S | S1V | evidence → staged S1 | support / S index | WT-S / `S-GIT-W` | S Git owner | S1C、IS、final |
| S1C | S1 / commit | 独立 S1 commit，worktree clean | S | S1S | staged S1 → commit id | staged diff / branch ref+index | WT-S / `S-GIT-W` | S Git owner；commit inspection | IS、final |
| T1R | T1 / routing 编辑 | routing smoke 只有一份，原断言/顺序不变 | M | PB | routing case source → routing smoke diff | AppRouting / AppRouting+Routing smoke | WT-T / 两个 routing files write | routing editor；不得 stage/commit | T1J、final |
| T1A | T1 / App 编辑 | 四个 App smoke case 各只有一份，原断言/顺序不变 | L | PB | App case sources → App smoke diff | App / App+harness+2 smoke files | WT-T / App、harness、两个 App smoke files write | App editor；不得 stage/commit | T1J、final |
| T1J | T1 / 编辑 fan-in | T1 五个 case 全部唯一，两个编辑 diff 的写集合仍不相交 | S | T1R+T1A | 两份 edit evidence → T1 diff | T1 files / 无 | WT-T / source read | T Git owner；逐文件审查 | T1F-T1C、T2、C2、final |
| T1F | T1 / 格式化 | fix 后仅 T1 files diff | S | T1J | T1 diff → formatted diff | T1 tree / GUI formatting | WT-T / tree write | T Git owner | T1V-T1C、T2 |
| T1V | T1 / 验证 | T1 五条命令通过；五 test 名唯一 | XL | T1F | formatted T1 → evidence | T1 tree / caches+browser artifacts | WT-T / `TS-CACHE-W` + `VITE-CACHE-W` + `BROWSERS-R` + WT-T test artifacts write | T verifiers；按 T1 命令 | T1S-T1C、T2、C2、final |
| T1S | T1 / stage | staged manifest 精确为 T1 files | S | T1V | evidence → staged T1 | T1 files / T index | WT-T / `T-GIT-W` | T Git owner | T1C、T2、C2 |
| T1C | T1 / commit | 独立纯移动 commit，worktree clean | S | T1S | staged T1 → commit id | staged diff / branch ref+index | WT-T / `T-GIT-W` | T Git owner | T2、C2、final |
| T2P | T2 / projection 编辑 | 从 `T1C` immutable tree 生成 projection/transcript owner file | L | T1C | T1 App cases → projection owner file | T1C tree / Projection owner file | WT-T / Projection owner file write | projection editor；不得改 App | T2J、final |
| T2Q | T2 / queue 编辑 | 从 `T1C` immutable tree 生成 Composer queue owner file | L | T1C | T1 App cases → queue owner file | T1C tree / Queue owner file | WT-T / Queue owner file write | queue editor；不得改 App | T2J、final |
| T2Sx | T2 / session 编辑 | 从 `T1C` immutable tree 生成 active-thread owner file | L | T1C | T1 App cases → session owner file | T1C tree / Session owner file | WT-T / Session owner file write | session editor；不得改 App | T2J、final |
| T2J | T2 / owner fan-in | 三个 owner files 均来自同一 `T1C` tree，case 清单无重叠/遗漏 | S | T2P+T2Q+T2Sx | 三个 owner files → reviewed split inputs | owner files+T1 App / 无 | WT-T / source read | T Git owner；按 test 名核对 | T2M、final |
| T2M | T2 / 文件移动 | 只执行 `git mv App.browser.test.tsx AppShell.browser.test.tsx`；记录 unavoidable staged rename | S | T2J | reviewed inputs+App → renamed AppShell | App / AppShell+index rename metadata | WT-T / App/AppShell write + `T-GIT-W` | T Git owner；不做源码删改 | T2E、final |
| T2E | T2 / 源码收敛 | 从 AppShell 删除已迁移 cases，收敛 imports/helpers，四 owner 文件无重叠/遗漏 | L | T2M | renamed AppShell+owner files → complete T2 diff | AppShell+owner files / AppShell+owner files | WT-T / AppShell+imports/helpers write | T editor；support只读，不 stage | T2F-T2C、final |
| T2F | T2 / 格式化 | fix 后仅 T2 files diff | S | T2E | T2 diff → formatted diff | T2 tree / GUI formatting | WT-T / tree write | T Git owner | T2V-T2C |
| T2V | T2 / 验证 | T2 五条命令通过；完整 case 集未减少 | XL | T2F | formatted T2 → evidence | T2 tree / caches+browser artifacts | WT-T / `TS-CACHE-W` + `VITE-CACHE-W` + `BROWSERS-R` + WT-T test artifacts write | T verifiers；按 T2 命令 | T2S-T2C、IT、final |
| T2S | T2 / 统一 stage | 对完整 T2 write set 重新 stage，覆盖 T2M 的提前 rename staging；manifest 仅 rename/owner files | S | T2V | evidence → fully staged T2 | T2 files / T index | WT-T / `T-GIT-W` | T Git owner；cached check 与 manifest 核验 | T2C、IT、final |
| T2C | T2 / commit | 独立职责拆分 commit，worktree clean | S | T2S | staged T2 → commit id | staged diff / branch ref+index | WT-T / `T-GIT-W` | T Git owner | IT、final |
| C1E | C1 / 编辑 | shared builder 形成；parallel/sequential语义逐字段不变 | M | PB | 现有 configs+v4.1.10语义 → C1 diff | configs/docs/Vite merge source / shared+2 configs | WT-C / config write | C editor；不写 package | C1F-C1C、IC、C2、final |
| C1F | C1 / 格式化 | fix 后仅 C1 files diff | S | C1E | C1 diff → formatted diff | C1 tree / GUI formatting | WT-C / formatter write | C Git owner | C1V-C1C |
| C1V | C1 / 验证 | C1 六条命令通过，测试集合/矩阵不变 | XL | C1F | formatted C1 → evidence | configs / caches+browser artifacts | WT-C / `TS-CACHE-W` + `VITE-CACHE-W` + `BROWSERS-R` + WT-C test artifacts write | C verifiers；按 C1 命令 | C1S-C1C、IC、C2、final |
| C1S | C1 / stage | staged manifest 精确为 shared+2 configs | S | C1V | evidence → staged C1 | C1 files / C index | WT-C / `C-GIT-W` | C Git owner | C1C、IC、C2 |
| C1C | C1 / commit | 独立行为不变 refactor commit，worktree clean | S | C1S | staged C1 → commit id | staged diff / branch ref+index | WT-C / `C-GIT-W` | C Git owner | IC、C2B、final |
| W1R | W1 / reusable 编辑 | 新 workflow 含无依赖 quick/full jobs 与精确安装/运行步骤 | M | PB | workflow约定+planned scripts → reusable workflow | package/lockfile/现有 workflows / codex-gui.yml | WT-W / codex-gui.yml write | reusable editor；不得改 blocking | W1J、final |
| W1B | W1 / blocking 编辑 | call job 与 `required.needs` 成对加入 | S | PB | blocking topology → blocking diff | blocking-ci.yml / blocking-ci.yml | WT-W / blocking-ci.yml write | blocking editor；不得改 reusable | W1J、final |
| W1J | W1 / 编辑 fan-in | 两份 workflow 同时存在且父子依赖层级正确 | S | W1R+W1B | 两份 edit evidence → W1 diff | two workflows / 无 | WT-W / source read | W Git owner；静态拓扑核对 | W1F-W1C、final |
| W1F | W1 / 格式化 | root fix 后范围外无 diff；check 通过 | S | W1J | W1 diff → formatted diff | root format scope / 2 workflows | WT-W / tree write | W Git owner；范围外恢复后重验 | W1V-W1C |
| W1V | W1 / 审查 | YAML 可被 Prettier 解析；双 job无needs；call+required成对 | S | W1F | formatted workflow → evidence | workflows/package/lockfile / 无 | WT-W / source read | W reviewer；root format+diff check+结构核对 | W1S-W1C、IW、final |
| W1S | W1 / stage | staged manifest 仅两 workflow | S | W1V | evidence → staged W1 | workflows / W index | WT-W / `W-GIT-W` | W Git owner | W1C、IW、final |
| W1C | W1 / commit | 独立 CI commit，worktree clean | S | W1S | staged W1 → commit id | staged diff / branch ref+index | WT-W / `W-GIT-W` | W Git owner | IW、final |
| C2B | C2 / 依赖集成 | WT-C 执行 `git merge --no-ff --no-edit <T1_COMMIT_ID>`，仅把 T1 smoke tree 合入 C1 branch | S | T1C+C1C | T1+C1 stable commits → combined WT-C base | T1 commit / C tree+index+ref | WT-C / `C-GIT-W` | C Git owner；无冲突、两 commit 可达、clean | C2K、final；失败转 C2R |
| C2R | C2 / 条件恢复 | 仅 C2B 失败时检查 `MERGE_HEAD`：存在则 `git merge --abort`，不存在则直接核验；WT-C 回到 C1C clean HEAD | S | C2B failed | failed merge state → clean C1C baseline | C merge metadata / 必要时 C tree+index | WT-C / `C-GIT-W` | C Git owner；pre/post HEAD 与 status 核验 | C2 暂停；其他分支继续 |
| C2K | C2 / smoke config 编辑 | smoke config 只选 smoke glob 与 Chromium | M | C2B success | smoke files+shared builder → smoke config | shared+smoke files / smoke config | WT-C / smoke config write | config editor；不得改 package | C2J、final |
| C2P | C2 / package 编辑 | 新增 smoke script 且 `ci` 追加 smoke，完整入口不变 | S | C2B success | existing scripts → package diff | package / package | WT-C / package write | package editor；lockfile只读 | C2J、final |
| C2J | C2 / 编辑 fan-in | config 与 package 语义互相匹配，lockfile 无 diff | S | C2K+C2P | two edits → C2 diff | package+config / 无 | WT-C / source read | C Git owner | C2F-C2C、final |
| C2F | C2 / 格式化 | fix 后仅 package+smoke config diff | S | C2J | C2 diff → formatted diff | C2 tree / GUI formatting | WT-C / tree write | C Git owner | C2V-C2C |
| C2V | C2 / 验证 | C2 七条命令通过，smoke单 Chromium，full 2×3 | XL | C2F | T1+C1+C2 tree → evidence | full GUI tree / caches+browser artifacts | WT-C / `TS-CACHE-W` + `VITE-CACHE-W` + `BROWSERS-R` + WT-C test artifacts write | C verifiers；按 C2 命令 | C2S-C2C、IC2、final |
| C2S | C2 / stage | staged manifest 仅 package+smoke config，lockfile无diff | S | C2V | evidence → staged C2 | C2 files / C index | WT-C / `C-GIT-W` | C Git owner | C2C、IC2、final |
| C2C | C2 / commit | 独立 smoke行为 commit，WT-C clean | S | C2S | staged C2 → commit id | staged diff / C ref+index | WT-C / `C-GIT-W` | C Git owner | IC2、final |
| IS/IT/IC/IW/IC2 | INTEGRATE / 集成 | 对应 S1C/T2C/C1C/W1C/C2C 一完成即 ready；若尚非 dev ancestor，则执行 `git merge --no-ff --no-edit <TASK_COMMIT_ID>`，若已随后代进入 dev 则只记录 ancestry；原 commit 可达 | S each | 各自对应 stable commit+D4，无彼此依赖 | immutable task commit → dev ancestry evidence | commit object / 必要时 dev tree+index+ref | 主 dev / ancestry-only 为 refs read，否则 `DEV-GIT-W`；写节点同时 ready 时逐个获锁 | integration Git owner；先记录精确 commit id，再核对 ancestry、无冲突、status | 仅本次 merge、对应 MR、IF；源分支继续可用 |
| MR | INTEGRATE / 条件恢复族 | 任一 dev merge 失败时检查 `MERGE_HEAD`：存在则立即 `git merge --abort`，不存在则直接核验；证明 dev 回到 merge 前 clean HEAD | S each | 对应 integration failed | failed merge state → clean pre-merge dev | dev merge metadata / 必要时 dev tree+index | 主 dev / `DEV-GIT-W`；恢复前暂停其他 dev integration | integration Git owner；记录 pre/post HEAD、status | 失败分支暂停；恢复后重新计算其他 ready nodes |
| IF | FINAL-INTEGRATION / fan-in | S1C、T2C、C1C、W1C、C2C 均为 dev ancestors，dev clean | S | IS+IT+IC+IW+IC2 success | 五份 merge evidence → final integrated dev id | refs/tree / 无 | 主 dev / refs read | 调度 owner；ancestry/status 核验 | final validation |
| VF | FINAL / 验证 | 根 `pnpm run format` 通过 | M | IF | final tree → root format evidence | root format scope / cache only | 主 dev / root dependencies read | root verifier | VA、cleanup |
| VQ | FINAL / 验证 | GUI `pnpm run ci` 通过 | L | IF | final GUI → quick evidence | GUI tree / shared caches+test artifacts | 主 dev / `TS-CACHE-W` + `VITE-CACHE-W` + `BROWSERS-R` + `MAIN-BROWSER-ARTIFACTS-W` | quick verifier | VA、cleanup |
| VB | FINAL / 验证 | GUI `pnpm run test:browser` 通过 | XL | IF | final GUI → full evidence | GUI tree / shared caches+browser artifacts | 主 dev / 与 VQ 同写锁；同时 ready 但串行获锁 | full verifier | VA、cleanup |
| VA | FINAL / 审查 | design完成标准、提交边界、`git diff D4..HEAD --check`、clean status全部通过；本地不冒充GitHub运行证据 | M | VF+VQ+VB | 三验证+history → final audit evidence | tree/history/status / 无 | 主 dev / source+refs read | independent auditor | cleanup；计划内问题插入新修正commit |
| KS/KT/KC/KW | CLEANUP / 清理 | clean且已合并后分别 `git worktree remove <path>` 与 `git branch -d <branch>`；commit仍由dev可达 | S each | VA | merged+clean evidence → path/branch absence | worktree+ref / registry+local ref | 主 repo / `REGISTRY-W` + 对应 task ref write；四节点同时ready但逐个获锁 | cleanup owner；禁止force/-D | 仅自身与KF，其他cleanup继续 |
| KF | FINAL / fan-in | 四 worktree/branch 均不存在，dev clean，所有 commit/验证可追踪 | S | KS+KT+KC+KW | cleanup evidence → completion record | repo metadata / 无 | 主 dev / metadata read | 主协调 | 最终汇报 |

## Ready set、关键路径与汇合点

- 当前初始状态：`A0` 等待用户确认计划。
- A0 完成后只有 DOCS 链 ready；D4 前任何实施节点都未授权。
- D4 完成后 WS/WT/WC/WW 同时 ready；它们只因 Git worktree registry/ref 写锁逐个执行，不互设
  硬依赖。PB 是统一预配屏障。
- PB 完成后 `S1E`、`T1R`、`T1A`、`C1E`、`W1R`、`W1B` 是初始实施 ready set；写集合不相交
  的编辑节点立即并行，格式化、stage 和 commit 仍由各 taskBoundary 唯一 Git owner 执行。
- T2 只等待 T1，因为它必须从稳定 `T1C` tree 拆分原 App 测试。T2 的三个 owner-file 编辑节点
  同时 ready，fan-in 后才由 Git owner 执行纯 `git mv`，再由独立编辑节点完成 AppShell 收敛。
- C2 只等待 T1+C1：`C2B` 把 T1 stable commit 合入 WT-C，成功后 smoke config 与 package 编辑
  同时 ready。C2 不等待 S1、T2、W1 或 dev 集成状态。
- S1C、T2C、C1C、W1C、C2C 各自形成后，对应 dev integration 立即以已记录的 immutable commit
  id ready；这些节点没有彼此依赖，只因 `DEV-GIT-W` 串行获锁。某次 merge 失败时，唯一优先动作
  是进入对应 `MR`：先检查 `MERGE_HEAD`，存在才执行 `git merge --abort`，不存在则直接核验
  pre-merge HEAD 与 clean status；恢复 clean baseline 后，其他已就绪集成继续，失败分支单独暂停。
- VF 与 VQ/VB 同时 ready；VF 使用根依赖，可与 GUI 验证并行。VQ/VB 因共享 GUI caches、Browser
  runner 和测试产物写锁串行，但产品 workflow 中 quick/full 仍无 `needs`。
- 粗粒度关键路径：
  `A0 → DOCS → 四 worktree barrier → max(C2, T2, S1, W1，经共享验证锁调度) → dev integration fan-in → full browser → final audit → cleanup`。
  C2 的内部关键边是 `(T1 ∥ C1) → C2`；S1、T2、W1 在 DAG 上与其并行，但各 Browser/type-check
  验证会因共享 cache 写锁串行获锁。只有最终 dev fan-in 是硬汇合点。

## 提交拓扑

```text
D0  docs(gui): plan browser verification topology
├─ S1  test(gui): seed browser auth through production session
├─ T1  test(gui): promote critical app browser smoke cases
│  └─ T2  test(gui): split app browser suites by owner
├─ C1  refactor(gui): share Browser Mode config
│  └─ merge T1
│     └─ C2  test(gui): add Chromium browser smoke entrypoint
└─ W1  ci(gui): add blocking browser verification

dev 在 S1/T2/C1/W1/C2 各自完成后立即消费其 immutable commit id：尚未可达时使用非 fast-forward
merge，已随其后代可达时只记录 ancestry；各写入只有共享 dev index/ref 锁，没有人为 fan-in前置依赖。
```

每个 taskBoundary 只有一个提交。任何针对已有提交的计划内修正都创建新的独立提交，禁止 amend、
squash 或把多个 task 提交重做成一个提交。

## 失败与修正规则

- formatter 产生范围外 diff：立即停止该 task 的 stage，使用 `git restore` 恢复范围外文件，检查真实
  diff 后重新运行非 fix 验证；不得强制暂存 ignore 文件。
- 测试迁移失败：只暂停 T 分支与 C2；不得删除断言、添加 retry/skip、修改 baseline 或修 production。
- storage helper 需要 production API 变化：停止 S 分支并回到设计确认；不得导出 key/serializer 或
  加 test-only API。
- Browser 配置出现测试集合或 instances 漂移：C1 行为不变提交失败；修正 builder，不能靠 filter
  或豁免隐藏。
- CI YAML 只能由真实 GitHub Actions 最终证明 runner 行为。本地只证明格式、脚本、静态拓扑和完整
  Browser tests；最终报告必须明确远端未执行，且不得操作 Git 远程。
- WT-C 合并 T1 或主 dev 合并任一 task commit 失败：不得在冲突状态继续其他集成。先检查
  `MERGE_HEAD`；存在才执行 `git merge --abort`，不存在则直接核验。WT-C 必须回到 C1C clean HEAD，
  主 dev 必须回到该次 merge 前 clean HEAD。恢复成功后重算 ready set；失败分支暂停，其他无依赖
  分支继续。
- 已确认计划内失败且写集合/行为边界不变：插入独立修正节点和新提交，重算 ready set，只重跑受
  影响验证。范围外或产品/协议/安全语义变化则暂停并请求用户决策。

## 明确排除

- 不安装或更新本机依赖、Node、pnpm、浏览器或其他程序。
- 不运行 E2E、后端、Rust build/run、`just fmt` 或 Rust tests。
- 不修改 `pnpm-lock.yaml`、production session API、storage key/shape、GUI 产品代码、协议、状态机、
  snapshots、Lingui catalog 或 issue 文档。
- 不删除 Firefox/WebKit，不合并 parallel/sequential，不把 sequential tests 改并行。
- 不增加 path filter、skip、retry、allow-failure、fallback、弱断言或 `--passWithNoTests`。
- 不操作 Git 远程，不使用 force、`-D`、amend、squash 或强制暂存 ignored files。

## 完成判定

本轮实现只有在以下条件同时成立时结束：

1. DOCS、S1、T1、T2、C1、W1、C2 均形成独立本地提交并可由 `dev` 追踪。
2. 五个 smoke 测试只有一份，默认 `ci` 只在 Chromium 运行它们，完整 parallel 在三浏览器重跑。
3. parallel/sequential 测试集合、三浏览器和 sequential 串行语义保持。
4. App Browser tests 按 shell、projection/transcript、Composer queue、active thread session、routing
   owner 划分，没有 production 行为变化或断言减少。
5. 测试 support 不再复制 production storage key/JSON writer，production unit contract tests 保留。
6. reusable workflow 中 quick/full 无依赖，每个 PR 都通过 `blocking-ci` 和 `CI required` 汇合。
7. 根格式、默认 GUI CI、完整 Browser Mode、本次提交 diff check 和 clean status 全部通过。
8. 四个临时 worktree 与本地 task branches 仅在 clean、merged、unused 后非 force 清理。
9. 最终汇报明确区分本地验证与尚待真实 GitHub Actions 运行的远端证据。

## 影响面反向审计

独立审计确认没有需要重新打开产品决策的遗漏，并将以下约束编入图：

- `mergeConfig` 会拼接数组，共同 builder 必须一次生成最终语义配置，不能假设数组覆盖；
- reusable workflow 的内部 jobs 不能直接进入父 workflow `needs`，父层只依赖 call job；
- storage seed 必须使用独立 URL 与 no-op `replaceState`，不能污染当前测试路由；
- smoke 纯迁移、剩余职责拆分、配置行为变化、storage helper 和 CI 接线必须保持不同提交；
- 本地不声称已验证 GitHub required check 的真实运行；
- 漏并行审计已完成：删除了 C2 等待 S1/T2/W1/dev 总汇合的伪依赖，把 T1、T2、C2、W1 的
  不相交编辑拆成并行节点，并为 WT-C 与主 dev 的 merge 增加原子 abort 恢复路径。
