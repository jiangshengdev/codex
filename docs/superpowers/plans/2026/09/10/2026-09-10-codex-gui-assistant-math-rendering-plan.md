# Codex GUI 助手回答数学公式显示实施计划

> 当前修订：2026-09-10，长公式局部横向滚动设计已确认；下方修订实施计划待确认。
> 原计划及其当时状态保留为历史。修订仅替代公式溢出约束，不重开已完成的语法任务。

## 修订实施计划：长公式局部横向滚动

### 目标、依据与范围

落实[设计的当前有效补充](../../../../specs/2026/09/10/2026-09-10-codex-gui-assistant-math-rendering-design.md)：
长公式仅在公式区域横向滚动，保持正常字号和数学排版，不撑宽页面。
用户已选择 A 并确认设计与计划落盘；本段形成可审阅实施方案，尚未授权本修订的源码修改或提交。

当前 `MarkdownText.tsx` 与 `LiveMarkdownText.tsx` 通过 `enableMath` 区分助手数学消费者，
`index.css` 已导入 Streamdown 与 KaTeX 样式。真实历史曾在 390px 视口产生 419px 页面内容宽度。
因此修订在助手数学展示边界约束公式宽度与滚动，不改消息内容、语法 tokenizer 或 transcript 分块。

沿用原计划 MATH、TEST、DOC 集合；STYLE 在 `codex-gui/src/index.css` 中扩展为允许助手数学专属
宽度与溢出样式。只修改必要的共享数学配置、静态/流式接入及对应 Browser 测试。
滚动 owner 必须落在公式区域，不得给整条消息或页面设置横向滚动来替代；不得以隐藏内容通过宽度检查。
短公式、行内/块级语义、MathML、复制、非助手消费者与原流式行为继续受保护。
不改 Rust、后端、依赖、锁文件、协议或翻译；不创建 scratch/worktree，不操作远程。

### 执行节点与提交边界

以下节点继承原计划公共字段、资源锁、失败域、命令入口与唯一 Git owner 约束。
本修订的 `authorizationGate` 为 pending；用户确认本实施计划后才进入执行。
主代理负责有界展示修正与验证；沿用已确认的 Standards、Spec 独立只读审查，审查者不得编辑、测试或 Git 写。
无额外产品任务；这是已提交数学展示能力的新独立修订，禁止 amend 或混入纯代码重排。

| nodeId | taskBoundary / operationKind | 硬前置与理由 | 消费→产出及完成证据 | writeSet / stateEffects / commandScope |
| --- | --- | --- | --- | --- |
| O.doc.stage | DOC / stage | 本修订实施确认、文档 diff 检查通过 | 修订文档→精确 staged diff | DOC/index；限定 git add |
| O.doc.commit | DOC / commit | O.doc.stage：暂存核查通过 | staged docs→实施前独立文档提交 | index/提交；git commit |
| O.edit | 溢出修订 / edit | O.doc.commit：文档屏障 | 当前数学展示与窄屏失败证据→局部滚动源码及回归 | 必要 MATH、STYLE、TEST；普通源码编辑 |
| O.format | 溢出修订 / format | O.edit：变更文件确定 | 源码→限定格式化 diff | 同 O.edit；项目格式化 owner |
| O.verify | 溢出修订 / verify | O.format：稳定源码 | 源码→三浏览器定向回归与静态检查证据 | runner 产物；原计划定向及静态入口 |
| O.stage | 溢出修订 / stage | O.verify：检查通过 | 精确任务 diff→staged diff | index；限定 git add、staged diff 检查 |
| O.commit | 溢出修订 / commit | O.stage：暂存核查通过 | staged 源码→新独立实现提交 | index/提交；git commit |
| O.review | 无提交 / review | O.commit：稳定实现 | 修订提交与设计→Standards、Spec 独立结论 | 无；只读审查 |
| O.level1 | 无提交 / verify | O.commit：稳定实现 | 组合源码→CI、完整 Browser 证据 | runner 产物；原计划最终 Level 1 入口 |
| O.level2 | 无提交 / verify | O.commit、当前 runtime 与有效会话授权 | 相同服务源码→真实局部滚动与页面宽度证据 | 专用无头浏览器状态；原 Level 2 入口 |
| O.join | 无提交 / fan-in | O.review、O.level1、O.level2：结果或明确缺口齐备 | 全部证据→修订及整体完成判断 | 无；只读汇总，不将缺口视为通过 |
| O.record | DOC / edit | O.join：结论已形成 | 验收结果→现有执行记录增量更新 | DOC；文档编辑，保留历史 |
| O.record.stage | DOC / stage | O.record：文档检查通过 | 执行记录→精确 staged diff | DOC/index；限定 git add |
| O.record.commit | DOC / commit | O.record.stage：暂存核查通过 | staged 记录→独立文档提交 | index/提交；git commit |

初始 ready set 在实施确认后为 O.doc.stage。O.commit 后的独立审查、Level 1、Level 2 可在资源无冲突时
并行；同一测试 runner 内串行执行入口。关键路径为文档提交→展示修正与定向验证→实现提交→
最晚就绪的审查/验收→记录提交。缺少真实 runtime 或专用会话授权只阻塞对应真实场景。

### 验证与完成要求

- 从实际消息展示入口构造合法的最小四语法样例，覆盖静态、流式、结束切换与历史重附，
  同时包含短公式、超宽行内/块级公式和普通正文。复用现有 projection builder，不复制私人全文。
- 在窄屏测量局部容器 `clientWidth`、`scrollWidth` 和滚动位置；交互后可到达公式末端。
  检查页面/消息宽度及正文位置，证明只有公式区域横向滚动；不能仅断言存在 CSS class。
- 对照桌面与窄屏的正常字号、数学语义及公式完整内容；普通宽度公式不出现无必要的滚动，
  非助手消费者与现有 Markdown 功能不受影响。
- 执行原计划定向三浏览器入口、适用静态检查，最终执行 `ci` 与完整 `test:browser`。
  命令及 fnm 环境沿用下方权威入口，实施前重新预检，不安装缺失工具或依赖。
- Level 2 在当前完整 URL、明确无头状态和服务源码一致的前提下，重验真实历史的 390px 窄屏、
  桌面、局部滚动末端和页面宽度；有授权的真实增量输出中验证流式与结束状态。
  向模型发送样例仍须专用验证会话，不能将本次设计确认当成修改既有任务的授权。
- 此前完整 Browser 失败及四语法真实流式缺口保持开放，分别记录新证据；不改基线、放宽断言或宣称已修复。
  新增滚动要求未达到时继续本修订内修正；完整计划仍以所有适用验证和审查闭环为完成标准。

## 原始实施计划记录

> 日期：2026-09-10
> 状态：任务拆分与依赖已确认，计划已落盘；尚未执行
> 确认依据：用户在两个任务、依赖及提交/验收边界展示后回复「确认」
> 本轮授权：计划与票据落盘；不在本轮运行实现、测试或 Git 提交

## 目标与文档

实现已接受的[设计](../../../../specs/2026/09/10/2026-09-10-codex-gui-assistant-math-rendering-design.md)：
只对助手回答支持行内和块级公式，覆盖实时输出及历史；支持 `\(…\)`、`\[…\]`、`$…$` 和
`$$…$$`，展示行为沿用 Streamdown 默认配置，单美元解析明确开启但自动补齐保持关闭。

本计划是执行调度与精确资源范围的权威文件；以下票据描述可独立验证的用户结果：

- [任务 01：数学渲染接入](2026-09-10-codex-gui-assistant-math-rendering-ticket-01.md)。
- [任务 02：反斜杠公式支持](2026-09-10-codex-gui-assistant-math-rendering-ticket-02.md)，阻塞于任务 01。

按用户要求，票据与计划共用项目现有文档目录，不创建 `.scratch`；此要求覆盖 `to-tickets` 的默认本地票据路径。

不发布外部 tracker，不新增第三个产品任务。最终审查、验证及必要修正属于这两个任务的完成闭环。

## 已核对的执行基础

- 当前项目根为 `/Users/jiangsheng/cnb/codex`，当前分支为 `dev`。实施前重新核对分支和工作区，不切换
  或覆盖用户后来产生的工作。本计划不创建 worktree，不增加项目外写入目标。
- 当前消息入口按 `plainText`、`staticMarkdown`、`streamingMarkdown` 分派；已完成思考内容也使用
  静态 Markdown，因此不能无条件给共享组件的所有消费者启用公式。
- 数学插件已声明；Streamdown 可读源码位于 `/Users/jiangsheng/GitHub/streamdown`，只读参考。
  不安装、升级依赖，也不改该参考仓库。实施预检核对所需模块与样式解析是否可用。
- 项目 `package.json` 提供 `ci`、`test:browser:parallel`、`test:browser` 等入口；GitHub GUI workflow
  分别消费 `ci` 与完整 Browser 检查。Browser shared config 明确无头，parallel config 收集普通
  `src/**/*.browser.test.tsx` 并使用 Chromium、Firefox、WebKit。
- `ci` 仅运行 Browser smoke，不能代替新增消息组件的三浏览器定向回归。

## 修改边界

以下路径均相对项目根，是允许实现的责任范围，不表示必须修改每个文件：

| 集合 | 范围 |
| --- | --- |
| DOC | 本设计、本计划、两张票据，以及本计划同日期目录内的执行记录与最终验证报告 |
| MATH | `codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx`、`MarkdownText.tsx`、`LiveMarkdownText.tsx`、`TranscriptEntryRenderer.tsx`；必要的同目录数学配置模块 |
| STYLE | `codex-gui/src/index.css` 中数学样式导入与构建扫描 |
| SYNTAX | `codex-gui/src/features/committedTranscriptSurface/` 内新增的反斜杠公式语法模块 |
| TEST | 同目录 `__tests__/` 下公式 Browser 测试及必要的语法单元测试；确有需要时扩展 `codex-gui/src/features/projection/__tests__/` 的共享合法 fixture/builder |

任务 01 写 MATH、STYLE、TEST；任务 02 写 SYNTAX、必要 MATH 接入和 TEST；各自更新 DOC 的执行状态。
不修改协议、后端、TUI、消息持久化、生成 schema、锁文件、翻译目录或参考源码；不把工具或思考内容纳入功能。
新增源码位置由责任确定，不以预计文件数限制实现；发生范围外需求时按授权边界处理。

## 两个完整功能任务

### 任务 01：美元公式的消息展示链路

在助手消息入口选择数学能力，接入插件和样式，使静态及流式消息都支持美元公式；共用配置并保持
其他消费者现状。保持现有 HeroUI 消息容器，不新增控件、pending 状态、错误面板或自定义布局策略。

在同一个任务内验证美元语法、实际数学语义与样式、默认补齐、静态/流式切换、非法表达式、非助手
隔离，以及既有 Markdown 功能。完成后形成独立提交，提供可用于任务 02 的已验证数学展示链路。

### 任务 02：反斜杠语法的消息展示链路

复用任务 01 的能力入口，在普通 Markdown 丢失转义之前识别成对反斜杠公式，保留行内与块级语义。
`\[…\]` 必须保持块级，不能简单替换成正文内可能按行内解析的双美元表达。
优先使用解析器扩展边界；不以全局文本替换模拟 Markdown 解析，不再造数学引擎或持久化转换结果。
不额外建立反斜杠自动补齐规则；默认流式机制仍由 Streamdown 拥有。

在同一个任务内验证代码、转义、链接隔离，分隔符跨增量到达、闭合与模式切换，以及四种语法混排。
采用去隐私的最小公式 fixture；形成第二个独立提交。最终结果只有一条数学渲染路径。

## 描述式执行 DAG

本节使用节点数据而非图形。节点字段由公共默认值、各节点记录及任务范围共同组成，执行时依照
`delegating-micro-stages` 的执行图契约展开；动作能力信封由 `action-authorization` 在执行前建立，
这里不把文档落盘授权解释为执行授权。

### 公共节点字段

- `estimatedCost`：每个编辑节点中，定向验证中，stage/commit 小，最终验证较大；不作为停止阈值。
- `deferralEvidence`：空；当前没有以偏好或惯例推迟 ready 节点。
- `subdelegation`：false；需要委派时由协调者下发新只读审查或验证信封。
- `executionContext`：上述 checkout 的当前分支和其 Git index；实施开始时记录实际身份。
- `owner`：主执行者拥有编辑、格式化、验证和唯一 Git index 写权限；独立审查者仅只读，不得审查自己修改的产物。
- `readSet`：设计、计划、节点消费集合、适用 AGENTS/skills、现有消息消费者、验证入口；依赖参考源码仅只读。
- `resourceLocks`：编辑/格式化独占对应文件；stage/commit 独占当前 checkout 实际 Git index；测试独占
  `codex-gui` 同一 runner 的缓存/产物；真实浏览器验收独占为本任务创建的无头会话。审查只读稳定源码。
- `authorizationGate`：当前执行节点 pending；获得实施授权并按中央 skill 收紧动作、目标与副作用后方可 active。
- `verification`：消费下节精确验证入口；成功必须实际收集目标并退出成功，不接受零测试。
- `failureDomain`：本节点产物及其传递后继；与失败无关的审查或验证分支继续。
- `replanTriggers`：权限、目标身份、工具或输入缺失，实际接口/消费者变化，或者需要改变产品范围；
  范围内失败进入诊断和修正，不以首次失败、耗时或任务编号终止。

### 节点记录

表内「消费→产出」对应 `consumes`/`produces`；依赖列同时给出 `hardPredecessors` 与理由；完成列为
`completionEvidence`/`outcome`。每个节点只有一个动作族。

| nodeId | taskBoundary / operationKind | 硬前置与稳定依赖 | 消费→产出与完成证据 | writeSet / stateEffects / commandScope |
| --- | --- | --- | --- | --- |
| D.stage | DOC / stage | 执行授权；文档已存在且通过检查 | 已接受文档→精确 staged diff | DOC；index；仅限定路径 git add、staged diff |
| D.commit | DOC / commit | D.stage：已审查暂存内容 | staged docs→独立文档 commit id | index/提交；git commit，不 amend |
| T1.edit | 01 / edit | D.commit：实施前文档提交屏障 | 设计与当前消息链→美元公式及回归源码 | MATH、STYLE、TEST；普通源码 patch |
| T1.format | 01 / format | T1.edit：具体变更文件 | 变更源码→限定格式化后的 diff | 同 T1.edit；项目格式化 owner |
| T1.verify | 01 / verify | T1.format：稳定文件 | 源码→定向 Browser 与静态检查证据 | runner 产物；下节定向与静态入口 |
| T1.stage | 01 / stage | T1.verify：检查通过 | 精确任务 diff→staged diff | index；git add 限定任务文件 |
| T1.commit | 01 / commit | T1.stage：暂存核查通过 | staged 任务 01→commit id | index/提交；git commit |
| T2.edit | 02 / edit | T1.commit：可复用数学链路与稳定提交 | 任务 01→反斜杠语法及回归源码 | SYNTAX、必要 MATH、TEST；普通源码 patch |
| T2.format | 02 / format | T2.edit：具体变更文件 | 变更源码→限定格式化后的 diff | 同 T2.edit；项目格式化 owner |
| T2.verify | 02 / verify | T2.format：稳定文件 | 源码→四语法定向验证证据 | runner 产物；下节入口 |
| T2.stage | 02 / stage | T2.verify：检查通过 | 精确任务 diff→staged diff | index；git add 限定任务文件 |
| T2.commit | 02 / commit | T2.stage：暂存核查通过 | staged 任务 02→commit id | index/提交；git commit |
| F.review | 无提交 / review | T2.commit：最终组合源码 | 两任务提交与设计→独立范围/正确性审查 | 无；只读源码/diff |
| F.level1 | 无提交 / verify | T2.commit：最终组合源码 | 两任务提交→完整 CI 与 Browser 证据 | runner 产物；下节完整入口 |
| F.level2 | 无提交 / verify | T2.commit：最终组合源码，且当前真实 runtime 可用 | 当前完整 GUI URL 与状态→真实历史/流式验收证据 | 无头会话运行状态；已授权浏览器入口 |
| F.join | 无提交 / fan-in | F.review、F.level1、F.level2：同一最终源码的证据 | 审查与验收→完成判断 | 无；只读证据汇总 |
| R.edit | DOC / edit | F.join：完成判断形成 | 最终证据→报告、票据和执行记录状态 | DOC；文档 patch，不改已确认计划正文 |
| R.stage | DOC / stage | R.edit：报告校验通过 | 文档 diff→staged diff | DOC/index；限定 git add |
| R.commit | DOC / commit | R.stage：暂存核查通过 | staged docs→最终记录 commit id | index/提交；git commit |

执行开始后的初始 ready set 为 D.stage；首个业务节点为 T1.edit。任务 02 依赖任务 01 的数学能力、
样式与同一消息入口，不是因编号串行。两个任务共享写集合，无需为这条依赖链创建 worktree。
没有独立 prefactor 需求，不新增临时兼容、双路径或纯重排任务。

fan-out 为 T2.commit 之后的 F.review、F.level1、F.level2；三者共享稳定源码，分别读取/运行，
可在真实资源无冲突时并行。F.level1 采用一位 runner owner 串行运行其两个命令，避免同一缓存竞争；
不要求 F.level2 等待 Level 1 成功，但必须绑定相同源码与所对应的运行版本。fan-in 为 F.join。
关键路径是文档提交、两个功能任务、最晚完成的最终验证分支及报告提交。

## 验证入口与执行预检

所有以下前端命令的 cwd 均为 `/Users/jiangsheng/cnb/codex/codex-gui`。当前只完成入口与配置只读核验，
没有运行测试。执行前按 toolchain skill 重新检查 fnm、Node/pnpm 身份、模块/字体、生成输入与浏览器
二进制是否存在；缺失时报告用户自行准备，禁止安装或绕过检查。

定向 Browser 验证：

```sh
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel src/features/committedTranscriptSurface/__tests__
```

目标为该目录的现有与新增 Browser 测试，三种浏览器都应收集；模式由 shared config 保证无头。
任务需要的源码检查使用以下现有入口；若新增独立语法单元测试，使用 `test:unit` 传入其具体测试路径。

```sh
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

格式修复优先依照现有 Oxfmt owner 对明确变更文件执行，随后运行非 fix 检查；不得为限定文件绕过
仓库固化入口，也不得格式化无关文件。具体文件集在节点编辑完成后由实际 diff 确定。

最终 Level 1：

```sh
/opt/homebrew/bin/fnm exec --using-file pnpm run ci
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser
```

这些入口的成功结果不代替 Level 2。若执行中包含生成物漂移，先确定 owner 和语义范围，不盲目提交。
本计划没有主动 schema、锁文件、翻译或快照更新节点；不得为通过检查新增豁免、删除覆盖或放宽断言。
不运行 Rust 构建、Rust 全量验证或项目根格式化；本改动仅涉及前端与文档。

### Level 2 场景与边界

从当前 runtime 的正规入口获得完整 GUI URL，不保存 token 到文档，不复用历史地址。只使用无头浏览器。
四种语法分别需要历史、实时及结束后的证据，美元阶段结果不能代替反斜杠阶段。在实际历史回答中
核验反斜杠公式与样式；在可用的真实助手增量输出中核验公式到达、闭合、结束后的
显示，并分别检查桌面/窄屏、长公式与非法表达式的默认表现。使用最小公开数学样例，不复制私人全文。
会向模型发送新消息时，应在实施授权覆盖的专用验证会话中进行，不修改用户既有任务。

没有完整 URL、真实 runtime、已授权验证会话或真实流式证据时，记录缺口并继续其他无依赖节点；
不得用测试 fixture、截图或静态历史结果宣称流式验收通过。Level 3 不适用，不打开可见窗口。

## 提交、修正与完成条件

- D.commit 必须独立包含设计、计划与两个票据，成功后才开始实施。阶段确认不要求本轮立即提交。
- T1.commit 与 T2.commit 分别只提交本任务已验证文件；主执行者是唯一 index 写 owner。
- 禁止远程 Git、强制操作、amend、squash、强制暂存 ignore 文件以及行为改动混入纯代码重排。
- 验证或独立审查发现范围内缺陷时，在执行记录中动态插入诊断、编辑、格式化、验证、stage、commit
  节点，建立最小能力信封；不得回写已确认计划来伪造原始任务。已有提交的修正形成新独立提交。
- 修正使哪些验证证据失效，就重新执行哪些分支；无新变更、失败或未解疑点时不重复已通过检查。
- 最终状态必须同时满足两个票据、设计约束、独立审查闭环、Level 1 与适用 Level 2，以及完整记录。
  单个中间提交不要求覆盖全部设计，最终任务是否完成按组合状态判断。
- 真正外部阻塞只暂停相关后继；一旦全部任务与计划内修正、最终验证完成，本轮执行结束，不自行追加新一轮工作。
