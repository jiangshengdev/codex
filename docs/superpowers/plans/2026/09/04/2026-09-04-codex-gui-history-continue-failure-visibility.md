# Codex GUI 历史任务继续失败即时可见实施计划

> 日期：2026-09-04
> 状态：待确认
> 设计：[Codex GUI 历史任务继续失败即时可见设计](../../../../specs/2026/09/04/2026-09-04-codex-gui-history-continue-failure-visibility-design.md)

## 目标与完成条件

在历史任务详情页中，把“继续此任务”的失败反馈移入始终可见的底部固定操作区。默认显示标题和
简短原因，原始诊断通过 HeroUI `Disclosure` 展开；失败后主按钮仍显示“继续此任务”。固定表面高度
变化时，文档末尾占位必须与实际高度同步，历史正文不被遮挡。

完成必须同时满足：

- 设计中的全部失败分支保持现有语义、状态级别、恢复操作与重试状态机；
- 长历史且当前未滚到底部时，失败摘要立即处于 viewport 内；
- 诊断默认折叠、按需展开，长诊断不把主操作推出 viewport；
- transcript 末尾在失败折叠态、诊断展开态和响应式换行后都位于 fixed 表面上方；
- 新增短操作文案带准确 translator comment，两份 Lingui catalog 完整、字段正确且重复提取稳定；
- 代码只在本计划创建的工作树中修改；当前 `dev` checkout 除工作文档提交外不承载代码变更；
- 每个任务形成独立本地提交，不 squash、不 amend、不执行任何 Git 远程操作。

## 已核验事实

- 当前 `dev` 为 `f66dd41f2a125b52689ee339e717008c27961120`；计划执行前必须重新核验，因为文档提交会成为
  工作树的新 base。
- 当前失败 `Alert` 位于 `ContinueTaskAction` 的普通文档流，fixed `aside` 只包含二维码与主按钮；失败
  state 更新没有滚动或 focus 动作。
- `AppShell` 仅以固定 `h-24` 为 history detail 预留空间，不能覆盖新增失败反馈和展开诊断的动态高度。
- `ContinueTaskAction.tsx` 当前 435 行；把全部失败展示继续堆入该文件会越过前端模块责任与可读性
  目标，因此先形成 feature-private 展示 owner。
- HeroUI 本地源码与项目解析版本均为 3.2.4；`Alert` 和 `Disclosure` compound API 可用。
- Vitest Browser parallel config 收集 `src/**/*.browser.test.ts(x)`，并在 Chromium、Firefox、WebKit
  三个实例运行；目标两个 history detail Browser 文件属于该 include，且不在 sequential exclude 中。
- `codex-gui/package.json` 的权威入口包括 `format:oxfmt:fix`、`format:oxfmt`、`lint`、`type-check`、
  `test:browser:parallel` 和 `messages:extract`。Node/pnpm 必须使用 fnm 入口；预检解析到 pnpm 10.34.5。
- Lingui 配置的 source include 为 `src`，locale 只有 `en` 与 `zh-CN`，完整 catalog 生成物边界为
  `codex-gui/src/locales/en.po` 和 `codex-gui/src/locales/zh-CN.po`。
- `/Users/jiangsheng/cnb/codex/.worktrees/vitest` 已是 symlink：直接目标
  `/Users/jiangsheng/cnb/vitest`，物理目标 `/Users/jiangsheng/GitHub/vitest`。工作树脚本按直接映射判定
  兼容性，所以命令必须传 `--vitest-root /Users/jiangsheng/cnb/vitest`。
- 默认八个 sparse 路径均存在于当前 `dev` Git tree；目标 worktree 路径和 branch 当前均不存在；
  `.worktrees/` 已由仓库 `.gitignore` 忽略。

## 范围与权威 owner

### 生产代码

- `codex-gui/src/features/threadHistory/ContinueTaskAction.tsx`
- `codex-gui/src/features/threadHistory/ContinueTaskFailureAlert.tsx`（新增）
- `codex-gui/src/features/appShell/AppShell.tsx`

`ContinueTaskAction` 继续拥有请求、state、fixed action surface、二维码与主按钮；新模块只拥有
`ActiveThreadActivationFailure` 到 HeroUI 反馈视图的穷尽映射。`ActiveThreadSession.activate` 仍是失败
语义权威来源，不新增 DTO、Redux mirror 或兼容路径。

### 测试与 catalog

- `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryDetailContinuation.browser.test.tsx`
- `codex-gui/src/features/threadHistory/__tests__/ThreadHistoryDetailRead.browser.test.tsx`
- `codex-gui/src/locales/en.po`
- `codex-gui/src/locales/zh-CN.po`

### 明确排除

- 不修改 `ActiveThreadSession`、GUI Host/app-server 协议、路由、全局 Toast 或 HeroUI sibling checkout。
- 不改变按钮文案、成功导航、二维码、warning Toast、只读 transcript、pagination 或 Composer 拓扑。
- 不自动滚动历史，不强制移动视觉 focus，不以 Modal 或顶部通知替代固定反馈。
- 不运行 `messages:extract:clean`、协议/schema 生成、repository-level `just fmt`、headed browser、Rust
  build/run、依赖安装、Git remote 或任何 force Git 命令。
- 生成器、formatter 或测试若产生范围外修改，不接受为“顺手修复”；按对应失败域停止后继并审查。

## 工作树与执行上下文

### 文档提交屏障

计划确认后，先在 `/Users/jiangsheng/cnb/codex` 的 `dev` checkout 只暂存并提交：

```sh
git add -- docs/superpowers/specs/2026/09/04/2026-09-04-codex-gui-history-continue-failure-visibility-design.md docs/superpowers/plans/2026/09/04/2026-09-04-codex-gui-history-continue-failure-visibility.md
git diff --cached --check
git diff --cached -- docs/superpowers/specs/2026/09/04/2026-09-04-codex-gui-history-continue-failure-visibility-design.md docs/superpowers/plans/2026/09/04/2026-09-04-codex-gui-history-continue-failure-visibility.md
git commit -m 'docs(codex-gui): design visible history continuation failures'
```

禁止暂存同目录已有的
`docs/superpowers/specs/2026/09/04/2026-09-04-codex-gui-navigation-menu-heroui-design.md` 或任何其他
dirty/untracked 文件。文档提交失败时不得创建工作树或开始实现。

### 工作树预配屏障

文档提交成功并重新核验 `dev` HEAD、branch/path 不冲突后，从仓库根运行唯一固化入口：

```sh
bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh \
  --name gui-history-continue-failure-visibility \
  --branch codex/gui-history-continue-failure-visibility \
  --base dev \
  --repo-root /Users/jiangsheng/cnb/codex \
  --worktree-root /Users/jiangsheng/cnb/codex/.worktrees \
  --vitest-root /Users/jiangsheng/cnb/vitest
```

预期执行上下文：

- worktree：`/Users/jiangsheng/cnb/codex/.worktrees/gui-history-continue-failure-visibility`
- branch：`codex/gui-history-continue-failure-visibility`
- package cwd：`/Users/jiangsheng/cnb/codex/.worktrees/gui-history-continue-failure-visibility/codex-gui`
- sparse checkout：脚本默认八个控制面路径，不追加 `--include`
- index：该工作树独占 Git index；不得从主 checkout 修改代码或暂存实现文件

脚本必须完整验证 sparse path、适用 AGENTS/skills、协议 schema、`node_modules`、HeroUI/Redux 文档和
Vitest 文档链接，并输出 clean `git status --short --branch`。任一项失败，工作树屏障不成立。

## 实现与验证原则

- 普通 TS/TSX 源码没有更高层迁移工具能表达本次抽取和布局修改，使用精确 `apply_patch`；不使用
  脚本复制或批量重写。
- 纯 owner 抽取和行为修改分开提交。后续对已有提交的修正只能形成新的独立提交。
- 新展开操作使用 `<Trans comment="Button in a history continuation error that expands raw diagnostic details">View diagnostic information</Trans>`；comment 在 source language 中说明位置和动作，不使用 `context` 拆分 message identity。
- Catalog 首次与稳定性提取都从工作树 `codex-gui` cwd 运行：

```sh
/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract
```

  首次提取后完整审查两份 PO 的 `#:`, `#.`, `msgid`, `msgstr`, fuzzy/obsolete；只人工补充目标
  `zh-CN` 的 `msgstr "查看诊断信息"`。重复运行同一入口后必须无新结构 diff且翻译保留。
- 格式化使用项目入口 `/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix`，随后以
  `format:oxfmt` 非 fix 模式复验。formatter 只允许保留本任务范围内的实际必要修改。
- Browser 目标发现和执行使用 live parallel config 的 direct Vitest 入口，避免 package script 的参数
  传播歧义：

```sh
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest list --config=vitest.browser.parallel.config.ts src/features/threadHistory/__tests__/ThreadHistoryDetailContinuation.browser.test.tsx src/features/threadHistory/__tests__/ThreadHistoryDetailRead.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest run --config=vitest.browser.parallel.config.ts src/features/threadHistory/__tests__/ThreadHistoryDetailContinuation.browser.test.tsx src/features/threadHistory/__tests__/ThreadHistoryDetailRead.browser.test.tsx
```

  `list` 必须非零列出两个目标文件在 Chromium、Firefox、WebKit 的实例；运行退出 0 但目标未收集不算
  验证。
- Browser 测试使用 role/name locator、`expect.element` 可重试 DOM 断言、真实 locator/keyboard 操作和
  `expect.poll` 几何断言；不直接派发伪造 click/keyboard event 代替用户交互。

## 任务与提交拓扑

### DOCS：工作文档提交

只包含已确认设计与本计划，形成实现前置提交。提交信息：
`docs(codex-gui): design visible history continuation failures`。

### T1：纯失败展示 owner 抽取

把 `ContinueTaskUnavailableAlert`、`OperationFailureSummary`、diagnostic text 映射和 unexpected/empty
失败展示迁入 `ContinueTaskFailureAlert.tsx`。`ContinueTaskAction` 只调用新组件；DOM、文案、状态级别、
诊断默认可见性和操作位置均保持不变。该任务不得新增 `Disclosure`、移动 Alert 到 fixed surface、
改变 spacer 或新增 message。抽取会改变既有 message 的 source references，因此格式化后必须完成两次
`messages:extract`、完整 PO 字段审查和稳定性闭环，并把纯 `#:` metadata 纳入 T1 提交。

提交信息：`refactor(codex-gui): extract history continuation failure view`。

### T2：固定失败反馈与诊断层级

先增加失败回归，再把失败组件渲染到 fixed `aside` 的按钮行上方。引入 HeroUI `Disclosure`：用户摘要
始终可见；仅存在 raw diagnostic 时显示带 translator comment 的展开 trigger；operation、cleanup 与
unexpected diagnostic 默认隐藏。所有失败分支都把主按钮的 `aria-describedby` 关联到当前可见摘要，
包括 `empty` 与 `unexpectedFailure`。保持 warning/danger、返回当前任务条件、按钮文案和重试 state。

本任务运行首次 extraction、补目标中文翻译、重复 extraction 并审查完整 PO diff。静态 `h-24`
placeholder 暂时保留；动态高度由 T3 接管，禁止在本提交顺手重排或迁移无关代码。

提交信息：`feat(codex-gui): surface history continuation failures beside action`。

### T3：动态 fixed surface 占位

先增加动态高度几何回归，再由 `ContinueTaskAction` 用 `ResizeObserver` 观测 fixed surface，渲染与实测
高度同步的局部 `aria-hidden` spacer；`AppShell` 删除 history detail 专用 `h-24` 占位和路由判断。
展开长诊断时诊断区域内部滚动，按钮行持续位于 viewport 内；不得改变文档 scrollTop 或抢焦点。

格式化后运行 `messages:extract`，完整审查实际变化，再运行一次相同入口证明稳定；只接受由当前
source 确定产生的 reference metadata。若 catalog 无 diff则不制造变更。

提交信息：`fix(codex-gui): track history continuation action height`。

### FINAL：组合验证与无头验收

在 T1、T2、T3 三个提交全部形成后的稳定 branch 上执行 catalog stability、format check、lint、
type-check、目标 collection、focused Browser 和完整 `test:browser:parallel`。完成后审查从 DOCS commit
到 HEAD 的完整 diff、提交序列与 clean status。

Level 2 必须证明真实 GUI runtime 使用目标工作树的前端，不能只凭页面可访问或 Vite 进程存在推断。
先由用户以`CODEX_GUI_HOST_MODE=dev`、`CODEX_GUI_VITE_URL=http://127.0.0.1:5173` 启动
Codex/app-server，并从该 runtime 现场生成完整`/gui` URL；取得这些输入后，才在稳定 clean HEAD 上
启动唯一 Vite 进程并锁定其 PID/cwd。通过该 GUI Host origin 请求本提交新增的
`ContinueTaskFailureAlert.tsx` 并核对特征内容，闭合资产来源后，才使用真实长历史详情进行无头验收。
常规与窄宽度下验证折叠/展开、按钮保持可见和正文不遮挡；真实失败无法稳定触发时，只报告已实际
证明的布局场景，并把失败注入场景标为未执行。不能猜测或复用旧 URL，不能用 Level 1 替代。原生
runtime 只由用户启动；Level 3 不适用，禁止启动可见浏览器或桌面窗口。

## 描述式执行 DAG

### 共享能力信封与锁规则

以下节点的 `objective` 均为本计划目标，`grantSource` 均等待用户明确确认本计划；确认前所有
`authorizationGate.status=pending`。确认后仅节点列出的 `grantedOperation`、`readSet`、`writeSet`、
`commandScope` 和 state effects 进入 active 信封。共同 `negativeConstraints` 为：无计划外文件、无
安装、无 headed UI、无 remote、无 force、无 amend/squash、无 fallback/skip/baseline 放宽；
`subdelegation=false`。节点返回或命令完成后其信封到期；需要扩大文件、动作或副作用时触发 replan。

canonical 资源锁：主 checkout index 与实现 worktree index 分离；实现节点共享同一 worktree 时，任何
write 与相交 read/write 不并发；catalog generator 独占两份 PO write lock并读取全部 `codex-gui/src`；
formatter 独占工作树 source write lock；Browser runner 独占该 worktree 的 Vitest/Playwright runner。

### 节点记录

#### `D0-PLAN-METADATA`

- `taskBoundary/operationKind/owner`：DOCS / edit / 工作文档 owner。
- `outcome`：用户确认本计划后，计划状态更新为“已确认”，记录确认日期与确认原文。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：用户明确确认计划；消费本计划文件与确认原文。
- `produces/completionEvidence`：仅计划头部确认元数据发生变化，正文语义不改。
- `readSet/writeSet/stateEffects`：本计划 / 本计划 / 工作文档状态更新。
- `commandScope`：精确 `apply_patch` 只改计划头部状态字段。
- `executionContext/resourceLocks`：主 checkout `dev` / 计划文件独占写。
- `verification/failureDomain/replanTriggers`：diff 不精确时阻断 D1 及全部实现；确认原文或目标变化时回到
  计划门禁。
- `authorizationGate`：用户明确确认本计划后 metadata edit active。

#### `D1-DOC-STAGE`

- `taskBoundary/operationKind/owner`：DOCS / stage / 主协调 Git index owner。
- `outcome`：两个目标工作文档被精确暂存并通过 cached diff/check；其他 dirty/untracked 文件未进入 index。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：D0；消费已确认的两份工作文档。
- `produces/completionEvidence`：精确 staged snapshot；`git diff --cached --check`通过且 cached diff只含两文件。
- `readSet/writeSet/stateEffects`：两份工作文档与主 index / 主 index / 精确 staged状态。
- `commandScope`：文档提交屏障中的 `git add --`、cached diff/check；禁止 `git add .`和commit。
- `executionContext/resourceLocks`：主 checkout `dev` / 主 Git index独占写。
- `verification/failureDomain/replanTriggers`：staged allowlist不精确时阻断 D2及全部实现；若 HEAD、文档
  路径或 unrelated staged set变化，重新核验而不自动清理。
- `authorizationGate`：计划确认后仅 docs stage/review active。

#### `D2-DOC-COMMIT`

- `taskBoundary/operationKind/owner`：DOCS / commit / 主协调 Git commit owner。
- `outcome`：精确 staged snapshot形成一个本地工作文档提交。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：D1；消费不可变 staged snapshot。
- `produces/completionEvidence`：DOCS commit id；提交内容等于 D1 snapshot，两个文件已跟踪。
- `readSet/writeSet/stateEffects`：主 index / `refs/heads/dev` / 新本地提交并清空目标 staged状态。
- `commandScope`：仅执行指定 message的 `git commit`与提交后只读核验。
- `executionContext/resourceLocks`：主 checkout `dev` / 主 Git index与`refs/heads/dev`独占写。
- `verification/failureDomain/replanTriggers`：提交失败阻断 W0及全部实现；index变化使 D1证据失效。
- `authorizationGate`：D1 snapshot稳定后 docs commit active。

#### `W0-WORKTREE-PREPARE`

- `taskBoundary/operationKind/owner`：无代码提交 / generate / 工作树准备 owner。
- `outcome`：固化脚本创建并验证目标 sparse worktree、branch、links 与 clean index。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：D2；消费 DOCS commit 和更新后的 `dev` commit。
- `produces/completionEvidence`：worktree path、branch、sparse list、linked resources、clean status 的脚本
  输出；worktree HEAD 含 DOCS commit。
- `readSet/writeSet/stateEffects`：repo/worktree 配置及固定控制面 / 目标 worktree、branch、脚本管理的
  symlink / 创建 worktree、branch、独占 index。
- `commandScope`：上文唯一精确 create-codex-gui-worktree.sh 命令及脚本内置验证。
- `executionContext/resourceLocks`：主 repo 管理区与目标 path/branch 独占写。
- `verification/failureDomain/replanTriggers`：任一脚本验证失败阻断全部代码节点；path、branch、base、
  sparse input 或 direct Vitest mapping 与预检不一致时停止，不运行脚本提示的 force cleanup。
- `authorizationGate`：计划确认后 worktree 创建 active；force cleanup 永不自动 active。

#### `T1-EDIT`

- `taskBoundary/operationKind/owner`：T1 / edit / T1 源码 owner。
- `outcome`：失败展示形成新 private module，调用方仍产生等价 DOM 与行为。
- `estimatedCost/deferralEvidence`：M / 无。
- `hardPredecessors`：W0；消费当前 `ContinueTaskAction` 与权威 failure enum。
- `produces/completionEvidence`：精确 source diff，无行为、文案、顺序或 catalog 修改。
- `readSet/writeSet/stateEffects`：threadHistory source/tests / 两个生产 TSX / source diff。
- `commandScope`：`apply_patch`；只读 `rg`/diff 审查。
- `executionContext/resourceLocks`：实现 worktree / 两个生产文件 write lock。
- `verification/failureDomain/replanTriggers`：穷尽 failure 映射与现有 props 保持；失败暂停 T1 后继；若
  抽取要求改 public API、state 或用户可见行为，回到计划范围。
- `authorizationGate`：计划确认且 W0 完成后纯重构 edit active。

#### `T1-FORMAT`

- `taskBoundary/operationKind/owner`：T1 / format / T1 formatter owner。
- `outcome`：T1 source 由权威 oxfmt 入口格式化，范围外无 diff。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：T1-EDIT；消费 T1 source diff。
- `produces/completionEvidence`：fix 入口退出 0，非 fix 入口退出 0，完整 diff 保持纯重构。
- `readSet/writeSet/stateEffects`：`codex-gui/**` / formatter 自动作用域 / 格式化状态。
- `commandScope`：fnm-backed `format:oxfmt:fix`、`format:oxfmt`。
- `executionContext/resourceLocks`：实现 worktree / source tree 独占 write。
- `verification/failureDomain/replanTriggers`：范围外变更阻断 T1 verify/commit；不得手工恢复未审查 diff。
- `authorizationGate`：T1-EDIT 后格式化 active。

#### `T1-I18N-EXTRACT`

- `taskBoundary/operationKind/owner`：T1 / generate / T1 Lingui generator owner。
- `outcome`：首次 extraction把既有 message的新 source references机械投影到两份 catalog。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：T1-FORMAT；消费格式化后的抽取 source和 lingui config。
- `produces/completionEvidence`：入口退出0；完整 PO diff仅含可回指 T1文件迁移的 `#:` metadata。
- `readSet/writeSet/stateEffects`：`codex-gui/src/**`, config, catalogs / `en.po`,`zh-CN.po` / catalog generation。
- `commandScope`：fnm-backed `messages:extract`；完整字段审查；禁止 clean。
- `executionContext/resourceLocks`：实现 worktree / source read、两 catalog独占write。
- `verification/failureDomain/replanTriggers`：任何 msgid/msgstr/comment/fuzzy/obsolete或范围外输出阻断 T1后继。
- `authorizationGate`：T1 format后 catalog generation active。

#### `T1-I18N-STABILITY`

- `taskBoundary/operationKind/owner`：T1 / generate / T1 Lingui stability owner。
- `outcome`：第二次相同 extraction不产生新结构变化。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：T1-I18N-EXTRACT；消费首次 catalog diff及审查结论。
- `produces/completionEvidence`：入口退出0；两 PO diff稳定且仅含 T1 source refs。
- `readSet/writeSet/stateEffects`：source/config/catalog / 两 PO / stability generation。
- `commandScope`：同一 fnm-backed `messages:extract`；前后完整 diff审查。
- `executionContext/resourceLocks`：实现 worktree / source read、两 catalog独占write。
- `verification/failureDomain/replanTriggers`：持续 drift阻断 T1 verify/commit，不以 metadata名义放行。
- `authorizationGate`：首次 extraction审查完成后 stability generation active。

#### `T1-VERIFY`

- `taskBoundary/operationKind/owner`：T1 / verify / T1 验证 owner。
- `outcome`：现有 continuation Browser tests 与 type-check 证明抽取等价。
- `estimatedCost/deferralEvidence`：M / 无。
- `hardPredecessors`：T1-I18N-STABILITY；消费格式化且 catalog稳定的 T1 diff。
- `produces/completionEvidence`：Continuation 目标在三 browser 非零收集并通过；type-check 退出 0。
- `readSet/writeSet/stateEffects`：T1 source/tests/config / 无显式文件 / Browser 与 typecheck 运行状态。
- `commandScope`：direct parallel Vitest 对单一 continuation 文件；fnm-backed `type-check`。
- `executionContext/resourceLocks`：实现 worktree / Browser runner 独占、source read。
- `verification/failureDomain/replanTriggers`：失败只暂停 T1-COMMIT 与传递后继并进入计划内诊断；发现
  行为差异则修正 T1，不把差异留给 T2。
- `authorizationGate`：T1 catalog稳定后 focused verification active。

#### `T1-STAGE`

- `taskBoundary/operationKind/owner`：T1 / stage / T1 Git index owner。
- `outcome`：纯 owner抽取与对应稳定 source-reference metadata被精确暂存并审查。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：T1-VERIFY；消费已验证 T1 diff。
- `produces/completionEvidence`：staged snapshot只含两个生产文件和实际变化的两 PO；cached check通过，
  不含用户可见行为修改。
- `readSet/writeSet/stateEffects`：T1 files与工作树 index / 工作树 index / 精确 staged状态。
- `commandScope`：精确 `git add --` 两个生产文件与实际变化的两 PO；cached diff/check；禁止commit。
- `executionContext/resourceLocks`：实现 worktree / 其 index独占写。
- `verification/failureDomain/replanTriggers`：staged越界阻断 T1-COMMIT；任何 staged变化使snapshot失效。
- `authorizationGate`：T1 verify后 stage/review active。

#### `T1-COMMIT`

- `taskBoundary/operationKind/owner`：T1 / commit / T1 Git commit owner。
- `outcome`：T1 staged snapshot形成纯 owner抽取提交。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：T1-STAGE；消费不可变 staged snapshot。
- `produces/completionEvidence`：独立 commit id，内容等于 T1-STAGE snapshot。
- `readSet/writeSet/stateEffects`：工作树 index / branch ref / 本地提交。
- `commandScope`：仅指定 message的 `git commit`与提交后只读核验。
- `executionContext/resourceLocks`：实现 worktree / index与branch ref独占写。
- `verification/failureDomain/replanTriggers`：commit失败阻断 T2；index变化使 T1-STAGE证据失效；禁止 amend。
- `authorizationGate`：T1 staged snapshot稳定后 local commit active。

#### `T2-TEST-EDIT`

- `taskBoundary/operationKind/owner`：T2 / edit / T2 test owner。
- `outcome`：新增长历史失败即时可见、Disclosure、按钮文案与重试语义回归。
- `estimatedCost/deferralEvidence`：M / 无。
- `hardPredecessors`：T1-COMMIT；消费稳定抽取 commit 与测试 harness。
- `produces/completionEvidence`：continuation Browser test 的最小测试 diff；精确测试名存在。
- `readSet/writeSet/stateEffects`：continuation source/test / continuation Browser test / test source diff。
- `commandScope`：`apply_patch` 与只读 diff审查。
- `executionContext/resourceLocks`：实现 worktree / test file独占写。
- `verification/failureDomain/replanTriggers`：若需改变产品语义或测试 harness owner，暂停 T2-RED-VERIFY及后继。
- `authorizationGate`：T1 commit后 test edit active。

#### `T2-RED-VERIFY`

- `taskBoundary/operationKind/owner`：T2 / verify / T2 red验证 owner。
- `outcome`：精确目标以预声明断言失败，证明旧实现未满足 fixed feedback与默认折叠。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：T2-TEST-EDIT；消费新增测试。
- `produces/completionEvidence`：目标非零收集；失败原因仅为 Alert 不在 fixed surface或诊断尚未折叠。
- `readSet/writeSet/stateEffects`：continuation source/test/config / 无显式文件 / red test运行状态。
- `commandScope`：direct Vitest `-t 'keeps a long history continuation failure visible beside the retry action'`。
- `executionContext/resourceLocks`：实现 worktree / Browser runner独占、source read。
- `verification/failureDomain/replanTriggers`：未收集、配置失败或其他断言失败不算 red成功；失败暂停 T2-EDIT及后继并诊断。
- `authorizationGate`：T2 test edit后预声明 red verification active。

#### `T2-EDIT`

- `taskBoundary/operationKind/owner`：T2 / edit / T2 UI owner。
- `outcome`：失败 Alert 位于 fixed surface；摘要默认可见，raw diagnostic 通过 Disclosure 展开；所有
  failure state的摘要与主按钮建立 accessible description关联；重试语义不变。
- `estimatedCost/deferralEvidence`：M / 无。
- `hardPredecessors`：T2-RED-VERIFY；消费命中的 red test和抽取后的展示 owner。
- `produces/completionEvidence`：两个生产 TSX 中与 T2 相关的最小 diff；新增 source message/comment；
  `unavailable`、`empty`、`unexpectedFailure`均由当前摘要 id驱动 `aria-describedby`。
- `readSet/writeSet/stateEffects`：T2 source/test/HeroUI docs / failure view与ContinueTaskAction / UI source diff。
- `commandScope`：`apply_patch`，只读 diff/rg；不触碰 AppShell spacer。
- `executionContext/resourceLocks`：实现 worktree / 两个 threadHistory production file write。
- `verification/failureDomain/replanTriggers`：若需改 failure enum、route/global owner 或按钮文案，暂停 T2及后继回到范围门禁。
- `authorizationGate`：T2 red 后 UI edit active。

#### `T2-FORMAT`

- `taskBoundary/operationKind/owner`：T2 / format / T2 formatter owner。
- `outcome`：T2 source/test 经 oxfmt fix 后通过 check，范围外无变更。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：T2-EDIT；消费 T2 source/test diff。
- `produces/completionEvidence`：format fix/check 退出 0，完整 diff仍为 T2 行为与测试。
- `readSet/writeSet/stateEffects`：`codex-gui/**` / formatter 自动作用域 / 格式化状态。
- `commandScope`：fnm-backed `format:oxfmt:fix`、`format:oxfmt`。
- `executionContext/resourceLocks`：实现 worktree / source tree 独占 write。
- `verification/failureDomain/replanTriggers`：范围外 formatter diff 阻断 extraction/verify。
- `authorizationGate`：T2 edit 后 format active。

#### `T2-I18N-EXTRACT`

- `taskBoundary/operationKind/owner`：T2 / generate / Lingui generator owner。
- `outcome`：两份 catalog 机械投影新 message、translator comment 和真实 source refs。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：T2-FORMAT；消费格式化 source 与 lingui config。
- `produces/completionEvidence`：首次 extraction 退出 0；完整 PO diff 已按字段分类，无范围外输出。
- `readSet/writeSet/stateEffects`：`codex-gui/src/**`, config / `en.po`,`zh-CN.po` / catalog generation。
- `commandScope`：fnm-backed `messages:extract`；禁止 clean。
- `executionContext/resourceLocks`：实现 worktree / source read、两 catalog 独占 write。
- `verification/failureDomain/replanTriggers`：计划外 msgid/msgstr/fuzzy/obsolete 或其他文件输出阻断后继。
- `authorizationGate`：T2 format 后 catalog generation active。

#### `T2-I18N-TRANSLATE`

- `taskBoundary/operationKind/owner`：T2 / edit / catalog translation owner。
- `outcome`：只补新增 `zh-CN` message 的 `msgstr "查看诊断信息"`。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：T2-I18N-EXTRACT；消费 generator-created entry。
- `produces/completionEvidence`：zh-CN field diff精确，en 与既有翻译不改。
- `readSet/writeSet/stateEffects`：两 PO及 source comment / `zh-CN.po` / 人工翻译。
- `commandScope`：精确 `apply_patch` 只改目标 msgstr。
- `executionContext/resourceLocks`：实现 worktree / zh-CN catalog独占 write。
- `verification/failureDomain/replanTriggers`：entry 未生成或 identity 不符时停止，不手写 msgid/refs。
- `authorizationGate`：目标 entry存在后翻译 edit active。

#### `T2-I18N-STABILITY`

- `taskBoundary/operationKind/owner`：T2 / generate / Lingui stability owner。
- `outcome`：重复 extraction 后 catalog 无新结构 diff且目标翻译保留。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：T2-I18N-TRANSLATE；消费人工补充后的 catalog。
- `produces/completionEvidence`：二次 extraction 退出 0；前后完整 diff稳定。
- `readSet/writeSet/stateEffects`：source/config/catalog / 两 PO / stability generation。
- `commandScope`：同一 fnm-backed `messages:extract`；完整字段审查。
- `executionContext/resourceLocks`：实现 worktree / source read、catalog独占 write。
- `verification/failureDomain/replanTriggers`：任何持续 drift 阻断 T2 verify/commit，不以 metadata 名义放行。
- `authorizationGate`：翻译后 stability generation active。

#### `T2-VERIFY`

- `taskBoundary/operationKind/owner`：T2 / verify / T2 验证 owner。
- `outcome`：Continuation Browser 文件三 browser 全部通过，type-check/lint通过。
- `estimatedCost/deferralEvidence`：M / 无。
- `hardPredecessors`：T2-I18N-STABILITY；消费稳定 T2 source/test/catalog。
- `produces/completionEvidence`：目标文件非零收集并通过；type-check、lint均退出 0。
- `readSet/writeSet/stateEffects`：T2范围与配置 / 无显式文件 / Browser、typecheck、lint运行状态。
- `commandScope`：direct parallel Vitest continuation 文件；fnm-backed `type-check`,`lint`。
- `executionContext/resourceLocks`：实现 worktree / Browser runner独占、source read。
- `verification/failureDomain/replanTriggers`：失败暂停 T2 commit/T3并按计划内根因诊断修正；不得跳过断言。
- `authorizationGate`：catalog稳定后 focused verification active。

#### `T2-STAGE`

- `taskBoundary/operationKind/owner`：T2 / stage / T2 Git index owner。
- `outcome`：固定反馈、Disclosure、测试及稳定 catalog被精确暂存并审查。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：T2-VERIFY；消费验证完成的 T2 diff。
- `produces/completionEvidence`：staged snapshot只含 T2生产/test/两 PO；cached diff/check精确。
- `readSet/writeSet/stateEffects`：T2文件与 index / index / 精确 staged状态。
- `commandScope`：精确 add T2生产/test/两 PO，cached审查；禁止commit。
- `executionContext/resourceLocks`：实现 worktree / index独占写。
- `verification/failureDomain/replanTriggers`：staged越界阻断 T2-COMMIT；任何 staged变化使snapshot失效。
- `authorizationGate`：T2 verify后 stage/review active。

#### `T2-COMMIT`

- `taskBoundary/operationKind/owner`：T2 / commit / T2 Git commit owner。
- `outcome`：T2 staged snapshot形成单一行为提交。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：T2-STAGE；消费不可变 staged snapshot。
- `produces/completionEvidence`：独立 commit id，内容等于 T2-STAGE snapshot。
- `readSet/writeSet/stateEffects`：index / branch ref / 本地提交。
- `commandScope`：仅指定 message的 `git commit`与提交后只读核验。
- `executionContext/resourceLocks`：实现 worktree / index与branch ref独占写。
- `verification/failureDomain/replanTriggers`：commit失败阻断 T3；index变化使 T2-STAGE证据失效；禁止 amend。
- `authorizationGate`：T2 staged snapshot稳定后 local commit active。

#### `T3-TEST-EDIT`

- `taskBoundary/operationKind/owner`：T3 / edit / T3 geometry test owner。
- `outcome`：新增动态高度占位、展开 surface 与 transcript末尾边界回归。
- `estimatedCost/deferralEvidence`：M / 无。
- `hardPredecessors`：T2-COMMIT；消费稳定 fixed surface DOM。
- `produces/completionEvidence`：两个 Browser test文件中的最小 test diff；精确测试名存在。
- `readSet/writeSet/stateEffects`：history Browser tests/source / 两 test文件 / test source diff。
- `commandScope`：`apply_patch` 与只读 diff审查。
- `executionContext/resourceLocks`：实现 worktree / 两 test files独占写。
- `verification/failureDomain/replanTriggers`：若需改变布局产品语义或测试 harness owner，暂停 T3-RED-VERIFY及后继。
- `authorizationGate`：T2 commit后 geometry test edit active。

#### `T3-RED-VERIFY`

- `taskBoundary/operationKind/owner`：T3 / verify / T3 red验证 owner。
- `outcome`：固定 `h-24` 无法匹配 expanded surface的预期几何断言失败命中旧实现。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：T3-TEST-EDIT；消费新增 geometry regression。
- `produces/completionEvidence`：精确测试非零收集且只因动态高度/遮挡断言失败。
- `readSet/writeSet/stateEffects`：history Browser tests/source/config / 无显式文件 / red test运行状态。
- `commandScope`：direct Vitest `-t 'keeps the transcript end above the measured continuation action surface'`。
- `executionContext/resourceLocks`：实现 worktree / Browser runner独占、source read。
- `verification/failureDomain/replanTriggers`：未命中旧高度问题不算完成；失败暂停 T3-EDIT并诊断。
- `authorizationGate`：T3 test edit后预声明 red verification active。

#### `T3-EDIT`

- `taskBoundary/operationKind/owner`：T3 / edit / dynamic layout owner。
- `outcome`：局部 measured spacer取代 AppShell `h-24`，展开诊断与按钮行在 viewport内正确布局。
- `estimatedCost/deferralEvidence`：M / 无。
- `hardPredecessors`：T3-RED-VERIFY；消费命中的 geometry regression与T2 fixed surface。
- `produces/completionEvidence`：ContinueTaskAction与AppShell最小行为 diff；无 scroll/focus副作用。
- `readSet/writeSet/stateEffects`：T3生产/test与现有ResizeObserver模式 / ContinueTaskAction、AppShell / layout source diff。
- `commandScope`：`apply_patch`、只读 diff/rg。
- `executionContext/resourceLocks`：实现 worktree / 两生产文件 write。
- `verification/failureDomain/replanTriggers`：需要全局 layout state、route/protocol修改或自动滚动时回到范围门禁。
- `authorizationGate`：geometry red后 dynamic layout edit active。

#### `T3-FORMAT`

- `taskBoundary/operationKind/owner`：T3 / format / T3 formatter owner。
- `outcome`：T3 source/test经 oxfmt fix后通过check，范围外无变更。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：T3-EDIT；消费 T3 diff。
- `produces/completionEvidence`：format fix/check通过；完整 diff仍在 T3范围。
- `readSet/writeSet/stateEffects`：`codex-gui/**` / formatter自动作用域 / 格式化状态。
- `commandScope`：fnm-backed format fix/check。
- `executionContext/resourceLocks`：实现 worktree / source tree独占write。
- `verification/failureDomain/replanTriggers`：范围外格式化阻断 T3-I18N及后继。
- `authorizationGate`：T3 edit后 format active。

#### `T3-I18N-STABILITY`

- `taskBoundary/operationKind/owner`：T3 / generate / Lingui stability owner。
- `outcome`：首次 extraction只产生可解释的 source reference metadata，第二次相同 extraction达到稳定状态。
- `estimatedCost/deferralEvidence`：S / 无；必须等待 formatter发布稳定 source。
- `hardPredecessors`：T3-FORMAT；消费格式化后的 source和既有 catalog。
- `produces/completionEvidence`：两次 extraction均退出0；完整 PO字段审查无语义漂移，第二次不再产生
  结构变化，实际 metadata纳入 T3 diff。
- `readSet/writeSet/stateEffects`：source/config/catalog / 两 PO / catalog generation。
- `commandScope`：连续两次 fnm-backed `messages:extract`，两次之间完整审查实际 diff；禁止 clean。
- `executionContext/resourceLocks`：实现 worktree / source read、两 catalog独占write。
- `verification/failureDomain/replanTriggers`：计划外 catalog语义或持续 drift阻断 T3 verify/commit。
- `authorizationGate`：T3 format后 catalog stability generation active。

#### `T3-VERIFY`

- `taskBoundary/operationKind/owner`：T3 / verify / T3 验证 owner。
- `outcome`：两个 focused Browser文件三 browser通过，type-check/lint通过。
- `estimatedCost/deferralEvidence`：M / 无。
- `hardPredecessors`：T3-I18N-STABILITY；消费稳定组合 diff。
- `produces/completionEvidence`：目标非零收集并通过；type-check/lint退出0；collapsed/expanded/narrow几何断言命中。
- `readSet/writeSet/stateEffects`：T3范围/config / 无显式文件 / Browser/typecheck/lint运行状态。
- `commandScope`：上文 direct list/run 两文件；fnm-backed `type-check`,`lint`。
- `executionContext/resourceLocks`：实现 worktree / Browser runner独占、source read。
- `verification/failureDomain/replanTriggers`：失败暂停 T3 commit及 FINAL并按计划内根因闭环。
- `authorizationGate`：格式与catalog稳定后 focused verification active。

#### `T3-STAGE`

- `taskBoundary/operationKind/owner`：T3 / stage / T3 Git index owner。
- `outcome`：动态占位、AppShell清理、几何测试及必要稳定 metadata被精确暂存并审查。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：T3-VERIFY；消费验证完成的 T3 diff。
- `produces/completionEvidence`：staged snapshot只含 T3生产/test及实际变化的两 PO；cached diff/check精确。
- `readSet/writeSet/stateEffects`：T3文件与 index / index / 精确 staged状态。
- `commandScope`：精确 add T3生产/test及实际变化的两 PO，cached审查；禁止commit。
- `executionContext/resourceLocks`：实现 worktree / index独占写。
- `verification/failureDomain/replanTriggers`：staged越界阻断 T3-COMMIT；任何 staged变化使snapshot失效。
- `authorizationGate`：T3 verify后 stage/review active。

#### `T3-COMMIT`

- `taskBoundary/operationKind/owner`：T3 / commit / T3 Git commit owner。
- `outcome`：T3 staged snapshot形成独立行为提交。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：T3-STAGE；消费不可变 staged snapshot。
- `produces/completionEvidence`：独立 commit id，内容等于 T3-STAGE snapshot。
- `readSet/writeSet/stateEffects`：index / branch ref / 本地提交。
- `commandScope`：仅指定 message的 `git commit`与提交后只读核验。
- `executionContext/resourceLocks`：实现 worktree / index与branch ref独占写。
- `verification/failureDomain/replanTriggers`：commit失败阻断 FINAL；index变化使 T3-STAGE证据失效；禁止 amend。
- `authorizationGate`：T3 staged snapshot稳定后 local commit active。

#### `F0-CATALOG-STABILITY`

- `taskBoundary/operationKind/owner`：FINAL / generate / final Lingui owner。
- `outcome`：最终 committed source再次 extraction后工作树保持 clean。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：T3-COMMIT；消费最终三个代码提交。
- `produces/completionEvidence`：`messages:extract`退出0且无 diff；两 catalog字段语义稳定。
- `readSet/writeSet/stateEffects`：source/config/catalog / 两 PO / final generation attempt。
- `commandScope`：fnm-backed `messages:extract`；只读 status/diff审查。
- `executionContext/resourceLocks`：实现 worktree / source read、catalog独占 write。
- `verification/failureDomain/replanTriggers`：产生任何 diff则插入计划内修正和独立 commit，旧 FINAL证据失效。
- `authorizationGate`：T3 commit后 final stability active。

#### `F1-FORMAT`

- `taskBoundary/operationKind/owner`：FINAL / verify / final format owner。
- `outcome`：最终 committed tree通过非 fix格式检查。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：F0；消费 catalog稳定的 committed tree。
- `produces/completionEvidence`：fnm-backed `format:oxfmt`退出0。
- `readSet/writeSet/stateEffects`：最终 source/config / 无 / format check结果。
- `commandScope`：单一 `pnpm run format:oxfmt`；禁止fix。
- `executionContext/resourceLocks`：实现 worktree / source read。
- `verification/failureDomain/replanTriggers`：失败只使F1与F5失效，其他final ready分支继续；插入修正时旧验证失效。
- `authorizationGate`：F0完成后 format verification active。

#### `F2-LINT`

- `taskBoundary/operationKind/owner`：FINAL / verify / final lint owner。
- `outcome`：最终 committed tree通过完整 frontend lint。
- `estimatedCost/deferralEvidence`：M / 无。
- `hardPredecessors`：F0；消费 catalog稳定的 committed tree。
- `produces/completionEvidence`：fnm-backed `lint`退出0。
- `readSet/writeSet/stateEffects`：最终 source/config / 无 / lint结果与项目内部cache状态。
- `commandScope`：单一 `pnpm run lint`；禁止fix。
- `executionContext/resourceLocks`：实现 worktree / source read、lint cache runner独占。
- `verification/failureDomain/replanTriggers`：失败只使F2与F5失效，其他final ready分支继续；禁止豁免规则。
- `authorizationGate`：F0完成后 lint verification active。

#### `F3-TYPECHECK`

- `taskBoundary/operationKind/owner`：FINAL / verify / final typecheck owner。
- `outcome`：最终 committed tree通过 TypeScript build-mode noEmit检查。
- `estimatedCost/deferralEvidence`：M / 无。
- `hardPredecessors`：F0；消费 catalog稳定的 committed tree与 sparse schema输入。
- `produces/completionEvidence`：fnm-backed `type-check`退出0。
- `readSet/writeSet/stateEffects`：最终 source/config/schema / 无显式文件 / typecheck增量状态。
- `commandScope`：单一 `pnpm run type-check`。
- `executionContext/resourceLocks`：实现 worktree / source/schema read、TypeScript runner独占。
- `verification/failureDomain/replanTriggers`：失败只使F3与F5失效，其他final ready分支继续；禁止降低类型边界。
- `authorizationGate`：F0完成后 type verification active。

#### `F4-BROWSER-PARALLEL`

- `taskBoundary/operationKind/owner`：FINAL / verify / final Browser owner。
- `outcome`：完整 parallel Browser suite在 Chromium、Firefox、WebKit非零收集并全部通过。
- `estimatedCost/deferralEvidence`：L / 无。
- `hardPredecessors`：F0；消费 catalog稳定的 committed tree与Browser配置。
- `produces/completionEvidence`：fnm-backed `test:browser:parallel`退出0并报告三个browser实际测试计数。
- `readSet/writeSet/stateEffects`：最终 source/tests/config / 无显式文件 / Browser运行与测试附件状态。
- `commandScope`：单一 `pnpm run test:browser:parallel`；禁止headed/UI/open。
- `executionContext/resourceLocks`：实现 worktree / Browser runner独占、source read、物理资源
  `/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.vite`独占write。
- `verification/failureDomain/replanTriggers`：失败只使F4与F5失效；其他final ready分支继续；禁止跳过测试。
- `authorizationGate`：F0完成后 Browser verification active。

#### `L2-RUNTIME-BINDING`

- `taskBoundary/operationKind/owner`：FINAL / authorization / Level 2 runtime binding owner与用户。
- `outcome`：用户提供一个在构造前已带精确dev环境的 Codex/app-server，并从该实例现场生成完整
  `/gui` URL；此时尚未占用计划内Vite端口。
- `estimatedCost/deferralEvidence`：M / 无。
- `hardPredecessors`：F0；消费 catalog稳定后的最终 committed tree与用户启动的原生runtime。
- `produces/completionEvidence`：记录用户确认的启动环境
  `CODEX_GUI_HOST_MODE=dev`、`CODEX_GUI_VITE_URL=http://127.0.0.1:5173`，以及该实例现场生成的完整
  GUI URL；URL不来自旧会话、手工拼接或其他runtime。
- `readSet/writeSet/stateEffects`：用户提供的runtime身份与完整URL / 无仓库文件 / 用户拥有的原生
  runtime状态；助手不启动、重启或修改该runtime。
- `commandScope`：助手只读取并保真记录用户提供的环境与URL；不得运行`cargo run`、`just codex`或
  其他后端/原生启动命令。
- `executionContext/resourceLocks`：用户启动的Codex/app-server与其GUI Host / runtime identity read。
- `verification/failureDomain/replanTriggers`：缺少精确环境、runtime身份或本次完整URL时仅L2后继等待，
  F1-F5继续；不得把当前桌面实例或旧URL假定为已绑定，也不得先启动Vite占用端口等待。
- `authorizationGate`：用户原生runtime与URL输入 pending；助手只读记录 active。

#### `L2-VITE-START`

- `taskBoundary/operationKind/owner`：FINAL / integrate / Level 2 Vite lifecycle owner。
- `outcome`：取得目标runtime与URL后，在目标 worktree 的 stable clean HEAD 上启动唯一、端口不漂移的
  Vite dev server。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：L2-RUNTIME-BINDING；消费完整GUI URL与catalog稳定后的最终 committed tree。
- `produces/completionEvidence`：记录 clean HEAD、clean status、exec session id、唯一 listener PID、完整命令；
  PID cwd精确等于目标 worktree的 `codex-gui`，`http://127.0.0.1:5173` readiness成功。
- `readSet/writeSet/stateEffects`：最终 frontend source/config与进程表 / 无仓库文件 / 单一 Vite进程与
  port 5173 listener。
- `commandScope`：从目标 package cwd运行
  `/opt/homebrew/bin/fnm exec --using-file pnpm run dev -- --host 127.0.0.1 --port 5173 --strictPort`；
  只读核验 PID/cwd/listener/readiness；禁止端口回退或启动原生 runtime。
- `executionContext/resourceLocks`：实现 worktree / frontend source read、TCP 127.0.0.1:5173与Vite
  lifecycle独占write、物理资源`/Users/jiangsheng/cnb/codex/codex-gui/node_modules/.vite`独占write。
- `verification/failureDomain/replanTriggers`：端口占用、多个 listener、cwd或HEAD不匹配时只暂停L2分支；
  任何后续修改 source/config/catalog/tests 的提交都会使F0-F5、本节点及后续L2证据失效；先精确关闭
  已创建的Browser/Vite资源，再从F0重算ready set并重跑受新提交影响的全部FINAL节点。
- `authorizationGate`：runtime binding完成后 frontend dev process active；用户原生runtime动作不在该信封内。

#### `L2-ASSET-PROVENANCE`

- `taskBoundary/operationKind/owner`：FINAL / verify / Level 2 asset provenance owner。
- `outcome`：通过本次 GUI Host origin 证明页面资产由目标 worktree的唯一Vite进程提供。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：L2-VITE-START；消费完整GUI URL、锁定Vite PID/cwd与stable HEAD。
- `produces/completionEvidence`：从GUI Host origin请求`/src/main.tsx`与
  `/src/features/threadHistory/ContinueTaskFailureAlert.tsx`均返回200；新模块响应包含目标提交特有的
  组件名和`View diagnostic information`特征；再次核对Vite PID/cwd、HEAD与clean status未漂移。
- `readSet/writeSet/stateEffects`：GUI Host同源资产、目标worktree HEAD/status与Vite进程 / 无仓库文件 /
  无头浏览会话状态。
- `commandScope`：使用本次完整GUI URL建立无头session，并在其origin内执行同源fetch与只读内容断言；
  禁止直接用Vite URL替代GUI Host、禁止接受仅`main.tsx`命中的证据。
- `executionContext/resourceLocks`：无头Browser provenance session / session独占、Vite与source read。
- `verification/failureDomain/replanTriggers`：任何404、特征缺失、origin/PID/cwd/HEAD漂移使L2验收暂停；
  若资产本身需要新增Git SHA机制则属于计划外范围，不在本计划实现。
- `authorizationGate`：Vite start完成后 headless provenance verification active。

#### `L2-ACCEPTANCE`

- `taskBoundary/operationKind/owner`：FINAL / verify / Level 2无头验收 owner。
- `outcome`：已闭合来源的真实 Codex runtime在常规与窄宽度下证明固定反馈、Disclosure、按钮可见与
  正文不遮挡。
- `estimatedCost/deferralEvidence`：M / 无。
- `hardPredecessors`：L2-ASSET-PROVENANCE；消费来源可信的GUI session与真实长历史任务。
- `produces/completionEvidence`：记录完整URL对应的route/runtime、明确non-headed session、collapsed、
  expanded、narrow与transcript末尾的实际观察；失败注入不可得时精确标记该场景未执行。
- `readSet/writeSet/stateEffects`：真实页面与浏览器session / 无仓库文件 / 无头浏览会话状态。
- `commandScope`：按 codex-gui-toolchain 使用`playwright-cli`对既有无头session进行真实页面导航与交互；
  不启动headed/UI/open模式，不手工拼接history route或复用旧token。
- `executionContext/resourceLocks`：无头Browser acceptance session / session独占、Vite与source read。
- `verification/failureDomain/replanTriggers`：布局或交互失败进入计划内诊断；缺真实失败条件只留下精确
  remaining gap，不用Level1伪替代；证据显示结果依赖可见桌面时回到Level3授权门禁。
- `authorizationGate`：asset provenance完成后 headless acceptance active。

#### `L2-BROWSER-STOP`

- `taskBoundary/operationKind/owner`：FINAL / integrate / Level 2 Browser lifecycle owner。
- `outcome`：验收结束后只关闭asset provenance创建的精确无头Browser session。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：L2-ACCEPTANCE；消费provenance记录的session id与L2结果。
- `produces/completionEvidence`：精确session已关闭且不再出现在`playwright-cli list --json`；其他session与
  browser进程未被操作。
- `readSet/writeSet/stateEffects`：目标无头session id与session列表 / 无仓库文件 / 关闭单一Browser session。
- `commandScope`：只对记录的精确session运行`playwright-cli -s=<session> close`，再以
  `playwright-cli list --json`只读复核；禁止按模糊进程名、宽泛PID或全局browser清理。
  provenance/acceptance失败时由动态图插入消费同一session id的等价关闭节点。
- `executionContext/resourceLocks`：无头Browser lifecycle / 目标session独占write。
- `verification/failureDomain/replanTriggers`：session关闭失败时保护session id与现场，按执行图继续有界
  诊断；不得扩大到其他Browser session。
- `authorizationGate`：仅对L2-ASSET-PROVENANCE创建的session关闭 active。

#### `L2-VITE-STOP`

- `taskBoundary/operationKind/owner`：FINAL / integrate / Level 2 Vite lifecycle owner。
- `outcome`：L2验收完成后停止本节点启动的唯一Vite进程，不影响其他进程或工作树文件。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：L2-BROWSER-STOP；消费Browser关闭证据与L2-VITE-START记录的exec session/PID。
- `produces/completionEvidence`：仅目标session/PID自然终止，127.0.0.1:5173不再由该PID监听；worktree
  HEAD/status仍与L2-VITE-START快照一致且clean。
- `readSet/writeSet/stateEffects`：目标Vite session/PID、listener与worktree状态 / 无仓库文件 / 停止本计划
  启动的Vite进程。
- `commandScope`：通过已记录exec session发送正常终止并轮询退出；禁止按模糊进程名、宽泛PID搜索或
  强制kill。L2任一前置失败或分支暂停时，由动态图插入消费同一启动记录的等价停止节点。
- `executionContext/resourceLocks`：Vite lifecycle / TCP 127.0.0.1:5173与目标session独占写。
- `verification/failureDomain/replanTriggers`：正常终止失败时保护session/PID证据并按执行图继续有界诊断；
  不把其他Vite/Codex进程作为清理目标。
- `authorizationGate`：仅对L2-VITE-START创建的进程停止 active。

#### `L2-LIFECYCLE-CLOSED`

- `taskBoundary/operationKind/owner`：FINAL / fan-in / Level 2 lifecycle fan-in owner。
- `outcome`：形成L2资源生命周期已闭合的稳定终态，覆盖“未创建资源”与“已创建资源均精确关闭”。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：成功路径等待L2-VITE-STOP；任一L2前置失败或外部输入不可得时，动态图以消费精确
  失败记录的Browser/Vite关闭节点或no-resource terminal替换该前置，不允许跳过已创建资源的关闭。
- `produces/completionEvidence`：二选一稳定证据：Browser/Vite从未创建；或所有已创建的精确session/PID
  均已关闭。另记录L2各场景的成功、失败或未执行原因，不能把未执行记为通过。
- `readSet/writeSet/stateEffects`：L2节点记录、session/PID/listener终态 / 无 / 生命周期汇合记录。
- `commandScope`：只读汇总已完成的精确生命周期证据；不得新增关闭目标或伪造未执行结论。
- `executionContext/resourceLocks`：协调上下文 / L2稳定证据read。
- `verification/failureDomain/replanTriggers`：任何已创建资源仍存活时阻断F6；需要操作计划外进程或session
  时回到授权门禁。
- `authorizationGate`：所有实际创建资源已有终止证据后 fan-in active。

#### `F5-DIFF-REVIEW`

- `taskBoundary/operationKind/owner`：FINAL / review / 主协调 review owner。
- `outcome`：稳定 branch 的完整 diff、提交拓扑、catalog边界和 status满足计划。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：F1、F2、F3、F4；消费四类稳定验证证据和全部 commit ids。
- `produces/completionEvidence`：从 DOCS commit到HEAD的diff审查；三个实现提交顺序存在、无squash/amend；
  `git diff --check`通过且 worktree clean。
- `readSet/writeSet/stateEffects`：Git history/diff/status / 无 / review结论。
- `commandScope`：只读 git log/diff/status；禁止 remote。
- `executionContext/resourceLocks`：实现 worktree / branch与index read。
- `verification/failureDomain/replanTriggers`：发现计划外文件、混合提交或dirty state使既有Level2证据失效
  并暂停final fan-in；修正已有提交必须另建提交，修正后重新执行受影响验证与L2来源闭环。
- `authorizationGate`：四项final verification完成后 review active。

#### `F6-FAN-IN`

- `taskBoundary/operationKind/owner`：FINAL / fan-in / 主协调 owner。
- `outcome`：全部必需节点、提交、验证与实际并行记录汇合，形成最终结论。
- `estimatedCost/deferralEvidence`：S / 无。
- `hardPredecessors`：F5与L2-LIFECYCLE-CLOSED；消费diff审查、L2场景结果与资源生命周期终态；若L2
  部分场景因外部条件未执行，消费其精确未执行记录，不伪造成功。
- `produces/completionEvidence`：最终报告包含提交 ids、验证命中/计数、Level结果、remaining gap，以及固定
  三项“实际并行/关键路径/未启动 ready节点”。
- `readSet/writeSet/stateEffects`：所有节点稳定证据 / 无 / 最终对话结果。
- `commandScope`：只读汇总；不stage、commit、merge、cleanup或remote。
- `executionContext/resourceLocks`：协调上下文 / 稳定证据read。
- `verification/failureDomain/replanTriggers`：必需节点未完成或无正面证据形成的硬阻塞时不得宣称完成。
- `authorizationGate`：前置满足后 fan-in active。

## Ready set、关键路径与反向审计

- 初始 ready set：计划确认后只有 `D0-PLAN-METADATA`；随后
  `D0-PLAN-METADATA -> D1-DOC-STAGE -> D2-DOC-COMMIT -> W0-WORKTREE-PREPARE`。stage与commit是
  单一动作节点；文档提交是全实现硬门禁，不是惯例串行。
- `D0 -> D1 -> D2 -> W0`：工作树必须包含已确认并提交的设计与计划，这是稳定 base 依赖。
- `W0 -> T1 -> T2 -> T3`：三任务共享并顺序修改同一 failure view、ContinueTaskAction、测试与 branch；T2
  消费 T1抽取 owner，T3消费 T2 fixed surface DOM，均为真实产物依赖，不是编号伪依赖。
- T2/T3 内部 `edit -> format -> extraction -> verify -> commit` 分别等待格式化 source、稳定 catalog、
  验证证据与 staged allowlist，不能并行越过写锁。
- `F0` 必须读取最终 committed source并证明无 catalog drift；完成后 F1/F2/F3/F4 ready。
  `L2-RUNTIME-BINDING`仍等待用户提供本次原生runtime身份、精确dev环境和现场生成的完整GUI URL，且
  `authorizationGate`变为active后才ready。它们读取同一stable clean tree且结果独立，不增加
  `F5 -> L2`伪边；F4与后续L2-VITE-START同时写物理`node_modules/.vite`时保持ready但由canonical
  资源锁互斥，不伪造hard edge。任何后续修改source/config/catalog/tests的提交都会使F0-F5与旧Level2
  来源/验收证据失效；关闭已创建资源后从F0重算ready set并重跑受影响的全部FINAL节点。
- 粗粒度关键路径：DOCS commit → worktree prepare → T1 commit → T2 red/edit/extraction/verify/commit → T3
  red/edit/format/extraction/verify/commit → final catalog stability → 最慢的F1-F4/F5分支或Level2来源与验收分支
  → fan-in。
- 没有值得另建并行编辑工作树的独立代码分支：三个行为阶段修改相交 owner并消费前一阶段DOM/状态
  产物；并行会引入冲突解决和二次集成，却不能缩短已证实关键路径。该结论在 T1抽取结果显示写集
  不再相交时复查；若出现真正独立稳定产物，执行图应立即重算而不是继续人为串行。

## 失败处理与停止条件

- 预期 red 只有精确命中预声明旧行为才算成功；零收集、环境失败或无关断言失败按新证据处理。
- 计划内 lint/type/browser/catalog/geometry失败先插入有界诊断、修正和重验节点；只暂停读取不稳定产物
  的后继，不停止无依赖 final分支。
- 修正若针对已形成提交，必须创建新的独立修正提交；禁止 amend、squash或临时兼容双路径。
- 只有需要新增授权/产品决策、越过安全边界、必要工具/URL确实不可得且无替代、约束矛盾或所有安全
  有效路径均被正面排除时，才形成对应失败域的硬阻塞。
- 不自动删除工作树、branch、测试附件或失败现场。cleanup、merge回 `dev` 与任何远程操作均不属于本
  计划。
