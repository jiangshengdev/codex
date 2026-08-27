# 执行环境预检提示词治理设计

日期：2026-08-27

状态：待确认

设计分支：`dev`

Codex 仓库设计时 HEAD：`0587754e2495a8149957aecf9692a4167078e12f`

`codex-config` 仓库设计时分支：`main`

`codex-config` 仓库设计时 HEAD：`77584f1a0da7530e0a67e6342a34f0789bcfeb84`

关联 issue：

- `docs/superpowers/issues/2026/08/24/2026-08-24-02-codex-execution-process-problems/2026-08-24-06-execution-environment-preflight.md`

## 唯一主目标

建立一套分层、按风险缩放的执行环境预检提示词治理：在会改变状态的命令执行前，以及命令结果会被用作事实、设计、计划或验证证据前，先证明命令将在正确入口、工作目录、执行身份、工具来源和完整输入上运行；预检成功时保持静默，失败时只报告阻断执行的环境差异，并让无依赖工作继续推进。

本设计只定义全局提示词、`$managing-work-stages` 和 `$codex-gui-toolchain` 的责任边界、预检契约、失败行为与验收边界。它不是 implementation plan，不定义任务顺序、执行图、提交拆分或实施命令，也不授权修改任何提示词、skill、issue、Git index 或本地提交。

## 当前事实与根因

### 事实校准

- `/Users/jiangsheng/cnb/codex-config/AGENTS.md` 是当前全局 filesystem 指令的实际文件；它不等同于产品内部的 system-role prompt。本文所称“全局提示词治理”只指该全局指令层。
- 全局规则已经要求按风险完成事实闭包，并把详细闭包交给 `$managing-work-stages`；同时已有必要工具检查、固化脚本入口和项目专属 skill owner 路由。
- `$managing-work-stages` 已把“执行前闭合可执行输入”列为第三道事实闭包，并要求核验命令、工作目录、工具、配置、生成输入、worktree 或 sparse 输入、预期输出和验证入口。
- `$codex-gui-toolchain` 已承担前端 live script、cwd、fnm/Node/pnpm、生成输入和验证目标命中等项目差异。
- 关联 issue 已分别记录绕过固化入口、错误 cwd 或 manifest、错误执行用户、工具直到批处理中后期才发现缺失、默认搜索受 ignore 影响，以及 sparse worktree 缺少必要输入等事件。Sparse checkout 是其中一个子问题，不是统一根因。

### 根因

当前缺口不是完全没有环境检查规则，而是缺少一个稳定、显式、可复用的预检契约：

- 全局层对“进入下一阶段前”的事实闭包已有路由，但对直接执行任务和证据命令的触发边界不够直观；
- `$managing-work-stages` 主文件列出了执行输入类别，却没有独立 reference 统一定义命令身份、环境身份、输入完整性、目标命中、成功静默、失败报告和调度行为；
- 前端专属检查与通用检查之间缺少清晰的继承关系，容易在全局提示词、GUI 提示词和 toolchain skill 之间重复；
- 环境问题常在命令已经失败、批处理已经推进或测试根本没有命中目标后才被发现，使环境错误被误判为产品错误，或使无关任务被一并串行阻塞。

因此，本设计不是把一份固定清单复制到所有提示词，而是补齐触发门禁、建立唯一通用详细 owner，并让项目专属 skill 只追加差异。

## 已确认的产品决策

### 决策 A：成功静默，失败报告

用户已选择方案 A：预检全部通过时不向用户逐项打印检查过程，也不增加新的确认点；助手直接进入当前已经获得授权的动作。

预检失败时，只报告会阻断当前动作的差异。报告必须让用户能判断失败发生在哪里、影响什么以及下一步由谁处理，但不得倾倒全部成功项或长篇环境清单。最低内容包括：

- 失败的预检项；
- 预期状态与实际状态；
- 被阻断的动作及其依赖后继；
- 可继续的无依赖工作；
- 需要用户完成的操作，或需要回到哪一个事实、设计、计划或授权边界。

成功静默只约束沟通噪声，不允许跳过预检，也不允许把失败降级为警告后继续使用不可信结果。

## 覆盖边界

预检适用于两类命令：

- 会修改文件、配置、生成物、进程状态、Git 状态或其他持久、半持久状态的命令；
- 虽然只读，但其输出将被用作事实判断、根因结论、设计输入、计划范围、排除证据或验证证据的命令。

纯展示且结果不会影响判断或后续动作的低影响读取，不要求套用完整预检。预检深度按风险缩放：

- 范围明确、可逆、低影响的动作，只检查与该命令能否真实命中目标直接相关的环境输入；
- 跨层、公共接口、生成链、持久状态、生命周期、失败恢复、高影响操作或未知影响面的动作，必须闭合全部适用环境输入；
- 发现入口、owner、生成输入、执行身份、工具来源或目标命中未知时，立即升级；
- 某项确实不适用时可以排除，不得为了填表虚构环境依赖。

预检只证明执行环境与命令目标可信，不替代 `$action-authorization` 的动作授权，不替代 `$instruction-fidelity` 的命令字面量保真，也不替代纵向影响面调查、产品验证或结果解释。

## 三层 owner

### 全局 `AGENTS.md`：短门禁与 owner 路由

`/Users/jiangsheng/cnb/codex-config/AGENTS.md` 只保留一条跨项目稳定成立的短规则：进入下一阶段或开始实际执行前，按 `$managing-work-stages` 完成适用的事实闭包；具体环境预检由适用的项目专属 skill 或固化入口负责，详细检查表不得复制回全局指令。

全局层可以继续保留高风险计划确认前的证据摘要要求，但不展开 cwd、manifest、工具路径、ignore、schema、generated input 或 sparse checkout 的逐项算法。应优先收敛现有 owner 路由语句，而不是追加新的长段落。

### `$managing-work-stages`：通用详细 owner

`/Users/jiangsheng/cnb/codex-config/skills/managing-work-stages/` 继续作为通用执行输入闭包的唯一详细 owner，不新建平行 skill。

主 `SKILL.md` 只保留：

- 执行环境预检的触发边界；
- 按风险缩放与升级条件；
- 关键环境未知阻断受影响动作；
- 成功静默、失败报告；
- 路由到新的 `references/execution-environment-preflight.md`。

新的 `execution-environment-preflight` reference 负责本文“详细 preflight 契约”和“失败与调度行为”。普通调查或低影响读取不需要加载完整 reference；真正准备执行有状态命令或证据命令时再按需读取。

### `$codex-gui-toolchain`：前端差异 owner

`/Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-toolchain/` 继续负责 Codex GUI 的前端差异，并继承 `$managing-work-stages` 的通用契约。其范围包括：

- 当前 fnm 管理的 Node 与 pnpm 来源；
- live `package.json` script、正确 cwd 和 frontend workspace root；
- 前端生成输入、schema fixture 和实际输出位置；
- Vitest Browser Mode、Playwright 或其他前端验证入口是否真实收集并命中目标；
- GUI sparse worktree 中前端命令所需输入是否可见。

该 skill 不复制通用的失败报告、ignore 判定、用户身份、调度阻断或风险缩放算法，只记录前端特有的输入和判定方式。

### 明确保持不变的 owner

本设计保持以下文件或 skill 不变：

- `/Users/jiangsheng/cnb/codex/codex-gui/AGENTS.md`：不再添加通用或前端预检规则，避免与 `$codex-gui-toolchain` 重复；
- `/Users/jiangsheng/cnb/codex/.codex/skills/codex-gui-worktree/`：继续只负责创建、准备、修复 GUI worktree 及其既有 sparse include，不承担所有命令的运行时预检；
- `/Users/jiangsheng/cnb/codex/AGENTS.md`：项目根提示词不修改，项目通用工具链细节不在此重复；
- `$action-authorization`、`$instruction-fidelity`、`$delegating-micro-stages` 和 `$project-doc-workflow`：继续分别负责授权、语义保真、委派与执行图、项目文档组织，不接管环境预检。

## 详细 preflight 契约

每次预检只展开当前命令适用的字段。高风险任务需要完整证明所有适用字段，低风险任务可以留下不影响当前执行的非关键字段，并说明升级条件。

### 命令身份与权威入口

- 保留用户提供的命令、token、空格、参数边界和路径字面量；不得未经证据改写成“等价”命令。
- 用户给出 alias 或 function 时，先只读展开其当前定义，确认真实入口、参数传播、环境激活和工作目录行为。
- 项目存在固化 script、recipe 或 wrapper 时，以该入口为权威；不得绕过它直调底层命令制造用户真实流程中不存在的环境。
- 固化入口不存在、不可用或与当前目标不一致时，阻断受影响动作并报告，不自行发明替代入口。

### cwd、root 与 manifest

- 明确命令实际运行的 cwd，以及该 cwd 所属 repository、worktree、workspace 或 package root。
- 核验命令依赖的 manifest、配置入口或 workspace 定义将从该 cwd 被正确解析。
- 区分逻辑路径、符号链接目标、worktree 路径和最终物理目标；路径身份影响入口判定时，不得仅因最终目标相同就假定表示等价。
- 面向用户提供命令时，同样必须核验该命令在用户预计 cwd 下可解析，而不是只证明助手当前 cwd 可运行。

### 执行用户与工具来源

- 核验命令应由助手当前身份、用户本人、特定服务用户或其他 owner 中的哪一方执行。
- 核验必要工具已存在，并确认实际解析到的 binary、runtime、package manager 或 wrapper 来源和适用版本。
- 工具缺失时必须在依赖它的工作开始前报告；不得在批处理后期才发现，也不得由助手自行安装程序、依赖、运行时或浏览器二进制。
- PATH 中存在同名工具不足以证明来源正确；项目专属 skill 指定 fnm、bundled runtime 或 wrapper 时，以该 owner 为准。

### 规则、配置与环境

- 确认当前路径实际适用的 `AGENTS.md` 链、项目 skill、固化 recipe 和其他权威说明。
- 确认命令读取的项目配置、用户配置、环境配置和必要环境变量来自预期来源。
- 只核验环境变量是否存在、来源是否正确及是否满足入口条件；不得在日志或文档中暴露 secret 值。
- 配置或规则冲突会改变命令语义时，必须在执行前解决 owner 与优先级，不能让命令结果替代冲突判断。

### ignore 与搜索可见性

- 区分“文件不存在”和“默认搜索受 ignore、hidden、sparse 或其他可见性规则过滤”。
- 使用搜索结果作为存在性、范围或排除证据前，必须核验相关 ignore 行为和搜索边界。
- 默认搜索没有返回目标，只能证明该搜索配置下不可见；在排除其他可见性原因前，不得提升为文件不存在或影响面为空。

### schema、skills、generated 与 sparse 输入

- 在生成、测试、格式化或验证开始前，列出该入口实际依赖的 schema、skills、模板、fixture、generated artifacts 和其他源树输入。
- 核验这些输入在当前 checkout 或 worktree 中存在、可读，并与权威入口期望的路径表示一致。
- sparse checkout 必须覆盖当前命令所需输入；只包含主源码目录不足以证明 schema、skill、fixture 或生成源已经就绪。
- 生成物存在不自动证明输入完整或来源权威；需要时区分生成输入、已生成输出和验证消费者。

### 目标命中与预期输出

- 在把命令结果当作验证证据前，证明命令会发现、收集并实际执行目标测试、文件、package、crate、schema 或生成目标。
- 预先明确成功时应产生的退出状态、关键结果和输出位置，以及失败时哪些信号表示尚未进入目标逻辑。
- “命令成功退出”不能替代目标命中；零测试、空搜索结果、错误 package 或写入错误输出目录均不得作为成功证据。
- 输出会成为后续输入时，必须确认其实际路径、格式和消费者，而不是只确认某处产生了同名文件。

## 失败与调度行为

- 任一关键预检项失败，只阻断依赖该环境输入的动作及其后继；不影响该输入的已授权工作继续进入 ready 状态。
- 同一批工作依赖多个相互独立的工具或输入时，应尽早并行完成对应预检，避免直到串行后段才暴露共同或局部缺口。
- 环境缺口影响共享前提、权威入口或证据可信度时，暂停所有依赖该前提的工作；不得把局部失败错误地扩大为全局停止，也不得让共享前提失败后的消费者继续。
- 失败报告遵循决策 A：只输出失败项、预期与实际、受阻范围、仍可继续范围和所需处理，不重复成功清单。
- 缺失工具需要用户安装时，报告组件和建议的用户操作，等待用户完成并明确通知；不得自行安装，也不得切换到未经 owner 认可的替代工具。
- 固化入口、cwd、执行用户或目标命中错误时，先修正环境判断或回到相应事实边界；不得把产生的错误当成产品根因。
- 证据命令预检失败时，该命令结果不得进入事实摘要、设计、计划、排除项或验证结论。
- 不得通过 fallback、跳过、放宽断言、缩小目标、静默兜底或修改基线把预检失败伪装成成功。

## 验收边界

### 规则结构验收

- 全局 `AGENTS.md` 只保留短门禁和 owner 路由，没有新增环境检查长清单；
- `$managing-work-stages` 主文件稳定路由到唯一 `execution-environment-preflight` reference；
- reference 覆盖触发边界、风险缩放、详细契约、成功静默、失败报告和调度行为；
- `$codex-gui-toolchain` 只保留前端差异，不复制通用算法；
- `codex-gui/AGENTS.md`、`codex-gui-worktree` 和项目根 `AGENTS.md` 保持不变；
- 没有新增第二个执行环境预检 skill。

### 合成行为验收

后续行为检查至少覆盖：

- 用户真实 alias 或固化入口会激活正确环境，而底层命令直接运行会进入错误环境；
- 同一命令在错误 cwd、root 或 manifest 下可以启动但不能命中真实目标；
- 当前用户与应执行命令的用户不同；
- 必要工具缺失，在依赖它的批处理开始前即被报告；
- 默认搜索因 ignore 规则漏掉目标文件，但文件实际存在；
- sparse worktree 缺少 schema、skill、fixture 或 generated input；
- 测试或生成命令成功退出，但没有收集目标或写入了错误位置；
- 低风险局部读取只做直接相关检查，不被迫执行完整高风险清单；
- 所有预检通过时不产生冗余用户消息，失败时报告足以定位受阻范围；
- 一个局部环境缺口只阻断依赖节点，无依赖工作仍可继续。

### 真实效果验收

提示词、skill、reference 修改和合成行为检查只能证明规则层已落地，不能单独证明关联问题已经消失。关联 issue 至多进入“📏 待复核”。

只有后续真实任务中不再出现以下情况，才能考虑将关联 issue 标记为“✅ 已修复”：

- 因绕过真实入口产生虚假错误；
- 命令因 cwd、manifest、执行用户或工具来源错误而重复失败；
- ignore 或 sparse 输入缺口被误判为文件、schema、skill 或生成物不存在；
- 必要工具直到批处理中后段才被发现缺失；
- 验证命令未命中目标却被当成有效证据。

## 明确排除范围

- 不修改 upstream base instructions、Default collaboration prompt 或其他产品内部提示词；
- 不修改 `/Users/jiangsheng/cnb/codex/codex-gui/AGENTS.md`、`/Users/jiangsheng/cnb/codex/AGENTS.md` 或 `$codex-gui-worktree`；
- 不新建独立的执行环境预检 skill；
- 不实现工具级 capability enforcement、自动环境修复、自动依赖安装或通用环境探测程序；
- 不要求每条只读命令都执行同一份固定清单；
- 不把预检成功变成新的用户确认点或逐项进度报告；
- 不借环境预检修改产品代码、协议、schema、生成器、测试或 GUI 行为；
- 不更新或关闭关联 issue；
- 不在本文写入 implementation plan、执行图、任务顺序、提交拓扑、精确实施命令或文件级改动步骤。

## 实施前门禁

本设计落盘后仍处于“待确认”。设计落盘不授权创建计划、修改提示词或 skill、执行验证、更新 issue、stage 或 commit。

只有用户明确确认本设计并另行要求编写计划后，才能进入独立计划阶段。设计确认和计划确认分别只满足对应阶段门禁，不能替代任何文件的写入授权。

`~/.codex/AGENTS.md` 与其实际目标 `/Users/jiangsheng/cnb/codex-config/AGENTS.md` 属于同一受保护全局文件。任何后续写入前，必须向用户展示针对该实际目标的精确拟写内容，并取得面向该受保护资源的独立明确确认；设计确认、计划确认、一般性的“继续”或其他文件授权均不能替代这一确认。

后续计划只能修改调查后仍存在职责缺口的载体，不得因为本文列出三层 owner 就假定三层全部需要改动。计划阶段必须重新核验两个仓库的当前 HEAD、目标文件、现有 references、验证入口和 Git 状态；若当前事实已变化，应先修正设计或计划前提，不得按本文快照盲目实施。
