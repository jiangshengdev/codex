# 08 测试基础设施、Fixture 与支持代码

状态：审计完成

## 审计范围

状态：审计完成。

计划范围：projection fixtures/builders、app browser test support、GUI host client test support、通用 render helper 与大型测试文件中的支持代码。

## 范围交界

状态：审计完成。

- 允许交界：各 production 报告拥有的行为边界。
- 禁止扩张：替 production 报告拥有 production finding。

## 审计进度

| 微阶段 | 状态 | 压缩结论 | Finding ID / 覆盖状态 | 关键证据 |
| --- | --- | --- | --- | --- |
| R08-GLOBAL | 完成 | `TestProvider`、`renderWithProviders` 与 App browser support 分别拥有 provider tree、Browser render 和 App integration 驱动，没有重复装配 owner。 | `RA-08-002`；已由现有抽象覆盖/非 finding | `TestProvider.tsx:7-16`；`test-utils.tsx:18-74`；`appBrowserTestSupport.ts:17-113`；`App.browser.test.tsx:55-148` |
| R08-HOST | 完成 | `guiHostClientTestSupport` 内聚拥有 transport/protocol harness；`createGuiHostCommands` 由 App、Composer 与 `markCommandsReady` 共同消费，保留在 global App browser support 可接受。无消费者 `createCommands` alias 仅为局部清理风险。 | `RA-08-002`；已由现有抽象覆盖/非 finding | `guiHostClientTestSupport.ts:14-214`；`appBrowserTestSupport.ts:32-39,86-92`；App/Composer 精确消费者搜索 |
| R08-PROJECTION/FIXTURE-LOADER | 完成 | Rust-generated JSON 已由 typed facade 与专属契约测试覆盖。 | `RA-08-002`；已由现有抽象覆盖/非 finding | `projectionFixtures.ts:1-42`；`projectionFixtures.test.ts:19-159`；14 份 JSON fixtures |
| R08-PROJECTION/TEST-BUILDERS | 完成 | Protocol item/event builders 保持 projection facade；`runtimeFromAttach` 构造 thread runtime record 且只被 snapshot replay tests 消费，owner 错位。 | `RA-08-001`；确认重构点/P3 | `projectionTestBuilders.ts:9-12,14-104,106-220`；`snapshotReplay.test.ts:10,66,109,177` |
| R08-PROJECTION | 完成 | Fixture loader 与 protocol builders 已覆盖；仅保留 `runtimeFromAttach` test-only owner 重构点。 | `RA-08-001`、`RA-08-002` | 两个 R08-PROJECTION 子阶段证据 |
| R08-UI-SUPPORT/FEATURE-BROWSER-HARNESS | 完成 | `renderWithProviders` 已覆盖共同 Browser render；Committed Transcript、Composer 与 QR 的局部 helpers 保持 feature-local。 | `RA-08-002`；已由现有抽象覆盖/非 finding | `test-utils.tsx:47-74`；三份 feature browser tests |
| R08-UI-SUPPORT/APP-BROWSER-LOCAL-SUPPORT | 完成 | App readiness、document scroll/layout 与 integration assertions 只服务 App；两处单帧等待和相似 Composer assertions 不足以建立公共层。 | `RA-08-002`；已由现有抽象覆盖/非 finding | `App.browser.test.tsx:55-148,452-485,532-744,800-814,893` |
| R08-UI-SUPPORT | 完成 | Feature browser harness 与 App-local support 均由现有分层覆盖。 | `RA-08-002`；已由现有抽象覆盖/非 finding | 两个 R08-UI-SUPPORT 子阶段证据 |
| R08-STATE-SUPPORT/TRANSCRIPT-STATE-HARNESS | 完成 | 九份 transcript tests 已按行为域拆分并共享 fixtures/builders；显式 action、`replay` 与 dispatch 顺序应保留。 | `RA-08-002`；已由现有抽象覆盖/非 finding | `transcriptState/__tests__/**` 九份测试 |
| R08-STATE-SUPPORT/RUNTIME-INGRESS-HARNESS | 完成 | Thread runtime 使用 typed reducer helper，ingress adapter 使用 feature-local derive/attach/closed builders；二者没有应合并的 harness 语义。 | `RA-08-002`；已由现有抽象覆盖/非 finding | `threadRuntimeSlice.test.ts:1-53`；`projectionIngressAdapter.test.ts:1-60` |
| R08-STATE-SUPPORT | 完成 | Transcript、runtime 与 ingress tests 保持行为域和 feature owner；本节点无确认重构点。 | `RA-08-002`；已由现有抽象覆盖/非 finding | 两个 R08-STATE-SUPPORT 子阶段证据 |
| R08-COVERAGE | 完成 | 25 份 feature tests、14 份 projection JSON fixtures、3 份 feature support/builder 文件及 4 份全局 test/support 文件均有覆盖状态；最终保留一个 P3 finding 与一个覆盖性条目。 | `RA-08-001`、`RA-08-002` | PATH-INVENTORY 与本报告 Findings |

## PATH-INVENTORY 覆盖状态

| 范围 | 文件清单 | 覆盖状态 |
| --- | --- | --- |
| 全局装配与 App support | `App.browser.test.tsx`、`appBrowserTestSupport.ts`、`TestProvider.tsx`、`test-utils.tsx` | `RA-08-002`；现有抽象覆盖。 |
| GUI host tests/support | `guiHostClientTestSupport.ts` 与 launch params、handshake、commands、protocol errors 四份测试 | `RA-08-002`；transport harness 保持，command alias 仅为风险。 |
| Projection fixtures/support | 14 份 `projection/__fixtures__/*.json`、`projectionFixtures.ts`、`projectionFixtures.test.ts`、`projectionTestBuilders.ts` | Typed facade/builders 归 `RA-08-002`；`runtimeFromAttach` 归 `RA-08-001`。 |
| UI tests | Committed Transcript、Composer、QR 各两份 browser/unit tests | Browser harness 归 `RA-08-002`；纯行为 unit tests 不建立 test-infra finding。 |
| State/runtime tests | 九份 transcript tests、`threadRuntimeSlice.test.ts`、`projectionIngressAdapter.test.ts` | `RA-08-002`；保持显式 action/outcome 顺序。 |
| Timeline material tests | `snapshotReplay.test.ts`、`liveEventHandling.test.ts` | Test helper owner 已审计；production 采用状态只引用下方 R04 交界。`runtimeFromAttach` 由 `RA-08-001` 拥有。 |
| Thread identity test | `threadIdentitySlice.test.ts` | 纯 production behavior test；不建立 test-infra finding。 |

## Findings

状态：审计完成；审计时包含一个确认重构点和一个“已由现有抽象覆盖”条目；`RA-08-001` 现已由 B07 条件吸收。

### RA-08-001 `runtimeFromAttach` 位于 projection-wide builders 的 owner 错位

- **Finding ID：** `RA-08-001`。
- **主报告：** `08-test-infrastructure-fixtures-and-support.md`。
- **Evidence owner：** `08-test-infrastructure-fixtures-and-support`。
- **状态：** 已由 B07 条件吸收（B08 不再独立实施）。
- **重构优先级：** P3。
- **结论摘要：** `runtimeFromAttach` 位于 projection-wide test builders，却构造 `ThreadRuntimeRecord`、调用 thread-runtime replay index helper，且只有 snapshot replay tests 消费。它应归属唯一 snapshot replay 测试域，其余 projection builders 保持不变。
- **审计时 owner 与职责：** `projectionTestBuilders.ts` 拥有 protocol input、item、turn、attach、event 与 delta builders；其中 `runtimeFromAttach` 是唯一构造 application runtime state 的 helper。`snapshotReplay.test.ts` 使用它为 snapshot material selector 构造 runtime input。
- **问题类型：** Test-only helper owner 与依赖方向错位。Projection-wide facade 因单一 snapshot replay 消费方而依赖 `ThreadRuntimeRecord` 和 `snapshotReplayIndexFromTurns`，扩大了共享 builders 的语义范围。
- **影响文件、定义侧、构造方、调用方和消费方：**
  - 定义侧：`projectionTestBuilders.ts:9-12,90-104` 导入 runtime 类型/helper并定义 `runtimeFromAttach`。
  - 构造方：该 helper 从 attach snapshot 拆出 turns，构造 replay index、active turn、active subscription 与空 event buffer。
  - 调用方和消费方：`snapshotReplay.test.ts:10,66,109,177` 是精确搜索得到的唯一 import 与三个调用点。
  - 保留侧：`projectionTestBuilders.ts:14-88,106-220` 的 protocol item/event/delta builders 仍由多个测试域消费。
- **共同语义或变化原因：** `runtimeFromAttach` 随 snapshot replay test input 与 `ThreadRuntimeRecord` shape 变化；其余 builders 随 protocol fixtures 和 notification shape 变化，两者没有稳定共同 owner。
- **推荐边界与允许的依赖方向：** 将 helper 移入 `snapshotReplay.test.ts`，或仅在出现第二个同域消费者时建立 snapshotReplay-local test support。Projection builders 不再依赖 thread runtime；snapshot replay tests 可以继续依赖公开 runtime 类型/helper。
- **预期收益：** 缩小 projection-wide builders 的依赖与语义范围，使唯一消费者直接拥有 runtime fixture 构造，并避免其他测试误把 application runtime record 当作通用 projection fixture。
- **建议变更范围、最小可审查批次和明确排除范围：** 最小批次只移动 `runtimeFromAttach`、调整 `snapshotReplay.test.ts` import并删除 projection builder 中不再需要的 runtime imports。明确排除其他 builders、production `ThreadRuntimeRecord`、snapshot replay 算法、fixtures JSON 和 production timeline materials。
- **行为、状态、性能和测试风险：** 迁移必须保持 thread metadata、snapshot turns、replay index、最后一个 in-progress active turn、active subscription 与空 event buffer 完全一致。无 production 行为或性能变更；主要风险是移动时遗漏 fixture shape 字段或扩大为 production 重构。
- **后续实施时建议的验证范围：** 精确搜索 `runtimeFromAttach` 确认 projection-wide export 消失且只有 snapshot replay-local 定义；运行 `snapshotReplay.test.ts` 的定向测试，并按 GUI 工具链要求执行受影响 TypeScript、lint 与格式化检查。本轮未运行测试或项目命令。
- **实施结果：** B07 完整删除 snapshot replay 专属测试后，条件批次 B08 不再执行 helper owner 迁移；`runtimeFromAttach` 及其 `ThreadRuntimeRecord` import 已从 `projectionTestBuilders.ts` 删除，没有建立新的 snapshotReplay-local owner。本地提交为 `bdc73c634`（`Remove obsolete live event and snapshot replay materialization`）。
- **已完成实施验证：** type-check 通过；unit `30` files / `300` tests、Browser Mode `24` files / `222` tests 通过；限定 oxfmt、oxlint、ESLint、diff check 与 `runtimeFromAttach` / timeline-material 零残留搜索通过。未运行 build、e2e、protocol generation 或 Rust，未操作远程。
- **当前代码关键证据路径与行号：** `projectionTestBuilders.ts:9-12,90-104`；`snapshotReplay.test.ts:10,66,109,177`；全仓 `runtimeFromAttach` 精确引用搜索。
- **关联的既有报告、issue 或专项设计：** Production 交界仅见下方“Production 交界引用”；无直接关联 issue 或专项设计。
- **已排除项：** 不移动其他 protocol builders；不把 helper 下沉到 production runtime；不修改 snapshot/live material 行为；不建立新的通用 runtime test factory。
- **报告建议：** 保留为 `RA-08-001`、状态“已由 B07 条件吸收（B08 不再独立实施）”、优先级 P3；保留审计时 owner 错位证据，不再迁移已无消费者的 helper。

### RA-08-002 测试装配、fixtures、transport harness 与 feature-local helpers 已由现有抽象覆盖

- **Finding ID：** `RA-08-002`。
- **主报告：** `08-test-infrastructure-fixtures-and-support.md`。
- **Evidence owner：** `08-test-infrastructure-fixtures-and-support`。
- **状态：** 已由现有抽象覆盖。
- **重构优先级：** 非 finding。
- **结论摘要：** Provider/render、App browser support、GUI host transport harness、typed projection fixtures、protocol builders、UI-local helpers及 state harness 已按稳定变化原因分层；全部路径均有覆盖状态，除 `RA-08-001` 外没有新的 test-infra 重构点。
- **当前 owner 与当前职责：** `TestProvider` 与 `renderWithProviders` 拥有通用 React test 装配；`appBrowserTestSupport` 拥有 App connection/projection 驱动和共享 command fake；`guiHostClientTestSupport` 拥有 storage/socket/RPC/handshake harness；projection facade 拥有 typed JSON 与 protocol builders；各 feature tests 拥有本地 setup、locator、assertion 和 reducer/adapter helpers。
- **问题类型或为何不是问题：** 各层共享的是不同契约。跨文件出现的单帧等待、Composer disabled assertions 或少量 fixture derivation 没有足够消费者；显式 action、`replay`、dispatch order 与 ingress outcome 也不应被默认化 harness 隐藏。
- **影响文件、定义侧、构造方、调用方和消费方：**
  - 通用装配：`TestProvider.tsx:7-16`、`test-utils.tsx:18-74`，由 App、Committed Transcript、Composer 与 QR browser tests 消费。
  - App/command support：`appBrowserTestSupport.ts:17-113`，由 `App.browser.test.tsx`、Composer 的 command fake 消费，并由 `markCommandsReady` 使用默认 fake。
  - Transport harness：`guiHostClientTestSupport.ts:14-214`，由四份 GUI host client tests 按职责消费。
  - Fixtures/builders：`projectionFixtures.ts:1-42`、`projectionFixtures.test.ts:19-159`、`projectionTestBuilders.ts:14-88,106-220`。
  - Feature-local helpers：三份 browser tests、App browser、九份 transcript tests、runtime 与 ingress tests，以及 PATH-INVENTORY 中的纯行为 tests。
- **共同语义或变化原因：** 通用 render 随应用 provider 变化，App support 随 integration callback surface 变化，transport harness 随 socket/RPC contract 变化，fixture facade 随 protocol payload 变化，local helpers 随单个 feature behavior 变化；这些变化原因不应合并。
- **推荐边界与保持现状：** 保持当前分层。`createGuiHostCommands` 继续由 global App browser support 拥有，App、Composer 与 `markCommandsReady` 可以共同消费；无消费者 `createCommands` alias 只作为局部清理风险，不单独建立 finding。Feature-local helpers 保持在测试文件内。
- **保持现状收益：** 避免建立宽泛 test-utils、隐藏 reducer/event 顺序、把 UI tests 耦合到 transport harness，或为只有一至两个消费者的 helpers 增加公共 API。
- **建议变更范围、最小可审查批次和明确排除范围：** 最小批次为无，不建议基础设施重构。可在独立局部清理中删除 `createCommands` alias，但不得借此迁移 command fake、拆分 transport harness 或重写 tests。
- **行为、状态、性能和测试风险：** Typed JSON facade 依赖契约测试发现 runtime drift；显式 reducer/adapter tests 依赖 action/outcome 顺序可见；Browser helpers 依赖真实 DOM/RAF；command alias 可能误导新消费者。以上均为维护风险，不升级为 finding。
- **后续实施时建议的验证范围：** 若未来修改对应边界，运行直接 GUI host、projection fixture、feature browser、transcript/runtime/ingress tests，并精确核对 helper 消费者与无消费者 exports；再执行项目要求的 type-check、lint 与格式化。本轮未运行测试或项目命令。
- **当前代码关键证据路径与行号：** `TestProvider.tsx:7-16`；`test-utils.tsx:18-74`；`appBrowserTestSupport.ts:17-113`；`guiHostClientTestSupport.ts:14-214`；`projectionFixtures.ts:1-42`；`projectionFixtures.test.ts:19-159`；`projectionTestBuilders.ts:14-88,106-220`；`App.browser.test.tsx:55-148`；`threadRuntimeSlice.test.ts:1-53`；`projectionIngressAdapter.test.ts:1-60`；九份 transcript tests；PATH-INVENTORY。
- **关联的既有报告、issue 或专项设计：** Production 交界仅见下方“Production 交界引用”；无直接关联 issue 或专项设计。
- **已排除项：** 不把测试文件规模、单行 render 重复、局部 DOM 查询、两处 RAF helper 或相似断言当作公共抽象证据；不把 production behavior tests 转换成 test-infra findings；不重复拥有下方 production 交界。
- **报告建议：** 保留为 `RA-08-002`、状态“已由现有抽象覆盖”、优先级“非 finding”；保持现有 test infrastructure owner，仅保留局部 alias 风险。

## Production 交界引用

### GUI host transport 交界

- 交界引用：[RA-02-002](./02-gui-host-transport-and-protocol.md#ra-02-002)
- 本报告仅使用的交界事实：GUI host client tests 验证 handshake/commands/protocol behavior；R08 只审计 test harness owner，不拥有 production transport finding。
- Evidence owner：`02-gui-host-transport-and-protocol.md`

### Runtime/ingress 交界

- 交界引用：[RA-03-005](./03-projection-ingress-and-thread-runtime.md#ra-03-005)
- 本报告仅使用的交界事实：Ingress adapter filtering/reconnect behavior 由 production 报告拥有；R08 只确认 adapter test helpers 保持 feature-local。
- Evidence owner：`03-projection-ingress-and-thread-runtime.md`

### Timeline materials 交界

- 交界引用：[RA-04-001](./04-timeline-materials-and-domain-models.md#ra-04-001)
- 本报告仅使用的交界事实：`snapshotReplay.test.ts` 与 `liveEventHandling.test.ts` 的 production 采用状态归 R04；R08 只拥有 test helper 归属与路径覆盖。
- Evidence owner：`04-timeline-materials-and-domain-models.md`

### Transcript state 交界

- 交界引用：[RA-05-001](./05-transcript-state-and-materialization.md#ra-05-001)
- 本报告仅使用的交界事实：Transcript state production/test behavior 与专项设计覆盖归 R05；R08 只确认九份测试的 harness 显式性和 fixture 复用边界。
- Evidence owner：`05-transcript-state-and-materialization.md`

## 已排除项

状态：审计完成。

- `committedTranscriptChunkEquality.test.ts`、`composerTurnControlModel.test.ts`、`qrAccessUrl.test.ts`、`threadIdentitySlice.test.ts` 是纯 production behavior tests，不建立 test-infra finding。
- 不合并九份 transcript behavior tests，不新增默认 attach/event/delta/replay reducer harness，不合并 runtime reducer 与 ingress adapter support。
- 不拆 `guiHostClientTestSupport`，不把 command fake 放入 transport harness，不因 `createCommands` alias 无消费者而建立独立 finding。
- 不移动 protocol item/event builders，不重写 projection fixture facade、JSON generation、snapshot replay 算法或 production runtime types。
- 不把 App/feature-local scroll、viewport、locator、assertion 或 RAF helpers 提升为全局 test-utils。

## 风险

状态：审计完成。

- `RA-08-001` 迁移必须保持完整 runtime record fixture shape，并严格限制为 test-only owner 移动。
- Typed fixture facade 使用断言衔接 JSON 与协议类型；新增 fixture 时必须同步更新 facade 与契约覆盖集合。
- 默认化 harness 可能隐藏 action、`replay`、dispatch 顺序、accepted/ignored outcome、commit continuity 和中间状态断言。
- `renderWithProviders` 当前固定装配 CSS、英文 catalog、Redux 与 user event；只有出现更多不同装配需求时才重新评估分层。
- `createCommands` alias 没有消费者，可能误导新调用方；仅建议独立局部清理，不改变 `createGuiHostCommands` owner。
- 单帧等待、Composer disabled assertions 及 feature-local fixture helpers 当前消费者不足，过早上移会制造无复用证据的公共层。
