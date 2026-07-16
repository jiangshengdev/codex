# Codex GUI 重构审计总报告

状态：完成

## 总体结论

状态：完成。

- 01–08 共形成 20 个稳定 Finding ID；09 完成 owner、coverage、跨域依赖与去重收敛，不建立自有 Finding。
- 审计完成时状态分布为：确认重构点 10、候选待补证据 1、已由现有抽象覆盖 7、不建议重构 1、已有专项设计 1。
- 优先级分布为：P2 8、P3 3、非 finding 9。
- 88 个 canonical paths 已全部覆盖，01–08 分布为 `9/2/4/2/7/6/12/46`，无遗漏、重复 canonical owner 或 secondary overlap 冲突。
- 10 个确认重构点归入 9 个必需实施批次和 1 个条件批次；另保留 1 个证据门禁，不在证据补足前实施。

## 审计进度

| 微阶段 | 状态 | 结论 |
| --- | --- | --- |
| `R00-INDEX` | 完成 | 汇总 01–09 分报告索引、20 个 Finding、状态/优先级计数与 88 路径覆盖。 |
| `R00-BATCHES` | 完成 | 汇总 B01–B10 与 G01；保持 09 已确认的独立批次、条件吸收和证据门禁。 |
| `R00-COMPLETE` | 完成 | 总报告仅汇总 01–09 稳定结论，不新增 Finding、owner、状态、优先级、源码证据或推荐边界。 |

## 分报告索引

| 分报告 | 状态 | 稳定 Finding 覆盖 | Canonical paths |
| --- | --- | --- | ---: |
| [01 App 入口、Shell 与平台边界](./01-app-entry-shell-and-platform.md) | 完成 | 3 个：2 个已由现有抽象覆盖、1 个不建议重构 | 9 |
| [02 GUI Host 传输与协议](./02-gui-host-transport-and-protocol.md) | 完成 | 审计完成时 3 个确认重构点，均为 P2 | 2 |
| [03 Projection Ingress 与 Thread Runtime](./03-projection-ingress-and-thread-runtime.md) | 完成 | 5 个：2 个 P2、1 个 P3、2 个已由现有抽象覆盖 | 4 |
| [04 Timeline Materials 与领域模型](./04-timeline-materials-and-domain-models.md) | 完成 | 1 个确认重构点，P2 | 2 |
| [05 Transcript State 与 Materialization](./05-transcript-state-and-materialization.md) | 完成 | 1 个已有专项设计，非 finding | 7 |
| [06 Transcript 渲染、流式更新与滚动](./06-transcript-rendering-streaming-and-scroll.md) | 审计完成 | 1 个已由现有抽象覆盖，非 finding | 6 |
| [07 Composer、访问能力与本地化](./07-composer-access-and-localization.md) | 完成 | 4 个：2 个 P2、1 个 P3 候选、1 个已由现有抽象覆盖 | 12 |
| [08 测试基础设施、Fixture 与支持代码](./08-test-infrastructure-fixtures-and-support.md) | 审计完成 | 2 个：1 个 P3、1 个已由现有抽象覆盖 | 46 |
| [09 跨域边界与排除项](./09-cross-cutting-boundaries-and-exclusions.md) | 完成 | 无自有 Finding；汇总 20 个稳定 ID 与 88 个 canonical paths | — |

## Finding 索引

| Finding ID | 标题 | Evidence owner | 状态 | 重构优先级 |
| --- | --- | --- | --- | --- |
| [RA-01-001](./01-app-entry-shell-and-platform.md#ra-01-001) | Typed Redux hooks 已覆盖应用状态访问边界 | [01](./01-app-entry-shell-and-platform.md) | 已由现有抽象覆盖 | 非 finding |
| [RA-01-002](./01-app-entry-shell-and-platform.md#ra-01-002) | App slice creator 已覆盖当前 slice 构造语义 | [01](./01-app-entry-shell-and-platform.md) | 已由现有抽象覆盖 | 非 finding |
| [RA-01-003](./01-app-entry-shell-and-platform.md#ra-01-003) | 不建议新增统一 provider wrapper | [01](./01-app-entry-shell-and-platform.md) | 不建议重构 | 非 finding |
| [RA-02-001](./02-gui-host-transport-and-protocol.md#ra-02-001) | Launch params 生命周期被嵌入 transport owner | [02](./02-gui-host-transport-and-protocol.md) | 已实施（B01） | P2 |
| [RA-02-002](./02-gui-host-transport-and-protocol.md#ra-02-002) | Handshake 阶段被 request ID 隐式编码并与 transport 生命周期混合 | [02](./02-gui-host-transport-and-protocol.md) | 已实施（B02） | P2 |
| [RA-02-003](./02-gui-host-transport-and-protocol.md#ra-02-003) | Runtime protocol guards 声明强于实际验证范围 | [02](./02-gui-host-transport-and-protocol.md) | 确认重构点 | P2 |
| [RA-03-001](./03-projection-ingress-and-thread-runtime.md#ra-03-001) | Bridge 集中承担 projection application coordination | [03](./03-projection-ingress-and-thread-runtime.md) | 已实施（B05） | P2 |
| [RA-03-002](./03-projection-ingress-and-thread-runtime.md#ra-03-002) | Snapshot replay index 在 Bridge 与 Redux runtime 重复持有 | [03](./03-projection-ingress-and-thread-runtime.md) | 已实施（B04） | P2 |
| [RA-03-003](./03-projection-ingress-and-thread-runtime.md#ra-03-003) | 单条 runtime delta action 已成为生产遗留与类型耦合 | [03](./03-projection-ingress-and-thread-runtime.md) | 已实施（B06） | P3 |
| [RA-03-004](./03-projection-ingress-and-thread-runtime.md#ra-03-004) | Thread identity 与 runtime 主生命周期边界已由现有抽象覆盖 | [03](./03-projection-ingress-and-thread-runtime.md) | 已由现有抽象覆盖 | 非 finding |
| [RA-03-005](./03-projection-ingress-and-thread-runtime.md#ra-03-005) | Adapter filtering/reconnect 契约已由现有抽象覆盖 | [03](./03-projection-ingress-and-thread-runtime.md) | 已由现有抽象覆盖 | 非 finding |
| [RA-04-001](./04-timeline-materials-and-domain-models.md#ra-04-001) | 未接入 production 的 timeline-material 并行管道 | [04](./04-timeline-materials-and-domain-models.md) | 确认重构点 | P2 |
| [RA-05-001](./05-transcript-state-and-materialization.md#ra-05-001) | Transcript State 内部拆分已有专项设计 | [05](./05-transcript-state-and-materialization.md) | 已有专项设计 | 非 finding |
| [RA-06-001](./06-transcript-rendering-streaming-and-scroll.md#ra-06-001) | 渲染、Markdown 与 sticky-bottom 职责已由现有抽象覆盖 | [06](./06-transcript-rendering-streaming-and-scroll.md) | 已由现有抽象覆盖 | 非 finding |
| [RA-07-001](./07-composer-access-and-localization.md#ra-07-001) | Composer stop 缺少 pending 门禁 | [07](./07-composer-access-and-localization.md) | 确认重构点 | P2 |
| [RA-07-002](./07-composer-access-and-localization.md#ra-07-002) | 未接入 production 的 i18n 示例与切换表面 | [07](./07-composer-access-and-localization.md) | 确认重构点 | P2 |
| [RA-07-003](./07-composer-access-and-localization.md#ra-07-003) | Production NotFound localization 覆盖不足 | [07](./07-composer-access-and-localization.md) | 候选待补证据 | P3 |
| [RA-07-004](./07-composer-access-and-localization.md#ra-07-004) | Viewport 与 QR/access 已由现有抽象覆盖 | [07](./07-composer-access-and-localization.md) | 已由现有抽象覆盖 | 非 finding |
| [RA-08-001](./08-test-infrastructure-fixtures-and-support.md#ra-08-001) | `runtimeFromAttach` 位于 projection-wide builders 的 owner 错位 | [08](./08-test-infrastructure-fixtures-and-support.md) | 确认重构点 | P3 |
| [RA-08-002](./08-test-infrastructure-fixtures-and-support.md#ra-08-002) | 测试装配、fixtures、transport harness 与 feature-local helpers 已由现有抽象覆盖 | [08](./08-test-infrastructure-fixtures-and-support.md) | 已由现有抽象覆盖 | 非 finding |

## 状态汇总

状态：完成。

| 状态 | 数量 |
| --- | ---: |
| 确认重构点 | 10 |
| 候选待补证据 | 1 |
| 已由现有抽象覆盖 | 7 |
| 不建议重构 | 1 |
| 已有专项设计 | 1 |
| 合计 | 20 |

## 优先级汇总

状态：完成。

| 重构优先级 | 数量 |
| --- | ---: |
| P2 | 8 |
| P3 | 3 |
| 非 finding | 9 |
| 合计 | 20 |

## 建议批次

状态：完成。以下批次只汇总各主报告与 09 已确认的设计入口、实施关系和排除边界；每个批次仍需独立通过“设计确认 → 计划确认 → 实施”门禁。

9 个必需实施批次为 B01–B07、B09、B10；B08 为条件批次。G01 仅为证据门禁，不是实施批次。

| 批次 | Finding | 稳定设计入口或门禁 | 关系 |
| --- | --- | --- | --- |
| B01 | [RA-02-001](./02-gui-host-transport-and-protocol.md#ra-02-001) | 独立确定 browser launch params owner | 无既定前置依赖 |
| B02 | [RA-02-002](./02-gui-host-transport-and-protocol.md#ra-02-002) | transport session、handshake owner 与 command gateway | 可与 B03 共用一份 transport/protocol 设计；实施和验收独立 |
| B03 | [RA-02-003](./02-gui-host-transport-and-protocol.md#ra-02-003) | runtime validation/trust boundary | 可与 B02 共用设计；实施和验收独立，不建立先后依赖 |
| B04 | [RA-03-002](./03-projection-ingress-and-thread-runtime.md#ra-03-002) | replay classification 的单一 owner 与 index 生命周期 | 必须允许先于 B05，保持独立批次 |
| B05 | [RA-03-001](./03-projection-ingress-and-thread-runtime.md#ra-03-001) | application coordination owner | `B04 -> B05`；不得与 B04 合并 |
| B06 | [RA-03-003](./03-projection-ingress-and-thread-runtime.md#ra-03-003) | 清理无 production dispatch 的单条 delta action | 与 B05 无硬依赖；联合处理时仍保持独立验收边界 |
| B07 | [RA-04-001](./04-timeline-materials-and-domain-models.md#ra-04-001) | 删除或收缩未接入 production 的 snapshot/live timeline-material 管道 | 完成时决定 B08 是否存在 |
| B08（条件） | [RA-08-001](./08-test-infrastructure-fixtures-and-support.md#ra-08-001) | snapshot replay-local test helper owner 迁移 | B07 删除 snapshot replay 专属测试时由 B07 条件吸收；保留测试时独立实施 |
| B09 | [RA-07-001](./07-composer-access-and-localization.md#ra-07-001) | 在现有 Composer owner 内增加 stop pending 门禁 | 无既定前置依赖 |
| B10 | [RA-07-002](./07-composer-access-and-localization.md#ra-07-002) | 删除或收缩未接入的 i18n 示例、切换表面及专属消息 | 与 G01 分离，不包含 NotFound localization |
| G01（证据门禁） | [RA-07-003](./07-composer-access-and-localization.md#ra-07-003) | 先确认 production localization 范围与 NotFound 测试要求 | 补足证据并重新裁决前不得实施；不得并入 B10 |

## 实施状态更新

状态：持续更新。本节记录当前实施进度；已实施批次更新 Finding 当前状态，但不改变标题、优先级、Evidence owner 或审计完成时统计。

| 批次 | 实施状态 | 完成日期 | 本地提交 | 验证结果 |
| --- | --- | --- | --- | --- |
| B01 | 已完成 | 2026-07-15 | `b8875b53a` `test(gui): lock browser launch lifecycle`；`ca4e3cd18` `refactor(gui): extract browser launch params owner`；`76c055797` `test(gui): satisfy browser launch lint` | 聚焦 Node tests `18/18` 通过；Chromium `App.browser.test.tsx` `29/29` 通过；限定文件 format、oxlint、ESLint、type-check 与 owner/排除边界搜索通过；最终专项审查无 findings；未操作远程。 |
| B02 | 已完成 | 2026-07-15 | `5636f0fad` `test(gui): lock gui host connection lifecycle`；`5c0832add` `refactor(gui): add gui host transport session`；`bcd78e75f` `refactor(gui): add gui host handshake and command owners`；`796706d50` `refactor(gui): split gui host connection owners`；`c725e8b3c` `fix(gui): close B02 verification findings`；`94035eb81` `fix(gui): preserve B02 public error semantics` | 聚焦 GUI host `6` 个文件、`81/81` tests 通过，Type Errors none；`pnpm run lint` 与 `pnpm run type-check` 通过；`pnpm run ci` 通过（`28/28` test files、`243/243` tests、Type Errors none；format check 通过（检查 `112` files），lint/type-check 通过）。四项 source search 均无匹配：production `message.id === 1/2/3`、facade old shared state（`terminalOnError`、`commandsReady`、`pendingRequests`、`nextRequestId`）、transport handshake/command methods、transport projection notification methods。范围仍仅含 `4` 个 production 与 `7` 个 feature-local test/support 文件，共 `11` 个文件，排除 protocol、browserLaunch、Bridge、Redux、projection、UI、Rust、lock/snapshot/generated。总量为 `1924` additions + `266` deletions = `2190` lines，超过 `800`；已按现有五个独立审查阶段拆分：characterization + TransportSession `763`、HandshakeController + CommandGateway `687`、facade `570`、第一轮 verification fix `470`、公开错误语义 fix `372`，每阶段均小于 `800`；排除审计文档后，两个 fix 阶段的 code/test 合并净 diff 为 `808`，不可合并。未操作远程、未安装依赖，未运行 Browser/Playwright/snapshot/Rust tests。 |
| B04 | 已完成 | 2026-07-15 | `74def529c` `test(gui): cover replay baseline lifecycle`；`39c036c25` `refactor(gui): remove duplicate replay index state` | fnm-managed `pnpm 10.33.0` 下 `pnpm run ci` 通过（24 个 unit 文件、157 个测试）；定向 `App.browser.test.tsx` Browser Mode 通过（3 个执行实例、87 个测试）；结构检查确认 Bridge 为唯一 production runtime replay index owner。 |
| B05 | 已完成 | 2026-07-15 | `3ae09b518` `refactor(gui): add projection application coordinator`；`b89880e1f` `refactor(gui): delegate projection coordination` | coordinator 单文件测试 `19/19` 通过；App browser 回归在 Chromium、Firefox、WebKit 各 `29/29` 通过；完整 GUI CI 共 `25` 个文件、`176` 个测试通过，format、oxlint、eslint、type-check 均通过；最终审查无 findings；未操作远程。 |
| B06 | 已完成 | 2026-07-15 | `2afe739ff` `refactor(gui): remove single accepted delta action` | Node `7` 个文件、`62` 个测试通过；Browser `1` 个文件、`16` 个测试通过；`oxfmt --check`、lint、type-check 与旧符号残留搜索通过；Spec、testing、breaking-change、change-size、model-context、code-quality 审查均无 findings；未操作远程。 |

## 依赖顺序

状态：完成。

- `B04 -> B05` 是唯一明确的先后依赖；B04 与 B05 保持独立 Finding 和验收边界。
- B07 必须在设计中明确是否实际删除 snapshot replay 专属测试：删除时条件吸收 B08，保留时生成独立 B08。
- B02 与 B03 可使用一份共同 transport/protocol 设计，但后续计划、实施和验收必须拆分。
- B06 与 B05 无硬依赖；若联合实施，仍需分别核对各自稳定边界。
- B10 与 G01 不合并；G01 在证据补足并重新裁决前没有实施批次。

## 证据不足与排除项

状态：完成。

- G01 / `RA-07-003` 仅为候选待补证据；在确认 production localization 范围和 NotFound 测试要求前不得实施。
- 不进入实施批次：`RA-01-001`、`RA-01-002`、`RA-01-003`、`RA-03-004`、`RA-03-005`、`RA-05-001`、`RA-06-001`、`RA-07-004`、`RA-08-002`。
- 不因跨报告表面复用新增宽泛 `shared`、`common`、`utils`、通用 event bus、common-types 或统一 lifecycle/provider 抽象。
- 不以共同设计、实施排序或条件吸收合并、删除或重编号 Finding，也不改变原 Evidence owner、状态和优先级。
- 本总报告不新增源码证据、owner、状态、优先级、Finding 或推荐边界；全部结论引用 01–09 稳定报告。
