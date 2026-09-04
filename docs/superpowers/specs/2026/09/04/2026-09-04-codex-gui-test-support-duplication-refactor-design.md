# Codex GUI 测试支撑重复重构设计

## 状态

- 设计状态：已确认（含 2026-09-04 Editor seam 修订）
- 确认日期：2026-09-04
- 日期：2026-09-04
- 当前分支：`dev`
- 设计基线：`8de6f1cab63e895926e3507562d5717d7adef626`
- 调查工具：`jscpd 5.1.2`

本文只定义 `codex-gui/src` 测试支撑重复的 owner、Module seam、Interface、不变量、风险和验收边界，
不是 implementation plan，不定义任务提交拓扑、精确执行命令或 worktree，也不授权修改 production、
生成物、Git index 或提交历史。

## 唯一主目标

在不改变生产行为、测试场景边界、事件顺序和完整断言的前提下，按已确认的四项优先建议收敛
`codex-gui/src` 中重复的测试支撑代码，使 ComposerTurnControl、ComposerEditor、App composer queue 和
Composer queue coordinator 测试分别通过职责清晰的深 Module 复用稳定装配机制。

## 当前证据与根因

当前基线使用以下扫描口径：

```sh
jscpd /Users/jiangsheng/cnb/codex/codex-gui/src \
  --reporters console \
  --min-lines 6 \
  --min-tokens 60 \
  --ignore "**/*.po,**/*.json,**/.DS_Store,**/generated/**"
```

扫描结果为：

- 242 个文件；
- 234 个 clone；
- 4621 个 duplicated lines；
- 行重复率 6.80%。

相同阈值排除测试文件后，只剩 5 个 production clone、67 个 duplicated lines 和 0.32% 行重复率。
229/234 个 clone 是测试代码之间的重复。把阈值提高到 15 行和 100 tokens 后仍有 79 个 clone、
2870 个 duplicated lines 和 4.23% 行重复率，说明当前问题不只是低阈值产生的小片段噪音，也包括
多处大块测试装配复制。

`jscpd` 报告的是成对匹配且区间会重叠，234 不能解释为 234 个独立重构点。本设计把它作为启发式
调查信号，不把 clone 数、duplicated lines 或重复率设为工程硬约束。

当前 Git 历史显示，自 2026-08-23 起存在 21 个 `test(gui): split ...` 提交。测试 suite 拆分保留了
行为 owner 和失败定位边界，但多次把同一套 mount、fixture、revision bridge 和 event wrapper 复制到
新文件。典型证据包括：

- `e1e6c313f` 拆分 ComposerTurnControl Browser suites，新增 1654 行、删除 802 行；
- `4cd49522d` 拆分 App composer queue Browser suites；
- `115c9171e`、`d8621b4b7`、`a5a3c173c` 拆分 Composer queue coordinator suites；
- `3f6b5c111`、`d5fd25bf9`、`551c9d343`、`594537b06` 拆分 ComposerEditor Browser suites 与
  fixtures。

因此根因不是 production owner 大面积重复，而是 suite 拆分后缺少与新文件结构匹配的共享测试支撑
seam。正确方向是保留拆分后的行为族，同时把稳定、无场景语义的装配机制重新集中。

## 总体设计原则

### 深 Module，而不是场景 DSL

共享 Module 应隐藏 caller 不应重复维护的装配复杂度，包括 dependency wiring、revision bridge、
listener、fixture guard 和 mount topology。测试仍必须显式展示被验证的输入、事件、resolve/reject 时点、
状态转换和完整 expected object。

禁止新增 `submitDraft()`、`completeTurn()`、`recoverScenario()`、`expectStarted()` 等高层场景 DSL。
这类 helper 会隐藏因果顺序，调用方仍需理解底层协议阶段，却无法从测试正文审计实际发生顺序，属于
浅 Module。

### 保持 suite 与行为 owner

- 不把已拆分的 suite 合回大文件；
- ordinary、steer、interrupt、delivery、session、input、pending-input 等行为族继续由当前文件拥有；
- suite 顶层 mock 注册与 reset/restore 生命周期保持显式；
- 测试支撑只拥有跨 suite 稳定复用的 mechanism，不拥有测试场景或产品行为。

### 保持权威类型失败传播

测试支撑 Interface 必须从现有 production、projection 和 protocol 类型机械派生。不得手写镜像 DTO、
宽泛 record、`unknown` contract 或第二套 command/lane/session union。上游 Interface 发生不兼容变化时，
共享测试支撑和 caller 应继续在类型检查或测试收集阶段失败。

### 指标不是验收目标

本设计不新增 `jscpd` 配置、package script 或 CI gate，不追求重复率清零。目标重复族消失和整体数字下降
可以作为观察证据，但不能替代测试集合、行为断言与类型检查。

## ComposerTurnControl Browser 测试支撑

### Seam 与 owner

新增：

- `codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlBrowserTestSupport.tsx`

该文件成为 ComposerTurnControl Browser 测试完整挂载图的共享 Module。它位于测试 suite 与
`ComposerTurnControl`、`ActiveThreadSessionHarness`、`ComposerInputQueueCoordinator`、skill catalog
external store、Redux provider 之间的 seam。

现有
`codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlPendingInputBrowserTestSupport.tsx`
只保留 pending-input projected queue、分页、detail、movement 和 recovery fake，不再同时拥有通用 mount、
session role、skill store 和 revision bridge。

### 推荐 Interface

采用一次性挂载的 Interface，不采用长生命周期 scenario object：

```ts
type RenderComposerTurnControlOptions = Readonly<{
  scenario?:
    | Readonly<{ type: "idle" }>
    | Readonly<{ type: "activeFixture"; captureEditReservations?: boolean }>;
  queue?:
    | Readonly<{ type: "created"; commands?: GuiHostCommands }>
    | Readonly<{ type: "provided"; controller: ComposerInputQueueCoordinator }>;
  skills?: SkillCatalogHarnessController;
  locale?: AppLocale;
  guardCompositionEndEnter?: boolean;
  strictMode?: boolean;
}>;

export function createComposerSkillCatalogHarness(
  initial?: SkillCatalogState,
): SkillCatalogHarness;

export async function renderComposerTurnControl(
  options?: RenderComposerTurnControlOptions,
): Promise<RenderedComposerTurnControl>;
```

`RenderedComposerTurnControl` 可以暴露真实测试正在观察或操纵的 raw handles：

- Browser render result；
- `composer(name?)` 的稳定 locator；
- commands；
- queue controller；
- session harness；
- skill catalog harness；
- active fixture turn；
- 只读 edit reservations；
- `dispatchProjectionFacts(facts)`。

不得公开 `composerRoleFor`、`skillsRoleFor`、stale revision 构造、subscription wiring、revision bookkeeping
或 React wrapper；这些全部属于 Module Implementation。

### Interface 不变量

1. idle 与 active fixture 必须由 tagged scenario 明确表达，不能继续从 `queue.canStop` 隐式推断。
2. created queue 使用 commands 创建真实 in-process coordinator；provided queue 只使用调用方提供的
   controller，不混合两套来源。
3. fixture 不是 `turnStarted`、queue thread identity 不匹配或初始 turn/queue 状态矛盾时立即失败，不静默
   修正或 fallback。
4. session role identity 在 snapshot publication 之间保持稳定。
5. 初始 session snapshot 先发布；随后接通 queue 与 skill subscription；React mount 完成后才 dispatch
   baseline projection facts。
6. queue 或 skills 每次 publication 恰好推进一次 session revision，并发布当时完整 snapshot。
7. `dispatchProjectionFacts` 严格保留调用方数组顺序，不排序、不拆分、不重试，也不包含断言。
8. render、Redux dispatch、production controller 与 command promise 的原始错误继续传播。

### 明确保留在 caller 的内容

- `vi.hoisted`、`vi.mock`、`beforeEach`、`afterEach`；
- owner replacement 的显式 JSX、snapshot 与 rerender 顺序；
- DOM geometry、visual signature、IME composition、guide shortcut 与 localized expectation；
- queue/projection event 的发射与观察顺序；
- 用户输入、键盘、指针和 focus 操作；
- 完整 outbound payload、snapshot 和可访问性断言。

## ComposerEditor Browser 测试支撑

### Seam 与 owner

新增唯一公共 Module：

- `codex-gui/src/features/composerEditor/__tests__/composerEditorBrowserTestSupport.ts`

并新增只属于该公共 Module Implementation 的私有 component-only fixture：

- `codex-gui/src/features/composerEditor/__tests__/composerEditorBrowserTestFixture.tsx`

当前 skill-token 与 typeahead 两套 support 的公共段，以及两套 fixture，实际表达同一个
ComposerEditor Browser test Adapter。公共 `.ts` Module 拥有普通单编辑器 mount、typed catalog candidate、
controller readiness 和 portal parent topology；私有 `.tsx` fixture 只导出 `ComposerEditorFixture` 组件，
公共 Module 对其 re-export。这样公共 Interface 仍只有一个 owner，同时让 React Refresh 对 `.tsx` 的
component-only 约束在文件边界上成立，而不是通过 lint 配置或 export allowlist 绕过。

### Interface

共享下列稳定入口：

- `ComposerEditorFixture`；
- `renderEditor`；
- `catalog`；
- `skill`；
- `getController`。

保持现有短名称，使 caller 迁移主要是 import 替换。Interface 不增加 `fixtureKind`、任意 props passthrough、
callback bag 或第二层 Adapter。四个 caller 继续使用不带扩展名的公共 support import，不直接依赖私有
fixture 文件。

### 不变量与保留分离内容

- 默认 locale 为 `en`；
- 默认 catalog 为 ready，`partialErrorCount` 为 0；
- `ariaLabel`、placeholder、disabled、no-op submit 和 controller-ready poll 时点保持不变；
- fixture 继续拥有真实 portal parent DOM 生命周期及现有 CSS variable；
- 私有 `.tsx` fixture 只导出组件；`renderEditor`、`catalog`、`skill` 和 `getController` 只由公共 `.ts`
  Module 导出；
- `SkillCatalogCandidate`、`SkillCatalogState`、`ComposerEditorProps` 与 controller 类型继续从权威类型派生。

双 editor、Drawer editor、catalog rerender、invalid skill topology、NodeSelection、DOM Selection、caret、
history shortcut 和 selection-specific helper 继续留在各自 owning suite 或窄 support。不得为统一数字把这些
不同测试语义参数化进共享 Module。

## App composer queue Browser 测试支撑

### Seam 与 owner

新增：

- `codex-gui/src/__tests__/appComposerQueueBrowserTestSupport.tsx`

该 Module 只服务 App composer queue 场景，不继续扩大通用 `appBrowserTestSupport.ts`。通用 support 继续
拥有 host、projection attach 和 authorization session；新 Module 拥有 queue-specific active App mount、
pending reads 和 command observation。

### Interface

共享的稳定入口包括：

- `renderActiveComposerQueueApp`；
- `readAllPendingItems`；
- `readPendingTextPreviews`；
- `startTurnParamsAt`；
- `steerTurnParamsAt`；
- `readGuiHostCommandCallCounts`；
- `dispatchGuideShortcut`。

`renderActiveComposerQueueApp` 隐藏 active turn、commands、App render、projection attach、host initialize、
coordinator capture 与 composer-ready 前置条件。command params reader 只返回权威参数，完整 request 断言
仍由 caller 编写。

### 不变量与保留分离内容

- Ordinary、Steer 与 Interrupt suite 保持独立；
- suite 顶层 host/coordinator mock 和 reset/restore 生命周期保持显式，避免破坏 Vitest mock hoisting；
- lane、deferred command resolve/reject、`GuiHostCommandError.delivery`、projection envelope、commit parent、
  event emission、command count expected object 和 queue snapshot 保持显式；
- `readAllPendingItems` 必须真正遍历全部分页，并在 stale、owner gone 或 revision 改变时失败，不静默重试；
- `readGuiHostCommandCallCounts` 返回 `Record<keyof GuiHostCommands, number>`，不能降级成 `Partial` 或宽
  record；
- Smoke 与 ActiveThreadSession suites 可以复用纯 reader，但不复用 active App mount Adapter，因为它们
  拥有不同的挂载和探针语义。

## Composer queue coordinator 测试 fixtures

### Seam 与 owner

新增：

- `codex-gui/src/features/composerInputQueue/__tests__/composerInputQueueCoordinatorTestFixtures.ts`

现有 `composerInputQueueTestFixtures.ts` 继续只拥有 draft、capture 和 queue message 构造。新 Module 专门
拥有 coordinator construction、单个 async dependency、live notification wrapper 与只读 pending lookup，
避免把两类 fixture 混成宽泛工具箱。

### Interface

共享：

- 从 `CreateComposerInputQueueCoordinatorInput` 机械派生的 `StartTurn`、`SteerTurn`、`InterruptTurn`；
- `createCoordinator`；
- `deferredStart`；
- `live`；
- `pendingItem`；
- `committedUserMessage`；
- `nextMicrotask`。

`createCoordinator` 保持 `startTurn` 和 `steerTurn` 必填，只为 `interruptTurn` 提供每次调用新建的默认 mock。
`deferredStart` 只隐藏 Promise wiring，测试仍显式决定 resolve/reject 时点。`live` 只包装 notification 与
`replay: "live"`。`pendingItem` 只读当前 revision 对应的 page，缺失或结果类型错误时立即失败。

### 明确不进入 Interface

- scenario DSL 或 mega harness；
- coordinator mutation、submit、settlement、observation 或 recovery 顺序；
- requests/responses 队列；
- snapshot、release blocker、management outcome 与完整 expected object；
- 只有一个 caller 的 `deferredInterrupt` 或 steer-specific deferred；
- `composerCapture` 的无行为别名。

`nextMicrotask` 必须严格表示一次 `Promise.resolve()`，不能升级成循环 drain 或“等待稳定”，避免掩盖多余
异步层级回归。

## 方案比较与选择

ComposerTurnControl 共享 seam 比较了三种 Interface：

1. 一次性挂载的最小 Interface；
2. 默认调用优先、带显式 queue Adapter 的单一 render Interface；
3. 长生命周期、两阶段 mount 的灵活 scenario object。

本设计选择前两者的收敛形态：单一一次性 `renderComposerTurnControl(options)`，默认调用简单，真实变化轴
使用 tagged union 或现有 Adapter 表达，并保留 raw handles。

不采用长生命周期 scenario object，因为它需要新增 created/mounted/disposed 等测试支撑自身状态，增加
ordering constraints 和 error modes；多数 caller 只 mount 一次，Interface 会变宽且更容易吸收场景编排。

不只抽低层 role Adapter，因为 session 创建、revision propagation、subscription、baseline dispatch、
StrictMode 和 locale wiring 仍会散落，无法形成足够 Leverage 与 Locality。

## 明确排除

- 不修改任何 production 文件或生产 Interface；
- 不处理当前 5 个 production clone；
- 不合并、删除、减少或重新分类现有测试；
- 不移动或弱化完整 `toEqual`、payload、snapshot、DOM、accessibility 和 locale 断言；
- 不隐藏 queue、projection、RPC、Promise 或用户交互的发生顺序；
- 不新增兼容层、旧新双路径、fallback、silent retry 或宽松 fixture；
- 不新增 protocol、session、queue、command 或 catalog 镜像类型；
- 不新增 `jscpd` package script、配置、依赖、基线或 CI gate；
- 不以重复率清零、固定 clone 数或固定 duplicated lines 作为完成条件；
- 不进行 Level 2 真实运行时验收或 Level 3 可见桌面验收。

## 风险与控制

### Mock hoisting

共享 Browser support 不注册 caller-specific `vi.mock`。每个 suite 继续在模块顶层安装 mock，shared render
只消费已经建立的 mock handle，避免 import 顺序改变被测 Module 的绑定。

### Interface 膨胀

新增变化轴必须先证明有至少两个真实 caller。优先接受现有 production Interface 或测试 Adapter，不增加
布尔开关、任意 callback bag、任意 JSX wrapper 或完整 props passthrough。

### 隐藏行为

共享 helper 只允许构造单个 dependency、fixture、event wrapper、只读 lookup 或完整 mount graph。禁止在
helper 内串联多个 coordinator mutation、projection event、用户操作或断言。

### 行为漂移

迁移应保持 fixture 默认值、DOM topology、subscription 顺序、revision advancement、baseline dispatch、
controller readiness 和 error propagation。任何需要改变这些事实的发现都不是机械重复重构，必须停止受
影响范围并回到设计确认。

## 验收边界

本设计只改变测试组织和测试支撑，适用验收为 Level 1：

- 原有目标 test files 均被非零收集并通过；
- 原测试名称、行为族、浏览器矩阵和完整断言保持；
- TypeScript 权威类型失败传播保持；
- formatter check、lint 和 type-check 通过；
- 目标 `jscpd` 大块重复族消失，整体数字下降仅作为观察记录；
- production 文件无 diff；
- 没有新增 test-only production export、协议镜像、兼容路径或隐藏场景 DSL。

纯测试支撑重构不改变真实 Codex runtime、布局、交互语义或操作系统桌面状态，因此 Level 2 和 Level 3
均不适用。

## 后续阶段门禁

设计落盘不授权编写 implementation plan 或执行重构。后续若进入计划阶段，计划必须以本设计的四个
独立 test-only seam 为边界，列出精确 write set、验证目标、任务提交拓扑和最终 fan-in，并保持本文所有
不变量和排除项。计划获得明确确认且相关工作文档形成独立本地提交前，不得开始实现。
