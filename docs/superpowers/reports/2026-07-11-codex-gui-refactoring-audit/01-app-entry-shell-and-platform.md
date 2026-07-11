# 01 App 入口、Shell 与平台边界

状态：完成

## 审计范围

状态：完成。

计划范围：应用入口、router、provider、store wiring、AppShell 与顶层 platform/environment 检测。

## 范围交界

状态：完成。

- 允许交界：GUI host client、projection connection bridge、i18n。
- 禁止扩张：host transport、projection reducer、transcript UI 内部。
- 报告 02 交界：`GuiHostStatus`、`GuiHostCommands`、`LaunchParams` 的类型与协议 owner。
- 报告 03 交界：`GuiHostConnectionBridge` 将 host lifecycle 写入顶层 React 状态。
- 报告 07 交界候选：Mac Apple WebKit platform heuristic 仅服务 `ComposerTurnControl` 的输入行为；本报告不分配 Finding ID。

## 审计进度

| 微阶段 | 状态 | 压缩结论 | Finding ID / 覆盖状态 | 关键证据 |
| --- | --- | --- | --- | --- |
| bootstrap/provider/store owner | 已完成 | bootstrap、provider、router 与 store 的 owner 清晰，当前没有候选 finding；Redux 现有抽象留待微阶段三核对。 | 无候选 finding | `codex-gui/src/main.tsx:13`、`codex-gui/src/router.tsx:5`、`codex-gui/src/app/store.ts:9` |
| AppShell 与 platform/environment 交界 | 已完成 | App 顶层 host 状态 owner 合理，shell composition 内聚；platform heuristic 仅作为报告 07 交界候选。 | 无报告 01 finding | `codex-gui/src/App.tsx:10`、`codex-gui/src/features/appShell/AppShell.tsx:18`、`codex-gui/src/features/appShell/AppShell.tsx:50` |
| 否定结论与报告完整性 | 已完成 | typed hooks 与 slice creator 已由现有抽象覆盖；不建议新增统一 provider wrapper；十个计划主文件均有覆盖状态。 | RA-01-001、RA-01-002、RA-01-003 | `codex-gui/src/app/hooks.ts:7`、`codex-gui/src/app/createAppSlice.ts:4`、`codex-gui/src/app/ThemeProvider.tsx:13` |

## 文件覆盖状态

| 文件 | 覆盖状态 | 结论或关联条目 | 关键证据 |
| --- | --- | --- | --- |
| `codex-gui/src/main.tsx` | 已审核 | bootstrap 与 production provider tree owner 清晰 | `codex-gui/src/main.tsx:13`、`codex-gui/src/main.tsx:21` |
| `codex-gui/src/App.tsx` | 已审核 | 顶层 host 状态是 bridge 与 shell 的最低共同 owner，无报告 01 finding | `codex-gui/src/App.tsx:10`、`codex-gui/src/App.tsx:19` |
| `codex-gui/src/router.tsx` | 已审核 | 单一路由树职责内聚，不建议新增路由抽象 | `codex-gui/src/router.tsx:5`、`codex-gui/src/router.tsx:17` |
| `codex-gui/src/index.css` | 已审核 | CSS 组织本身不构成 finding | `codex-gui/src/index.css:1`、`codex-gui/src/index.css:17` |
| `codex-gui/src/app/ThemeProvider.tsx` | 已审核 | 主题副作用已有单一 owner；关联 RA-01-003 | `codex-gui/src/app/ThemeProvider.tsx:4`、`codex-gui/src/app/ThemeProvider.tsx:13` |
| `codex-gui/src/app/createAppSlice.ts` | 已审核 | 已由现有抽象覆盖；RA-01-002 | `codex-gui/src/app/createAppSlice.ts:1`、`codex-gui/src/app/createAppSlice.ts:4` |
| `codex-gui/src/app/hooks.ts` | 已审核 | 已由现有抽象覆盖；RA-01-001 | `codex-gui/src/app/hooks.ts:7`、`codex-gui/src/app/hooks.ts:11` |
| `codex-gui/src/app/store.ts` | 已审核 | root reducer、store 构造和 Redux 类型 owner 清晰；关联 RA-01-001、RA-01-002 | `codex-gui/src/app/store.ts:9`、`codex-gui/src/app/store.ts:15`、`codex-gui/src/app/store.ts:22` |
| `codex-gui/src/features/appShell/AppShell.tsx` | 已审核 | shell composition 内聚；platform heuristic 仅为报告 07 交界候选 | `codex-gui/src/features/appShell/AppShell.tsx:18`、`codex-gui/src/features/appShell/AppShell.tsx:50` |
| `codex-gui/src/__tests__/App.browser.test.tsx` | 已审核 | 主代理已抽查 App shell/host lifecycle 行为覆盖 | `codex-gui/src/__tests__/App.browser.test.tsx:154`、`codex-gui/src/__tests__/App.browser.test.tsx:165`、`codex-gui/src/__tests__/App.browser.test.tsx:211` |

## Findings

状态：审计完成；包含两个“已由现有抽象覆盖”和一个“不建议重构”条目，无确认重构点或候选待补证据。

### 微阶段一：bootstrap/provider/store owner

`main.tsx` 拥有浏览器 bootstrap 与 provider tree 装配，`router.tsx` 拥有路由树和 Router 类型注册，`store.ts` 拥有 root reducer、store 构造和 Redux 类型，`hooks.ts` 与 `createAppSlice.ts` 已提供命名明确的应用级 Redux 入口。当前范围内没有证据支持新增公共 bootstrap、provider、router 或 store 抽象。

`ThemeProvider.tsx` 内聚地拥有系统主题监听与 DOM theme 标记同步，范围内只有 `main.tsx` 一个构造方。`App.tsx` 的顶层 host 状态接线已在微阶段二确认是 bridge 与 shell 的最低共同 owner。主代理已另行抽查 App browser test 对 App shell/host lifecycle 的行为覆盖，本报告不据此扩大结论。

### 微阶段二：AppShell 与 platform/environment 交界

`App.tsx` 是三个 host 值在 connection bridge 与 shell 之间的最低共同 owner：setter 直接交给 bridge，值直接交给 `AppShell`，没有多层 prop drilling 或重复状态。`AppShell.tsx` 内聚地组合 host error notice、transcript surface、bottom sentinel、composer 和 toast provider，当前没有稳定的新公共 shell 边界。

`isMacAppleWebKitRuntime` 的结果只传给 `ComposerTurnControl.guardCompositionEndEnter`。该 heuristic 仅记录为报告 07 的交界候选；在未审核 composer 行为与其他消费者前，不形成报告 01 finding，也不分配 Finding ID。

### 微阶段三：否定结论与报告完整性

精确符号搜索确认 typed hooks 与 async-thunk-enabled slice creator 已形成应用级复用入口，当前 production 代码没有绕开这些入口。ThemeProvider、production provider tree 与测试 TestProvider 分别拥有不同装配职责，不存在值得新增统一 wrapper 的稳定共同语义。

### RA-01-001 Typed Redux hooks 已覆盖应用状态访问边界

- Finding ID: RA-01-001
- 主报告: 01-app-entry-shell-and-platform
- Evidence owner: 01-app-entry-shell-and-platform
- 状态: 已由现有抽象覆盖
- 重构优先级: 非 finding
- 结论摘要: `useAppDispatch` 与 `useAppSelector` 已集中绑定 `AppDispatch` 和 `RootState`；production 消费方通过该入口访问 Redux，未发现原始 hook bypass。
- 当前 owner 与当前职责: `codex-gui/src/app/hooks.ts` 拥有预类型化 React Redux hooks；`codex-gui/src/app/store.ts` 拥有其依赖的 store 类型。
- 问题类型: 已有抽象覆盖。
- 影响文件、定义侧、构造方、调用方和消费方: 定义侧为 `app/hooks.ts`；类型构造方为 `app/store.ts`；直接消费方包括 `GuiHostConnectionBridge.tsx`、`useCommittedTranscriptStickyBottom.ts`、`ComposerTurnControl.tsx` 和 `CommittedTranscriptSurface.tsx`。
- 共同语义或变化原因: 所有 Redux React 消费方都需要与应用 store 一致的 dispatch/state 类型，这一稳定共同语义已经由 typed hooks 表达。
- 推荐边界、建议 owner 和允许的依赖方向: 保持 `app/hooks.ts` 为唯一 typed hook owner；允许 feature 依赖 `app/hooks.ts`，由 `app/hooks.ts` 单向依赖 `app/store.ts` 类型；不新增第二层 hook wrapper。
- 预期收益: 维持单一类型入口，避免各 feature 重复绑定 store 类型或直接使用未类型化 hooks。
- 建议变更范围、最小可审查批次和明确排除范围: 当前不需要代码变更；若未来出现 bypass，应以独立 import-boundary 或 lint 批次处理；排除 selector、reducer 和 feature 行为重构。
- 行为、契约、状态、性能和测试风险: 当前保持现状没有行为或状态风险；新增 wrapper 会增加间接层并可能弱化类型错误定位；未来边界调整需确认 selector equality 与 dispatch typing 不变。
- 后续实施时建议的验证范围: 精确搜索原始 `useDispatch`/`useSelector` 导入，运行受影响 TypeScript 检查和直接消费方测试；本轮未执行这些命令。
- 当前代码关键证据路径与行号: `codex-gui/src/app/hooks.ts:7-12`；`codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx:2,39`；`codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts:2,21-22`；`codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx:3,43-46`；`codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx:3,85,97,167,221-222,266-268`。
- 关联的既有报告、issue 或专项设计: 与报告 03、05、06、07 的消费边界相交；未分配其他报告 Finding ID；无关联 issue 或专项设计。
- 已排除项: 未将 selector 数量、feature 数量或多次 hook 调用视为重复抽象证据。
- 报告建议: 保持现状，仅保留覆盖索引。

### RA-01-002 App slice creator 已覆盖当前 slice 构造语义

- Finding ID: RA-01-002
- 主报告: 01-app-entry-shell-and-platform
- Evidence owner: 01-app-entry-shell-and-platform
- 状态: 已由现有抽象覆盖
- 重构优先级: 非 finding
- 结论摘要: `createAppSlice` 已集中封装 `buildCreateSlice` 与 `asyncThunkCreator`，当前 store 装配的三个 feature slice 均使用该入口，未发现旁路构造。
- 当前 owner 与当前职责: `codex-gui/src/app/createAppSlice.ts` 拥有应用 slice factory；`app/store.ts` 组合由该 factory 创建的 feature slices。
- 问题类型: 已有抽象覆盖。
- 影响文件、定义侧、构造方、调用方和消费方: 定义侧为 `app/createAppSlice.ts`；调用方为 `threadIdentitySlice.ts`、`threadRuntimeSlice.ts`、`transcriptStateSlice.ts`；最终消费方为 `app/store.ts` 的 `combineSlices`。
- 共同语义或变化原因: 当前应用 slices 共享 async thunk creator 配置，该共同构造语义已由单一 factory 表达。
- 推荐边界、建议 owner 和允许的依赖方向: 保持 `app/createAppSlice.ts` 为应用级 factory owner；允许 feature slice 单向依赖该入口；禁止为单个 feature 再建立等价 factory。
- 预期收益: 保证 slice 创建配置一致，避免各 feature 重复绑定 async thunk creator。
- 建议变更范围、最小可审查批次和明确排除范围: 当前不需要代码变更；若未来新增不同构造需求，应先证明独立语义再设计；排除各 feature reducer、action 和 selector 内部重构。
- 行为、契约、状态、性能和测试风险: 保持现状不改变 reducer 或 state 契约；拆分或复制 factory 可能造成 thunk 配置漂移；本条不提出运行时或性能变更。
- 后续实施时建议的验证范围: 精确搜索 `createSlice`、`buildCreateSlice` 和 `createAppSlice` 调用，并运行受影响 slice 测试与 TypeScript 检查；本轮未执行这些命令。
- 当前代码关键证据路径与行号: `codex-gui/src/app/createAppSlice.ts:1-6`；`codex-gui/src/features/threadIdentity/threadIdentitySlice.ts:2,18`；`codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts:2,107`；`codex-gui/src/features/transcriptState/transcriptStateSlice.ts:1,54`；`codex-gui/src/app/store.ts:3-9`。
- 关联的既有报告、issue 或专项设计: 与报告 03、05 的 feature state 边界相交；未分配其他报告 Finding ID；无关联 issue 或专项设计。
- 已排除项: 未读取或评价 feature reducer 逻辑，未因三个 slice 使用同一 factory 而新增更宽公共层。
- 报告建议: 保持现状，仅保留覆盖索引。

### RA-01-003 不建议新增统一 provider wrapper

- Finding ID: RA-01-003
- 主报告: 01-app-entry-shell-and-platform
- Evidence owner: 01-app-entry-shell-and-platform
- 状态: 不建议重构
- 重构优先级: 非 finding
- 结论摘要: production bootstrap、主题同步和测试 provider 已有不同且清晰的 owner；它们只有表面 JSX wrapper 相似，不具备值得统一的装配语义。
- 当前 owner 与当前职责: `main.tsx` 拥有 production provider tree；`ThemeProvider.tsx` 拥有主题副作用；`utils/TestProvider.tsx` 与 `utils/test-utils.tsx` 拥有测试 I18n/Redux 装配。
- 问题类型: provider composition 的表面重复。
- 影响文件、定义侧、构造方、调用方和消费方: production 定义和构造位于 `main.tsx` 与 `ThemeProvider.tsx`；测试定义和构造位于 `utils/TestProvider.tsx`，由 `utils/test-utils.tsx` 消费。
- 共同语义或变化原因: production 需要 StrictMode、theme、I18n、Redux 和 router；测试 wrapper 只组合测试 I18n 与注入 store。共同点仅是 React provider 嵌套，不是稳定领域契约。
- 推荐边界、建议 owner 和允许的依赖方向: 保持 `main.tsx`、`ThemeProvider.tsx` 和测试 provider 分离；production bootstrap 依赖应用 providers，测试工具依赖可注入的测试 provider；不引入条件化统一 wrapper。
- 预期收益: 避免 production/test 条件分支和无意义间接层，使每个装配场景保持显式。
- 建议变更范围、最小可审查批次和明确排除范围: 当前不实施变更；若测试 provider 后续出现自身重复，由报告 08 单独审核；排除 router、i18n、theme 和测试基础设施重设计。
- 行为、契约、状态、性能和测试风险: 强行统一可能让测试意外启用 theme/router 副作用，或让 production 接受测试注入参数；保持现状没有新增行为、状态或性能风险。
- 后续实施时建议的验证范围: 若未来调整 provider 边界，应核对 production 启动、主题监听和测试 render helper 行为；本轮未运行测试、build 或 type-check。
- 当前代码关键证据路径与行号: `codex-gui/src/main.tsx:21-30`；`codex-gui/src/app/ThemeProvider.tsx:4-30`；`codex-gui/src/utils/TestProvider.tsx:12-15`；`codex-gui/src/utils/test-utils.tsx:61-64`。
- 关联的既有报告、issue 或专项设计: 测试 provider 的内部质量归报告 08；未分配报告 08 Finding ID；无关联 issue 或专项设计。
- 已排除项: 未将单次 provider 包装、相邻 JSX 嵌套或 production/test 的结构相似视为可抽取公共语义。
- 报告建议: 保持现状，不进入后续重构设计。

## 已排除项

- 单次 provider 包装、单一路由树和单一主题 provider 不单独构成重构依据。
- 未进入 host transport、feature reducer 或其他报告拥有的实现边界。
- 未将 `App.tsx` 的 host 状态接线提前归类为 finding。
- 未将三个相邻 `useState` 仅因数量相近而合并为对象或新 store。
- 未将一层 bridge-to-shell 接线视为 prop drilling。
- 未将 shell 私有展示组件、单个 browser heuristic 或 CSS 组织单独视为重构依据。

## 风险

- 精确符号搜索确认当前 typed hooks 与 slice creator 无旁路，但未来新增代码仍需维持现有 import boundary。
- platform heuristic 的完整行为、不变量和其他消费者仍需由报告 07 核对；报告 01 不提前判断其最终 owner。
- GUI host 类型稳定性和 connection lifecycle 分别属于报告 02、03，本报告只记录交界事实。
- 测试 provider 的进一步抽象质量属于报告 08；RA-01-003 只判断 production/test provider 不应被强行统一。
