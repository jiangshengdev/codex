# Codex GUI 系统性前端性能检查设计

日期: 2026-07-09
状态: 设计落盘
范围: `codex-gui/**` 的系统性前端静态复杂度审计

## 背景

现有 `docs/superpowers/specs/2026-07-04-rust-performance-detection-design.md` 明确排除了前端 GUI 性能，不阅读或审查 `codex-gui/**`。

现有 `docs/superpowers/specs/2026-07-03-codex-gui-streaming-support/05-frontend-performance-check-design.md` 只覆盖 Codex GUI 03 assistant text streaming display 完成后的直接热路径。它可以作为本轮系统性检查的一个输入切片，但不能代表 GUI-wide 前端性能审计。

现有 `docs/superpowers/issues/2026-06-23-01-codex-gui-frontend-performance-hot-paths.md` 及其拆分 issue 已覆盖 transcript、projection 和 live streaming 热路径中的一批已知问题。它们作为本轮种子索引使用，但不能替代系统性切片。

## 目标

- 为 `codex-gui/**` 制定一轮系统性前端性能检查设计。
- 以静态时间复杂度和空间复杂度审计为主，识别随规模变量增长的结构性风险。
- 把检查范围拆成 GUI-wide 小切片，避免只围绕已有 03 streaming issue 或单个模块展开。
- 对每个问题同时记录复杂度优先级和当前状态标签。
- 明确后续执行应由子代理承担细分审计，主线程只做协调、抽查和合并。
- 明确最终输出按摘要和分面报告拆分。

## 性能定义

本轮“性能”指时间复杂度或空间复杂度意义上的结构性风险，不以视觉流畅度、耗时分数或 bundle 体积数值为主判断依据。

核心目标是发现随规模变量增长而退化的问题，例如:

- 高频路径中重复全量扫描 turns、chunks、entries、live items、DOM-facing lists 或 subscriber lists。
- append、delta、scroll pulse、store update、render、selector 或 input event 触发与历史规模相乘的工作。
- 长 transcript、长 turn、长 live text、长会话、多个 thread、多个 pending event 或多个 retained object 引发无界增长。
- UI-only 行为把 chunk-level 边界退回到 turn-level 或 transcript-level。
- collapsed、hidden 或非当前区域仍持续渲染、扫描或持有大量内容。

以下内容不是本轮主 finding:

- 固定大小对象处理。
- 单次参数解析。
- 一次性 provider 初始化。
- 常数级组件包装。
- 只能通过浏览器测量判断的耗时变化。

常数成本只有在它位于高频路径中，并且会随明确触发频率重复发生时，才可以作为复杂度风险的一部分记录。

## 非目标

- 不运行 profiling、benchmark、browser trace、Lighthouse、Playwright 性能测量、bundle build 或测试。
- 不修复性能问题。
- 不创建或更新 issue。
- 不修改 `codex-gui/**` 代码。
- 不写 implementation plan。
- 不评价 Rust projection、app-server、gui-host 或 TUI 的性能。
- 不把 CSS/JS 体积、真实交互延迟或渲染帧率作为主要结论，除非只作为需要后续量化的背景。

## 审计口径

本轮采用“当前状态为主，附带归因标签”的口径。

每个审计条目必须写清楚:

- 关联 issue 或声明无关联 issue。
- 触发源。
- 触发频率。
- 单次同步工作。
- 规模变量。
- 累计时间复杂度或空间增长方式。
- 复杂度优先级。
- 当前状态。
- 当前代码证据路径/行号。
- 排除项。

复杂度判断按 `触发频率 * 单次同步工作 * 规模变量` 展开。空间风险必须说明 retained state 的 owner、key、生命周期和清理边界。

## 复杂度优先级

优先级只表达时间复杂度或空间复杂度意义上的严重度，不表达修复排期、用户感知严重度或常数耗时大小。

- `P0`: 已确认的高频热路径超线性风险，或无界增长会随长期会话持续累积。例如 per delta、per store update、per input 或 per render 触发 `O(transcript entries)`，累计接近 `O(n^2)`；或 event、thread、turn、live item、cache、DOM-facing list 等 retained state 缺少清理边界。
- `P1`: 已确认的高频线性风险，规模变量明确且可能变大。例如每次 render、dispatch、selector、scroll pulse 或 live update 都扫描 turns、chunks、entries、live items 或 mounted lists。
- `P2`: 中频或低频路径上的线性或无界风险，或已经被部分缓解但仍有复杂度边界。例如 snapshot attach、large turn 展开、batch 内聚合扫描、一次性 attach 后持有大量 state。
- `P3`: 常数级、一次性、规模变量不明确，或只能靠测量判断的成本。可以作为背景记录，不作为本轮主要 finding。
- `非 finding`: 固定大小对象处理、单次参数解析、没有规模变量放大的局部开销。

复杂度优先级与问题状态互不替代。已知旧 issue 仍可能是 `P0` 或 `P1`，新发现问题也可能只是 `P2` 或 `P3`。

## 状态标签

每个审计条目的当前状态只能使用以下标签:

- `已有 issue 仍成立`: 已知 issue 的复杂度风险在当前代码中仍可由证据确认。
- `已修复`: 已知 issue 的风险路径已被当前代码消除。
- `新发现`: 当前代码存在复杂度风险，但没有对应已知 issue。
- `非本轮可归因`: 问题存在或可能存在，但不属于本轮静态复杂度审计主线，或需要测量、产品决策、Rust 边界或后续专项设计判断。
- `证据不足`: 缺少当前代码证据、触发频率证据、生命周期证据或规模变量证据，不能下结论。

禁止把已知 issue 换个说法重复报告为新问题。若旧 issue 的原始形态过期但仍有收窄后的边界，应在状态说明中写明过期部分和保留部分。

## 切片设计

审计切片以 GUI-wide 风险路径为主轴，文件路径为辅助。

每个切片必须满足:

- 只覆盖一个风险路径或一组紧密相连的触发链路。
- 明确规模变量，例如 transcript entries、turns、chunks、live items、delta count、threads、pending events、mounted components、retained cache entries。
- 明确关注时间复杂度、空间复杂度或 retained lifecycle 风险。
- 绑定少量入口文件。
- 明确关联 issue 或声明无关联 issue。
- 明确允许证据类型和停止条件。
- 能由一个子代理独立完成。

禁止的切片形态:

- “检查整个前端”。
- “阅读全部 `codex-gui/src`”。
- “跑测试看看性能”。
- “列举所有可能慢的细节”。
- “把 bundle/CSS 体积当作静态复杂度 finding”。

## 初始切片地图

### 启动与资源入口

关注首屏入口、全局 provider、同步 CSS/JS 入口和初始化 state wiring 的结构性复杂度。

允许的 finding 只限静态复杂度风险，例如入口阶段随 thread、history、route、provider 或 retained state 数增长而重复构建大量对象。CSS/JS 体积只能标记为 `非本轮可归因` 或后续量化输入。

已知输入:

- `05-heroui-full-css-import.md` 作为首屏资源背景和后续量化输入。

### Projection ingest

关注 GUI host event 进入前端后的投递、过滤、合批、Redux action 和 fanout 边界。

规模变量包括 projection events、delta notifications、batch size、threads、subscribers 和 pending queues。

已知输入:

- `01-projection-event-top-level-react-state.md`
- `08-projection-delta-redux-action-frequency.md`

### Redux/store update 与 selector

关注 slice 写入、selector materialization、cache invalidation、store subscription 和无关更新扩散。

规模变量包括 store updates、mounted selectors、turns、chunks、entries、live items 和 cache entries。

已知输入:

- `02-transcript-chunk-selector-view-rebuild.md`
- `03-item-started-dirties-transcript-state.md`
- `07-transcript-revision-invariant.md`
- `10-live-slot-selector-cache-invalidation.md`

### Transcript rendering

关注 turn/chunk/entry render 边界、长 transcript DOM、collapsed hidden content、full-turn flatten/grouping 和 chunk-level memo 边界。

规模变量包括 turns、chunks、entries、mounted DOM nodes、expanded modules 和 hidden entries。

已知输入:

- `04-long-transcript-no-windowing.md`
- `06-temporary-grouping-full-turn-scan.md`

### Live streaming text

关注 projection delta 到 live item 的 text accumulation、revision/pulse 更新、live markdown consumption 和 streaming render 边界。

规模变量包括 delta count、batch size、accumulated live text length、live item buckets 和 markdown source length。

已知输入:

- `08-projection-delta-redux-action-frequency.md`
- `09-projection-delta-transient-text-concat.md`
- `10-live-slot-selector-cache-invalidation.md`
- `05-frontend-performance-check-design.md` 中 03 hot-path 设计。

### Composer/input

关注后台事件、store updates、projection events 或 transcript changes 是否扩散到输入路径，导致输入状态、composer subtree 或 input handlers 被无关高频事件 dirty。

规模变量包括 projection events、store updates、composer state changes、mounted shell subtree 和 input events。

已知输入:

- `01-projection-event-top-level-react-state.md` 作为历史扩散问题输入。

### Scroll/sticky-bottom/layout

关注 sticky-bottom、scroll pulse、auto-scroll、surface content detection 和 layout-facing 列表扫描。

规模变量包括 live updates、turns、chunks、entries、surface live items、mounted DOM nodes 和 scroll events。

该切片只做静态复杂度审计，不做浏览器 layout、paint、FPS 或 trace 结论。

### Retained state / memory

关注 map、cache、event window、pending queue、live state、thread state、projection state 和 cleanup 生命周期。

规模变量包括 threads、turns、items、events、event ids、cache entries、pending deltas 和 detached live items。

空间风险必须明确 owner、key、增长路径和清理路径。无法确认生命周期时标记为 `证据不足`。

## 输出结构

最终报告目录由后续计划阶段固定，建议形态为:

```text
docs/superpowers/reports/YYYY-MM-DD-codex-gui-system-performance-check/
  00-summary.md
  01-startup-resources.md
  02-state-projection-ingest.md
  03-transcript-rendering.md
  04-live-streaming-input-scroll.md
  05-retained-state.md
```

`00-summary.md` 职责:

- 总体结论。
- 切片索引。
- `P0` / `P1` / `P2` / `P3` finding 汇总。
- 已有 issue 状态汇总。
- 新发现问题索引。
- `非本轮可归因` 和 `证据不足` 摘要。
- 需要后续单独设计、计划或量化的问题。

分面报告职责:

- 记录对应切片的完整审计条目。
- 保留当前代码证据路径/行号。
- 明确排除项和停止条件。
- 不提出修复方案。

## Issue 文档规范

本轮报告可以引用已有 issue，也可以在结论中指出需要后续创建或更新 issue。但只要后续计划允许创建、拆分、复核或更新 `docs/superpowers/issues/**`，对应 issue 文档必须按 `codex-issue-doc-workflow` 新规范编写。

普通 issue 文档必须使用统一元数据和章节顺序:

- `日期:`
- `状态: <emoji> <状态文本>`
- `范围:`
- `优先级: P0/P1/P2/P3 或 未定`
- `## 摘要`
- `## 问题`
- `## 证据`
- `## 判断`
- `## 影响`
- `## 后续处理`

拆分父 issue 必须保留为索引，并使用 `状态: ✅ 已拆分`、`## 拆分索引` 和 `## 后续处理`。普通 issue 和拆分索引都必须保持半角元数据冒号。

性能 issue 的 `优先级:` 必须与本设计的复杂度优先级一致，只表达时间复杂度或空间复杂度意义上的严重度，不用 emoji 表达优先级。`状态:` 只表达当前 issue 状态，使用 `✅`、`🔴`、`🟡` 或 `📏` 四类状态 emoji。

Issue 文档只记录问题、证据、判断、影响和后续入口，不得写 implementation plan。若问题需要代码改动，`## 后续处理` 只能指向单独进入设计、计划、复核或量化入口。

## 子代理执行原则

真正执行系统性前端性能审计时必须使用子代理。主线程不直接展开大范围代码分析。

主线程职责:

- 拆分任务。
- 明确每个子代理的范围、禁止事项和输出格式。
- 抽查关键证据。
- 合并结论。
- 写入最终报告。

子代理职责:

- 只处理一个微切片。
- 不跨范围扩张。
- 不修复。
- 不运行测试、profiling、benchmark、browser automation、build、format 或 package scripts。
- 不访问 git remote。
- 不把已知 issue 重报为新问题。
- 必须说明规模变量、触发频率、单次同步工作和复杂度优先级。
- 必须说明 retained state 的 owner 和 cleanup 边界。

子代理固定输出字段:

```md
## 结论

## 审计字段

- 关联 issue:
- 触发源:
- 触发频率:
- 单次同步工作:
- 规模变量:
- 累计复杂度:
- 复杂度优先级:
- 当前状态:

## 关键证据路径/行号

## 已排除项

## 风险

## 报告建议
```

## 进入计划阶段的门禁

只有本设计被用户确认后，才能编写实施计划。

计划阶段必须单独定义:

- 报告目录和文件名。
- 每个切片的子代理任务。
- 每个切片允许读取的 issue、设计和代码范围。
- 每个切片的停止条件。
- 报告文件的创建顺序。
- 是否允许任何命令执行。
- 是否允许创建、拆分或更新 issue；如果允许，必须列明目标 issue 路径，并要求按 `codex-issue-doc-workflow` 做质量检查。

在计划被用户确认之前，不得创建报告文件、执行审计、运行测试或修改 `codex-gui/**` 代码。
