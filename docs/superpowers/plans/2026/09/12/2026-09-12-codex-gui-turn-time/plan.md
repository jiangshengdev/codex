# Codex GUI 时间标签与耗时实施计划

日期：2026-09-12

状态：任务拆分和展示格式已确认；计划已落盘，等待明确开始执行。本轮不修改产品代码、不运行测试、不提交。

设计依据：[时间标签与 turn 耗时设计](../../../../../specs/2026/09/12/2026-09-12-codex-gui-turn-time-design.md)。

## 目标与任务

1. [每个 turn 显示实时与最终耗时](issues/01-turn-duration.md)。Blocked by：无。
2. [按四小时时段显示时间标签](issues/02-turn-time-labels.md)。Blocked by：无。

两项都是从权威数据到界面和验证的完整纵向切片，不拆出独立的类型层或组件层任务。任务之间没有产品硬依赖；最终验收依赖两个任务的稳定提交。遵循项目日期目录规则，将本地 tickets 放在本计划的 issues 目录，一票一文件；不使用外部 tracker，不产生远程操作。

## 证据与实现边界

| 字段 | 当前证据与计划结论 |
| --- | --- |
| 权威入口 | core 的 `TurnTimingState` 在任务开始记录时间，结束计算完整经过时间；app-server 生成的 `Turn` 包含 `startedAt`、`completedAt`、`durationMs`。标签采用 turn 开始时间，不宣称是点击发送时间。 |
| 已追踪链路 | `thread_history` 保存并转换时间；`thread_history_projection` 在开始、完成及中断事件传递时间；GUI 的基线构造和 `transcriptProjection` 的开始/完成事件调用 `upsertTranscriptTurn`，当前模型未保存这些字段。 |
| 修改范围 | transcript 模型、转换、selector 和聊天记录展示；当前任务页和历史详情共用同一 surface，均纳入验证。 |
| 验证映射 | 现有 transcript 状态、重连、context page 单元测试；surface 消息、会话、折叠和分页 Browser 测试；新增时间行为 Browser 测试；真实运行时无头验收。 |
| 排除项 | 不改变协议、Rust 计时、生成的 TypeScript 或 validator。现有协议与历史转换已经携带可空时间值；缺失值按设计省略。 |
| 剩余未知 | 当前真实运行时 URL 和历史样本尚未取得，不影响源码修改范围，但阻塞 Level 2 通过声明。没有使用页面挂载时间填补缺失值的路径。 |

证据入口（均为仓库相对路径）：

- `codex-rs/core/src/turn_timing.rs`：`mark_turn_started`、`complete_profile_and_duration_ms`。
- `codex-rs/core/src/tasks/mod.rs`：`start_task`。
- `codex-rs/app-server-protocol/src/protocol/thread_history.rs`：历史 turn 的时间转换和结束事件更新。
- `codex-rs/app-server-protocol/src/protocol/thread_history_projection.rs`：时间投影。
- `codex-gui/src/features/transcriptState/transcriptStateImplementation.ts`：基线与 `upsertTranscriptTurn`。
- `codex-gui/src/features/transcriptState/transcriptProjection.ts`：实时事件入口。
- `codex-gui/src/features/currentTask/CurrentTaskPage.tsx`、`codex-gui/src/features/threadHistory/ThreadHistoryDetailContent.tsx`：生产挂载入口。

## 具体实现约束

- 时间字段使用生成 `Turn` 类型的机械派生，保留 null 语义与编译期契约传播，不手写另一份协议。
- 耗时属于 turn，只挂在包含该 turn 第一条用户输入的 fragment。没有该输入锚点时不移动到助手消息或凭空补造输入。context page 切换不产生重复耗时。
- 运行中基于权威 `startedAt` 计算整秒经过时间；包含等待；终态采用 `durationMs` 并停止时钟。终态缺少耗时就不显示，不继续计时或猜测终点。
- 标签使用本地日历日期和小时所属的四小时区间。仅在 turn 的首个展示 fragment 输出，内部跨段不插入标签。通过 turn 元数据确定前序，禁止展开全部 entries。
- 缺失时间的 turn 不显示标签，不把缺失值认定为任何时段；下一个有效时间与前一个可确定时间比较。第一个可确定时间显示标签，不为未加载的数据猜测前序；context page 切换不把同一已知 turn 重新认定为新 turn。
- 采用已确认的中文日期、时分与耗时补零格式；英文沿用现有 locale 体系。不显示毫秒、不增加重复状态。
- 非交互标签采用语义 `time`/文本元素，使用 HeroUI `muted` 等既有语义 token；无新增交互控件或变体需求。选用原生语义元素是因为这里只展示时间，不承担组件交互。
- 时钟只更新活动 turn 的耗时展示，不触发全部历史 chunk 重渲染；折叠内容不因时间标签被提前挂载。

## 范围集合

所有路径相对 `/Users/jiangsheng/cnb/codex`。

- `S`：`codex-gui/src/features/transcriptState/` 下模型、实现、selector、相关测试；`codex-gui/src/features/committedTranscriptSurface/` 下 fragment、renderer、新增时间展示模块与相关测试；共享 projection 测试 builders；`codex-gui/src/locales/en.po` 和 `zh-CN.po`。
- `R`：S 加当前任务、历史详情、projection ingress、active thread 读取模型、上述 Rust 与生成协议证据、GUI 测试配置及 package scripts。
- `D`：本设计文件、本计划与两份 ticket 文件。
- 不修改 Rust、协议生成物、依赖、全局配置、现有业务状态或无关工作。

## 执行 DAG 与提交边界

公共字段由下述默认记录与节点表合并展开；每个阶段为独立节点，不把编辑、验证和提交混为同一动作。

- `owner`：主代理，唯一编辑与 Git index owner；`subdelegation`：无。本次范围是同一有界 transcript 链路，两个切片的模型、fragment 与 catalog 写集合高度重合，不另建并发编辑上下文。
- `executionContext`：当前 `/Users/jiangsheng/cnb/codex` checkout，已核实分支 `dev`；共用该仓库 Git index，不创建 worktree 或分支。开始执行时复核身份和状态。
- `authorizationGate`：当前仅 D 的文档写入 active；实现、生成、测试、stage、commit 等节点均等待用户明确开始执行，随后逐节点按 action-authorization 建立最小能力信封。计划落盘不等于执行授权。
- `readSet`：R 与 D；`writeSet`、`stateEffects`、`commandScope`、`verification` 由阶段表限定。
- `resourceLocks`：S 的实际文件按读写模式加锁；两个 catalog、当前 checkout 的 Git index、GUI runner 均唯一写 owner。读同一稳定文件可并行，读写相交不可并行。
- `deferralEvidence`：不以任务编号产生暂缓；共享文件锁限制同时写入，释放后重算 ready set。若执行上下文改变并消除冲突，重新评估可并行节点。
- `failureDomain`：本任务节点及消费其不稳定产物的后继；共享契约损坏才传播到两项任务。`replanTriggers`：需要协议变更、产品语义变化、范围外资源或新授权。

| nodeId | operationKind | taskBoundary | hardPredecessors 与稳定输入 | outcome / produces / completionEvidence | estimatedCost |
| --- | --- | --- | --- | --- | --- |
| DOC-S | stage | 文档提交 | 执行授权、D 审查通过 | 只暂存 D；staged diff 与空白检查通过 | 小 |
| DOC-C | commit | 文档提交 | DOC-S 的精确 index | 独立文档提交，记录 commit id | 小 |
| T1-E | 编辑 | 任务 1 | DOC-C 的设计与计划 | 耗时端到端源码与行为测试 diff | 中 |
| T2-E | 编辑 | 任务 2 | DOC-C 的设计与计划 | 时间标签端到端源码与行为测试 diff | 中 |
| T1-G / T2-G | 生成 | 各自任务 | 对应 E 的稳定源码 | extraction、翻译补充后复提取稳定的 catalog | 小 |
| T1-F / T2-F | 格式化 | 各自任务 | 对应 G 的稳定产物 | 该任务文件格式化完成，非 fix 检查通过 | 小 |
| T1-V / T2-V | 验证 | 各自任务 | 对应 F 的稳定产物 | 该任务受影响测试、类型、lint 通过 | 中 |
| T1-S / T2-S | stage | 各自任务 | 对应 V 的证据与任务 diff | 精确暂存本任务，staged diff 检查通过 | 小 |
| T1-C / T2-C | commit | 各自任务 | 对应 S 的 index | 各一份独立行为提交，记录 commit id | 小 |
| FINAL-V | 验证 | 无提交，汇合 | T1-C、T2-C 的组合状态 | 组合回归与真实运行时无头验收证据 | 中 |

阶段动作边界：编辑节点只写对应任务的 S 源码和测试；生成节点只写两个 catalog，其中人工步骤只补本功能翻译；格式化节点只作用对应任务文件；验证节点不主动编辑源码，仅允许工具自动产物；stage 节点只操作已核对的任务文件与 index；commit 节点只创建新的本地提交。禁止 amend、squash、远程 Git 和强制暂存。

初始执行 ready set 为 DOC-S；DOC-C 后 T1-E 与 T2-E 同时满足硬依赖。fan-out 为两个任务，fan-in 为 FINAL-V。逻辑关键路径为 DOC-C → 两个任务中较长的一条 → FINAL-V；当前共享文件锁可能延长实际关键路径，不把资源等待伪装成 T2 依赖 T1。

为避免混合暂存，持有共享写集合的任务先完成自己的生成、验证和提交，再释放其变更供另一个任务消费。每项切片自身覆盖需要的字段；后完成者合并为同一个权威模型，不建立临时兼容层。不进行无关代码顺序调整；若确需纯重排，另建独立提交节点。

## 验证与生成入口

执行前使用 `codex-gui-toolchain` 复核 fnm 环境、pnpm 来源与必要工具，禁止安装。当前已确认 fnm、GUI Vitest 与 oxfmt 入口文件存在；本轮未运行它们。下列命令从 `codex-gui` 执行：

- `/opt/homebrew/bin/fnm exec --using-file pnpm run type-check`
- `/opt/homebrew/bin/fnm exec --using-file pnpm run lint`
- `/opt/homebrew/bin/fnm exec --using-file pnpm run messages:extract`
- `/opt/homebrew/bin/fnm exec --using-file pnpm run test:unit src/features/transcriptState/__tests__/transcriptStateReconnect.test.ts src/features/transcriptState/__tests__/transcriptStateCommittedTerminal.test.ts src/features/transcriptState/__tests__/transcriptContextPages.test.ts`
- `/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel --run src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurfaceMessages.browser.test.tsx src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurfaceSessions.browser.test.tsx src/features/committedTranscriptSurface/__tests__/TranscriptContextPagination.browser.test.tsx src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurfaceDisclosure.browser.test.tsx`

新建时间行为测试也通过相同入口按实际文件名加入；最终受影响测试文件不得带 `-t`，核对实际收集文件与测试数，零测试不算通过。不运行 aggregate Browser、全仓库 Rust 测试或后端构建。

格式化遵循 package 的 oxfmt owner；执行前确认限定实际变更文件的参数可用，不能用包含全目录输入的 fix 命令造成无关修改。随后用非 fix 模式复验。本轮仅 Markdown 不触发 `just fmt`。

Lingui 输入由现有配置的 `src` 范围拥有；完整输出边界为 `src/locales/en.po`、`src/locales/zh-CN.po`。逐字段审查 references、comments、msgid、msgstr 和状态变化，仅人工补充本功能翻译；再次 extraction 必须稳定。出现边界外产物或无关语义漂移时暂停该生成节点的后继，不手工伪造生成 metadata。

Level 1：每个 ticket 的验收条件、基线/事件/历史展示、分页、折叠与时钟隔离。现有 Browser 配置为 headless。

Level 2：通过当前真实 GUI URL 验证新 turn 实时增长、包含等待、终态冻结、历史与重连、窄屏位置。仅凭 fixture 或页面打开不能认定通过。需要发消息等真实状态操作时，先明确隔离测试 thread 与副作用并按授权规则取得许可；跨日期样本不足时如实标记相应未执行场景，不修改系统时钟。

Level 3：当前不适用，不启动可见浏览器。运行时、URL 或所需工具缺失时只阻塞对应验收，不安装、不启动后端构建，也不将其写为通过。

## 失败处理与完成

失败按执行图契约补充有界诊断、修正与再验证节点，只影响实际消费者；计划内修正持续完成，不降低断言、删除覆盖或扩大豁免。修改已有提交必须新建独立修正提交。出现产品或授权边界变化时只暂停受影响路径。

全部任务提交、计划内修正与适用验证完成后才报告实现完成。报告区分 Level 1、Level 2、Level 3，记录提交 id、实际并行、关键路径及未启动 ready 节点的具体原因。本计划正文不充当动态执行日志。
