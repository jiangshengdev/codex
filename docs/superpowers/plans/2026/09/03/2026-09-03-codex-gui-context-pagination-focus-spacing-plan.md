# Codex GUI 上下文分页 focus ring 与间距实施计划

计划状态：已确认

确认日期：2026-09-03

用户确认原文：`开始进行`

计划日期：2026-09-03

计划基线：`dev @ a514fcb2ba0f49898ad4a1d4a332394e8ead4e72`

设计输入：

- `docs/superpowers/specs/2026/09/03/2026-09-03-codex-gui-context-pagination-focus-spacing-design.md`
- `docs/superpowers/research/2026/09/03/2026-09-03-codex-gui-context-pagination-focus-spacing.md`

## 阶段与授权边界

本文只把已确认设计编译为可执行计划，不改变产品决策。本轮计划落盘只授权更新设计状态和创建
计划文档；不授权实现、格式化、测试、浏览器、Git index 或 commit。用户明确确认本计划后，执行
仍必须先把设计与计划创建为独立本地 DOCS 提交，DOCS 提交成功前不得开始 TEST 或 FIX。

执行期禁止安装依赖或浏览器 binary，禁止操作 Git remote，禁止 amend、squash、force、强制暂存
ignored 文件或提交范围外 dirty work。每个 task boundary 保留独立提交；已提交任务的任何修正都
使用新的独立提交。

## 唯一交付目标

在不改变上下文展示分页的算法、语义和交互行为的前提下，把分页项横向间距从 HeroUI 默认 4px
调整为当前实例的 8px，并在横向 scrollport 内为 HeroUI focus ring 四周保留 4px clearance；上下
clearance 吸收到现有区块间距中，使分页按钮位置与外部纵向节奏保持不变。

## 当前事实闭包

- 当前生产 owner 是
  `codex-gui/src/features/committedTranscriptSurface/TranscriptContextPagination.tsx`。第 45 行仍为无
  padding 的 `w-full overflow-x-auto`，`Pagination.Content` 仍未覆盖 HeroUI 默认 gap。
- 当前 HeroUI sibling source 与 `codex-gui` 解析版本均为 3.2.4。Pagination link 的
  `status-focused` 使用 2px ring 与主题 2px offset，视觉向外扩约 4px；Content 默认 `gap-1`。
- 当前 Browser owner 是
  `codex-gui/src/features/committedTranscriptSurface/__tests__/TranscriptContextPagination.browser.test.tsx`。
  基线提交 `a514fcb2` 已在同一文件增加压缩分隔线居中几何覆盖，但尚无分页 focus、overflow 或
  item-gap 回归。
- `a514fcb2` 同时新增 `TranscriptContextBoundary.tsx` 并修改 renderer；这些文件与分页 scrollport
  owner 不相交，本计划不修改它们，但目标 Browser 文件必须保留其现有断言。
- `codex-gui/package.json` 的 frontend 验证入口、`vitest.browser.parallel.config.ts` 的三浏览器实例、
  `/opt/homebrew/bin/fnm`、`codex-gui/node_modules` 与 `playwright-cli` 当前均存在。pnpm 当前通过 fnm
  解析为 10.34.5。

风险为低：两文件局部样式与 Browser 回归，不涉及协议、状态模型、数据、生成物、本地化或安全
边界。关键未知已闭合；执行时唯一动态输入是 Level 2 当次完整 GUI URL，必须在验收节点重新取得，
不得猜测或复用旧 URL。

## 实现设计映射

### TEST：先建立失败回归

只在现有 `TranscriptContextPagination.browser.test.tsx` 增加当前组件公开 DOM seam 的回归：

- 使用真实 `userEvent.tab()` 触发分页按钮的键盘 `focus-visible`，不直接伪造
  `data-focus-visible`。
- 从 pagination navigation 的父 scrollport 和 `data-slot="pagination-content"` 读取真实 DOM 与
  computed style；不引入 production test hook。
- 断言 Content 的 column gap 为 8px。
- 在常规与受限宽度中断言 focused Previous、数字 Link、Next 四周至少有 4px scrollport 内部
  clearance；受限宽度必须真实产生 `scrollWidth > clientWidth`，并覆盖左右滚动边界。
- 用前后 sibling 的实际几何验证分页按钮与相邻内容仍保持现有 16px 外部节奏，不把内部 4px
  clearance 叠加为额外纵向空白。
- 保留当前翻页、`aria-current`、disabled、分页卸载、本地化和压缩分隔线居中断言，不放宽容差或
  删除覆盖。

TEST 的 red 完成条件预先定义为：目标 Browser 文件在 Chromium、Firefox、WebKit 中被实际收集；
新增 gap 断言观察到当前 4px 而期望 8px，新增 focus clearance 断言观察到至少一个 block 方向
小于 4px；现有断言仍通过。配置、类型、fixture、浏览器启动或零收集失败不算 red。

### FIX：局部样式修复

只修改 `TranscriptContextPagination.tsx`：

- 保留 HeroUI v3 compound API、`size="sm"`、`onPress`、`isDisabled`、`isActive` 与所有 ARIA 文案。
- 在当前 `Pagination.Content` 实例覆盖为 8px item gap，并给首尾内容提供 4px inline clearance。
- 在现有横向 scrollport 内提供上下各 4px clearance，同时以等量 block 负 margin 吸收新增内部
  空间，保持按钮位置和外部纵向 footprint。
- 保留 `overflow-x-auto`，不修改 HeroUI 全局 CSS、theme、ring、button 尺寸、圆角、颜色、
  hover/pressed/active 状态或分页算法。

若实现证据表明 4px clearance 无法完整容纳当前 HeroUI ring，或保持纵向 footprint 必须修改
renderer、boundary、全局 CSS、HeroUI sibling checkout、分页状态或测试配置，当前局部 owner 假设
失效，暂停受影响节点并回到计划范围确认。

## 工具链与精确命令

下列 workspace/Git 预检固定从 `/Users/jiangsheng/cnb/codex` 执行：

```bash
git status --short --branch
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
test -x /opt/homebrew/bin/fnm
test -d codex-gui/node_modules
command -v playwright-cli
```

所有 frontend 命令固定从 `/Users/jiangsheng/cnb/codex/codex-gui` 执行，fnm-backed pnpm 必须使用：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

若 pnpm 解析到 `/Users/<user>/.cache/codex-runtimes/`，或必要工具/输入缺失，暂停依赖节点；助手
不得安装或切换到其他 runtime。

focused red/green 与目标文件 closure 使用 `codex-gui-toolchain` 定义的 direct target 形式，避免
package script 对 positional filter 的收集不确定性：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run --config=vitest.browser.parallel.config.ts src/features/committedTranscriptSurface/__tests__/TranscriptContextPagination.browser.test.tsx
```

输出必须明确列出目标文件，并分别实际运行 Chromium、Firefox、WebKit；零测试或误收集不能作为
证据。

每个 TSX task 修改后使用 repository-owned formatter 入口：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
```

`format:oxfmt:fix` 会写整个 `codex-gui`。执行前必须先用非 fix `format:oxfmt` 证明当前 baseline
无格式漂移；运行后检查完整 diff，只允许当前 task 的精确文件出现新变化。出现其他文件变化时
暂停，不得自动 restore、吸收或提交。

最终静态检查使用：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Level 2 仅在取得当次完整 GUI URL 后使用无头入口：

```bash
playwright-cli open '<complete current GUI URL>'
playwright-cli list --json
```

`<complete current GUI URL>` 是执行时必须从当次 `/gui` 或 `launch_gui` 获得的动态输入，不是允许
猜测的占位值。`list --json` 必须证明 session 非 headed；否则 Level 2 保持未执行，禁止启动可见
浏览器作为 fallback。

## 执行上下文、任务提交与依赖

- 执行上下文固定为当前 `/Users/jiangsheng/cnb/codex` checkout 的 `dev` branch 和共享 Git index；
  不创建 worktree 或 branch。
- 不创建 worktree 的证据：DOCS 是全局实施前门禁；TEST 的失败回归是 FIX 的稳定输入；两项代码
  task 虽写不同文件，但 FIX 必须消费 TEST red，关键路径无法通过独立 worktree 缩短，额外集成只会
  增加同一目标 Browser 文件与 HEAD 的协调成本。
- task boundary 与提交信息：
  - DOCS：`docs(gui): plan context pagination focus spacing`
  - TEST：`test(gui): cover context pagination focus spacing`
  - FIX：`fix(gui): correct context pagination focus spacing`
- TEST 提交预期包含失败回归；中间提交不要求满足最终计划。FIX 之后的组合状态必须使该回归转绿。
- 禁止 squash、amend 或把三个 task 合并。格式化导致的纯顺序调整不得混入 TEST 或 FIX；若出现，
  暂停并重新判断独立 order-only task，而不是顺手提交。

## 描述式执行 DAG

以下节点是未来执行期权威结构。计划确认前所有 `authorizationGate` 均为
`pending-plan-confirmation`；确认后由 `$action-authorization` 为每个节点建立最小能力信封。
所有节点 `subdelegation: false`。

### D0：DOCS 审查

- `nodeId`: D0；`taskBoundary`: DOCS；`operationKind`: 审查
- `outcome`: 设计为“已确认”、计划为“已确认”，两文档与执行时 HEAD/dirty/index 一致
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: 无
- `consumes`: 用户计划确认、两文档、Git metadata；`produces`: DOCS allowlist 审查结论
- `completionEvidence`: 两文档存在且语义一致，whitespace check 无问题，index 无范围外内容
- `readSet`: 两文档、Git status/index/HEAD；`writeSet`: 无
- `stateEffects`: 只读审查；`commandScope`: 精确文件读取、`git status`、`git diff --check`
- `executionContext`: 当前 checkout/dev，共享 index read
- `resourceLocks`: canonical Git index read
- `owner`: DOCS review owner；`verification`: 状态、目标、隐私、范围、whitespace
- `failureDomain`: D0、D1、D2 与全部后继
- `replanTriggers`: HEAD/branch/文档/dirty/index 漂移改变范围
- `authorizationGate`: `pending-plan-confirmation`，只读审查信封
- `subdelegation`: false

### D1：DOCS 精确暂存

- `nodeId`: D1；`taskBoundary`: DOCS；`operationKind`: stage
- `outcome`: index 只包含本次 design 与 plan
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: D0，等待稳定 DOCS allowlist
- `consumes`: D0 审查；`produces`: DOCS staged snapshot
- `completionEvidence`: cached name list 精确等于两文档，cached diff/check 通过
- `readSet`: 两文档与 index；`writeSet`: `/Users/jiangsheng/cnb/codex/.git/index`
- `stateEffects`: 精确 stage；`commandScope`: `git add -- docs/superpowers/specs/2026/09/03/2026-09-03-codex-gui-context-pagination-focus-spacing-design.md docs/superpowers/plans/2026/09/03/2026-09-03-codex-gui-context-pagination-focus-spacing-plan.md` 及 cached 只读检查
- `executionContext`: 当前 checkout/dev，共享 index write
- `resourceLocks`: canonical Git index write
- `owner`: DOCS Git owner；`verification`: cached allowlist/content/whitespace
- `failureDomain`: D1、D2 与全部后继
- `replanTriggers`: ignored match、额外 staged 文件或 cached 漂移
- `authorizationGate`: `pending-plan-confirmation`，精确 stage 信封
- `subdelegation`: false

### D2：DOCS 独立提交

- `nodeId`: D2；`taskBoundary`: DOCS；`operationKind`: commit
- `outcome`: 创建只包含设计与计划的本地 DOCS commit
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: D1，等待 DOCS staged snapshot
- `consumes`: DOCS staged snapshot；`produces`: DOCS commit id
- `completionEvidence`: commit parent/message/文件列表正确，index 无范围外内容
- `readSet`: index、HEAD metadata；`writeSet`: Git object database、`refs/heads/dev`、index
- `stateEffects`: 一个本地 commit
- `commandScope`: `git commit -m 'docs(gui): plan context pagination focus spacing'` 与只读 show/status
- `executionContext`: 当前 checkout/dev
- `resourceLocks`: canonical index、object database、`refs/heads/dev` write
- `owner`: DOCS Git owner；`verification`: 无 amend/remote，commit 仅含两文档
- `failureDomain`: D2 与全部后继
- `replanTriggers`: parent/branch/message/scope 漂移
- `authorizationGate`: `pending-plan-confirmation`，本地 commit 信封
- `subdelegation`: false

### T1E：编写分页样式失败回归

- `nodeId`: T1E；`taskBoundary`: TEST；`operationKind`: 编辑
- `outcome`: 目标 Browser 文件增加 8px gap、4px clearance、16px 外部节奏与真实键盘 focus 覆盖
- `estimatedCost`: 中；`deferralEvidence`: 无
- `hardPredecessors`: D2，实施必须等待 DOCS commit
- `consumes`: 已确认设计、当前分页 DOM、Vitest Browser userEvent/locator API
- `produces`: TEST source diff
- `completionEvidence`: 只修改目标 Browser 文件，不新增 production hook、配置或 test helper
- `readSet`: 目标组件、目标测试、test utils、Vitest 本地 docs
- `writeSet`: `codex-gui/src/features/committedTranscriptSurface/__tests__/TranscriptContextPagination.browser.test.tsx`
- `stateEffects`: 工作树编辑；`commandScope`: `apply_patch` 与精确只读 diff
- `executionContext`: 当前 checkout/dev，禁止 index
- `resourceLocks`: 目标 Browser 文件 write
- `owner`: TEST edit owner；`verification`: 公开 DOM seam、真实 Tab、稳定几何条件
- `failureDomain`: T1E、T1F、T1V、T1S、T1C 与全部 FIX/Z 后继
- `replanTriggers`: 需要 production hook、测试配置或新的执行策略
- `authorizationGate`: `pending-plan-confirmation`，TEST 精确编辑信封
- `subdelegation`: false

### T1F：格式化 TEST

- `nodeId`: T1F；`taskBoundary`: TEST；`operationKind`: 格式化
- `outcome`: repository-owned formatter 处理 TEST diff 且不产生范围外变化
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: T1E，等待稳定 TEST source diff
- `consumes`: TEST diff、clean format baseline；`produces`: formatted TEST diff
- `completionEvidence`: fix 后仅目标 Browser 文件变化，随后非 fix check 通过
- `readSet`: `codex-gui/**` formatter 输入；`writeSet`: formatter 可写 `codex-gui/**`
- `stateEffects`: project-wide formatter 写入
- `commandScope`: fnm-backed `pnpm run format:oxfmt:fix` 与 `pnpm run format:oxfmt`
- `executionContext`: `codex-gui` cwd、当前 checkout
- `resourceLocks`: canonical codex-gui source tree write、formatter exclusive
- `owner`: TEST format owner；`verification`: 完整 diff 仅保留 TEST allowlist
- `failureDomain`: T1F、T1V、T1S、T1C 与全部后继
- `replanTriggers`: baseline 或 formatter 产生范围外/order-only diff
- `authorizationGate`: `pending-plan-confirmation`，project-wide formatter 信封
- `subdelegation`: false

### T1V：证明目标回归为 red

- `nodeId`: T1V；`taskBoundary`: TEST；`operationKind`: 验证
- `outcome`: 三浏览器实际收集目标文件，并精确命中预声明的 gap/clearance 失败
- `estimatedCost`: 中；`deferralEvidence`: 无
- `hardPredecessors`: T1F，等待 formatted TEST diff
- `consumes`: TEST diff、当前未修复 production；`produces`: red evidence
- `completionEvidence`: Chromium/Firefox/WebKit 均命中预声明 red，现有断言无新失败
- `readSet`: 目标测试、production、Browser runner inputs；`writeSet`: 无主动写目标
- `stateEffects`: Browser runner 内部临时状态
- `commandScope`: fnm-backed focused Vitest direct target 命令
- `executionContext`: `codex-gui` cwd、当前 checkout
- `resourceLocks`: Vitest Browser runner 与浏览器实例 exclusive
- `owner`: TEST verification owner；`verification`: 非零收集、三浏览器、失败归因
- `failureDomain`: T1V、T1S、T1C 与全部 FIX/Z 后继
- `replanTriggers`: red 未出现、根因被推翻、出现配置/类型/fixture/浏览器失败
- `authorizationGate`: `pending-plan-confirmation`，focused Browser 验证信封
- `subdelegation`: false

### T1S：暂存 TEST

- `nodeId`: T1S；`taskBoundary`: TEST；`operationKind`: stage
- `outcome`: index 只包含失败回归测试文件
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: T1V，等待稳定 red evidence
- `consumes`: formatted TEST diff、red evidence；`produces`: TEST staged snapshot
- `completionEvidence`: cached name list 为唯一目标测试文件，cached check/diff 正确
- `readSet`: TEST 文件、index；`writeSet`: canonical Git index
- `stateEffects`: 精确 stage；`commandScope`: `git add --` TEST 文件与 cached 只读检查
- `executionContext`: 当前 checkout/dev
- `resourceLocks`: canonical Git index write
- `owner`: TEST Git owner；`verification`: allowlist、red test 语义、无范围外 staged
- `failureDomain`: T1S、T1C 与全部 FIX/Z 后继
- `replanTriggers`: index 或 staged scope 漂移
- `authorizationGate`: `pending-plan-confirmation`，TEST stage 信封
- `subdelegation`: false

### T1C：提交 TEST

- `nodeId`: T1C；`taskBoundary`: TEST；`operationKind`: commit
- `outcome`: 创建只包含失败回归的独立本地 commit
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: T1S，等待 TEST staged snapshot
- `consumes`: TEST staged snapshot、red evidence；`produces`: TEST commit id
- `completionEvidence`: commit 文件/message/parent 正确，red evidence 与 commit 内容一致
- `readSet`: index、HEAD；`writeSet`: object database、`refs/heads/dev`、index
- `stateEffects`: 一个本地 commit
- `commandScope`: `git commit -m 'test(gui): cover context pagination focus spacing'` 与 show/status
- `executionContext`: 当前 checkout/dev
- `resourceLocks`: canonical index、object database、`refs/heads/dev` write
- `owner`: TEST Git owner；`verification`: 无 amend/remote，commit 仅含 TEST 文件
- `failureDomain`: T1C 与全部 FIX/Z 后继
- `replanTriggers`: commit scope、parent 或 message 漂移
- `authorizationGate`: `pending-plan-confirmation`，TEST commit 信封
- `subdelegation`: false

### T2E：实现局部分页样式

- `nodeId`: T2E；`taskBoundary`: FIX；`operationKind`: 编辑
- `outcome`: 当前 Pagination 实例使用 8px gap、四周 4px clearance，并保持外部纵向 footprint
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: T1C，等待已提交 red contract
- `consumes`: TEST commit、已确认设计、HeroUI 3.2.4 styles
- `produces`: FIX production diff
- `completionEvidence`: 只修改 `TranscriptContextPagination.tsx`，交互/ARIA/分页算法不变
- `readSet`: 目标组件、TEST commit、HeroUI local source/docs
- `writeSet`: `codex-gui/src/features/committedTranscriptSurface/TranscriptContextPagination.tsx`
- `stateEffects`: 工作树编辑；`commandScope`: `apply_patch` 与精确只读 diff
- `executionContext`: 当前 checkout/dev，禁止 index
- `resourceLocks`: 目标 production 文件 write
- `owner`: FIX edit owner；`verification`: class/DOM diff 只表达已确认 spacing/clearance
- `failureDomain`: T2E、T2F、T2V、T2S、T2C 与全部 Z 后继
- `replanTriggers`: 需要计划外 production/global/HeroUI/config 修改
- `authorizationGate`: `pending-plan-confirmation`，FIX 精确编辑信封
- `subdelegation`: false

### T2F：格式化 FIX

- `nodeId`: T2F；`taskBoundary`: FIX；`operationKind`: 格式化
- `outcome`: repository-owned formatter 处理 FIX diff 且不产生范围外变化
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: T2E，等待稳定 FIX diff
- `consumes`: FIX diff、clean format baseline；`produces`: formatted FIX diff
- `completionEvidence`: fix 后仅 production 文件变化，非 fix check 通过
- `readSet`: `codex-gui/**` formatter 输入；`writeSet`: formatter 可写 `codex-gui/**`
- `stateEffects`: project-wide formatter 写入
- `commandScope`: fnm-backed `pnpm run format:oxfmt:fix` 与 `pnpm run format:oxfmt`
- `executionContext`: `codex-gui` cwd、当前 checkout
- `resourceLocks`: canonical codex-gui source tree write、formatter exclusive
- `owner`: FIX format owner；`verification`: 完整 diff 仅保留 FIX allowlist
- `failureDomain`: T2F、T2V、T2S、T2C 与全部 Z 后继
- `replanTriggers`: formatter 产生范围外/order-only diff
- `authorizationGate`: `pending-plan-confirmation`，project-wide formatter 信封
- `subdelegation`: false

### T2V：证明目标回归转绿

- `nodeId`: T2V；`taskBoundary`: FIX；`operationKind`: 验证
- `outcome`: TEST commit 的同一 Browser 文件在三浏览器全部转绿
- `estimatedCost`: 中；`deferralEvidence`: 无
- `hardPredecessors`: T2F，等待 formatted FIX diff
- `consumes`: TEST commit、formatted FIX diff；`produces`: focused green evidence
- `completionEvidence`: 目标文件非零收集，Chromium/Firefox/WebKit 全部测试通过
- `readSet`: 目标测试、production、Browser runner inputs；`writeSet`: 无主动写目标
- `stateEffects`: Browser runner 内部临时状态
- `commandScope`: 与 T1V 完全相同的 focused Vitest direct target 命令
- `executionContext`: `codex-gui` cwd、当前 checkout
- `resourceLocks`: Vitest Browser runner 与浏览器实例 exclusive
- `owner`: FIX verification owner；`verification`: 8px、4px、16px及既有断言全部通过
- `failureDomain`: T2V、T2S、T2C 与全部 Z 后继
- `replanTriggers`: 同一测试不转绿或出现新的计划内失败
- `authorizationGate`: `pending-plan-confirmation`，focused Browser 验证信封
- `subdelegation`: false

### T2S：暂存 FIX

- `nodeId`: T2S；`taskBoundary`: FIX；`operationKind`: stage
- `outcome`: index 只包含目标 production 文件
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: T2V，等待 focused green evidence
- `consumes`: formatted FIX diff、green evidence；`produces`: FIX staged snapshot
- `completionEvidence`: cached name list 为唯一 production 文件，cached check/diff 正确
- `readSet`: production 文件、index；`writeSet`: canonical Git index
- `stateEffects`: 精确 stage；`commandScope`: `git add --` production 文件与 cached 只读检查
- `executionContext`: 当前 checkout/dev
- `resourceLocks`: canonical Git index write
- `owner`: FIX Git owner；`verification`: allowlist、无 TEST/DOCS/范围外 staged
- `failureDomain`: T2S、T2C 与全部 Z 后继
- `replanTriggers`: index 或 staged scope 漂移
- `authorizationGate`: `pending-plan-confirmation`，FIX stage 信封
- `subdelegation`: false

### T2C：提交 FIX

- `nodeId`: T2C；`taskBoundary`: FIX；`operationKind`: commit
- `outcome`: 创建只包含分页局部样式修复的独立本地 commit
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: T2S，等待 FIX staged snapshot
- `consumes`: FIX staged snapshot、focused green evidence；`produces`: FIX commit id
- `completionEvidence`: commit 文件/message/parent 正确，TEST commit 保持独立祖先
- `readSet`: index、HEAD；`writeSet`: object database、`refs/heads/dev`、index
- `stateEffects`: 一个本地 commit
- `commandScope`: `git commit -m 'fix(gui): correct context pagination focus spacing'` 与 show/status
- `executionContext`: 当前 checkout/dev
- `resourceLocks`: canonical index、object database、`refs/heads/dev` write
- `owner`: FIX Git owner；`verification`: 无 amend/remote，commit 仅含 production 文件
- `failureDomain`: T2C 与全部 Z 后继
- `replanTriggers`: commit scope、parent 或 message 漂移
- `authorizationGate`: `pending-plan-confirmation`，FIX commit 信封
- `subdelegation`: false

### Z1：最终静态检查

- `nodeId`: Z1；`taskBoundary`: 无提交，final verification；`operationKind`: 验证
- `outcome`: format、lint、type-check 在集成后的稳定 HEAD 通过
- `estimatedCost`: 中；`deferralEvidence`: 无
- `hardPredecessors`: T2C，等待稳定 DOCS+TEST+FIX commits
- `consumes`: integrated HEAD；`produces`: static verification evidence
- `completionEvidence`: 三个 repository-owned check 均退出 0，且无目标遗漏
- `readSet`: `codex-gui/**`、配置、node_modules；`writeSet`: 无主动写目标
- `stateEffects`: checker 内部 cache/临时状态
- `commandScope`: fnm-backed `format:oxfmt`、`lint`、`type-check`
- `executionContext`: `codex-gui` cwd、当前 checkout
- `resourceLocks`: frontend checker/cache resources
- `owner`: static verification owner；`verification`: 分别记录每个命令结果
- `failureDomain`: Z1、ZF
- `replanTriggers`: 本次引入的失败需动态插入修正；预存/无关失败需证据化区分
- `authorizationGate`: `pending-plan-confirmation`，只读静态验证信封
- `subdelegation`: false

### Z2：最终三浏览器回归

- `nodeId`: Z2；`taskBoundary`: 无提交，final verification；`operationKind`: 验证
- `outcome`: 目标 Browser 文件在稳定 HEAD 的三浏览器全部通过
- `estimatedCost`: 中；`deferralEvidence`: 无
- `hardPredecessors`: T2C，等待稳定 DOCS+TEST+FIX commits
- `consumes`: integrated HEAD；`produces`: final Level 1 evidence
- `completionEvidence`: 目标文件非零收集，Chromium/Firefox/WebKit 全部通过
- `readSet`: 目标测试、production、Browser inputs；`writeSet`: 无主动写目标
- `stateEffects`: Browser runner 内部临时状态
- `commandScope`: focused Vitest direct target 命令
- `executionContext`: `codex-gui` cwd、当前 checkout
- `resourceLocks`: Vitest Browser runner 与浏览器实例 exclusive
- `owner`: Level 1 verification owner；`verification`: 收集数、浏览器、断言结果
- `failureDomain`: Z2、ZF
- `replanTriggers`: 本次引入失败需动态修正，零收集不算通过
- `authorizationGate`: `pending-plan-confirmation`，Level 1 验证信封
- `subdelegation`: false

### Z3：Level 2 无头真实应用验收

- `nodeId`: Z3；`taskBoundary`: 无提交，final verification；`operationKind`: 验证
- `outcome`: 真实 Codex runtime 在常规/窄宽度与左右滚动边界下完整显示 focus ring 和既定间距
- `estimatedCost`: 中；`deferralEvidence`: 无
- `hardPredecessors`: T2C 与当次完整 GUI URL，等待稳定 HEAD 和真实 runtime 输入
- `consumes`: integrated HEAD、当次完整 URL、真实上下文分页状态；`produces`: Level 2 evidence
- `completionEvidence`: session 明确非 headed；8px gap、四边 ring、首尾滚动、按钮位置和纵向节奏通过
- `readSet`: 当前 GUI runtime/page state；`writeSet`: 无 workspace 写入
- `stateEffects`: 一个无头 browser session，不发送消息，验收结束保持 Composer 清洁
- `commandScope`: `playwright-cli open '<complete current GUI URL>'`、`list --json` 与无头交互/几何读取
- `executionContext`: 当前 checkout/dev 对应真实 runtime，无头 browser
- `resourceLocks`: 当次 GUI runtime/browser session exclusive
- `owner`: Level 2 acceptance owner；`verification`: URL、route、headed state、场景逐项记录
- `failureDomain`: Z3、ZF 的完整验证声明
- `replanTriggers`: URL/runtime/分页状态不可得或 headed state 不明确时标记未执行，不切换可见模式
- `authorizationGate`: `pending-plan-confirmation`，无头 Level 2 验收信封
- `subdelegation`: false

### ZF：最终 fan-in 与完成审查

- `nodeId`: ZF；`taskBoundary`: 无提交，final fan-in；`operationKind`: fan-in
- `outcome`: 综合提交、Level 1、Level 2、静态检查和工作树证据，判断计划是否完整完成
- `estimatedCost`: 低；`deferralEvidence`: 无
- `hardPredecessors`: Z1、Z2、Z3，分别等待 static、Level 1、Level 2 稳定证据
- `consumes`: 三个 task commits、Z1/Z2/Z3 evidence、Git status/index
- `produces`: 最终完成报告
- `completionEvidence`: 最终 HEAD 含三提交；index/allowlist 正确；所有适用验证通过；无范围外修改
- `readSet`: commits、diff、status/index、verification outputs；`writeSet`: 无
- `stateEffects`: 只读完成审查；`commandScope`: 精确 Git/diff/status 读取与证据汇总
- `executionContext`: 当前 checkout/dev
- `resourceLocks`: canonical Git metadata read
- `owner`: root coordination owner；`verification`: 不复用 FIX 前证据，不把未执行 Level 2 写成通过
- `failureDomain`: ZF
- `replanTriggers`: 任一前置证据失效时只重跑实际受影响节点
- `authorizationGate`: `pending-plan-confirmation`，final audit 信封
- `subdelegation`: false

## 初始 ready set、关键路径与反向审计

- 计划确认后的初始 ready set 只有 D0；D1、D2 受 DOCS 稳定产物硬依赖约束。
- 关键路径为 D0 → D1 → D2 → T1E → T1F → T1V → T1S → T1C → T2E → T2F → T2V →
  T2S → T2C → Z3 → ZF。TEST 必须先取得并提交 red，FIX 才能消费稳定回归契约；这不是由任务编号
  或 agent 复用制造的依赖。
- T2C 后 Z1、Z2、Z3 构成 fan-out；它们只读稳定 HEAD，工具与 browser session 资源不相交时应
  实际并行。ZF 是唯一 final fan-in。
- 反向审计没有发现可删除的串行边：DOCS commit 是全局实施门禁；TEST red 是 FIX 的必要输入；
  task 内 edit → format → verify → stage → commit 都等待前一稳定产物。不存在仅因文件顺序或惯例
  形成的依赖。
- 若 Z3 的当次 URL/runtime 输入尚未可得，Z1 与 Z2 仍应立即运行；只能暂停 Z3 与 ZF 的完整验证
  声明，不能阻塞无依赖 final checks，也不能用 Level 1 替代 Level 2。

## 最终完成条件

- DOCS、TEST、FIX 三个独立本地提交均存在且保持祖先关系，无 squash/amend/remote。
- 最终生产 diff 仅改变当前 Pagination 实例的 8px gap 与四周 4px focus clearance，并保持外部
  16px 纵向节奏、横向滚动和既有分页/ARIA 行为。
- 目标 Browser 文件在 Chromium、Firefox、WebKit 中非零收集并通过；format、lint、type-check
  通过。
- Level 2 无头真实应用验收通过。若当次完整 URL、runtime 或可用分页状态不可得，必须明确记录
  未执行并停止“计划完整完成”的声明，不启动可见浏览器。
- 工作树与 index 不含本计划引入的未提交变化；预存或无关变化保持原样并明确排除。
- 最终汇报固定包含 `实际并行`、`关键路径`、`未启动 ready 节点` 三项执行证据。
