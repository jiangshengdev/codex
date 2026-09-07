# Codex GUI 全部报错布局统一实施计划

日期：2026-09-07

状态：设计已确认，计划按用户要求落盘，待确认执行。当前仅创建文档，未实施、运行验证或提交。

设计：[全部报错布局统一设计](../../../../specs/2026/09/07/2026-09-07-codex-gui-unified-error-layout-design.md)。

基线：`dev`，`0985fd985`。实施前重新核对基线及工作树，保护无关改动。

## 1. 产品合同与交付范围

诊断属于内容，重试属于操作。宽屏内容在左、操作在右；小屏依次为标题、说明、诊断、重试。没有重试时省略操作区，诊断不补到右侧。全部错误遵循此规则，保留原有卡片、消息、菜单、内联、Toast、独立页面等载体。

不新增“恢复”按钮；不改错误文本的展示策略、原始诊断内容、按钮 variant、可用性、回调、错误归属、状态生命周期、队列及协议。无诊断或无操作的提示不新增空区域。

交付为一项完整布局行为修改及回归覆盖。共享布局和消费者属于同一行为任务，可由不相交编辑节点并行完成；不为拆提交保留临时双路径。文档先独立提交。对已有提交的修正另建独立提交，禁止 amend、squash、远程操作及强制暂存 ignored 文件。

## 2. 当前证据与修改集合

下列路径均相对 `codex-gui/`。生产调用继续由既有页面、会话及编辑器装配入口承接，不新增业务入口。

| 集合 | 文件与计划修改 | 现有证据 / 测试映射 |
| --- | --- | --- |
| S：共享布局 | 新建 `src/feedback/FailureLayout.tsx`、必要的 `src/feedback/failureLayout.css` | 当前诊断组件允许调用方指定定位 class，不能独自保证内容/操作分区；新建 `src/feedback/__tests__/FailureLayout.browser.test.tsx`，保留现有诊断 Modal 测试 |
| P：页面 | `src/features/appShell/AppShell.tsx`、`src/features/currentTask/CurrentTaskPage.tsx`、`src/NotFoundPage.tsx` | AppShell 诊断宽屏进入右列；CurrentTask 当前基本符合但有重复布局；404 的自带操作始终底部居中。测试：`src/__tests__/AppShell.browser.test.tsx`、`src/__tests__/NotFoundPage.browser.test.tsx` |
| H：历史 | `src/features/threadHistory/ContinueTaskFailureAlert.tsx`、`ThreadHistoryListPage.tsx`、`ThreadHistoryDetailContent.tsx` | 继续失败部分诊断进入右列；历史 Retry 始终在内容下方。测试：该 feature 下 `__tests__/ThreadHistoryDetailContinuation.browser.test.tsx`、`ThreadHistoryListPage.browser.test.tsx`、`ThreadHistoryDetailRead.browser.test.tsx` |
| C：保存与紧凑菜单 | `src/features/composerTurnControl/ComposerPersistenceStatus.tsx`、`src/features/composerEditor/SkillTypeaheadPlugin.tsx` | 保存错误诊断与重试在同组；技能菜单状态行只有横向 flex，没有窄容器重排。测试：`src/features/composerTurnControl/__tests__/ComposerTurnControlPersistence.browser.test.tsx`、`src/features/composerEditor/__tests__/ComposerEditorTypeaheadMenu.browser.test.tsx` |
| G：生成闭包 | `src/locales/en.po`、`src/locales/zh-CN.po` | 布局改变源码行号后的 Lingui 定位元数据；不新增或改变 message identity、翻译及状态 |

测试修改白名单为上表现有测试、共享布局新测试及 `src/feedback/__tests__/FailureDiagnosticModal.browser.test.tsx`。测试继续复用各自现有 helper，不新增协议样本或跨功能测试总入口。

已核对、预期无需改动的入口：`CommittedTranscriptTurnFragment`、`CommittedTranscriptSurfaceRenderer` 的无操作错误；`ComposerPendingInputEditor`、`ComposerPendingInputDrawer` 的说明型反馈；`SelectedSkillToken` 的无效状态文字；`ContinueTaskAction` 的失败 Toast。保留它们的信息、严重性和载体，不为“全部覆盖”制造无效果修改。

`ContextUsagePopover` 的压缩按钮、`ComposerTurnControl` 的停止按钮属于原有工具栏/编辑器操作，按设计不搬入错误提示；内联错误留在原位置。`ComposerPersistenceStatus` 的非错误队列业务与继续发送规则不改。`NotFoundPage` 保留 Typography、Link、路由及现有链接目标，只调整其错误内容与自带操作布局。

## 3. 实现机制

共享 `FailureLayout` 只接受内容和可选操作两个展示槽，不接收业务 error、retry policy 或状态 owner。内容槽由调用方保留现有 HeroUI `Alert.Content`、标题、说明及诊断；操作槽保留原有按钮。组件不负责翻译或诊断格式化。

卡片保留 `Alert.Indicator` 与原 Alert 严重性；内容与操作布局使用一个 DOM 来源。可用宽度足够时操作置右并顶部对齐，空间不足时置于完整内容之后并左对齐。优先采用组件容器查询，使宽视口下的狭窄菜单也能正确重排；以项目 `sm` 对应尺度为初始参考，并用实际载体几何验收确定 CSS。断点与 CSS 组织属于实现机制，不新增用户决策。

紧凑载体复用内容/操作机制，不套用 Alert 卡片外壳。多操作区保留既有操作顺序，内部可换行，不能溢出。诊断永远不进入操作槽。无操作时不渲染空操作包装或空列。

诊断弹窗继续沿用 `FailureDiagnosticModal`，保留 `secondary`、尺寸语义、Escape、内部滚动及焦点返回。消费者删除让诊断进入操作列的定位 class，由共享布局的内容槽确定区域；不改诊断组件内部实现或创建第二种诊断实现。

不移动无关 import、声明或函数。自动格式化若产生独立的非行为重排，须与行为修改拆成独立提交；不能为规避检查关闭排序或手工制造生成物。新增必要引用不构成顺手重排旧代码。

## 4. 工具及验证入口

已读 `package.json`、`.github/workflows/codex-gui.yml`、Vitest shared/parallel 配置及本地 Vitest 文档。CI 的 quick 链使用 `format:oxfmt`、lint、type-check 等；full-browser 使用 `test:browser`。本任务使用相关子入口，不运行带安装步骤的 CI 配置。

已核对 `/opt/homebrew/bin/fnm` 存在，fnm 解析 pnpm 为用户 Node v24.17.0 下的 `10.34.5`，不属于 Codex runtime shim；现有 node_modules 内有 oxfmt、Vitest、tsc，浏览器缓存存在。尚未实际启动浏览器，缓存存在不等于可启动证据。执行前重复工具与浏览器版本预检，缺失时报告用户自行安装，助手不得安装。

以下前端命令 cwd 为 `/Users/jiangsheng/cnb/codex/codex-gui`：

```bash
/opt/homebrew/bin/fnm env --shell zsh
/opt/homebrew/bin/fnm exec --using-file which pnpm
/opt/homebrew/bin/fnm exec --using-file pnpm --version
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

格式修复优先原生 oxfmt。项目 `format:oxfmt:fix` 固定写整个包，会触及范围外文件，因此仅对 S/P/H/C/G 中实际修改文件运行 `pnpm exec oxfmt <逐项列出的文件> --write`，仍使用 fnm 前缀，随后执行上面的非 fix 检查。尖括号是实施时依据 allowlist 展开的参数说明，不是可直接执行的 shell 命令。无关既存格式问题单独报告，不扩大写集合。纯前端与文档不触发仓库 `just fmt`。

Level 1 通过已核对的无头三浏览器入口执行以下目标；新文件须先存在，确认实际收集的文件、浏览器和最终测试数：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel src/feedback/__tests__/FailureLayout.browser.test.tsx src/feedback/__tests__/FailureDiagnosticModal.browser.test.tsx src/__tests__/AppShell.browser.test.tsx src/__tests__/NotFoundPage.browser.test.tsx src/features/threadHistory/__tests__/ThreadHistoryDetailContinuation.browser.test.tsx src/features/threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx src/features/threadHistory/__tests__/ThreadHistoryDetailRead.browser.test.tsx src/features/composerTurnControl/__tests__/ComposerTurnControlPersistence.browser.test.tsx src/features/composerEditor/__tests__/ComposerEditorTypeaheadMenu.browser.test.tsx
```

先对实际生产入口写几何回归，至少让“AppShell 宽屏诊断被放到右侧”与“保存失败小屏诊断/重试顺序错误”在修改前失败，记录断言与结果；只运行涉及的测试文件取得红灯，不把组件缺失导致的加载错误当回归证据。已有保存测试约束诊断在 Retry 右侧，与已确认设计冲突，应修改为新几何合同并保留交互覆盖，不删除测试。

绿灯矩阵：宽屏 1280、小屏 375，并包含宽视口下狭窄容器、长说明、长按钮文本、中英文、四种按钮存在组合；轮换有无重试后诊断保持内容区。断言实际几何及 DOM/焦点顺序，验证没有溢出、空位、重复按钮。保留重试回调、disabled、诊断完整性、打开/关闭/焦点返回及原有错误归属断言。不把 CSS 类名或截图更新作为唯一证据，不降低既有检查。

不改变协议、owner 或纯逻辑，因此不安排 Rust、后端构建或全量纯逻辑测试。若实现改变了既有逻辑，优先纠正该越界，而不是用额外测试默许设计扩大。

## 5. 生成边界

权威入口为 `pnpm run messages:extract`，cwd 同上并使用 fnm 前缀。输入 owner 为 `lingui.config.ts` 及其配置的 `src`，排除截图和 trace；source locale 为 `en`，完整输出为 `src/locales/en.po` 与 `src/locales/zh-CN.po`。

首次 extraction 后审查完整 diff；仅接受能回指现有 message 的 `#:` 定位元数据变化。`msgid`、`msgstr`、`#.` 语义、fuzzy/obsolete 不得发生计划外变化，本计划不需要人工翻译。再次运行相同入口，比较两次文件内容证明稳定，不手写旧行号。无变化则不制造 catalog 提交内容。生成范围外、语义漂移或不稳定时暂停 G 及消费者并诊断，不能全量接受 generated 文件。

## 6. Level 2 与当前环境缺口

实施后需在当前真实 Codex GUI 无头验收改变的页面、诊断与操作组合、紧凑菜单、历史及保存失败载体。覆盖宽窄屏、狭窄容器、交互与焦点；只读取或操作测试专用会话中明确可安全操作的状态，不向用户正在运行的任务发送、重试、停止或故意制造存储/连接故障。

计划编写时工具列表未发现外层 `launch_gui`，尚未取得当次完整 GUI URL，也未证明所需真实错误状态可用。执行时先重新发现该能力，或使用用户当次提供的 `/gui` 输出；禁止猜测、拼接或复用历史 URL。浏览器只能使用经 toolchain 预检的无头入口，并核对会话明确非 headed。必须确认加载的是本次前端源码。

缺少 URL、当前 runtime、真实场景或安全操作授权时，仅相应 Level 2 场景标为未执行并等待所需输入；其他实现、Level 1 和代码核对继续。测试 fixture、请求 mock、页面注入和伪造错误不能冒充真实状态。需要额外有状态故障注入时先说明目标与副作用并取得授权。

Level 3 不适用，不打开可见浏览器、DevTools 或报告窗口。Level 2 未完成时不得声称计划完整验收。

## 7. 描述式执行 DAG

本节是执行结构，不是图形。所有实现节点目前 `authorizationGate.status=pending`，待用户确认本计划执行；文档落盘不激活这些节点。

共同字段（每个节点继承，表内覆盖）：

- `executionContext`：`/Users/jiangsheng/cnb/codex`，分支 `dev`，共享当前 worktree 和 `.git/index`；本计划不创建 worktree/branch，无相关创建命令。所有编辑节点属于同一个行为提交任务，因此可在共享 worktree 修改不相交文件。
- `owner`：主代理为协调及唯一 format/generate/stage/commit owner；S/P/H/C 可分配具名且边界明确的子代理；独立审查由未修改该产物的子代理完成。`subdelegation=false`。
- `readSet`：该节点对应集合的当前源码、直接导入、现有测试 helper、设计、计划及适用规则。验证节点读取整个 frontend manifest/config 和 S/P/H/C/G 的稳定组合。`writeSet` 只取表内集合；只读节点为空。
- `resourceLocks`：各集合实际文件 canonical 路径按 read/write 加锁；共享布局发布后只读。format/generate 为对应写集合独占；runner 独占 `/Users/jiangsheng/cnb/codex/codex-gui` 的测试运行资源与产物；Git 写节点独占 `/Users/jiangsheng/cnb/codex/.git/index`；运行记录仅协调 owner 可写。相交读写不得并发，锁释放后重算 ready set，不补造依赖。
- `stateEffects`：编辑为白名单文件修改；验证为项目命令正常产生的缓存/测试产物；生成仅 G；stage/commit 为精确 allowlist 的本地 Git 状态。不得主动清理无关文件或产物。
- `commandScope`：调查仅只读搜索/读取；编辑仅普通源码 patch；验证仅第 4–6 节预检通过的入口与目标；生成仅第 5 节；Git 仅本地 status/diff/check-ignore/add/commit，禁止 force/remote/amend。
- `deferralEvidence`：默认无。共享 runner 的争用用资源锁解释，不把任意并发数量当工程上限。
- `authorizationGate`：用户确认执行后由 action-authorization 将各节点动作、目标、副作用与父授权取交集，建立最小能力信封；返回即到期，新增能力先更新信封。
- `replanTriggers`：基线、读写集合或接口失真时重算；需要新增产品行为、外部动作或目标范围时暂停对应后继请求授权。计划内失败先诊断、修正与重验，不自动结束任务。
- `failureDomain`：本节点不稳定产物及其实际消费者，除共享前提失效外不传播至独立分支。

| nodeId / taskBoundary | operationKind / owner / estimatedCost | hardPredecessors（原因） | consumes → produces / completionEvidence | writeSet / verification |
| --- | --- | --- | --- | --- |
| D / 文档提交 | commit / 主代理 / 小 | 用户确认执行（授权） | 已确认设计与计划 → 独立文档 commit id；暂存 diff 无无关文件 | 仅设计、计划；check-ignore、staged diff 与 diff check |
| R1 / 布局行为 | 编辑 / 页面测试子代理 / 中 | D（落盘计划执行前文档须提交） | 旧生产布局 → 两项可复现几何回归断言源码 | AppShell、保存 Browser 测试；只写测试不运行 |
| R2 / 布局行为 | 验证 / 主代理 / 中 | R1（断言稳定） | 旧生产代码与新断言 → 指定几何失败证据 | 无主动源码写；相关 Browser 文件收集且按预期失败 |
| S / 布局行为 | 编辑 / 共享布局子代理 / 中 | D（文档提交） | 设计合同 → 尚未接入生产的稳定共享接口、CSS、基础测试源码 | S；交接精确 props、文件版本及布局约束 |
| P / 布局行为 | 编辑 / 页面子代理 / 中 | S（消费共享接口）、R2（旧生产红灯） | 共享布局 → 页面与 404 接线及测试 | P 对应源码/测试；布局与业务边界自查 |
| H / 布局行为 | 编辑 / 历史子代理 / 中 | S（消费共享接口） | 共享布局 → 历史接线及测试 | H 对应源码/测试；保留现有回调和说明 |
| C / 布局行为 | 编辑 / 保存与菜单子代理 / 中 | S（消费共享接口）、R2（旧生产红灯） | 共享布局、R1 测试 → 保存及菜单接线与测试 | C 对应源码/测试；窄容器和保存门禁自查 |
| F / 布局行为 | 格式化 / 主代理 / 小 | P,H,C（组合源冻结） | S/P/H/C → 原生格式化后的稳定源码 | 仅实际修改文件；完整 diff 无无关重排 |
| G / 布局行为 | 生成 / 主代理 / 小 | F（稳定 source references） | 源码与 Lingui 配置 → catalog 闭包与稳定证据 | G；完整字段分类及重复 extraction 稳定 |
| V1 / 布局行为 | 验证 / 主代理 / 中 | G（最终生成物） | 稳定组合 → 格式、lint、type-check 通过 | 无主动源码写；第 4 节检查入口 |
| V2 / 布局行为 | 验证 / 主代理 / 大 | G（最终组合） | 稳定组合 → Level 1 三浏览器绿灯 | 无主动源码写；第 4 节 Browser 目标 |
| A / 无提交 | 审查 / 独立子代理 / 中 | G（完整 diff 稳定） | 设计、最终 diff、入口清单 → 无未处理问题的审查报告 | 空；反查全部入口、排除项、回调/数据保持、单一 DOM |
| L / 无提交 | 验证 / 主代理 / 大 | G（真实前端必须为最终源码）；当次 URL/场景/安全门禁 | 真实状态 → Level 2 分场景记录 | 仅正常浏览器产物；第 6 节；不得把环境缺口标通过 |
| K / 布局行为提交 | commit / 主代理 / 小 | V1,V2,A（组合检查及独立审查通过） | 稳定组合 → 单独行为 commit id | 精确 S/P/H/C/G 实际 diff；只暂存非 ignored 文件 |
| Z / 无提交 | fan-in / 主代理 / 小 | K,L 及全部计划内修正（最终状态与适用验收） | commit、验收与审查 → 完成结论 | 空；核对 Git 状态及证据对应最终文件版本 |

授权满足后的初始 ready set 为 D；D 完成后 R1 与 S 同时就绪，新增且尚未接入生产的布局不需要等待红灯。R2 等 R1 的断言稳定；若 S 尚在写源码，因 Browser typecheck 会读取同一源码树，R2 等待该文件写锁释放，不建立 S→R2 的假产物依赖。H 在 S 完成后就绪，与 R2 的源码读写冲突只通过锁调度。P/C 在 S 与 R2 完成后就绪；三编辑分支可以重叠，不等待其中某个分支提交。F/G 是共同可变输入的必要汇合点。G 后 V1/V2/A/L 无产物依赖；实际启动根据源码读锁、runner 和浏览器资源锁调度，独立 A 可与检查并行。粗粒度关键路径为 D→较慢的共享布局/回归准备→R2→最长编辑分支→F→G→较慢验证/验收→Z。

独立范围核对已发现并补入 NotFoundPage 和技能菜单窄容器；没有把 CurrentTask 已符合分支或无按钮提示强制重写。三编辑分支写集合不相交；同任务共享 index 只有主代理可写，子代理不能暂存。无跨任务并行提交或集成，故不引入 worktree、merge 或 cherry-pick。

K 不依赖 L，可在真实场景缺失时保留已验证代码的本地提交，但 Z 必须等全部适用验收完成。后续验收发现问题则创建修正节点及独立新提交，再运行受影响验证；不 amend，也不要求中间提交各自满足整个计划。

执行事件和动态节点由协调 owner 在会话内记录，固定计划正文不回写为执行日志。需要落盘额外执行文件时另行明确路径与文档授权。

## 8. 提交及完成门槛

执行确认后的文档提交只包含本计划与对应设计。行为提交只包含上述实际修改源码、测试、必要 CSS 和生成 catalog。提交前对精确文件检查 ignore 与暂存 diff，执行 `git diff --cached --check`；不强制暂存，不加入无关文件。已有提交修正、必须发生的非行为重排分别独立提交。

全部编辑汇合、生成稳定、静态检查、Level 1、独立复核与所有适用 Level 2 场景通过，计划内修正形成独立提交后才判定完成。禁止降低测试、隐藏失败或以环境缺口代替通过。缺失环境只阻断相应节点，继续其他安全且已授权工作。

最终汇报包含改动、提交、各验收层结果与局限，并按执行图契约列出实际并行、关键路径、未启动 ready 节点及原因。当前仅落盘计划，以上执行节点均未启动。
