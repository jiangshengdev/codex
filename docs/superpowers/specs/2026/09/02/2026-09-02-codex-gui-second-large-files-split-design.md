# Codex GUI 第二轮大文件拆分设计

## 状态

- 设计状态：已确认
- 确认日期：2026-09-02
- 日期：2026-09-02
- 当前分支：`dev`
- 设计基线：`d8b78558256b1263036b9bc6a5d3f640d5b0921f`
- 候选报告：`codex-gui/.reports/large-files.md`
- 报告生成时间：`2026-09-02T09:39:09.382Z`
- 前序设计：
  `docs/superpowers/specs/2026/09/02/2026-09-02-codex-gui-large-files-split-design.md`

本文定义第二轮 Source 与 Test 大文件候选的职责判断、Module seam、owner、不变量和批次范围。
本文不是 implementation plan，不定义任务提交、精确执行命令、worktree 或执行 DAG，也不授权修改
production、测试、生成物、Git index 或提交历史。

## 唯一主目标

在不改变产品行为、外部 Interface、状态语义、生成合同、渲染性能和测试覆盖的前提下，基于当前
`large-files.md` 重新评估并设计第二轮 Source 与 Test 大文件拆分。

## 与第一轮的关系

第一轮已经完成 queue private owner、UI Module、renderer、history page 和 Test behavior suite 拆分。
第二轮只消费第一轮落地后的当前代码事实，不把第一轮结论永久化，也不因文件仍在 Top 10 就假定
第一轮失败。

当前报告中的行数、字节数和 Top 10 排名仍是启发式信号，不是拆分阈值、验收目标或 CI gate。
第二轮重新检查每个候选是否存在：

- 独立变化轴；
- 单一且可说明的状态或生成 owner；
- 小而稳定的 Interface；
- 删除新 Module 后会重新泄漏到多个调用族的真实复杂度；
- 可以通过现有生产 Interface 和完整测试集合验证的 seam。

若候选只允许搬类型、函数段、switch、私有 helper 或一组必须共享父对象内部可变状态的 callback，
则不构成 deep Module 拆分。

## 总体设计原则

### 保持单一 owner

- ordinary、start、steer、pending identity、active turn、interrupt 和 recovery 各自只有一个状态 owner。
- transcript placement/chunk/fragment indexes 继续由一个 mutation kernel 原子维护。
- active thread candidate preparation、handoff、publication 和 cleanup 继续由一个 activation transaction
  owner 维护。
- protocol schema、Rust 生成 TypeScript、metadata、runtime validator 与声明文件继续只有一条权威派生链。
- Test support 可以隐藏纯 fixture construction，但不得拥有生产行为语义或跨文件共享可变状态。

### 保持外部 Interface

第二轮不新增 command bus、兼容 facade、旧新双入口、adapter、fallback、test-only production export、
第二状态 owner 或 consumer-owned contract mirror。

Source 拆分只允许新增 feature-private 或 script-private Implementation Module。现有生产调用方继续通过
原有 public Interface 使用行为，Test 继续穿过同一 Interface 验证。

### Test 按行为族拆分

Test 文件长度只触发调查。可拆 Test 必须具备独立行为族、fixture 使用差异或失败模型；不得为了减行数：

- 删除、合并、改写或参数化既有场景；
- 改变完整 test name、参数矩阵、断言或 test registration；
- 把 Browser 测试移入 sequential config；
- 缩小 Chromium、Firefox、WebKit 覆盖；
- 用 unit test 替代现有 Browser 纵向覆盖；
- 让一个 test 文件 import 另一个 collected test 文件复用 helper。

## Source 候选结论

| 当前文件 | 第二轮结论 | 设计依据 |
| --- | --- | --- |
| `src/features/composerInputQueue/composerInputQueue.ts` | 暂不拆 | 已是 ordinary/start/steer/identity/interrupt/recovery 的唯一跨 owner 编排层 |
| `src/features/composerInputQueue/composerSteerQueueState.ts` | 暂不拆 | scheduling order 跨 unsent、pending、rejected、recovery 与 closed target，不能只由 unsent lane 拥有 |
| `src/features/composerTurnControl/composerPendingInputSession.ts` | 暂不拆 | generation、pages、edit、focus effects、completion hold 与 publication 共同构成单一 session transaction |
| `src/features/transcriptState/transcriptStateImplementation.ts` | 暂不拆 | placement、chunk、fragment、entry indexes 与 revision 必须原子维护 |
| `src/features/activeThreadSession/activeThreadSession.ts` | 暂不拆 | candidate preparation、release handoff、staged dispatch、publication 与两阶段 cleanup 是同一 activation transaction |
| `scripts/protocolValidators/typescriptArtifacts.ts` | 延后 | 当前可见拆法要么收益过小，要么恢复历史浅 Module；后来的 auxiliary contract 也使旧结构不可直接复用 |
| `src/features/composerInputQueue/composerInputQueueCoordinator.ts` | 暂不拆 | coordinator 继续唯一拥有 RPC delivery、interrupt、recovery、release、generation 与 snapshot publication 编排 |
| `src/features/composerInputQueue/composerPendingInputLiveManagement.ts` | 暂不拆 | 第一轮刚形成的 management/replay transaction deep Module，继续保持单一 owner |
| `scripts/protocolValidators/core.ts` | 拆分 | standalone runtime validator 生成已经形成可复用的 schema closure、Ajv compile 与 bundle seam |
| `src/features/activeThreadSession/liveActiveThreadSession.ts` | 暂不拆 | 它是一个完整 live session adapter；没有第二个独立状态 owner 或调用族证明新的 seam |

## Source 拆分：standalone validator artifact Module

### 新 Module 的职责

从 `scripts/protocolValidators/core.ts` 提取 script-private
`standaloneValidatorArtifacts.ts`。该 Module 完整隐藏：

- 从 schema bundle 收集 selected closure；
- 验证 root schema 存在；
- 拒绝 selected closure 内重复 `$id`；
- 稳定派生 validator export name；
- 配置并执行 Ajv compile；
- 保持 standalone validator source opaque；
- 生成 browser ESM validator bundle；
- 返回 artifact 内容与 validator exports 的确定性结果。

`core.ts` 保留：

- app-server request、notification 与 auxiliary schema 的输入选择；
- GUI Host contract 的输入选择；
- app-server 与 GUI Host artifact-family 编排；
- TypeScript artifact builder 调用；
- 顶层 artifact map 组合。

### Interface 方向

新 Module 的 Interface 只接受完成 standalone artifact family 所需的 typed 输入：

- schema bundle；
- schema identity 与 root schema IDs；
- artifact basename；
- Ajv error-message policy；
- 已有可替换 generator dependencies。

它只返回生成后的 artifacts 与 validator exports，不向 caller 暴露 schema closure 的内部对象、Ajv 实例、
mutable Map、AST helper 或 formatter callback 集合。

该 seam 有两个真实消费族：app-server runtime groups 与 GUI Host registry profile。删除新 Module 后，schema
closure、duplicate-ID、export naming、Ajv 与 browser bundling 复杂度会重新出现在两个调用族，满足 deletion
test。

### 生成合同不变量

- Rust schema JSON、Rust 生成 TypeScript 和 metadata 仍是权威输入。
- `RequestResponse<M>`、`Extract<...>["params"]`、`Partial`、`Required`、`Pick` 等机械派生保持不变。
- missing schema、unresolved ref、duplicate `$id`、duplicate export、Ajv compile 和 formatter error 必须继续
  直接失败。
- artifact filename、header、imports、exports、排序、declaration alignment 与 complete artifact set 不变。
- 拆分前后所有 generated artifact 必须 byte-for-byte 相同。
- 不修改 `src/generated/**`，不接受生成物基线变化。

### 未选择的 Source 方案

#### 不提取 unsent steer lane

`composerSteerQueueState.ts` 的 slot/edit/read/move 确实形成连续代码簇，但 `intentOrder` 会跨越：

- unsent edit save 与 reorder；
- pending claim；
- target close 后的 rejection batch；
- rejected take/restore；
- outstanding recovery transfer；
- closed-target late enqueue。

若只提取 unsent lane，父 Module 必须持续注入 recovery blocker、共享 scheduling order，并跨 seam 读取或更新
rejection ordering。该 Interface 会泄漏 outer state，不能以 `composerOrdinaryQueueState` 的形似结构替代因果
证据。

#### 不继续拆 queue root

`composerInputQueue.ts` 已经是跨 private owner 的 orchestration seam。pending page/detail/edit/delete/move
共同依赖 ordinary、steer、identity、known IDs 与 active edit；start、terminal、interrupt 与 recovery 还会共同
推进 display identity 和 effects。继续拆会产生宽 callback Interface 或第二 owner。

#### 不恢复历史 TypeScript artifact 拆分

历史提交曾把 `typescriptArtifacts.ts` 拆为多个文件，随后被整体 revert。revert 信息没有提供技术失败或产品
否定证据，因此它既不是永久禁止，也不是恢复旧结构的授权。旧结构包含只承载少量 AST/types helper 的浅
Module，并且早于当前 auxiliary schema contract；第二轮不直接复用。

## Test 候选结论

当前报告中的 10 个 Test 候选都存在独立行为族，第二轮全部纳入 Test 拆分设计。纳入不改变测试语义，
也不推导 production Source 必须按相同族拆分。

### Composer pending-input Browser

保留 `ComposerTurnControlPendingInput.browser.test.tsx` 作为综合 pending Drawer/session suite；新增
`ComposerTurnControlPendingInputReordering.browser.test.tsx`，迁移完整的 reordering 行为族：

- authoritative owner move；
- move 后 menu/item focus；
- independent lane page budgets；
- no-op 不公告、不刷新；
- atomic two-lane stale refresh；
- continuous stale cutoff 与恢复；
- owner-projected move blockers；
- move failure 与 stale callback。

综合简体中文场景继续留在原文件，因为它同时覆盖 Guide、pending summary、Drawer 与 move 文案。
edit/delete、projection availability、closing/presence 继续留在原综合 suite。

两个 collected files 可以共享非测试 harness Module，但每次 factory 调用必须创建全新的 mocks、listeners、
details、cursor facts 和 session role adapter。file-local `beforeEach`/`afterEach` 不进入 support Module。

### Composer Editor typeahead Browser

把 `ComposerEditorTypeahead.browser.test.tsx` 拆为两个 sibling：

- Menu/presentation：accessible list、drawer placement、scroll owner、catalog states、collision paths、layout、
  hover 与 overflow；
- Selection/ownership：multi-editor IDs、query replacement、keyboard priority、Enter/Escape/Tab、pointer/touch
  selection 与 focus retention。

共享 support 只包含 per-call render、基础 fixture、纯 skill/catalog builder 与 controller getter。
Drawer geometry、DOM/CSS probes 留在 Menu；navigator mutation、caret/Selection helper 与 shortcut owner 留在
Selection。两个 sibling 都保持自己的 pointer reset。

### Composer queue start unit

把 `composerInputQueueStart.test.ts` 拆为三个 sibling：

- Start claim/settlement：idle claim、client identity、release blockers、FIFO、invalid input、settlement ownership、
  delivery unknown 与 definite rejection；
- Runtime observation：turn-start/commit arrival order、delivery-unknown convergence、foreign facts、matching
  candidate、evidence eviction、identity reuse 与 terminal replay；
- Interruption/recovery：local stop restore、cursor/detail invalidation、rejected steer 与 ordinary ordering、完整
  submit-to-recovery single-ownership sequence。

全部断言继续穿过 `ComposerInputQueue` Interface，不直接测试 private start/evidence owner。

### Composer Editor skill-token Browser

把 `ComposerEditorSkillTokens.browser.test.tsx` 拆为两个 sibling：

- Atomic selection/editing：delete/undo/redo、多 NodeSelection、mouse/Shift-click、pointer replace/delete/restore
  与 double-click atomicity；
- Presentation/catalog validity：inline geometry、HeroUI Chip/Tooltip、ARIA、Tab traversal、catalog status、invalid
  path 与 sibling collision re-projection。

共享 support 只承载 per-call render/catalog/Lexical DOM builder。support 不注册 hooks，不匹配 Browser test glob。

### Coordinator management unit

把 `composerInputQueueCoordinatorManagement.test.ts` 拆为三个 sibling：

- Replay：accepted-event mailbox、reentrant mutation gate、FIFO replay、listener/final publication failure 与未消费
  runtime facts；
- Lifecycle：edit ownership、authoritative revision、synchronous owner replacement、steer target invalidation 与
  draft-free outcome；
- Recovery：management drain、ordinary/steer recovery ordering 与 recover-listener disposal。

accepted-event FIFO 纵向断言必须完整保留，不能降为 live-management private Module 的窄单测。

### Protocol validator unit

删除聚合的 `scripts/protocolValidators/core.test.ts`，拆为：

- input selection；
- app-server artifacts；
- GUI Host artifacts。

非测试 support Module 只共享 immutable fixture builders 与 artifact inspectors。三个 test sibling 保留行为断言、
artifact-family 常量和 determinism 场景；不得让 test 文件互相 import，也不得缓存生成结果。

### Transcript live-item lifecycle unit

把 `transcriptStateLiveItemLifecycle.test.ts` 拆为：

- Settlement：started-to-completed、empty completion removal、phase reclassification、completed-only 与 visible
  count；
- Placement：slot order/dedup、later-item identity、shared-chunk targeted removal、historical chunk identity 与
  chunk capacity。

每个 sibling 自己持有 session revision 和 action adapter，不共享 module-level mutable revision。

### Composer pending-input reordering unit

把 `composerPendingInputReordering.test.ts` 拆为：

- Movement：ordinary/steer move table、1-based projection、revision/CAS、cursor/no-op、invalid keys、edit 与
  outstanding-recovery blocker；
- Scheduling：ordinary/steer identity、next claim/promotion、pending prefix、target close、rejected restore 与
  recovery restore。

两个 sibling 都保留 ordinary 与 steer 的对照，禁止按 lane 拆分，否则会削弱 cross-lane parity 与独立 FIFO
不变量。

### Coordinator delivery unit

把 `composerInputQueueCoordinatorDelivery.test.ts` 拆为：

- Start delivery：`deliveryUnknown`、`definitelyNotAccepted` 与 accepted/unknown interruption evidence；
- Interrupt delivery：local stop recovery、non-local auto-drain、terminal cleanup、late settlement、mismatch 与
  disposal；
- Steer delivery：steer identity/commit release、structured payload、opaque draft 与 terminal rejected merge。

每个跨阶段纵向场景整体迁移，不拆成只检查 mock call 的薄测试。

### Transcript item policy unit

保留 `transcriptItemPolicy.test.ts` 的 non-collab policy，新增
`transcriptCollabAgentItemPolicy.test.ts` 承载完整 collab-agent behavior family 及其专属 helpers。

collab 场景继续贯通 started/completed projection 与 `transcriptEntryView`；不按 started、terminal、presentation
实现层继续细分。

## Test support 与 collection 不变量

- 新 support 文件不得匹配 `*.test.ts`、`*.browser.test.ts` 或 `*.browser.test.tsx`。
- support Module 不注册 `beforeEach`、`afterEach`、`vi.mock` 或 collected tests。
- 每个 Browser sibling 自己建立并恢复 DOM、pointer、navigator、observer、timer、RAF、Toast 和 mock state。
- 每个 Browser sibling 继续由 parallel config 在 Chromium、Firefox、WebKit 三个实例执行。
- 拆分前后的完整 test-name multiset、参数展开矩阵和断言数量保持一致。
- 新旧源码注册点与真实 collection 必须同时核对；命令 exit 0 或默认 glob 命中不能替代 collection 证据。
- 不增加 `skip`、`todo`、`only`、`passWithNoTests`，不改变 config 或 Browser matrix。

## 验证设计

### Source 结构验证

- 新 standalone Module 的 Interface 只暴露 typed input/result，不暴露 Ajv、closure Map 或 mutable callback
  collection。
- `generateProtocolArtifacts` 与 `generateGuiHostContractArtifacts` 的现有外部 Interface 和 artifact map 语义
  不变。
- `protocol:check-validators` 必须通过，且完整 generated artifact tree 无 diff。
- 现有 missing-schema、duplicate-ID、unresolved-ref、Ajv、formatter 与 determinism 测试继续覆盖原失败传播。

### Test 拆分验证

- 每个候选在拆分前记录完整 test names、参数化展开与真实 collected count。
- 拆分后分别按精确 sibling target 运行，证明每个文件独立收集且 support 未被收集。
- 汇总后的 name multiset 与参数展开必须与 baseline 相同。
- Browser suite 必须分别记录 Chromium、Firefox、WebKit 的目标 collection 与结果。

### GUI 验收层级

- Level 1：适用。运行受影响的 unit 与 Browser regression，并核对真实 collection。
- Level 2：不适用。本设计不改变生产 GUI 行为、布局、interaction 或真实 runtime integration。
- Level 3：不适用。本设计不依赖可见桌面、系统 IME、跨应用焦点、DevTools 或操作系统窗口。

若实施 diff 出现生产 GUI 行为、DOM/ARIA、焦点、布局、scroll、overlay 或 runtime integration 变化，原 Level
2/3 排除结论失效，必须停止受影响节点并回到设计/计划边界重新判断。

## 非目标

- 不要求任何文件退出 Top 10，不设置单文件行数接受标准。
- 不修改 large-files analyzer、limit、报告格式或 CI gate。
- 不重新设计 queue、steer scheduling、pending session、transcript state 或 active-session transaction。
- 不修改 protocol schema、selected method 列表、artifact set、generated files 或消费者。
- 不新增 production behavior、用户文案、Redux state、React Context、runtime validation 或持久化。
- 不安装依赖，不运行 headed Browser、GUI、runtime、DevTools 或原生构建。
- 不在设计阶段运行格式化、生成、测试、stage、commit 或 Git remote。

## 后续计划必须保留的验收条件

1. Source 只实现 `core.ts` 的 standalone-validator artifact deep Module，不顺手修改其他 Source 候选。
2. generated artifacts byte-for-byte 不变，完整失败传播和 determinism 覆盖保持。
3. Test 拆分只移动完整行为场景，完整 test-name multiset、参数矩阵与断言保持。
4. Browser siblings 保持 parallel Chromium、Firefox、WebKit collection，且各自完成 file-local global cleanup。
5. support Module 不被收集、不拥有 mutable singleton，也不成为第二测试行为 owner。
6. 不新增兼容层、旧新双入口、test-only production Interface 或 consumer-owned authoritative contract。
7. 最终报告分别说明 Source seam、Test behavior locality、collection、生成合同和剩余 Source 候选；不得用行数
   下降代替正确性证据。

## 进入下一阶段的门禁

本设计已由用户确认并获得落盘授权。后续若用户要求编写 implementation plan，必须新建第二轮计划文档，
列出精确修改范围、baseline/post collection、格式化与验证入口、任务提交拓扑、执行 DAG、资源锁和最终
fan-in，并再次等待明确计划确认。

在计划确认且本次相关设计/计划文档形成独立本地 Git 提交前，不得开始任何 production/test 编辑、生成、
格式化、验证、stage、implementation task 或本地集成。
