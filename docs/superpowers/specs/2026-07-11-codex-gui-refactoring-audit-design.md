# Codex GUI 重构审计设计

日期: 2026-07-11
状态: 设计落盘
范围: `codex-gui/**` 的只读重构机会审计，以及 `docs/superpowers/reports/**` 下对应的分报告与总报告结构

## 背景

`codex-gui` 已持续开发一段时间，部分 feature 已出现职责增长、跨 feature 类型依赖、领域转换重复、测试支持代码扩散和大文件聚集。仅从单个重复函数开始提取，无法回答哪些逻辑真正具有稳定的公共语义，也无法区分“跨 feature 公共边界”“feature 内部职责拆分”和“不值得抽象”的情况。

本轮需要先系统审核当前代码，再产出多份分报告和一份总报告。报告的目的不是立即实施重构，而是给出有代码证据、能独立设计和分批实施的重构建议。

现有 `docs/superpowers/specs/2026-07-09-codex-gui-system-performance-check-design.md` 已建立 GUI-wide 微切片、分报告和总报告的审计组织方式，可以作为结构先例。但性能审计的复杂度定义、优先级和 finding 状态不适用于本轮重构审计。

现有 `docs/superpowers/specs/2026-07-11-codex-gui-transcript-state-split-design.md` 已完整拥有 transcript state 内部 production 模块拆分、测试文件拆分、兼容边界和验证策略。本轮不得将该设计重新包装为新 finding。

## 与既有成果的关系

### 结构复用

本轮复用以下组织原则：

- 使用一个 `00-summary.md` 和多份具有独立 evidence ownership 的分报告。
- 将大范围审核拆成单一问题、少量入口文件或一条明确调用链的微切片。
- 子代理承担微切片阅读，主代理负责拆分、校准、关键证据抽查、跨报告去重和最终汇总。
- 分报告保留完整代码证据、已排除项、风险和停止条件；总报告只汇总已经由分报告成立的结论。

### 只引用不重复

以下既有结论只允许引用，不得作为新发现重复论证：

- `2026-07-11-codex-gui-transcript-state-split-design.md` 已确定的 `transcriptStateModel`、event dedup、live projection、committed projection、selector 和 slice 装配边界。
- 该设计已确定的 transcript state 测试文件拆分、30 个测试迁移边界、公开导出兼容和性能不变量。
- 已有性能报告中已经成立的复杂度 finding。若它同时构成重构动机，只能引用原 finding，并补充本轮独有的职责或依赖边界判断。

### 允许新增

本轮允许新增：

- transcript state 与 timeline、thread runtime、projection ingress、渲染消费方之间的跨 feature 边界问题。
- 既有 transcript state 拆分设计明确排除且当前代码证据能够支持的残余重构点。
- 其他 feature 内尚无专项设计覆盖的职责拆分、类型归属、依赖方向、重复领域语义和测试基础设施问题。
- 对已有抽象已经正确覆盖某类重复的否定结论，防止后续重复建设。

若 transcript 相关发现需要修改 `threadRuntimeSlice`、projection protocol、UI 组件或 Redux state shape，应记录为新的跨域候选并要求后续单独设计，不得扩充或改写既有 transcript state 拆分设计。

## 目标

- 系统覆盖 `codex-gui/src` 的 production 代码、对应测试和测试支持设施。
- 识别应提取为跨 feature 领域边界、应保持 feature 私有但需要拆分、应继续保留现状三类结论。
- 为每个重构点提供精确代码证据、当前 owner、消费者、推荐边界、收益、风险和建议批次。
- 通过唯一 evidence ownership 防止同一问题在多个分报告和总报告中重复出现。
- 产出可供后续选择、单独设计和实施规划的重构建议报告集。

## 非目标

- 不修改 `codex-gui/**` 代码、测试、配置、生成物或快照。
- 不实施任何重构，不生成 patch，不运行格式化，不 stage 或 commit。
- 不运行 test、build、type-check、lint、profiling、benchmark、browser automation 或 package scripts。
- 不把代码行数大、文件名相似或局部语法重复单独视为重构依据。
- 不预先建立宽泛的 `shared`、`common` 或 `utils` 目录。
- 不重新设计已经由专项设计拥有的 transcript state 内部拆分。
- 不创建 implementation plan，不创建或更新 issue。
- 不评价 Rust、app-server、TUI 或外部 GUI host 实现内部的重构机会；只审核它们在前端边界上的协议和依赖表现。

## 审计定义与判断原则

本轮“重构点”指在保持产品行为和外部契约不变的前提下，通过调整职责、依赖方向、模块边界或测试支持边界，能够持续降低重复修改、认知负担、耦合风险或回归风险的问题。

判断必须同时回答：

- 当前语义由谁拥有，实际消费者是谁。
- 问题是跨 feature 公共语义、feature 内职责混合，还是仅有表面相似。
- 推荐边界是否有稳定领域名称和单向依赖方向。
- 变更是否能形成独立、可验证、可审查的批次。
- 是否已有抽象、专项设计或历史报告覆盖该问题。
- 不重构的代价与引入抽象的代价分别是什么。

以下证据可以支持 finding：

- 两个或更多调用方重复实现相同领域转换或不变量。
- 公共类型或契约由具体 adapter、组件或 reducer 实现文件拥有，导致反向或跨层依赖。
- 单个模块同时拥有可独立描述、可单向依赖、分别变化的多类职责。
- 同一行为变化需要在多个文件同步修改，且同步关系没有被现有抽象表达。
- 测试 builder、fixture 或环境装配出现稳定且合法的重复语义。
- 近期变更压力、调用图或测试边界能够证明当前职责划分持续增加维护成本。

以下情况默认不是 finding：

- 只有一处调用且没有独立领域语义的小 helper。
- 为消除少量语法重复而增加新的公共层、泛型或间接调用。
- 测试中的 malformed payload、expected value 或行为差异为了可读性而显式重复。
- 仅因文件超过某个行数阈值，但内部职责仍内聚且没有可验证的新边界。
- 只能依靠未来需求成立的预防性抽象。
- 已有抽象已经提供正确复用入口，当前代码没有绕开它。

## 重构优先级

本优先级只表达重构紧迫性，不复用性能审计的时间/空间复杂度含义，也不等同于实施排期。

- `P0`: 当前职责或依赖边界已经威胁正确性、外部契约、状态一致性或关键回归锁；继续在现结构上开发存在高概率扩大事故面的风险。
- `P1`: 高频变更路径存在强跨 feature 耦合、多个 owner、循环或反向依赖，已经持续阻碍功能开发、审查或安全修改。
- `P2`: 有明确重复领域语义、职责混合或类型归属错误，推荐边界稳定，重构收益可预期，但尚未造成关键开发阻塞。
- `P3`: 局部、低风险的可维护性整理候选，收益有限，适合与相关修改一起处理，不应单独驱动大批次。
- `非 finding`: 缺少稳定边界、收益不足以抵消抽象成本、已有抽象覆盖，或只是表面相似。

## Finding 状态

每个条目只能使用以下状态之一：

- `确认重构点`: 当前代码证据、owner、消费者和推荐边界均明确。
- `候选待补证据`: 存在合理边界，但调用关系、变更压力或风险证据尚未完整。
- `证据不足`: 只能观察到现象，无法确认共同语义、owner 或实际维护成本。
- `不建议重构`: 已比较保留现状与抽象方案，当前结构更清晰或重构成本更高。
- `已由现有抽象覆盖`: 已存在正确公共入口，未发现需要新增抽象的生产重复。
- `已有专项设计`: 问题已由明确的现有设计拥有，本轮只记录索引和交界，不重复提出方案。

状态与优先级相互独立。只有 `确认重构点` 和证据充分的 `候选待补证据` 可以进入总报告的建议批次；`已有专项设计` 只能作为覆盖状态和依赖输入。

## Finding 固定字段

每个 finding 必须包含：

- Finding ID 和标题。
- 主报告与 evidence owner。
- 状态。
- 重构优先级。
- 结论摘要。
- 当前 owner 与当前职责。
- 问题类型：重复语义、职责混合、类型归属、依赖方向、测试支持或其他。
- 影响文件、定义侧、构造方、调用方和消费方。
- 共同语义或变化原因；若不存在共同语义，说明为何不应抽象。
- 推荐边界、建议 owner 和允许的依赖方向。
- 预期收益。
- 建议变更范围、最小可审查批次和明确排除范围。
- 行为、契约、状态、性能和测试风险。
- 后续实施时建议的验证范围，但本轮不得执行验证命令。
- 当前代码关键证据路径与行号。
- 关联的既有报告、issue 或专项设计。
- 已排除项。
- 报告建议：进入后续设计、补证据、保持现状或只保留索引。

## 微切片规则

每个审计微切片必须：

- 只回答一个独立问题、一个明确文件/函数范围、一条调用链或一个具体假设。
- 绑定少量入口文件，并预先声明允许追踪的直接构造方和调用方。
- 先检查定义、构造、调用和测试，再判断公共语义；不能只比较文本相似度。
- 输出结论、关键证据路径/行号、已排除项、风险和下一阶段建议。
- 遇到多个模块、多个假设或多条独立调用链时立即停止扩张，重新拆分。
- 能被主代理抽查关键证据，而不要求主代理重新阅读全部文件。

禁止的微切片包括：

- “审核整个 `codex-gui/src`”。
- “找出所有公共代码”。
- “阅读相关代码并给完整重构方案”。
- “按文件行数决定如何拆分”。
- “把全部测试重复合并成 helper”。

## 报告目录设计

后续计划应创建以下报告集：

```text
docs/superpowers/reports/2026-07-11-codex-gui-refactoring-audit/
  00-summary.md
  01-app-entry-shell-and-platform.md
  02-gui-host-transport-and-protocol.md
  03-projection-ingress-and-thread-runtime.md
  04-timeline-materials-and-domain-models.md
  05-transcript-state-and-materialization.md
  06-transcript-rendering-streaming-and-scroll.md
  07-composer-access-and-localization.md
  08-test-infrastructure-fixtures-and-support.md
  09-cross-cutting-boundaries-and-exclusions.md
```

报告文件只能在本设计被确认、后续计划落盘并被确认后创建。

## 唯一 Evidence Ownership 与跨报告去重

- 每个 finding 只有一个主报告，该报告拥有完整论证、证据和推荐边界。
- 同一文件可以出现在多个报告中，但不同报告必须审核不同机制或不同交界。
- 其他报告引用 finding 时只写 Finding ID、单句交界事实和主报告路径，不复制完整证据。
- 单 feature 内部问题由对应 feature 报告拥有；真正跨越两个或更多 feature、且不能自然归属定义侧的边界问题才由 `09` 拥有。
- `09` 不重复单 feature finding，只维护跨 feature 类型所有权、依赖方向、重复语义和排除矩阵。
- `00` 不产生新 finding、不补充新的源码证据、不改变分报告状态；发现遗漏必须先回写主报告。
- 既有 Transcript State 拆分设计统一标记为 `已有专项设计`，不得以“大文件”“职责混合”或测试拆分的不同表述再次报告。
- 性能问题若只是重构动机，必须引用性能报告；只有本轮新增的 owner、依赖或模块边界论证由重构报告拥有。

## 分报告范围与交界

### `01-app-entry-shell-and-platform.md`

覆盖 `main.tsx`、`App.tsx`、router、provider、store wiring、`appShell` 和顶层 platform/environment 检测。它拥有入口装配、顶层状态归属和 shell 边界 finding，不拥有具体 GUI host transport 或 transcript 渲染实现。

### `02-gui-host-transport-and-protocol.md`

覆盖 GUI host client/protocol、launch params、token storage、WebSocket/RPC 请求、握手、通知解析和 commands/status 公共 API。它拥有 transport 与协议解析职责边界、启动参数 owner 和公共协议类型归属 finding；连接状态进入 Redux 后的生命周期由 `03` 拥有。

### `03-projection-ingress-and-thread-runtime.md`

覆盖 projection ingress adapter、thread runtime、thread identity 和 GUI host connection bridge。它拥有事件进入 Redux 前后的过滤、合批、dispatch、snapshot index、runtime 状态和 reconnect 契约 finding；协议 wire shape 归 `02`，timeline 领域材料归 `04`。

### `04-timeline-materials-and-domain-models.md`

覆盖 snapshot replay、live event handling、timeline selector/material 和 Turn/item 领域转换。它拥有 snapshot/live 两类生产者的共同 timeline 语义、timeline material owner 和跨来源组合职责 finding；projection 投递归 `03`，transcript state 投影归 `05`。

### `05-transcript-state-and-materialization.md`

覆盖 transcript Redux state、item materialization、reducer/selector 定义侧和 snapshot/live/committed 投影边界的当前实现交界。

`2026-07-11-codex-gui-transcript-state-split-design.md` 已拥有 transcript state 内部模块拆分与测试拆分设计。本报告不得重报这些内容，只能：

- 将其标记为 `已有专项设计` 并核对本轮覆盖关系。
- 审查 transcript state 与 `03`、`04`、`06` 的跨 feature 边界。
- 记录既有设计未覆盖的残余点。

selector 的定义、缓存 owner 和数据生产归 `05`；React 消费、渲染和副作用归 `06`。

### `06-transcript-rendering-streaming-and-scroll.md`

覆盖 committed transcript surface、live Markdown/Streamdown、chunk equality、sticky-bottom、scroll hooks 和相关 React 组件。它拥有渲染组件职责、UI 消费边界和副作用复用 finding，不拥有 Redux state shape、selector 实现或 transcript 内部拆分。

### `07-composer-access-and-localization.md`

覆盖 composer/turn control、QR/access、i18n、LanguageSwitcher、viewport resize、输入与错误展示辅助逻辑，以及仍在 production 范围内的示例页面。它拥有交互模型、环境检测、URL 构造、本地化辅助逻辑和局部 UI 领域边界 finding。

### `08-test-infrastructure-fixtures-and-support.md`

覆盖 projection fixtures/builders、app browser test support、GUI host client test support、通用 render helper 和大型测试文件中的支持代码。它必须区分合法协议 builder、应显式保留的 malformed payload、测试专属 expected value 和真正可复用的环境装配。production 重构建议由对应 production 报告拥有，本报告只拥有测试基础设施边界。

### `09-cross-cutting-boundaries-and-exclusions.md`

覆盖跨 feature 类型所有权、依赖方向、潜在循环、重复领域语义、公共模块候选、覆盖矩阵和排除项。只有无法自然归属单一 feature 定义侧的跨域 finding 由本报告拥有。它还负责记录“不建议建立的抽象”和“已由现有抽象覆盖”的系统级结论。

## `00-summary.md` 职责

`00-summary.md` 只负责：

- 总体结论和审计范围说明。
- 分报告索引与覆盖状态。
- 按优先级和状态汇总 finding 数量。
- `确认重构点`、`候选待补证据`、`不建议重构`、`已由现有抽象覆盖` 和 `已有专项设计` 的索引。
- 跨报告去重后的推荐重构批次、依赖顺序和后续设计入口。
- 证据不足、排除范围和未完成覆盖的摘要。

总报告不得重新展开源码证据，也不得产生分报告中不存在的新建议。

## 覆盖矩阵与停止条件

`09` 必须维护文件覆盖矩阵。每个 in-scope production/test 文件至少记录：

- 主报告。
- 必要时的次级交界报告。
- 已审核机制。
- 结果状态或 Finding ID。
- 排除理由。

单个微切片在以下任一条件满足时停止：

- 已确认 owner、消费者、推荐边界和当前代码证据。
- 已证明只是表面重复或已有抽象覆盖。
- 需要跨入另一个独立机制、模块或假设，应拆成新微切片。
- 需要运行测试、浏览器、profiling 或修改代码才能继续，只能标记 `候选待补证据` 或 `证据不足`。
- 触及已有专项设计的内部决策，只记录索引和交界，不继续重复审计。

整轮审计在以下条件全部满足后停止：

- 所有 in-scope 文件都有主报告或明确排除理由。
- 所有候选都已归入固定状态枚举。
- 所有确认 finding 都有当前行号证据和唯一主报告。
- Transcript State 既有设计已被映射，但没有被重报。
- `09` 完成跨报告去重和覆盖矩阵。
- `00` 只汇总分报告已有结论，没有新增证据。

## 子代理执行原则

真正执行审计时必须使用子代理承载跨文件阅读细节。主代理不得先自行展开整个代码库。

主代理负责：

- 将每个分报告继续拆成一个问题、一个文件/函数范围或一条调用链的微切片。
- 为每个阶段声明允许读取范围、禁止事项和固定输出字段。
- 收到结果后先记录阶段状态和压缩结论，再决定是否复用同一子代理进入下一阶段。
- 自行抽查关键定义、构造方、调用方和测试证据。
- 维护 evidence owner、覆盖矩阵、跨报告去重和最终判断。

子代理负责：

- 一次只回答一个小问题，不自行扩大范围。
- 返回结论、关键证据路径/行号、已排除项、风险和下一阶段建议。
- 明确当前结论与既有报告、issue 或专项设计的关系。
- 不修改文件，不运行测试、构建、格式化、profiling、browser automation 或 package scripts。
- 不把已有专项设计或已有 finding 改写为新问题。

## 验证方式

本轮只允许只读验证：

- 使用 `rg`、`rg --files`、文件读取和精确行号核对定义、构造方、调用方、导入关系和测试覆盖。
- 使用本地 `git status`、`git diff`、`git log`、`git show` 等只读命令核对当前 workspace、近期变更压力和历史归因。
- 对共享类型或 helper，至少核对定义侧、全部生产调用方和代表性测试。
- 对“不建议重构”与“已由现有抽象覆盖”，同样保留反证路径和行号。

禁止运行 test、build、type-check、lint、format、profiling、benchmark、browser automation、package scripts，禁止安装依赖，禁止访问 git remote。

## 风险与控制

- **公共层膨胀：** 只有稳定领域语义和明确消费者才能支持公共边界；表面重复标记为 `不建议重构`。
- **重复既有设计：** Transcript State 内部拆分统一由现有专项设计拥有；本轮只核对交界和残余点。
- **性能 finding 换名重报：** 复杂度问题引用原报告，本轮必须补充独立的职责或依赖证据才能成为重构 finding。
- **跨报告重复：** finding 必须先分配唯一主报告，再允许其他报告引用。
- **文件切片替代机制切片：** 同一文件中的不同机制可以分开审核，但每个微切片只能追踪一条问题链。
- **过度依赖行数：** 大文件只能作为入口信号，不能作为结论。
- **静态证据不足：** 需要运行时测量或代码修改才能确认的条目标记为候选或证据不足，不伪装成确认结论。
- **工作区漂移：** 报告写入前后核对当前文件和行号；总报告生成前重新检查关键 evidence owner。

## 接受标准

- 报告集包含 `00` 至 `09` 的既定文件，且每份分报告范围与交界清晰。
- 所有 in-scope production/test 文件都出现在覆盖矩阵中或有明确排除理由。
- 每个 finding 使用固定字段、固定状态和重构紧迫性优先级。
- 每个确认 finding 都有唯一 evidence owner、当前代码行号、推荐 owner、最小批次和风险。
- 总报告没有新增 finding 或重复源码论证。
- 报告明确区分跨 feature 公共边界、feature 内部拆分和不建议抽象。
- Transcript State 内部拆分只引用现有专项设计，没有以任何标题或措辞重复报告。
- 审计过程没有修改 `codex-gui/**`，没有运行被禁止的验证命令，也没有访问 git remote。
- 最终建议能够被逐项选择，并分别进入新的设计、计划和实现门禁。

## 后续边界

本设计确认后，下一轮只能编写并落盘审计执行计划。计划必须固定：

- 报告创建顺序和每份报告的微切片任务。
- 每个阶段允许读取的代码、测试、历史文档和 issue 范围。
- 子代理复用顺序、主代理抽查点和阶段结果落盘方式。
- coverage matrix、Finding ID、evidence owner 和跨报告引用格式。
- 每个阶段停止条件与最终总报告生成门禁。

计划被明确确认前，不得创建报告文件或开始代码审计。报告完成后，用户应从确认 finding 中选择一个独立批次，重新进入设计、计划、实现三阶段；本报告集本身不授权任何代码修改。
