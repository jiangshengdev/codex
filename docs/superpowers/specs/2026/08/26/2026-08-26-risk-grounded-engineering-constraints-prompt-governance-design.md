# 工程约束风险落地提示词治理设计

日期：2026-08-26

状态：已确认

确认日期：2026-08-26

确认原文：确认设计。设计落盘

Codex 仓库设计时分支：`dev`

Codex 仓库设计时 HEAD：`88dae79e47746d186d5db264be39bd0614f18d6f`

`codex-config` 仓库设计时分支：`main`

`codex-config` 仓库设计时 HEAD：`9e6549ec2d48ee3c6069b31802cce8b92167c50e`

关联 issue：

- `docs/superpowers/issues/2026/08/24/2026-08-24-02-codex-execution-process-problems/2026-08-24-05-rules-used-as-wrong-proxies.md`

## 唯一主目标

建立一套通用的工程约束判断机制，防止 Codex 用容易计算的行数、diff、并发数量、覆盖率、历史实现和“更安全”等代理信号替代对真实职责、复杂度、共享资源、威胁路径与回归风险的技术判断；全局与前端提示词只保留简洁、稳定的不变量和 owner 路由，详细判断方法由手工维护的专门 skill 承载。

本设计只定义提示词与 skill 的责任分层、约束分类、证据要求、最小作用域、失败行为和验收边界。它不是 implementation plan，不定义执行顺序、执行图、提交拆分或实施命令，也不授权修改任何提示词、skill、issue 状态、Git index 或本地提交。

## 已确认的产品决策与后续修正

### 采用通用机制，历史事故只作为验收案例

用户已选择方案 A：治理对象不限于当前 issue 记录的几个关键词，而是所有可能被误作目标的代理信号。历史事故用于验证通用机制能否得到正确结论，不写成“见到某个词就禁止”的新门禁。

这意味着设计不能把 `500`、`800`、`Object.freeze`、closure、Firefox 或三个浏览器逐一复制到全局提示词。全局规则必须能处理尚未发生的新案例，同时保留明确硬约束的原有效力。

### 禁止修改上游 SKILL，必要时新建本地 skill

用户后续明确收窄范围：禁止修改上游 SKILL，必要时新建。

Git 证据确认：

- `.codex/skills/code-review-change-size/SKILL.md` 来自上游提交 `513dc28717aadc9e2a94c5736d55d4424eb12a27`，作者为 `pakrym-oai <pakrym@openai.com>`；本设计明确不修改该文件。
- `codex-config/skills/managing-work-stages/SKILL.md` 和 `codex-config/skills/delegating-micro-stages/SKILL.md` 的相关规则由当前仓库 Git 身份维护，不属于本次禁止修改的上游 SKILL。

由于通用机制需要覆盖普通实施、设计、调度和代码审查，而现有上游 change-size skill 又不能修改，本设计选择在 `/Users/jiangsheng/cnb/codex-config/skills/**` 新建手工维护的中央 skill。不得把它创建到只用于自动安装第三方 skill 的 `.agents/skills/**`。

## 当前事实校准

### 全局规则已有局部纠偏，但缺少统一 owner

`/Users/jiangsheng/cnb/codex-config/AGENTS.md` 已经要求按风险决定调查深度、区分解决问题与隐藏问题、禁止为了通过验证而削弱检查，并声明“改动量少”不是目标。这些规则方向正确，但不能统一回答以下问题：

- 一个数字究竟是硬边界、审查触发信号，还是与当前对象无关的指标；
- 约束保护的失败模式、资源或威胁路径是什么；
- 局部风险是否足以扩大成全局停工、拆分或串行；
- 历史实现是必要约束，还是仅供调查的既有做法；
- 何时可以退出限制，而不是让临时防护永久存在。

全局文件还包含“直到槽位用满”等容易被误读为数量目标的调度措辞，以及仅适用于前端样式测试的详细规则。这些内容说明需要重新分层，而不是继续添加平行条目。

### GUI 已有事故修补，不应继续堆叠近义规则

`/Users/jiangsheng/cnb/codex/codex-gui/AGENTS.md` 当前已经明确：

- Rust module 的 `500 LoC` 规则不适用于 TypeScript、TSX 或 JavaScript；
- complex changed lines 不是前端单文件行数门禁；
- 不得为了文件长度压缩、削弱或删除测试；
- 文件长度只能辅助判断，职责、状态所有权、耦合、函数范围、可测试性和可审查性才是结构判断依据；
- 没有真实不可信边界和篡改路径时，不应添加 `Object.freeze` 等运行时防御；
- 小 public interface 不能证明巨型 factory 或 closure 的内部职责合理。

这些规则覆盖了当前事故的主要局部边界，但内容已经偏详细，部分措辞仍暗含“存在文件行数限制”的前提。前端提示词需要压缩和校准，而不是再增加一套通用判断流程。

当前 GUI 提示词不存在 Firefox、Chromium、WebKit 的全局串行规则。浏览器事故不能通过添加浏览器专属反向门禁解决；它应由通用的共享资源与最小冲突域判断覆盖。

### 上游 change-size skill 保持原样

上游 `.codex/skills/code-review-change-size/SKILL.md` 使用 `800` 和 `500` 作为 change-size guidance，并要求根据实际 diff、依赖和调用点判断可审查的拆分阶段。

本设计不修改该上游内容。当前用户维护的全局规则和新中央 skill 负责补充解释：这些数字触发审查，但不能脱离 measurement target、变化构成、职责边界和拆分代价自动推出停工或拒绝。若上游未来明确把某个数字绑定为不可违反的强制政策，则仍须按实际指令层级和来源重新核验，不得由本设计预先覆盖未知未来规则。

## 术语与分类

### 硬约束

硬约束是已经明确绑定目标、作用范围和违反后果的不可违反边界，例如用户的明确否定条件、授权与安全门禁、协议不变量、资源上限或项目明确规定的强制政策。

硬约束必须按其精确对象和范围执行。本设计不把所有数字软化成建议，也不允许借“技术判断”绕过授权、安全、数据或用户明确边界。

### 启发式信号

启发式信号用于提示进一步检查，例如行数、diff 大小、覆盖率、状态数量、helper 数量、并发数量或文件长度。信号达到某个值可以触发调查，但在没有额外证据时不能单独决定停工、拆分、串行、重构、增加测试或拒绝交付。

### 历史实现与防御手段

已有 adapter、fallback、freeze、closure、锁、串行配置或其他防御手段只能证明“过去存在这种实现”，不能单独证明当前仍需要它。继续或复制这些手段前，必须识别当前 actor、触发路径、受保护不变量和机制无法由更简单边界替代的原因。

### 最小作用域

约束只作用于证据证明会触发风险的最小对象集合。局部共享资源冲突不能自动扩大成全任务、全浏览器、全仓库或全阶段限制；扩大作用域需要新的因果证据。

## 通用判断契约

当规则、指标或历史实现将导致停工、拆分、串行、增加防御、增加测试、降低可读性或改变交付范围时，必须在行动前完成以下判断：

1. 确认规则类型：硬约束、启发式信号、历史实现，还是领域惯例。
2. 确认测量对象与口径：最终成品、单次 diff、生产代码、测试、生成物、单文件、函数、模块或整个任务不能混为一谈。
3. 确认受保护目标与具体失败模式：说明谁或什么会通过哪条真实路径造成什么失败。
4. 建立因果证据：当前代码、配置、日志、测试或权威文档必须支持该信号与风险之间的关系；“更安全”“通常如此”和既有做法不是充分证据。
5. 确认最小必要动作与作用域：只限制真实冲突对象，保留无冲突路径继续执行。
6. 确认验证方式与退出条件：说明如何证明风险已被控制，以及何时解除临时限制。
7. 保持原有检查能力：不得通过压缩测试、删除覆盖、关闭检查、放宽断言或隐藏失败满足代理指标。

该契约是判断内容，不是强制用户可见的固定表单。实现不得要求每个普通任务机械打印七个字段，也不得把“字段已填满”再次当成技术判断完成的代理。风险低且关系显然时可以简短完成；风险高、影响面未知或准备据此停止工作时必须提供可复核证据。

## 责任分层

### 全局 `AGENTS.md`：短不变量与路由

`/Users/jiangsheng/cnb/codex-config/AGENTS.md` 只保留跨项目始终成立的简洁规则：

- 明确硬约束与启发式信号必须分开解释；
- 指标、阈值、历史实现和“更安全”不能脱离真实风险与因果证据替代技术判断；
- 局部风险不得无证据扩大作用域，不能通过削弱检查满足指标；
- 当这些信号会改变工作范围、停止条件、防御机制、测试或并发策略时，必须使用 `$evaluating-engineering-constraints`；
- 详细判断和事故案例不复制回全局提示词。

全局并行调度措辞应避免把槽位利用率本身设为目标，只要求及时运行所有有实际价值、无依赖、无冲突且已获授权的 ready 节点。前端样式测试的具体规则移交 GUI 层，全局仅保留“验证必须对应真实稳定约束和实际回归风险”的通用语义。

### 新建 `$evaluating-engineering-constraints`：唯一详细 owner

在 `/Users/jiangsheng/cnb/codex-config/skills/evaluating-engineering-constraints/` 新建自动发现的手工 skill，作为本问题的唯一详细 owner。

skill 的 description 应覆盖以下触发：使用指标、阈值、历史实现、防御性编码、并发限制或测试数量来决定停工、拆分、串行、重构、加固或验证范围。description 同时要排除纯粹执行已经明确且无需解释的硬约束，避免每遇到数字都误触发。

主 `SKILL.md` 只保留：

- 约束分类与核心判断流程；
- 硬约束不得被软化的边界；
- 代理信号不能单独决定结果；
- 何时必须读取详细 reference；
- 与 `$managing-work-stages`、`$delegating-micro-stages` 和领域提示词的 owner 边界。

详细 reference 采用渐进披露，承载 measurement target、因果证据、最小作用域、威胁模型、结构职责、测试价值、失败行为与历史事故验收案例。具体文件拆分属于后续计划的实现机制，本设计不固定 reference 数量。

skill 不维护动作授权、阶段门禁、项目命令、代码风格或浏览器配置，不成为新的全能工程规则 owner。它只回答“这条约束能否基于当前证据用于当前对象，以及能推出多大作用域的动作”。

### `$managing-work-stages`：保持阶段与事实闭包 owner

`$managing-work-stages` 继续负责风险分级、事实闭包、设计/计划/实现门禁和关键未知阻断。本设计不要求修改它来复制新的约束分类流程。

当阶段判断需要用指标决定调查深度、停止推进或扩大范围时，加载新的 `$evaluating-engineering-constraints`；新的 skill 消费当前事实闭包证据，不取代阶段 owner。

### `$delegating-micro-stages`：只修正调度目标

`/Users/jiangsheng/cnb/codex-config/skills/delegating-micro-stages/SKILL.md` 由当前用户维护，可以在本设计范围内修改。

它继续拥有执行图并行调度、微阶段拆分、能力信封与失败域。需要修正的语义只有：

- 并行目标是运行所有有实际价值且无冲突的 ready 节点，不是为了填满槽位而制造节点；
- 是否并行和限制到何种范围由真实产物依赖、资源锁、授权边界和当前负收益证据决定；
- 局部资源冲突只串行对应冲突域，其他独立节点继续；
- 完成前检查只要求不存在被无证据搁置的有价值 ready 节点，不要求用无价值任务填满 agent 数量。

它不承载 Firefox、浏览器测试或运行时 freeze 的领域案例；这些案例只存在于新中央 skill 的验收 reference。

### `codex-gui/AGENTS.md`：精简的前端差异项

`/Users/jiangsheng/cnb/codex/codex-gui/AGENTS.md` 只保留在进入前端目录时必须始终可见的短规则：

- Rust module LoC、changed lines 和 TypeScript/TSX/JavaScript 文件长度是不同对象，不能互相转换；
- 前端结构判断以职责、状态所有权、耦合、函数范围、可测试性和可审查性为准，文件长度只提供辅助信号；
- 不得为了长度指标压缩、削弱或删除测试；
- typed in-process 边界默认使用类型、所有权、复制和封装，运行时防御必须有真实不可信 actor、支持路径和失败影响；
- 小 public interface 或文件低于某个长度都不能证明巨型函数、factory 或 closure 的职责合理；
- 前端样式测试只覆盖稳定、用户可感知且有实际回归风险的约束；
- 性能验证必须对应可测风险，存在测试或 issue note 不能单独证明性能正确。

现有细节应合并和压缩，并路由到 `$evaluating-engineering-constraints`。不得添加 Firefox/Chromium/WebKit 专属反向门禁，也不得把 GUI 提示词变成通用风险判断手册。

### 上游 SKILL：全部保持不变

本设计禁止修改所有经 Git 证据确认来自非当前用户的上游 SKILL，包括但不限于：

- `/Users/jiangsheng/cnb/codex/.codex/skills/code-review-change-size/SKILL.md`。

实施前若发现某个拟修改 skill 的作者身份不明确，必须先通过当前仓库 `git config user.name`、`git config user.email`、`git blame` 和必要的 `git log --follow` 核验。无法确认由当前用户维护时，按上游 SKILL 处理并排除修改；若仍有必要，优先在 `/Users/jiangsheng/cnb/codex-config/skills/**` 新建或扩展当前用户维护的 owner，不得直接编辑来源不明的 skill。

## 历史事故验收案例

以下案例用于验证通用机制，不是全局触发词清单。

### 单次 diff 代替最终成品规模

历史事件中，单次 Task diff 为 `503` 行，但最终生产 module 为 `495` 行；diff 还混合了测试与生产变化。仅用 `503 > 500` 触发硬停止、拆任务和重写计划，混淆了 measurement target。

正确行为是先确认约束保护的是最终模块职责、单次审查负担还是其他对象，再拆解生产、测试、生成和机械变化。达到 change-size guidance 可以触发审查，但不能靠压缩测试或删除正确性检查越线。

### Rust module LoC、changed lines 与 GUI 文件长度混用

Rust module 的目标行数、复杂逻辑的 changed lines 和 TypeScript 文件总长度是三个不同指标。不能把 Rust 规则转成 GUI 单文件 `wc -l` 门禁，也不能因为文件未达到某个数值就证明内部职责合理。

正确行为以语言与规则对象、职责、状态所有权、耦合、函数范围、可测试性和可审查性为依据。

### Firefox 局部焦点竞争扩大为三浏览器串行

历史根因只涉及同一个 Firefox browser process 内多个并行 page 争夺焦点。Chromium、WebKit 不共享该 process，也不是触发条件。

正确行为是识别触发条件、竞争资源、最小互斥域和仍可并行对象。局部 Firefox page 冲突不能单独推出三个浏览器引擎全局串行。

### 无威胁模型的 `Object.freeze`

历史实现加入了大量 `Object.freeze`，但没有真实 caller、支持的篡改路径或无法由 `Readonly`、输入复制、唯一 owner 和封装处理的风险；测试又用 `Object.isFrozen` 把实现手段固化成契约。

正确行为是先确认 actor、path 和 impact。只有真实不可信 JavaScript 或外部边界需要运行时防篡改时才考虑 freeze；除非 runtime tamper resistance 是明确产品或安全要求，不测试具体冻结手段。

### 小接口和文件长度掩盖巨型 closure

历史 closure 在状态和职责增长后仍集中承载多类状态转换，又以 public interface 小和文件低于某个行数暗示结构合理。

正确行为是独立审查函数职责、共享状态 owner、变化轴和测试边界。closure 本身不被禁止，状态数量、helper 数量也不能被固化成新的硬阈值。

## 失败行为

- 无法判断规则是硬约束还是启发式信号：保留原文与当前来源，继续核验；差异会改变结果且证据不足时才请求用户决定。
- measurement target、计算口径或适用对象不明：不得据该指标停工、拆分或宣称通过；先闭合对象。
- 缺少 actor、触发路径、共享资源或失败影响：不得仅以“更安全”增加防御或扩大串行域。
- 只有局部风险证据：只限制局部失败域，无关且仍获授权的工作继续。
- 发现明确硬约束：按精确对象执行，不得用通用机制将其降级为建议。
- 发现上游 SKILL 与当前用户维护规则冲突：按当前全局规则核验具体冲突行作者；本设计不授权修改上游 SKILL。
- 某项检查本身错误：只有修正检查属于用户目标和授权范围时才能修改；否则报告，不通过关闭或绕过检查假装解决。

## 验收边界

### 规则与 skill 结构验收

- 全局新增内容保持简洁，只定义不变量和 `$evaluating-engineering-constraints` 路由；
- 新 skill 位于 `/Users/jiangsheng/cnb/codex-config/skills/evaluating-engineering-constraints/`，metadata 能准确触发且不会因普通数字误触发；
- 详细流程与事故案例通过 reference 渐进披露，不复制回全局或 GUI 提示词；
- `$delegating-micro-stages` 不再把槽位利用率本身作为完成指标；
- GUI 提示词比当前相关段落更短，同时保留前端专属边界；
- 没有修改任何上游 SKILL；
- 新建或修改的 skill 按全局规定的隔离方式通过 `quick_validate.py` 结构校验，具体命令由后续计划根据当前工具和路径核验。

### 合成行为验收

后续独立行为检查至少覆盖：

- change-size 超过 guidance，但主要由必要测试或机械生成组成，不能自动停工；
- 最终模块职责合理但单次 diff 较大，要求分析审查负担而不是混淆成文件 LoC；
- TypeScript 文件超过 Rust 的数值 guidance，不触发跨语言硬门禁；
- 文件低于 guidance，但一个函数拥有多类状态与变化轴，仍能识别结构风险；
- 一个浏览器 process 内存在资源冲突，只限制对应冲突域；
- 没有真实不可信路径时，不因“更安全”添加 runtime freeze；
- 明确安全、授权、用户否定条件或协议硬不变量仍保持强制；
- 低风险普通任务不被迫打印固定七字段表格。

### 真实效果验收

提示词、skill 修改、结构校验和合成行为检查只能证明规则层已按设计落地，不能单独证明历史问题已经不再发生。关联 issue 应保持打开，至多在后续实施和复核任务中根据当前源码、验证与 Git 证据更新为“📏 待复核”。

只有后续真实任务中不再出现以错误 measurement target 停工、无证据扩大串行域、无威胁模型增加防御或用文件长度替代职责判断，才可单独评估是否标记“✅ 已修复”。

## 明确排除范围

- 不修改任何上游 SKILL，包括 `.codex/skills/code-review-change-size/SKILL.md`；
- 不修改 upstream base instructions、Default collaboration prompt、模型 system prompt 或产品内置提示词；
- 不把所有数字、阈值或门禁降级为启发式建议；
- 不新增工具层规则解释器、运行时 capability enforcement、自动打分器或固定风险数据库；
- 不修改产品代码、协议、schema、生成器、测试运行器配置或浏览器并发配置；
- 不为历史事故新增关键词黑名单、数值反门禁或三浏览器专属规则；
- 不修改或关闭关联 issue；
- 不在本文写入 implementation plan、执行图、任务顺序、提交拓扑或执行命令；
- 不借本设计精简与该问题无关的全部全局规则、GUI 规则或 skills。

## 实施前门禁

设计落盘不授权创建计划或开始实施。只有用户确认本设计并明确要求编写计划后，才能进入独立计划阶段。

当前 `/Users/jiangsheng/.codex/AGENTS.md` 是指向 `/Users/jiangsheng/cnb/codex-config/AGENTS.md` 的符号链接，两者是同一受保护资源。后续计划即使获得确认，实施前仍必须向用户展示拟写入该受保护资源的精确内容，并取得面向该文件的单独明确写入确认。设计确认、设计落盘、计划确认或一般性的“继续”都不能替代该 special approval。

后续计划必须先只读核验两个仓库的当前 HEAD、Git 状态、目标文件作者、skill 路径、现有验证入口与受保护资源 canonical identity。计划不得假定本设计列出的每个可修改 owner 都必然需要改动，只修改实施前审计后仍存在职责缺口的文件。

若后续计划获得确认，开始执行任何计划任务前，必须先将本设计和相关计划文档创建为独立本地 Git 提交；文档提交成功前不得修改提示词或 skill。
