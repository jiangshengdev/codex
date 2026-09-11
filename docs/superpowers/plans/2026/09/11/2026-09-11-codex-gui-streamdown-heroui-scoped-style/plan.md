# 富文本局部 HeroUI 样式实施计划

日期：2026-09-11

状态：新版设计与两项任务拆分已获用户接受；计划已落盘，待执行确认。本轮仅文档操作。

## 依据与任务

依据 [新版设计](../../../../../specs/2026/09/11/2026-09-11-codex-gui-streamdown-heroui-scoped-style-design.md)。唯一目标是保持 HeroUI 全局主题和工具类语义不变，仅在现有富文本及所属浮层范围应用 HeroUI 视觉语义，尽可能沿用 Streamdown 默认组件。

任务为 [01：局部样式适配](01-local-richtext-styles.md) 和 [02：真实 GUI 验收](02-real-gui-acceptance.md)。第二项消费第一项的真实实现，依赖不是人为编号顺序。无需预重构，也不拆成 CSS、组件和测试三个水平任务。

本版取代旧主题适配计划，旧文档保留历史。原实现 f1cf417a9 已由 bbf7c2936 回退；不能恢复原提交或沿用其验收结论替代本版实施。用户要求本地计划，因此使用项目日期目录与一任务一文件，不发布远程 issue。

## 范围与不变量

以下路径相对仓库 `/Users/jiangsheng/cnb/codex`：

- 产品写集合 P：`codex-gui/src/index.css`、`codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx`；必要时调整同目录 `MarkdownText.tsx`、`LiveMarkdownText.tsx` 的富文本作用域标记。
- 测试写集合 T：同目录 `__tests__` 的现有 Markdown、消息、思考测试，可新增一个局部样式与隔离 Browser 测试文件；复用既有 projection fixtures，不新增生产测试接口。
- 文档集合 D：上述新版设计、本目录 `plan.md` 与两份任务文件。执行记录 L 为本目录 `execution-log.md`，仅执行时创建。
- 不修改后端、协议、生成物、依赖、锁文件、外层 Card variant 或状态模型；不改旧设计、旧计划和旧日志。
- 当前存在范围外未跟踪文件 `pelican-bicycle.html`，保留且不读取、修改或暂存。执行前重查实际工作区，不假定只有本轮文档。

HeroUI 继续拥有主题及工具类映射。禁止新增或重定义全局颜色映射，禁止全局工具类引用富文本专属变量，禁止改变 HeroUI muted 等变量含义；即使设置回退或仅在子树重定义也不能绕过。不得再把“原变量没变”或“外部当前外观没变”当作隔离证据。

样式通过富文本作用域和 data-streamdown 元素标记消费 HeroUI surface、surface-secondary、foreground、muted、border。全屏表格使用 table-fullscreen 独立边界；无独立标记的菜单和控件由 table-wrapper 等已标记祖先定位。覆盖需包含默认、悬停和焦点状态。每项覆盖必须有实际富文本消费者，不能为修颜色重建全局或局部工具类兼容系统。

恢复默认 inlineCode；保留默认代码块、表格和工具栏，不改交互逻辑。保留 GitHub 浅深高亮、lineNumbers: false、white-space: pre-wrap、caret="block"、无 animated、静态/流式模式、用户和思考层次、助手数学、文件链接、HTML/图片及剪贴板边界。无等价证据不删除既有换行和滚动规则。

## 实施与验证方法

先核对当前默认组件的颜色消费点和层叠，形成简短元素/状态/作用域清单写入执行记录；以标记和局部结构定位，不默认所有控件都有独立标记。源码审查必须能逐项回答“这条覆盖为什么只属于富文本”。

通过现有 CommittedTranscriptSurface 入口和共享 fixtures 补充回归：表头背景、默认行内代码，以及外部 HeroUI 组件/颜色工具类在富文本挂载、卸载、全屏开关前后的不变性。目标颜色及边框在修改前应产生对应红灯，环境错误和零匹配不计。隔离断言在当前已回退基线上可能本就通过，不要求人为制造失败。

实现完成后验证正向呈现与反向隔离。源码和 CSS 构建规则审查独立检查全局主题定义；不只检查根元素变量，也不以硬编码整段 CSS 字符串代替行为测试。检查无标记菜单、hover、焦点以及 portal 的局部覆盖。

### 自动化入口与预检

实施前读取实际适用 AGENTS、codex-gui-toolchain、HeroUI、Streamdown 和 Vitest Browser skills；按执行环境预检核对 package scripts、配置、生成输入、fixtures、工具来源及真实测试收集。规划已核实当前 package scripts、CI 使用 pnpm run ci、Browser parallel 收集普通 Browser 文件且保留 Chromium/Firefox/WebKit。fnm 与 playwright-cli 已存在；执行前再核实版本及浏览器二进制，缺失时报告，不安装。

前端命令从 `codex-gui` 执行，使用 `/opt/homebrew/bin/fnm exec --using-file pnpm run`：

- `test:browser:parallel --run` 传下面明确文件及实际新增主题测试的完整相对路径，不插入额外 `--`，不使用 shell 通配收集。
- `type-check`、`lint`、`format:oxfmt` 为非 fix 质量检查。
- 格式修复只针对明确文件；当前 `format:oxfmt:fix` 固定包含 `.`，会扩大写入范围，因此使用同一已安装版本的 `pnpm exec oxfmt --write <明确文件>`，检查实际 diff 后用对应 `--check` 复验。其他自动修复同样先核实范围，不顺手修复无关文件。

受影响 Browser 文件均位于 `src/features/committedTranscriptSurface/__tests__/`：

- `CommittedTranscriptSurfaceMessages.browser.test.tsx`
- `ReasoningTranscriptSurface.browser.test.tsx`
- `MarkdownFileLinks.browser.test.tsx`
- `MarkdownCopyControlsAvailable.browser.test.tsx`
- `MarkdownCopyControlsUnavailable.browser.test.tsx`
- `MarkdownCopyControlsMissingClipboardWrite.browser.test.tsx`
- 实际新增的局部样式与隔离测试文件。

优先在新增文件完成红绿验证，最终运行全部受影响文件的完整用例。覆盖静态/流式、浅深主题、角色、数学、链接、剪贴板、窄屏滚动及默认工具栏，不依据旧测试计数声称通过。默认不运行全量 unit、Browser、E2E 或 ci；新证据或后续明确指令要求扩大时，说明原因并更新执行节点，不能凭惯例重复全套测试。

此前全局 lint、布局 Browser 和 E2E 存在失败，当前状态必须重新核实，不能直接认定已修复或由本版引入。范围内问题修复并重验；范围外问题仅记录证据，不扩大修改、删除覆盖或放宽检查。全局检查失败不能记为通过，也不能解除依赖成功的完成门禁。

### 真实运行时

Level 2 使用实施时提供或由允许入口取得的当前完整 GUI URL，保留原路由与 token，不猜测或复用历史地址。无头 playwright-cli 专用会话，先用 list --json 明确证明 headed=false，再确认真实状态和本次实现已加载。日志不保存 token。

检查浅深主题、宽屏/390px、用户/助手/完成思考、代码/表格/公式实际局部滚动、原文换行、默认工具栏、复制/下载/菜单/全屏、指针/键盘/焦点和真实流式转静态。同步检查外部 HeroUI 组件在富文本/浮层状态变化前后的语义与呈现。复制可用与不可用环境分别记录；内容没有产生溢出不算滚动验证，空闲静态内容不算流式验证。

没有真实内容时先检查已有会话状态，不合成 DOM 或使用 fixtures 冒充运行时。发送验收消息尚无授权，需要另行明确新增对话和额度消耗；该缺口只暂停相应场景。需要后端重建时仅提供用户执行命令。Level 3 不适用，不打开可见窗口。

## 执行上下文与调度契约

沿用当前 checkout 的 dev，不创建 branch/worktree。执行时先把 D 创建为独立文档提交，成功后才实施。主代理是 P、T、L 及 `/Users/jiangsheng/cnb/codex/.git/index` 的唯一写 owner；精确 allowlist 暂存，禁止远程、force、amend、squash 或强制暂存 ignored 产物。行为修改与纯顺序调整分开提交，后者没有必要时不做。

实现只有一个共享边界，由主代理完成；为避免重演同一盲点，稳定实现增加一个独立只读审查节点 R，检查设计职责与作用域，可与自动化并发。该审查者只读项目规则、设计、稳定 diff 和已核实的本地依赖源码，不编辑、不测试、不操作 Git 写、不再委派，返回证据给主代理。无并行实现、额外 worktree 或预配任务。

下述共享字段与节点表共同定义每个节点；执行图契约按 delegating-micro-stages 管理：

- `owner`：主代理，R 为独立只读审查者；`subdelegation`：禁止，主代理仅可派发 R 的最小能力。
- `executionContext`：上述 dev checkout，共享 index；R 读取明确固定的 diff 基线及稳定源码，审查期间禁止修改其输入。
- `authorizationGate`：当前仅 D 的文档落盘 active；所有执行节点 waiting。用户确认执行后由 action-authorization 按节点激活对应读写、验证及本地提交能力；业务写入仍 waiting，不继承旧轮实现授权。
- `readSet`：当前节点前置产物、适用规则、设计与计划，以及验证真实依赖的源码/fixtures；R 限定上述只读范围。`writeSet`、`stateEffects`、`commandScope` 见节点表，未列主动写不允许；已授权工具正常自动产物按能力信封契约处理。
- `resourceLocks`：P/T 源码按 canonical 路径编辑写锁、验证读锁；Browser runner 独占本 checkout 的测试运行资源；质量工具按其缓存和自动产物资源独占，冲突时串行。真实浏览器独占本任务会话；index 与 L 各有唯一写 owner。
- `estimatedCost`：文档与 Git 节点低，实现/自动化/审查中，真实验收中；`deferralEvidence`：无预设暂缓。
- `verification`：节点完成证据及上述权威入口；节点消费稳定快照，失败后旧证据按影响范围失效。
- `failureDomain`：该节点及实际消费失效产物的后继，不暂停无依赖验证或调查。
- `replanTriggers`：全局样式职责不满足、范围或产品语义变化、授权缺口、工具入口或依赖证据失真；范围内修正插入执行记录，不回写已确认计划。

## 描述式执行节点

`hardPredecessors / consumes` 给出依赖原因及稳定输入；`outcome / produces / completionEvidence` 给出唯一产出和判定条件。各操作单独成节点。

| nodeId | taskBoundary | operationKind | hardPredecessors / consumes | outcome / produces / completionEvidence | writeSet / stateEffects / commandScope |
| --- | --- | --- | --- | --- | --- |
| D-S | 文档提交 | stage | 无；已确认 D | 仅新版设计与三份计划文件的审查后 staged snapshot | index；精确 git add、cached diff 检查 |
| D-C | 文档提交 | commit | D-S：文档 snapshot | 独立文档 commit id | 本地 Git；git commit |
| I | 任务 1 | 调查 | D-C：文档与当前源码 | 元素/状态/作用域清单及测试目标 | 无主动写；只读源码、配置 |
| T | 任务 1 | 编辑 | I：真实边界和消费者 | 测试 diff，覆盖呈现和隔离契约 | T；普通源码编辑 |
| RED | 任务 1 | 验证 | T：稳定测试快照 | 已知表头/行内代码缺陷红灯，隔离基线结果 | 仅工具自动产物；过滤 Browser |
| E | 任务 1 | 编辑 | RED：有效目标证据 | 完整局部覆盖及默认组件恢复 | P/T；普通源码编辑，无重排 |
| F | 任务 1 | 格式化 | E：完整实现 | 格式合规稳定快照与固定审查基线 | P/T 明确文件；限定格式入口 |
| B | 任务 1 | 验证 | F：稳定实现 | 全部受影响 Browser 用例通过 | 工具自动产物；过滤 Browser |
| Q | 任务 1 | 验证 | F：稳定实现 | 类型、lint、格式检查结果全部通过 | 工具自动产物；非 fix 质量入口 |
| R | 任务 1 | 审查 | F：相同稳定实现及新版设计 | 独立职责/隔离审查，无未处理范围内缺陷 | 无写；只读 diff、规则、依赖源码 |
| S1 | 任务 1 | stage | B/Q/R：同一快照通过证据 | 精确 P/T staged snapshot | index；git add 明确文件、diff 检查 |
| C1 | 任务 1 | commit | S1：审查后 snapshot | 独立实现 commit id | 本地 Git；git commit |
| V2 | 任务 2 | 验证 | C1：待验收实现身份；当前 URL/真实状态 | 逐场景真实运行时证据 | 专用无头浏览器状态；playwright-cli，业务写另核授权 |
| L2 | 任务 2 | 编辑 | V2：全部可执行场景结果或明确限制 | L 记录证据、失败、未执行项及修正提交 | 仅 L；文档编辑 |
| S2 | 任务 2 | stage | L2：证据记录 | 仅 L 的 staged snapshot | index；精确 git add、diff 检查 |
| C2 | 任务 2 | commit | S2：记录 snapshot | 独立记录 commit id；不等同验收通过 | 本地 Git；git commit |
| FINAL | 无提交 | fan-in | C1/C2、全部适用验证与范围内修正 | 最终状态完整满足新版设计，工作区核验 | 无主动写；只读 Git/证据 |

当前没有执行 ready 节点，只有文档落盘授权。获得执行确认后初始 ready 为 D-S；D-C 后开始实现链。F 后 B、Q、R 消费相同稳定输入，可并发；S1 汇合三者。共享源码在此期间不编辑，修正时先收齐或安全结束消费者，再重建受影响快照。

依赖反向审计：I 等待文档身份，T 等待真实测试目标，E 等待回归证据，验证/审查等待稳定实现，Git 等待对应审查后的 snapshot，真实验收等待代码身份。没有按 agent 复用或编号额外串行。关键路径为文档提交、红绿实现、较慢验证/审查分支、代码提交、真实验收、记录提交与完成汇合。

## 失败、修正与终止

实现或真实验收发现范围内问题时，主代理在 L 中声明诊断、编辑、格式化、验证、审查及 Git 节点的实际依赖、能力信封、输入输出和失败域。已有提交的修正创建新的独立提交，不 amend；重新验证受影响自动化和真实场景。不得为中间提交增加双路径或临时兼容层。

缺授权、内容、工具或范围外质量失败时，继续所有独立且获授权的有效路径，保存结果；不能把已知失败写成成功，不能以历史通过解除当前门禁。局部受阻只影响对应后继，记录提交可保存限制，但 FINAL 仍不通过。需要改变范围或检查要求时交回用户，不自行绕过。

最终以全部任务和修正合并后的状态判断，不能要求每个中间提交独立满足整个计划。全部适用验证通过、真实场景齐备、无未处理范围内缺陷和临时路径后才声明完成。执行日志记录实际并行、关键路径及未启动 ready 节点原因；旧版结果只作历史，不计本版验证。
