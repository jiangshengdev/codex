# Codex GUI 时间呈现微调实施计划

日期：2026-09-12

状态：用户已确认两个 ticket 的拆分，计划落盘；等待明确开始实现。本轮只写工作文档，不测试、不提交、不修改产品代码。

设计依据：[时间呈现微调设计](../../../../../specs/2026/09/12/2026-09-12-codex-gui-turn-time-presentation-design.md)。

## 目标与任务

1. [时间标签居中与耗时分隔线](issues/01-time-label-and-duration-separator.md)：Blocked by 无。
2. [turn 底部静态结束时间](issues/02-static-turn-completion-time.md)：Blocked by 无。

每项覆盖展示到用户可见行为验证，不拆出组件层、数据层等水平任务。任务 2 不依赖任务 1 的产物；最终组合验证依赖两项提交。沿用项目日期目录与一票一文件约定，不发布外部 tracker。

## 已核验事实与边界

- transcript 的 `TranscriptTurn` 已从生成 `Turn` 机械派生 `startedAt`、`completedAt`、`durationMs`，更新链路已保存三字段；结束时间直接使用现有 `completedAt`，无需修改协议、Rust 或数据模型。
- turn fragment 的首输入后已有耗时组件，最后一个 fragment 的终态底部已有分叉动作；这是两项呈现修改的集成位置。
- 时间标签与耗时已有 surface Browser 测试和共享 projection fixtures/builders；分叉已有应用级 Browser 回归入口。
- HeroUI 本地源码与项目安装依赖均为 3.2.4；使用 `Typography`、`Separator` 及现有分叉 `Button`。
- 当前 checkout 分支为 `dev`，当前待保存变更为本次设计文档。实施前重新核验工作区，不覆盖其他工作。
- 真实 GUI URL 和所需历史样本尚未取得，只阻塞相应 Level 2 验收与通过声明。

## 产品与实现约束

- 时间标签使用 `Typography type="body-xs" color="muted" align="center"`，相对聊天内容区域居中。保留 `<time>` 语义和原有四小时分段、跨日期、真实开始时间及分页去重规则。
- 耗时使用弱化的小号 `Typography` 与等宽数字，保留运行中和终态口径及首输入锚点；其下使用水平 `Separator variant="tertiary"`。缺少可显示耗时时同时省略线，不留下空白分隔。
- 结束时间在最后一个 fragment 的终态底部显示一次，位于分叉按钮右侧。采用本地时区、24 小时制、两位 `HH:mm`；缺少权威 `completedAt` 时省略，不估算。
- 成功、失败和中断均适用；结束时间与耗时数据独立判断。分叉动作不可用或不渲染不隐藏已知结束时间。按钮与时间在窄屏允许换行，避免横向溢出。
- 结束时间是静态 `Typography` 与 `<time>`，保留机器可读 `dateTime`。不使用 Tooltip、原生 `title`、额外完整时间提示、`tabIndex` 或键盘事件；不为辅助时间增加 Tab 停留点。现有分叉按钮的键盘交互不受影响。
- 分叉按钮沿用 `variant="secondary" size="sm"`，保留 pending、disabled 和分叉语义。状态沿用已有组件，不重复增加。
- 保留 chunk 级渲染与折叠边界，不拍平 turn entries，不让计时更新带动无关历史内容重渲染。
- 本地化继续使用 Lingui 与 Intl。没有新增文案需求时不引入消息；若组件迁移影响提取 references，按 Lingui 的权威流程处理两个现有 catalog。

## 文件与资源集合

根目录为 `/Users/jiangsheng/cnb/codex`，以下为相对路径。

- `D`：本设计、本计划及本目录下两份 ticket。
- `S1`：`codex-gui/src/features/committedTranscriptSurface/TranscriptTimeLabel.tsx`、`TranscriptTurnDuration.tsx`、`CommittedTranscriptTurnFragment.tsx`，及其目录下现有时间标签、耗时 Browser 测试和确需调整的共享测试 fixtures。
- `S2`：同目录下 `CommittedTranscriptTurnFragment.tsx`、拟新增的静态结束时间组件与 Browser 测试、共享测试 fixtures；`codex-gui/src/__tests__/AppThreadFork.browser.test.tsx`。分叉动作本体仅在当前组合入口确有需要时作本目标内调整，不改变其行为。
- `G`：`codex-gui/src/locales/en.po`、`codex-gui/src/locales/zh-CN.po`，仅当权威提取导致变化时进入写集合。
- `R`：D、S1、S2、G 加 transcriptState、projection fixtures/builders、threadFork、生产 surface 挂载入口及 GUI 工具链与测试配置，仅只读。
- 排除 Rust、协议生成物、依赖、全局配置、无关 UI 和旧版工作文档。

## 执行 DAG

节点由以下公共字段、任务集合及节点表合并展开，字段含义遵守执行图契约。

- `owner`：主代理，负责本计划的编辑、验证及唯一 Git index 写入；`subdelegation`：无。当前是同一 fragment 内两个有界呈现切片，没有独立调查缺口或指定独立审查任务。委派交接不能改善当前证据质量，不为文件数量创建子代理。
- `executionContext`：当前 checkout、`dev` 分支、当前仓库 index；不创建 worktree 或新分支。实现前复核 canonical 路径及状态。
- `authorizationGate`：文档写入已获授权；以下执行节点等待明确开始实现。执行时由 action-authorization 为各动作建立最小能力信封。
- `readSet`：R；编辑写集合按任务为 S1 或 S2；生成写 G；格式化写当前任务实际变更文件；验证仅工具自动产物；stage 写 index；commit 写本地 Git 对象和当前分支。
- `commandScope`：只读核验、普通源码 patch、项目 owner 的生成/格式化/测试入口、精确路径 stage 和本地 commit。开始每类命令前按工具链完成预检，不安装、不执行远程 Git 或后端构建。
- `resourceLocks`：S1/S2 实际交集的 canonical 文件为写锁，稳定读取为读锁；G 两个 canonical 文件为生成写锁；`/Users/jiangsheng/cnb/codex` 实际 Git index 为唯一写锁；GUI runner 和验收浏览器会话按实际 canonical 资源独占。
- `stateEffects`：严格随上述 operationKind，不借验证或生成扩大主动修改范围。
- `verification`：本任务验收条件与下述项目入口；stage/commit 额外要求 ordinary/staged diff、路径集合及空白检查通过。
- `failureDomain`：失败节点及消费其不稳定产物的后继；共享 fragment 损坏时影响读取该 fragment 的验证，不自动暂停无关工作。
- `replanTriggers`：需要协议变更、新产品行为、范围外资源、可见窗口或新状态操作授权。计划内错误补充有界修正节点，不以失败为终态。
- `deferralEvidence`：两个切片并行编辑最多节省其中较短的展示改动时间，但当前共享 fragment、时间测试、catalog 与 index；隔离编辑需要新增工作树、相同组件的合并与重复验证，协调成本抵消当前小范围编辑收益。因此保持当前 checkout，按实际文件锁协调，先持锁任务完成提交后释放。任务边界或写集合变化时立即复查；冲突消除后该依据失效，不将资源等待写成 ticket 的硬依赖。

| nodeId | taskBoundary | operationKind | hardPredecessors / consumes | outcome / produces / completionEvidence | estimatedCost |
| --- | --- | --- | --- | --- | --- |
| D-S | 独立文档提交 | stage | 实现授权、已审查的 D | 精确暂存 D，staged diff 与空白检查通过 | 小 |
| D-C | 独立文档提交 | commit | D-S 的 index | 独立文档 commit id | 小 |
| T1-E | ticket 1 | 编辑 | D-C 的稳定设计与计划 | S1 展示与行为测试 diff | 小 |
| T2-E | ticket 2 | 编辑 | D-C 的稳定设计与计划 | S2 静态时间与行为测试 diff | 中 |
| T1-G / T2-G | 对应 ticket | 生成 | 对应 E 稳定源码 | 如需提取，G 审查并重复提取稳定；无变化记录证据 | 小 |
| T1-F / T2-F | 对应 ticket | 格式化 | 对应 G 稳定产物 | 限定任务文件格式化及非 fix 复验通过 | 小 |
| T1-V / T2-V | 对应 ticket | 验证 | 对应 F 稳定产物 | 受影响 Browser、类型和 lint 证据 | 中 |
| T1-S / T2-S | 对应 ticket | stage | 对应 V 通过及稳定 diff | 精确任务 index，经 staged 审查 | 小 |
| T1-C / T2-C | 对应 ticket | commit | 对应 S 的 index | 各一个独立行为 commit id | 小 |
| FINAL-V | 无提交，汇合 | 验证 | T1-C 与 T2-C 的组合状态 | 最终受影响组合验证及各级验收证据 | 中 |

初始执行 ready set 为 D-S；D-C 后两个编辑节点同时满足硬前置，构成 fan-out；FINAL-V 是 fan-in。逻辑关键路径由文档提交、较长 ticket 链及最终验证构成，实际时长受已声明的共享文件锁影响。两个 ticket 不依赖彼此完成，仅避免重叠写入和混合暂存。

每项任务一个独立本地行为提交。禁止 amend、squash、强制暂存、远程操作；代码行为修改与纯重排不得混在同一提交。不得为了中间提交通过而引入临时兼容路径。最终完整性按两个任务合并状态验收。

## 验证与生成策略

已读取当前 package scripts；本次不运行。实施前使用 codex-gui-toolchain 核验 fnm 管理的 Node/pnpm、实际工作目录、测试文件、配置及已有浏览器二进制，不使用 Codex runtime shim，不安装缺失工具。

- 类型与 lint：使用项目 `type-check`、`lint` 入口；格式化遵循 oxfmt owner，fix 限定实际文件，随后非 fix 验证。
- Browser：使用 `test:browser:parallel` 的文件过滤入口，覆盖现有 `CommittedTranscriptTiming.browser.test.tsx`、`CommittedTranscriptTimeLabels.browser.test.tsx`、新增结束时间行为测试、`AppThreadFork.browser.test.tsx`，以及实际受影响的分页/折叠测试。最终文件验证不带名称过滤，核对真实收集数量，零测试不算通过。
- 验证真实布局与用户结果：居中位置、分隔线相对位置、无耗时不留线、按钮右侧常驻时间、终态与缺失数据、历史/重连/分页唯一性、窄屏无横向溢出。静态时间不得增加悬浮提示或 Tab 停留点；原有按钮交互继续有效。
- 保留原有严格断言，不删除覆盖、不扩大阈值、不用新豁免掩盖失败。仅在影响面或失败证据支持时扩大验证，不默认跑全套。
- 若需 Lingui 提取，使用 `messages:extract` 权威入口。输入 owner 为当前 Lingui 配置下源码，完整输出边界为 G；仅人工补充本功能必要翻译，审查所有 references、comments、msgid、msgstr 及状态变化，再次提取必须稳定。边界外输出或无关语义漂移暂停生成后继并调查，不手工模拟生成 metadata。
- Level 1：上述隔离自动回归；尚未执行。
- Level 2：当前真实 Codex GUI 无头验收，核对完整当前 URL、目标路由、真实数据和非 headed 会话，验证静态结束时间、布局、历史和窄屏。需要发送消息等状态操作时，单独明确测试 thread 与副作用并取得适用授权。URL 或样本缺失如实标记未执行，不用 fixture 替代。
- Level 3：不适用；不启动可见浏览器或报告窗口。

## 失败与完成

实施时按执行图契约维护节点状态、锁、失败、稳定产物和提交身份，不将计划正文用作动态执行日志。失败先插入当前授权范围内的诊断、修正、再验证节点；提交后的修正单独新提交。只有新产品决策、授权缺口或有证据的环境阻塞才暂停相应路径。

最终报告记录两项任务提交、最终验证、Level 1/2/3、实际并行、关键路径及未启动 ready 节点原因。全部必要任务和验证完成后终止本轮实现；缺失真实验收不得宣称完全验证。
