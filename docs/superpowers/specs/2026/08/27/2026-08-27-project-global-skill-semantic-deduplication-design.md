# 项目与全局 Skill 语义去重设计

日期：2026-08-27

状态：设计已确认

确认日期：2026-08-27

确认原文：`确认，计划落盘`

设计分支：`dev`

设计时 Codex HEAD：`7ae48eb24bf1e0e4d88a67b49110af8aa63e49cf`

设计时 codex-config 分支：`main`

设计时 codex-config HEAD：`722ccef6b5dd0e96a111a8dfe2ded32bc616c44c`

## 唯一主目标

为当前项目 `.codex/skills/**` 与全局 `~/.codex/skills/**` 中由 `jiangshengdev@outlook.com` 或 `jiangshengse@outlook.com` 提交的内容建立语义去重方案：保持现有 skill 入口、触发范围和有效行为，以唯一 canonical owner 承载详细规则，其他 skill 只保留触发路由、消费契约和领域增量，并继续强制在适用的复杂跨文件工作中使用子代理。

本设计只定义作者边界、canonical 资源、owner 分层、重复簇处理方式、行为保持条件和验收不变量。它不是 implementation plan，不定义任务顺序、提交拆分、执行命令或精确写入文本，也不授权修改 skill、`AGENTS.md`、Git index、提交或远程状态。

## 已确认决策

### 两个邮箱均属于本人提交

以下两个 Git author email 均纳入本人范围：

- `jiangshengdev@outlook.com`
- `jiangshengse@outlook.com`

作者范围必须以目标仓库当前文件的逐文件 Git 证据核验。不能因为 merge commit 的作者是本人，就把 merge 带入且当前仍归属上游作者的具体内容认定为本人提交。

### 保持入口、触发范围和有效行为

本轮不以减少 skill 数量为目标，不合并或删除现有 skill 入口，不扩大或缩小 metadata 触发范围，不删除领域能力。去重对象是重复维护的规则和协议，不是名称相近的 skill。

允许的结果是：一个 owner 保留完整规则，消费者改为短路由并保留领域增量。禁止用“文字更少”替代行为等价证明。

### 子代理在适用任务中必须使用

跨文件阅读、复杂排查、长 diff、方案比较、多阶段调研和执行已确认计划等当前规则命中的工作必须使用子代理。当前任务已经由用户直接明确授权并要求使用子代理。

通用授权语义统一归 `action-authorization`：当前用户直接指令，或当前适用的用户自有规则中明确声明的委派授权，可以成为委派授权来源；普通 skill trigger、工具可用性或仅仅写着“建议委派”不能自行产生授权。`delegating-micro-stages` 只判断何时必须委派、如何拆分和如何消费授权结论。

## 资产、作者与 canonical 边界

### 项目 skill

项目 canonical 根为 `/Users/jiangsheng/cnb/codex/.codex/skills`。当前纳入 9 个本人 skill 目录及其全部已跟踪内容，包括 `SKILL.md`、`agents/`、`references/`、`scripts/` 和测试：

- `codex-gui-toolchain`
- `codex-gui-worktree`
- `codex-rust-verification`
- `debug-responsive-gui`
- `gui-launch`
- `heroui-react`
- `redux-toolkit`
- `release-promotion`
- `vitest-react-browser-docs`

当前项目其余 11 个 skill 的现存内容由上游作者提交，全部排除。本人作为 merge commit 作者不改变这些具体文件行的作者归属。

### 全局 skill

`/Users/jiangsheng/.codex/skills/<name>` 下的 10 个手工 skill 是符号链接，不是第二份内容。其 canonical 根为 `/Users/jiangsheng/cnb/codex-config/skills`，纳入：

- `action-authorization`
- `codex-issue-doc-workflow`
- `delegating-micro-stages`
- `evaluating-engineering-constraints`
- `instruction-fidelity`
- `managing-work-stages`
- `node-imagegen`
- `project-doc-workflow`
- `resolve-idea-simple-conflicts`
- `reverting-git-commits`

后续设计和计划必须把 `~/.codex/skills/**` 的逻辑入口与 `codex-config/skills/**` 的 canonical 内容视为同一资源，不得重复修改。全局 skill 的实际修改、验证和提交归 codex-config 仓库；项目 skill 与本设计文档归 Codex 仓库。两个仓库不能形成一个 Git 提交。

### 明确排除

- 项目中 11 个无本人当前内容的上游 skill。
- `/Users/jiangsheng/.codex/skills/.system/**`。
- `/Users/jiangsheng/.codex/skills/playwright/**` 与 `playwright-interactive/**`。
- `/Users/jiangsheng/cnb/codex-config/.agents/skills/**` 自动安装的第三方 skills。
- 两个仓库的 `AGENTS.md`、产品代码、协议、schema 和运行时。
- 已删除的历史 skill 与旧符号链接。
- Git 远程、安装程序或依赖、issue 状态更新。

## 统一去重模型

每个重复簇只允许一个详细 owner。其他 skill 可以保留以下三类内容：

1. **触发路由**：说明何时必须加载或消费 owner。
2. **领域增量**：只在本 skill 领域成立的路径、参数、算法、失败行为或验收要求。
3. **停止条件**：该消费者特有且不能由通用 owner 推出的阻断边界。

消费者不得重新定义 owner 的字段、状态机、授权来源、完整检查表或算法。owner 也不得反向接管消费者的领域机制，否则会从文本重复变成职责膨胀。

允许保留一条短边界句以防止误触发；这种必要路由不算重复。只有完整规则、相同判断过程或同一不变量在多个位置分别维护时，才属于本轮去重对象。

## Canonical owner 矩阵

### 动作授权与能力信封

`action-authorization` 是动作授权来源、动作族、目标与副作用、canonical target、special approval 和授权生命周期的唯一 owner。`references/capability-envelope.md` 是子代理能力字段、交集公式、到期和授权越界语义的唯一详细 owner。

`managing-work-stages` 只消费授权结论并映射到阶段；`delegating-micro-stages` 只在委派前构造和消费能力信封；execution graph 只记录 `authorizationGate` 对 ready 状态的调度影响。

委派授权的既有歧义按已确认语义收敛：用户当前直接要求子代理时当然已授权；适用的用户自有规则只有明确声明“授权委派”时才能形成 standing authorization；普通“必须委派”文字不自动被泛化为授权来源。

### 工作阶段

`managing-work-stages` 唯一拥有调查、设计、计划、实现、准备模式、设计先于计划、设计与计划落盘授权、回复长度以及既有阶段例外。

`project-doc-workflow` 不再重新判断是否已经获得落盘授权，只消费阶段结论，负责文档位置、命名、历史保留、research 载体和计划正文结构。

### 执行图

`delegating-micro-stages/references/execution-graph.md` 是节点 schema、`ready set`、关键路径、资源锁、fan-in、失败域、运行记录和终态并行证据的唯一详细 owner。

必要的分层路由继续保留：

- `managing-work-stages` 保留什么阶段需要计划 DAG、何时执行已落盘计划并进入动态图；
- `delegating-micro-stages/SKILL.md` 保留普通委派与执行落盘计划的触发差异；
- `project-doc-workflow` 保留长计划文档必须承载权威 DAG，以及计划文档如何保存确认时结构。

上述短契约不是重复，不得机械删除。字段清单、调度状态机、锁算法和 fan-in 协议不得在消费者中再次展开。

### 文档位置、日期与 Issue 专属结构

`project-doc-workflow` 唯一拥有通用 `YYYY/MM/DD/` 分类、日期前缀、既有文档不迁移和历史版本保留。

`codex-issue-doc-workflow` 只保留 Codex issue 专属的 `NN-short-topic`、拆分目录与根索引、状态字段、必需章节、证据和后续处理格式。它通过短路由消费通用路径与历史规则，不再复制日期目录和历史文件迁移原则。

`project-doc-workflow` 的 description 和正文不得因此接管 issue schema；两个 skill 仍保持各自入口。

### 提交已有变更与计划内提交

`action-authorization/references/action-families.md` 唯一拥有“提交已有变更”动作族允许的只读检查、精确 stage、本地 commit 及不允许编辑、生成或扩大范围的边界。

`managing-work-stages` 只保留该请求无需重新进入设计或计划的阶段例外。`project-doc-workflow` 中已确认计划的逐任务提交、文档默认未提交状态和计划内提交拓扑是不同对象，继续原地保留。

### 通用执行环境预检

`managing-work-stages/references/execution-environment-preflight.md` 唯一拥有权威入口、cwd、manifest、工具来源、配置与环境、generated/sparse 输入、真实目标命中和预期输出等通用检查。

`codex-gui-toolchain` 只保留 `codex-gui` 的 `package.json`、fnm 管理的 Node/pnpm、具体脚本发现、schema/validator、Vitest/Playwright 收集和目标命中等项目增量。

`codex-rust-verification` 保留 Rust 窄测试和 lint Hard Limits、快照、schema、依赖锁等领域规则；通用的“读取实时入口、不要照搬旧计划”改为短路由，不重复完整预检。

### worktree 授权与项目机制

`action-authorization` 唯一判断当前直接 worktree 请求、已确认计划中的精确动作、旧计划字段更新及是否需要重新确认。

`managing-work-stages` 保留“准备 worktree 不进入只读准备模式”、计划中的 worktree 交付要求和实现前统一预配屏障。

`codex-gui-worktree` 唯一拥有项目脚本入口、参数、canonical 路径算法、symlink 映射、执行前披露、冲突/覆盖检测、sparse layout、链接资源和创建后验证。它消费授权结论，不再自行维护一套通用授权来源和旧计划覆盖语义。

worktree 创建在执行图中属于独立有状态节点，由图指定唯一 owner；“coordinating agent”不能被解释为绕过已确认计划的委派契约。

### 前端命令与恢复

`codex-gui-toolchain` 唯一拥有 codex-gui 的 pnpm 命令选择、脚本存在性、fnm 环境和执行前 discovery。

`heroui-react` 与 `redux-toolkit` 继续保留“相关改动完成后需要 lint 与 type-check”的结果要求，但不裸写可能漂移的通用执行命令；执行方式路由到 toolchain。

`debug-responsive-gui` 保留“仅在 502 且没有监听器时启动前端开发服务”、前台会话、禁止 `nohup` 和恢复后继续真实 GUI 验收的行为，但具体当前入口与运行环境由 toolchain 决定。

### 本地前端依赖文档导航

不新增或删除 skill 入口。在 `codex-gui-toolchain` 下建立一个非触发型共享 reference，作为“离线文档存在性、使用 `rg` 定向查找、只读相关章节、缺失即停止”的通用导航 owner。

`heroui-react`、`redux-toolkit` 与 `vitest-react-browser-docs` 加载该 reference，同时保留自己的 docs root、优先目录、搜索词和领域 API 规则。`codex-gui-worktree` 只负责在工作树中提供缓存与链接，不接管文档使用语义。

### Git 回退

`reverting-git-commits` 继续作为完整动作专用 owner，不与 `release-promotion` 合并。

该 skill 内部把默认 `git revert <sha>`、多提交反向顺序、默认一原提交一 revert commit、原提交 hash、明确合并例外、冲突即停、禁止手写反向 patch 和禁止远程各保留一处规范定义。单提交、多提交和完成检查只引用这些规范，不再反复重述全文。

## 明确保留的非重复边界

- `gui-launch` 的普通 URL 输出与 `debug-responsive-gui` 的真实浏览器调试是互斥入口，不合并。
- `debug-responsive-gui` 的 Chrome for Testing、Playwright、AppleScript、IME、React/Redux inspector 和真实 GUI 验收继续完整保留。
- HeroUI、Redux Toolkit 与 Vitest Browser Mode 的领域规则彼此独立，不合并。
- `codex-gui-worktree` 的资源链接 provisioning 不等于使用这些技术文档。
- `codex-rust-verification` 的 Hard Limits 与 `release-promotion` 的本地分支晋级流程独立。
- `instruction-fidelity`、`evaluating-engineering-constraints`、`node-imagegen` 与 `resolve-idea-simple-conflicts` 当前没有高置信可迁移重复，不因本轮“顺手精简”。
- 各 skill 必要的短触发句、owner 路由和领域停止条件不因文本相近被删除。

## 邻近问题但不在本设计内

`redux-toolkit` 同时规定离线使用本地文档，又提供通过 `gh api` 在线更新文档的流程。这是模式或行为冲突，不是语义重复。

本设计保持该现状，不删除任一侧，不把冲突隐藏到共享 reference 中，也不据此修改更新脚本。若需要处理，必须由用户另行发起独立任务，先明确在线刷新是否是显式触发的维护模式。

## 行为保持与验收不变量

### 作者和写入边界

- 所有拟修改行与目录在实施前重新通过 Git config、log 和逐文件 blame 核验为两个已确认邮箱之一。
- 非本人项目 skill、`.system`、第三方实体目录与 `.agents/skills/**` 保持不变。
- `~/.codex/skills/**` 的符号链接和 codex-config canonical 目标不被当作两份文件。
- Codex 与 codex-config 分别形成可审计的本地提交边界，不跨仓库混交。

### 入口与行为

- 现有 19 个纳入范围的 skill 入口、名称、description 触发语义和可发现性保持不变。
- 普通 GUI 启动、真实 GUI 调试、worktree 创建、Rust 验证、发布晋级、文档管理、委派与 Git 回退的用户结果保持不变。
- 子代理在适用的复杂工作中仍然必须使用；只读父授权不能因委派而扩大为写权限。
- worktree 直接请求、设计/计划落盘、提交已有变更等现有授权结果保持不变。
- Redux 离线/在线刷新冲突保持可见，不被去重改动静默选择。

### Owner 一致性

- 每个详细协议只有一个 owner；消费者只保留路由、领域 delta 和停止条件。
- 不形成相互引用的 owner 环，也不让通用 owner 接管项目机制。
- 同一判断修改后，不需要在多个 skill 同步更新完整规则。
- 完成前检查可以引用规范段，但不能再次复制整套规范。

### 验收证据

后续实现验收必须同时包含：

- scope-aware diff 与逐文件作者复核；
- skill 结构校验和引用可达性检查；
- 针对每个受影响入口的合成触发案例，证明入口、触发范围和有效行为未变化；
- owner 静态审计，证明详细规则只剩一个 canonical 定义；
- 两仓库独立状态、diff、stage 与提交证据。

字数减少、重复行计数下降、skill 能被发现或结构校验通过，都不能单独证明设计目标达成。

## 后续计划边界

本设计确认后才能进入独立计划阶段。计划必须把 Codex 项目 skill、codex-config 全局 skill、共享 reference、引用校验和行为验收分为边界明确的任务，并为两个仓库分别定义提交拓扑。

计划不得修改 `AGENTS.md`、非本人 skill、Redux 在线刷新行为、产品代码或远程状态。若实施调查发现必须越过这些边界，必须停止并回到设计确认，不得借“去重”扩大范围。

执行已落盘计划前，必须先把本设计和对应计划文档创建为独立本地 Git 提交；该提交授权不由本设计确认自动产生。

## 设计确认门禁

设计落盘不等于设计确认。只有用户明确确认本设计后，才能进入独立计划阶段。设计确认不授权编写计划之外的修改，不授权修改 skill、验证、stage、commit、安装依赖或操作 Git 远程。
