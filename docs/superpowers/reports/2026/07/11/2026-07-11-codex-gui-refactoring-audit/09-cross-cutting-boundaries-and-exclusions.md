# 09 跨域边界与排除项

状态：完成

## 审计范围

状态：完成。Owner/coverage reconciliation、跨域依赖核对与跨报告去重均已收敛；未建立 09 自有 Finding。

计划范围：跨 feature 类型所有权、依赖方向、潜在循环、重复领域语义、公共模块候选、覆盖矩阵与排除项。

## 范围交界

状态：完成。01-08 继续拥有各自单 feature 证据；09 只记录稳定 owner/coverage、跨域依赖结论和实施批次关系，不复制完整论证。

- 允许交界：01-08 已建立的 finding 与交界事实。
- 禁止扩张：重复单 feature 的完整论证。

## 审计进度

| 微阶段 | 状态 | 压缩结论 | Finding ID / 覆盖状态 | 关键证据 |
| --- | --- | --- | --- | --- |
| R09-OWNER-TABLE（依赖 `R01-DRAFT...R08-DRAFT`） | `complete` | 第二轮复扫确认 20 个 Finding ID 全部唯一；固定字段完整，无 Evidence owner 冲突或 RA 断链。状态分布为 `10/1/7/1/1`。 | Owner table 稳定；不创建 finding | 01-08 Findings heading、固定字段与稳定链接复扫 |
| R09-COVERAGE-SCAN（依赖 `R01-DRAFT...R08-DRAFT`） | `complete` | 第二轮复扫确认 88 个计划路径；canonical owner 分布为 `9/2/4/2/7/6/12/46`，无遗漏、重复 canonical owner 或 secondary overlap 冲突。 | Coverage 稳定 | 01-08 文件覆盖表与路径清单复扫 |
| R09-REPAIR-FIXED-POINT（依赖 `R09-OWNER-TABLE,R09-COVERAGE-SCAN`） | `complete` | 01-07 的固定字段、中文状态与稳定链接修订全部关闭；08 无修订。 | 不创建 finding | 两轮扫描与 01-07 reconciliation diff |
| R09-REPAIR-CONVERGED（依赖 `R09-REPAIR-FIXED-POINT`） | `complete` | 第二轮 owner/coverage 结果与第 1 轮技术结论及 canonical path 数量一致；仅元数据格式发生变化。 | Reconciliation 收敛 | 第二轮复扫结果 |
| R09-STABLE-OWNER-COVERAGE（依赖 `R09-REPAIR-CONVERGED`） | `complete` | Owner table 与 coverage matrix 已形成稳定输入，可供后续 R09 跨域阶段使用。 | Stable fixed point | 本报告 Evidence Ownership 与覆盖矩阵 |
| R09-CROSS-DOMAIN（依赖 `R09-STABLE-OWNER-COVERAGE`，与 `R09-DEDUP` 并行） | `complete` | Production 跨 feature 类型、action 与 selector 依赖均为单向消费；未发现无法归属 01-08、需要 09 自有 owner 的循环或重复领域语义。 | 无 09 自有 finding | `RA-03-001`、`RA-03-003`、`RA-03-005`、`RA-04-001`、`RA-05-001`、`RA-06-001` 的稳定交界 |
| R09-DEDUP（依赖 `R09-STABLE-OWNER-COVERAGE`，与 `R09-CROSS-DOMAIN` 并行） | `complete` | 20 个 ID 不重编号、不合并；只记录条件性实施吸收与可统筹但独立的批次关系。 | Finding 集合保持不变 | 本报告“跨报告去重” |
| R09-COMPLETE（依赖 `R09-CROSS-DOMAIN,R09-DEDUP,R09-STABLE-OWNER-COVERAGE`） | `complete` | Owner、coverage、cross-domain 与 dedup 均完成；报告达到最终稳定状态。 | 20 个既有 ID；无 RA-09 finding | 本报告全部章节 |

## Findings

状态：完成；未建立 09 自有 finding。

稳定 owner/coverage 与 production 跨 feature 依赖核对没有发现新的跨域 owner 缺口。已有跨域事实分别由 01-08 中对应 Finding 拥有；09 不创建 `RA-09-*` ID，也不改变既有 Finding 的状态或优先级。

## Evidence Ownership

状态：第二轮复扫完成，stable fixed point。

- Finding ID：20 个，全部唯一。
- Evidence owner：各 Finding 均由其编号对应的主报告拥有，没有实质 owner 冲突。
- 状态/优先级分布：确认重构点 10、候选待补证据 1、已由现有抽象覆盖 7、不建议重构 1、已有专项设计 1；P2/P3 与非 finding 组合未发现矛盾。
- 合法状态保留：RA-05-001 的“已有专项设计”作为合法非 finding 状态保留，不归一为“已由现有抽象覆盖”。
- 固定字段与链接：20 个 Finding 均具有独立 `Finding ID`、`主报告`、`Evidence owner`、`状态`、`重构优先级`；所有相对 RA 链接均指向现有 heading。

| 主报告 | 稳定 Finding ID | 状态 / 优先级摘要 |
| --- | --- | --- |
| 01 | `RA-01-001`、`RA-01-002`、`RA-01-003` | 2 个已覆盖、1 个不建议；均为非 finding |
| 02 | `RA-02-001`、`RA-02-002`、`RA-02-003` | 3 个确认重构点；均为 P2 |
| 03 | `RA-03-001`、`RA-03-002`、`RA-03-003`、`RA-03-004`、`RA-03-005` | 2 个 P2、1 个 P3、2 个已覆盖 |
| 04 | `RA-04-001` | 确认重构点；P2 |
| 05 | `RA-05-001` | 已有专项设计；非 finding |
| 06 | `RA-06-001` | 已由现有抽象覆盖；非 finding |
| 07 | `RA-07-001`、`RA-07-002`、`RA-07-003`、`RA-07-004` | 2 个 P2、1 个 P3 候选、1 个已覆盖 |
| 08 | `RA-08-001`、`RA-08-002` | 1 个 P3、1 个已覆盖 |

## 覆盖矩阵

状态：第二轮复扫完成，stable fixed point。

| Exact path | Canonical 主报告 | 必要次级交界 | 结果 / Finding 或排除理由 |
| --- | --- | --- | --- |
| `codex-gui/src/App.tsx` | 01 | 02、03 | 顶层 host/Bridge/Shell 接线已审核；无 01 finding |
| `codex-gui/src/app/ThemeProvider.tsx` | 01 | — | `RA-01-003`；保持独立 production theme owner |
| `codex-gui/src/app/createAppSlice.ts` | 01 | 03、05 | `RA-01-002`；现有 slice factory 覆盖 |
| `codex-gui/src/app/hooks.ts` | 01 | 03、05、06、07 | `RA-01-001`；typed Redux hooks 覆盖 |
| `codex-gui/src/app/store.ts` | 01 | 03、05 | `RA-01-001`、`RA-01-002`；store/type owner 清晰 |
| `codex-gui/src/features/appShell/AppShell.tsx` | 01 | 02、03、06、07 | Shell composition/platform 消费已审核；无 01 finding |
| `codex-gui/src/index.css` | 01 | — | CSS 组织不构成 finding |
| `codex-gui/src/main.tsx` | 01 | 07 | Bootstrap/provider tree 已审核；`RA-01-003` 排除统一 wrapper |
| `codex-gui/src/router.tsx` | 01 | 07 | 单一路由树已审核；NotFound 文案交界归 `RA-07-003` |
| `codex-gui/src/features/guiHost/guiHostClient.ts` | 02 | 01、03、07、08 | `RA-02-001`、`RA-02-002`；launch/transport/handshake owner |
| `codex-gui/src/features/guiHost/guiHostProtocol.ts` | 02 | 03、08 | `RA-02-003`；runtime protocol validation owner |
| `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx` | 03 | 01、02、04、05、07、08 | `RA-03-001`、`RA-03-002`、`RA-03-003` |
| `codex-gui/src/features/projectionIngress/projectionIngressAdapter.ts` | 03 | 02、05、08 | `RA-03-005`；ingress outcome/reconnect owner 已覆盖 |
| `codex-gui/src/features/threadIdentity/threadIdentitySlice.ts` | 03 | 01、07、08 | `RA-03-004`；identity/runtime 分工已覆盖 |
| `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts` | 03 | 01、04、05、07、08 | `RA-03-002`、`RA-03-003`、`RA-03-004` |
| `codex-gui/src/features/liveEventHandling/liveEventHandling.ts` | 04 | 03、05、08 | `RA-04-001`；未接入 live/timeline material 管道 |
| `codex-gui/src/features/snapshotReplay/snapshotReplay.ts` | 04 | 03、05、08 | `RA-04-001`；未接入 snapshot material 管道 |
| `codex-gui/src/features/transcriptState/transcriptCommittedProjection.ts` | 05 | 03、04、06、08 | `RA-05-001`；专项设计覆盖 committed projection |
| `codex-gui/src/features/transcriptState/transcriptEntryMaterialization.ts` | 05 | 04、06、08 | `RA-05-001`；专项设计覆盖 materialization |
| `codex-gui/src/features/transcriptState/transcriptEventDedup.ts` | 05 | 03、08 | `RA-05-001`；专项设计覆盖 bounded dedup |
| `codex-gui/src/features/transcriptState/transcriptLiveProjection.ts` | 05 | 03、04、06、08 | `RA-05-001`；专项设计覆盖 live projection；单条 action 交界见 `RA-03-003` |
| `codex-gui/src/features/transcriptState/transcriptStateModel.ts` | 05 | 03、06、08 | `RA-05-001`；专项设计覆盖 model/type owner |
| `codex-gui/src/features/transcriptState/transcriptStateSelectors.ts` | 05 | 06、08 | `RA-05-001`；selector/cache owner 已覆盖 |
| `codex-gui/src/features/transcriptState/transcriptStateSlice.ts` | 05 | 01、03、04、06、08 | `RA-05-001`；稳定 facade/action routing 已覆盖 |
| `codex-gui/src/features/appShell/useCommittedTranscriptStickyBottom.ts` | 06 | 01、05、08 | `RA-06-001`；document sticky-bottom owner 已覆盖 |
| `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx` | 06 | 01、05、08 | `RA-06-001`；committed/live composition 已覆盖 |
| `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx` | 06 | 05、08 | `RA-06-001`；streaming Markdown wrapper 已覆盖 |
| `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx` | 06 | 05、08 | `RA-06-001`；static Markdown wrapper 已覆盖 |
| `codex-gui/src/features/committedTranscriptSurface/committedTranscriptChunkEquality.ts` | 06 | 05、08 | `RA-06-001`；UI equality adapter 已覆盖 |
| `codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx` | 06 | 05、08 | `RA-06-001`；共享 Markdown policy 保持 feature-local |
| `codex-gui/src/LanguageSwitcher.tsx` | 07 | 01 | `RA-07-002`；未接入 production 的语言切换表面 |
| `codex-gui/src/MsgExample.tsx` | 07 | — | `RA-07-002`；未接入 i18n 示例 |
| `codex-gui/src/NotFoundPage.tsx` | 07 | 01 | `RA-07-003`；production localization 候选待补证据 |
| `codex-gui/src/PluralExample.tsx` | 07 | — | `RA-07-002`；未接入 i18n 示例 |
| `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx` | 07 | 01、02、03、08 | `RA-07-001`；Stop pending 门禁缺口 |
| `codex-gui/src/features/composerTurnControl/composerTurnControlModel.ts` | 07 | 02、03、08 | `RA-07-001`；Composer availability/send/stop model |
| `codex-gui/src/features/composerTurnControl/useRevealComposerOnViewportResize.ts` | 07 | 01、08 | `RA-07-004`；viewport hook 已由现有抽象覆盖 |
| `codex-gui/src/features/qrAccess/QrAccessPopover.tsx` | 07 | 02、08 | `RA-07-004`；QR/access 组件边界已覆盖 |
| `codex-gui/src/features/qrAccess/qrAccessUrl.ts` | 07 | 02、08 | `RA-07-004`；QR URL builder 已覆盖 |
| `codex-gui/src/i18n.ts` | 07 | 01 | Production i18n 初始化 owner 清晰；`RA-07-002` 仅清理未接入表面 |
| `codex-gui/src/locales/en.po` | 07 | — | `RA-07-002`、`RA-07-003` 的 catalog 交界 |
| `codex-gui/src/locales/zh-CN.po` | 07 | — | `RA-07-002`、`RA-07-003` 的 catalog 交界 |
| `codex-gui/src/__tests__/App.browser.test.tsx` | 08 | 01、02、03、04、06、07 | `RA-08-002`；App integration harness；production 结论归对应报告 |
| `codex-gui/src/__tests__/appBrowserTestSupport.ts` | 08 | 02、03、07 | `RA-08-002`；App connection/projection/commands support |
| `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx` | 08 | 05、06 | `RA-08-002`；feature-local browser harness |
| `codex-gui/src/features/committedTranscriptSurface/__tests__/committedTranscriptChunkEquality.test.ts` | 08 | 05、06 | 纯 production behavior test；不建立 test-infra finding |
| `codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx` | 08 | 02、03、07 | `RA-08-002`；feature-local browser harness；行为交界见 `RA-07-001` |
| `codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts` | 08 | 03、07 | 纯 production behavior test；不建立 test-infra finding |
| `codex-gui/src/features/guiHost/__tests__/guiHostClientTestSupport.ts` | 08 | 02 | `RA-08-002`；transport/protocol test harness |
| `codex-gui/src/features/guiHost/__tests__/guiHostCommands.test.ts` | 08 | 02 | `RA-08-002`；production commands 行为归 `RA-02-002` |
| `codex-gui/src/features/guiHost/__tests__/guiHostHandshake.test.ts` | 08 | 02 | `RA-08-002`；production handshake 行为归 `RA-02-002`、`RA-02-003` |
| `codex-gui/src/features/guiHost/__tests__/guiHostLaunchParams.test.ts` | 08 | 02 | `RA-08-002`；production launch 行为归 `RA-02-001` |
| `codex-gui/src/features/guiHost/__tests__/guiHostProtocolErrors.test.ts` | 08 | 02 | `RA-08-002`；production protocol error 行为归 `RA-02-002`、`RA-02-003` |
| `codex-gui/src/features/liveEventHandling/__tests__/liveEventHandling.test.ts` | 08 | 04 | `RA-08-002`；timeline test support；production 采用状态归 `RA-04-001` |
| `codex-gui/src/features/projection/__fixtures__/attach-baseline.json` | 08 | 02、03 | `RA-08-002`；typed projection fixture |
| `codex-gui/src/features/projection/__fixtures__/attach-replacement.json` | 08 | 02、03 | `RA-08-002`；typed projection fixture |
| `codex-gui/src/features/projection/__fixtures__/closed-backpressure.json` | 08 | 02、03 | `RA-08-002`；typed projection fixture |
| `codex-gui/src/features/projection/__fixtures__/event-agent-message-delta.json` | 08 | 02、03、05 | `RA-08-002`；typed projection fixture |
| `codex-gui/src/features/projection/__fixtures__/event-item-completed.json` | 08 | 02、03、04、05 | `RA-08-002`；typed projection fixture |
| `codex-gui/src/features/projection/__fixtures__/event-item-started.json` | 08 | 02、03、04、05 | `RA-08-002`；typed projection fixture |
| `codex-gui/src/features/projection/__fixtures__/event-reasoning-item-completed.json` | 08 | 02、03、04、05 | `RA-08-002`；typed projection fixture |
| `codex-gui/src/features/projection/__fixtures__/event-reasoning-item-started.json` | 08 | 02、03、04、05 | `RA-08-002`；typed projection fixture |
| `codex-gui/src/features/projection/__fixtures__/event-reasoning-summary-part-added-delta.json` | 08 | 02、03、05 | `RA-08-002`；typed projection fixture |
| `codex-gui/src/features/projection/__fixtures__/event-reasoning-summary-text-delta.json` | 08 | 02、03、05 | `RA-08-002`；typed projection fixture |
| `codex-gui/src/features/projection/__fixtures__/event-reasoning-text-delta.json` | 08 | 02、03、05 | `RA-08-002`；typed projection fixture |
| `codex-gui/src/features/projection/__fixtures__/event-subscription-replacement.json` | 08 | 02、03 | `RA-08-002`；typed projection fixture |
| `codex-gui/src/features/projection/__fixtures__/event-turn-completed.json` | 08 | 02、03、04、05 | `RA-08-002`；typed projection fixture |
| `codex-gui/src/features/projection/__fixtures__/event-turn-started.json` | 08 | 02、03、04、05 | `RA-08-002`；typed projection fixture |
| `codex-gui/src/features/projection/__tests__/projectionFixtures.test.ts` | 08 | 02、03 | `RA-08-002`；generated JSON typed facade contract test |
| `codex-gui/src/features/projection/__tests__/projectionFixtures.ts` | 08 | 02、03 | `RA-08-002`；projection fixture typed facade |
| `codex-gui/src/features/projection/__tests__/projectionTestBuilders.ts` | 08 | 02、03、04 | `RA-08-001`、`RA-08-002`；`runtimeFromAttach` owner 错位，其余 protocol builders 保留 |
| `codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts` | 08 | 03 | `RA-08-002`；feature-local ingress helpers；行为归 `RA-03-005` |
| `codex-gui/src/features/qrAccess/__tests__/QrAccessPopover.browser.test.tsx` | 08 | 02、07 | `RA-08-002`；feature-local browser harness；行为归 `RA-07-004` |
| `codex-gui/src/features/qrAccess/__tests__/qrAccessUrl.test.ts` | 08 | 02、07 | 纯 production behavior test；不建立 test-infra finding |
| `codex-gui/src/features/snapshotReplay/__tests__/snapshotReplay.test.ts` | 08 | 03、04 | `RA-08-001` 条件性交界；production 采用状态归 `RA-04-001` |
| `codex-gui/src/features/threadIdentity/__tests__/threadIdentitySlice.test.ts` | 08 | 03 | 纯 production behavior test；行为归 `RA-03-004` |
| `codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts` | 08 | 03、05 | `RA-08-002`；显式 reducer/action harness；行为归 `RA-03-002`、`RA-03-003`、`RA-03-004` |
| `codex-gui/src/features/transcriptState/__tests__/transcriptStateCommittedProjection.test.ts` | 08 | 05 | `RA-08-002`；Transcript committed behavior test |
| `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemIndex.test.ts` | 08 | 05 | `RA-08-002`；Transcript live item index behavior test |
| `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveItemLifecycle.test.ts` | 08 | 05 | `RA-08-002`；Transcript lifecycle behavior test |
| `codex-gui/src/features/transcriptState/__tests__/transcriptStateLiveStreaming.test.ts` | 08 | 03、05 | `RA-08-002`；显式 delta/action behavior test |
| `codex-gui/src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts` | 08 | 03、05 | `RA-08-002`；显式 reconnect behavior test |
| `codex-gui/src/features/transcriptState/__tests__/transcriptStateReplayDedup.test.ts` | 08 | 03、05 | `RA-08-002`；显式 replay/dedup behavior test |
| `codex-gui/src/features/transcriptState/__tests__/transcriptStateScrollSignals.test.ts` | 08 | 05、06 | `RA-08-002`；Transcript scroll signal behavior test |
| `codex-gui/src/features/transcriptState/__tests__/transcriptStateSelectorCache.test.ts` | 08 | 05、06 | `RA-08-002`；selector cache behavior test |
| `codex-gui/src/features/transcriptState/__tests__/transcriptStateSnapshot.test.ts` | 08 | 03、05 | `RA-08-002`；snapshot projection behavior test |
| `codex-gui/src/utils/TestProvider.tsx` | 08 | 01、07 | `RA-08-002`；通用测试 provider；`RA-01-003` 排除 production/test 统一 wrapper |
| `codex-gui/src/utils/test-utils.tsx` | 08 | 01、06、07 | `RA-08-002`；通用 browser render helper |

总计 88 个 canonical paths，分布为 `9/2/4/2/7/6/12/46`；secondary overlap 只表达交界引用，不产生第二 canonical owner。

## 跨域依赖结论

状态：完成；明确无 09 自有 finding。

- GUI host 的 `LaunchParams`、status 与 commands 由 AppShell、Composer 和 QR/access 单向消费；输入侧由 [RA-02-001](./02-gui-host-transport-and-protocol.md#ra-02-001) 与 [RA-02-002](./02-gui-host-transport-and-protocol.md#ra-02-002) 拥有，QR/access 消费侧由 [RA-07-004](./07-composer-access-and-localization.md#ra-07-004) 拥有，没有反向依赖。
- Projection ingress 的 outcome/reconnect reason 单向进入 application coordination、thread runtime、Transcript State 与未接入 timeline materials；类型 owner 与依赖方向由 [RA-03-005](./03-projection-ingress-and-thread-runtime.md#ra-03-005) 覆盖。
- Bridge producer、thread runtime action contract 与 Transcript State consumer 的 delta 链由 [RA-03-001](./03-projection-ingress-and-thread-runtime.md#ra-03-001)、[RA-03-003](./03-projection-ingress-and-thread-runtime.md#ra-03-003) 和 [RA-05-001](./05-transcript-state-and-materialization.md#ra-05-001) 分别拥有；未发现 runtime 对 transcript/AppShell 的反向 import。Batch action owner 没有新增独立错位证据，不升级为 09 finding。
- Snapshot/live `TimelineMaterial` 的跨来源组合和与 Transcript State 的重复领域表示已由 [RA-04-001](./04-timeline-materials-and-domain-models.md#ra-04-001) 裁决为未接入并行管道；不在 09 重复建立 common timeline owner。
- Transcript selectors/views 到 committed transcript UI，再到 AppShell sticky effect 的依赖方向由 [RA-05-001](./05-transcript-state-and-materialization.md#ra-05-001) 与 [RA-06-001](./06-transcript-rendering-streaming-and-scroll.md#ra-06-001) 覆盖，没有 state 对 UI/DOM 的反向依赖。

## 跨报告去重

状态：完成。20 个 Finding ID 保持原编号、原 Evidence owner 与原裁决，不合并、不删除。

- 报告 01：稳定交界引用修订已关闭；无技术结论变化。
- 报告 02：三个 finding 固定字段与稳定链接修订已关闭；无技术结论变化。
- 报告 03：前三个 finding 固定字段、关联字段与稳定链接修订已关闭；无技术结论变化。
- 报告 04：RA-04-001 固定字段与 RA-03-001 稳定链接修订已关闭；无技术结论变化。
- 报告 05：中文完成状态与 `重构优先级` 字段修订已关闭；合法状态“已有专项设计”保持不变。
- 报告 06：RA-01-001 稳定链接修订已关闭；无技术结论变化。
- 报告 07：01/02 语义链接修订已关闭；四个 finding 裁决保持不变。
- 报告 08：无需修订。

### 实施批次关系

- `RA-08-001 -> RA-04-001` 仅允许条件性吸收：如果 `RA-04-001` 的实施删除 snapshot replay 专属测试及其未接入管道，`runtimeFromAttach` 会随唯一消费者一并消失，可在同一实施批次关闭 `RA-08-001`；如果 snapshot replay 测试仍保留，`RA-08-001` 必须作为独立 test-only owner 迁移批次保留。该吸收不合并或重编号两个 Finding。
- [RA-02-002](./02-gui-host-transport-and-protocol.md#ra-02-002) 与 [RA-02-003](./02-gui-host-transport-and-protocol.md#ra-02-003) 可在同一 transport/protocol 设计中统筹接口，但实施批次保持独立：前者处理 handshake/request 生命周期，后者处理 runtime validation/trust boundary。
- [RA-03-002](./03-projection-ingress-and-thread-runtime.md#ra-03-002) 可先于 [RA-03-001](./03-projection-ingress-and-thread-runtime.md#ra-03-001) 清理重复 replay index；两者不得合并，前者是单一状态 owner，后者是 application coordination 边界。
- [RA-07-002](./07-composer-access-and-localization.md#ra-07-002) 与 [RA-07-003](./07-composer-access-and-localization.md#ra-07-003) 必须分离：前者是未接入 i18n 示例/切换表面清理，后者仍是 production NotFound localization 的候选待补证据。

### 实施排除

- 不进入重构实施批次的非 finding/专项设计 ID：`RA-01-001`、`RA-01-002`、`RA-01-003`、`RA-03-004`、`RA-03-005`、`RA-05-001`、`RA-06-001`、`RA-07-004`、`RA-08-002`。
- `RA-07-003` 在补足 production localization 证据并重新裁决前，不与确认重构点合并实施。
- 禁止为跨报告表面复用新建宽泛 `shared`、`common`、`utils`、通用 event bus、common-types 或统一 lifecycle/provider 抽象。只有出现稳定共同语义、至少两个真实 production owner 和明确单向依赖后，才能另行设计。

## 已排除项

状态：完成。

- Reconciliation 未改变 01-08 的技术结论、Finding ID、状态、优先级或 canonical path 归属，只规范固定字段与跨报告链接。
- 本轮不将格式缺失解释为 Evidence owner 缺失；owner 实质判断与文本格式修订分开处理。
- Coverage scan 只判断 canonical path ownership 与 secondary overlap，不重新审计源码行为。
- 不把多 feature 消费同一稳定类型解释为 owner 冲突，不把 type-only import 或单向 selector/action consumption 解释为循环依赖。
- 不把无新增证据的 batch action owner、future common module 或联合设计可能性升级为 09 finding。
- 不以实施批次统筹替代独立 Finding 的验收边界；条件性吸收只影响执行顺序，不改变历史裁决。

## 风险

状态：完成。

- 第 1 轮 owner/coverage snapshot 已被 reconciliation 修订失效，并由本次第二轮复扫结果替代。
- 后续修改 01-08 Finding 字段、交界链接或文件覆盖表时，必须重新执行 owner/coverage 扫描，避免 stable snapshot 漂移。
- 联合实施 `RA-03-001`、`RA-03-003` 或 `RA-04-001` 时，必须重新核对 accepted-delta contract 与 projection/transcript 依赖方向，避免引入反向依赖或新的重复领域表示。
- `RA-08-001` 的条件性吸收必须以 snapshot replay 专属测试是否实际删除为门禁，不能仅因两个 Finding 相邻而提前关闭。
