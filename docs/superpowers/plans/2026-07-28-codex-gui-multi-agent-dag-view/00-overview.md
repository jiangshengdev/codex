# Codex GUI 多代理持久化 DAG 视图实施计划总览

日期：2026-07-28
状态：待确认

## 唯一目标

按照已确认设计，分六个可独立验证、独立提交的任务，在 app-server Thread projection 与 `codex-gui` 中实现纵向 Git-like 多代理持久化 DAG 视图。

## 设计来源

- `docs/superpowers/specs/2026-07-28-codex-gui-multi-agent-dag-view-design.md`

设计文档定义目标、协议语义、DAG 语义、布局和交互；本总计划只定义六份实施计划的边界、依赖和完成出口，不复制各计划的具体修改步骤。

## 计划文件集合

### `01-app-server-inter-agent-projection.md`

- 唯一目标：从既有 raw inter-agent 记录统一物化 experimental `ThreadItem::InterAgentMessage`，让历史分页、attach snapshot 与实时 notification 使用同一结构化 projection 语义。
- 输入依赖：已确认设计中的 Projection 设计；现有 Rust 权威协议、rollout record 与 Thread history projector。
- 明确不包含：GUI generated artifacts、DAG 领域模型、Redux、订阅协调、React Flow。
- 完成出口：Rust 权威类型、稳定 projection identity、历史/实时共用转换、schema fixtures 和聚焦测试完成；同一 raw delivery 不重复，turn/order 稳定，payload 与 encrypted content 不泄露；形成独立本地提交。

### `02-gui-experimental-contract-and-dag-source.md`

- 唯一目标：把 `01` 的 experimental 权威契约机械生成到 GUI，并建立窄的 production/in-memory `AgentDagSource` adapter。
- 输入依赖：`01` 已完成的 Rust contract、schema profile 与 projection RPC 行为。
- 明确不包含：多 Thread runtime、历史/实时队列、DAG 事件转换、Redux scene、React Flow UI。
- 完成出口：GUI experimental profile、initialize capability、request descriptors、runtime validators、Host commands 与 `AgentDagSource` adapters 完成；不存在手写 DTO、`unknown` 逃生口或通用 request；生成检查和 adapter 测试通过；形成独立本地提交。

### `03-agent-dag-event-model-and-causal-replay.md`

- 唯一目标：建立 `agentDag` 深模块内部的结构化 item 转换、稳定 identity、五类事件、因果拓扑顺序和 recipient-turn batch merge 语义。
- 输入依赖：`02` 提供的生成 `Thread` / `Turn` / `ThreadItem` 类型与内存 fixtures。
- 明确不包含：lane、坐标和颜色分配；Redux scene 接线；网络分页与 subscription；React Flow。
- 完成出口：五类事件、`NEW_TASK` 忽略、unresolved diagnostic、稳定 ID、最短唯一名称、确定性 Kahn 排序与 batch sealing 均由完整模型等值测试固定；不同 page 和输入到达顺序产生相同 replay sequence；形成独立本地提交。

### `04-agent-dag-incremental-layout-and-redux-scene.md`

- 唯一目标：把 `03` 的稳定 replay sequence 通过同一纯函数增量 reducer 转换为 serializable Redux scene，落实 activation、结构锚点、lane、颜色、节点外观和历史节点不移动。
- 输入依赖：`03` 的事件、merge、diagnostic、因果顺序与 batch 封口模型。
- 明确不包含：真实 app-server 请求、subscription lease、帧调度、React Flow DTO、任务视图。
- 完成出口：scene interface、normalized Redux state、selectors、activation/lane/color allocator、结构锚点和 edge semantics 完成；不同 replay batch 切分得到相同 scene，live append 不移动旧节点，Root/父子右侧、lane/颜色复用、节点形状及 identity 续接测试通过；形成独立本地提交。

### `05-agent-dag-runtime-and-multi-thread-ingestion.md`

- 唯一目标：使用 `AgentDagSource` 驱动 `AgentDagRuntime`，完成 descendants/history 分页、有限并发、多 projection 路由、历史分帧重放、live 因果缓冲、batch 封口、错误恢复和 dispose。
- 输入依赖：`02` 的 source adapter 与 `04` 的稳定 Redux replay interface。
- 明确不包含：React Flow、Tabs、工具栏、viewport、高亮视觉和节点样式。
- 完成出口：Root notification fanout 不污染聊天 coordinator；历史 replay 前 live 只进入 keyed buffer；因果 ready-set 与 recipient `turnCompleted` 封口后由同一 reducer 追平；attach snapshot/history cut 可去重，source error 不伪装 `caughtUp`，retry generation、stale notification 与 frame cancellation 测试通过；形成独立本地提交。

### `06-react-flow-task-surface-and-verification.md`

- 唯一目标：把稳定 scene 接入任务内 DAG panel，完成 React Flow adapter、HeroUI 控件、viewport/session、高亮、加载与错误展示，并完成跨层用户可感知验证。
- 输入依赖：`04` 的 scene/selectors 与 `05` 的 runtime/load/error 状态。
- 明确不包含：修改 projection、排序、batch merge、activation/lane 算法或 runtime 协议；不得借 UI 测试修补下层缺口。
- 完成出口：随首个实际消费者加入唯一新依赖 `@xyflow/react`；聊天/DAG Tabs、四项工具栏、首次定位最新事件、会话 viewport、只读 pan/zoom、可见元素渲染、warning/source error 和 replay 期间交互降级完成；Browser Mode、密集数据视觉回归及最终聚焦验证通过；形成独立本地提交后结束计划。

## 依赖顺序

```text
01 app-server projection
  → 02 generated contract + AgentDagSource
    → 03 event model + causal replay
      → 04 incremental layout + Redux scene
        → 05 runtime + multi-Thread ingestion
          → 06 React Flow task surface + final verification
```

上一份计划的完成出口未满足、对应提交未创建时，不得开始下一份计划。不得为了并行而引入临时 DTO、临时 scene、临时 queue contract 或重复转换路径。

## 全局约束

- 只扩展 projection；不新增或修改 core / rollout 原始 inter-agent event 或 metadata，不修改文本信封。
- projection 可以输出由既有 raw record 确定性派生的结构化字段；GUI 不解析 inter-agent 文本信封。
- 只显示 `started`、`interacted`、`interrupted`、`MESSAGE`、`FINAL_ANSWER` 五类事件；结构锚点与 batch merge 不计入事件数量。
- Root 固定 lane 0，后代只向直接父代理右侧分叉；抽象时间从下向上；正常追加不得移动既有节点。
- 历史和实时必须进入同一事件 replay 与增量布局路径；不得以跨 subscription 网络到达顺序充当确定性全局顺序。
- 只新增 `@xyflow/react`；不引入 ELK、Dagre、D3、额外虚拟化库、Canvas 或 WebGL。
- React Flow 只负责 viewport、可见元素渲染和 node/edge host；排序、布局、颜色和边语义由项目拥有。
- 不把 DAG 状态并入现有 transcript state，不把现有单 Thread coordinator 改造成多 Thread 数组。
- 不修改 Git 远程，不安装缺失工具，不运行后端、原生程序或 CLI build；正常格式化、生成、lint、类型检查和聚焦测试仍按项目规则执行。
- 每份子计划必须包含本层必要测试和验证；不得把 `01`–`05` 的验证推迟到 `06`。
- 每份子计划是一个顶层计划任务和独立本地提交边界。完成修改、聚焦验证与本次任务引入问题的闭环后，只暂存该任务相关文件，检查 staged diff，再创建提交。
- `01`–`06` 全部完成后立即终止，不追加新的 review、修复或验证轮次。

## 子计划编写要求

后续创建每份子计划时必须具体列出：

- 唯一任务目标和非目标；
- 预计修改、新增与生成的精确文件；
- 按依赖顺序排列的实现步骤；
- 测试先行或现有测试扩展的具体 seam；
- 允许执行的格式化、生成、lint、类型检查和聚焦测试；
- 本任务独立提交的暂存边界与建议提交信息；
- 遇到计划外接口、数据语义、安全风险或文件范围扩大时的停止条件。

`00-overview.md` 与 `01`–`06` 六份子计划共同构成完整实施计划。六份子计划尚未全部落盘并获得用户明确确认前，不得开始产品代码实现。

## 编写顺序

- [ ] 编写并确认 `01-app-server-inter-agent-projection.md`。
- [ ] 编写并确认 `02-gui-experimental-contract-and-dag-source.md`。
- [ ] 编写并确认 `03-agent-dag-event-model-and-causal-replay.md`。
- [ ] 编写并确认 `04-agent-dag-incremental-layout-and-redux-scene.md`。
- [ ] 编写并确认 `05-agent-dag-runtime-and-multi-thread-ingestion.md`。
- [ ] 编写并确认 `06-react-flow-task-surface-and-verification.md`。

## 最终完成条件

- 六份子计划全部完成并各自产生一个独立本地提交。
- app-server 能从既有 raw inter-agent records 稳定生成结构化历史、snapshot 与 live projection。
- GUI 能聚合 Root 与全部后代 Thread，并以同一确定性 replay/layout 路径生成完整 DAG scene。
- DAG 正确表达五类事件、结构锚点、activation、lane/颜色复用、跨代理 operation、同 turn 多回复 batch merge 与身份续接。
- 聊天/DAG 切换不重连、不丢实时事件，并按任务恢复应用会话内 viewport。
- dense 数据集下逻辑事件完整、可见元素受视口限制，历史分帧重放期间 UI 可浏览。
- 每层聚焦测试、生成检查、格式化、lint、类型检查、Browser Mode 与最终视觉/规模回归均按对应子计划通过。
