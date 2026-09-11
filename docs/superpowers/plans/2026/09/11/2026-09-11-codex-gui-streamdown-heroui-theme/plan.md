# Streamdown HeroUI 主题适配实施计划

日期：2026-09-11

状态：任务拆分已确认；计划已落盘，待执行确认。本轮仅写入文档。

## 依据与交付

依据 [设计文档](../../../../../specs/2026/09/11/2026-09-11-codex-gui-streamdown-heroui-theme-design.md)。唯一目标是所有现有 Streamdown 内容适配 HeroUI 风格并尽可能使用默认组件。保留无行号、段落原文换行、现有块状光标；不启用渐入动画，不改变数学、链接、安全、剪贴板或角色语义。

按已确认拆分交付两个本地任务文件：[任务 1](01-unify-markdown-theme.md)、[任务 2](02-real-gui-acceptance.md)。使用项目既有日期目录代替通用 skill 的 `.scratch` 路径；不发布远程 issue。任务文件描述用户结果，本文件承载精确实现与执行边界。

## 修改范围

仓库根目录为 `/Users/jiangsheng/cnb/codex`。路径均相对该根目录。

- 产品：`codex-gui/src/index.css`、`codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx`，必要时调整同目录 `MarkdownText.tsx` 和 `LiveMarkdownText.tsx` 的主题作用域标记。
- 测试：同目录 `__tests__` 下现有消息、思考、Markdown 链接及复制控件测试；可增加一个主题呈现 Browser 测试文件，复用既有生产渲染入口与 fixtures。
- 工作文档：本设计、本目录计划和任务文件；执行期在本目录创建 `execution-log.md`，记录节点状态、证据与提交身份，不改写已确认计划正文。
- 不修改 Rust、协议、生成物、依赖和锁文件；不新增插件，不重构状态模型，不改变外层 HeroUI Card 的现有 variant。

## 实现策略

先在共享 Markdown 边界建立主题语义适配，区分 muted 的前景与背景用途，补齐 sidebar、muted-foreground 等实际消费的 token。使用 HeroUI surface、surface-secondary、foreground、muted、border 表达层次；检查浅深主题和用户/助手/思考的不同外层背景。作用域不得泄漏到其他 HeroUI 组件，避免嵌套变量覆盖导致辅助文字也采用背景色。

随后删除自定义 inlineCode 替换，恢复 Streamdown 默认结构与间距。代码块、表格、工具栏继续由默认组件拥有。代码行块级显示、公式滚动和段落换行覆盖只有在具备等价行为证据时才可移除；本任务不追求删除所有 CSS。

不需要预重构或临时兼容路径。代码行为修改不得混入纯顺序调整；已有提交的修正必须形成新提交，禁止 amend、squash 或用兼容层保持中间提交完整。

## 验证入口

所有前端命令从 `codex-gui` 执行。实施前重读适用 AGENTS、codex-gui-toolchain、Streamdown、HeroUI 和 Vitest Browser skills；核实 fnm 环境及 Node、pnpm 来源。规划阶段已确认 fnm 存在、pnpm 可用、Browser 配置以 TypeScript 源文件解析 `.js` 导入，默认 headless，三个浏览器实例均保留。尚未启动测试，浏览器二进制与运行时在执行时检查；缺失时不安装。

固定命令前缀为 `/opt/homebrew/bin/fnm exec --using-file pnpm run`：

- `test:browser:parallel --run` 后传明确测试文件列表。初始范围为 `CommittedTranscriptSurfaceMessages.browser.test.tsx`、`ReasoningTranscriptSurface.browser.test.tsx`、`MarkdownFileLinks.browser.test.tsx` 及三个 `MarkdownCopyControls*.browser.test.tsx`，均位于 `src/features/committedTranscriptSurface/__tests__/`；加入实际新增的主题测试文件。传完整路径，不依赖 shell 通配收集，不插入额外 `--`。
- `type-check`、`lint`、`format:oxfmt` 用于任务提交前的非修复检查；仅在必要时通过现有格式化入口对明确文件执行格式修复，再审查 diff 和运行非 fix 检查。禁止借此修复无关文件。
- 不运行全量 `ci` 或全部 Browser/E2E 测试。未修改解析逻辑时不扩大到全部 unit；新证据需要时只增加对应测试文件。

Level 1 覆盖静态和流式内容、浅深主题、不同角色外层、默认行内代码、无行号、段落换行、数学/文件链接/复制行为、窄屏容纳及键盘焦点。先补充能捕获本次已知主题问题的用户可见回归断言，记录修复前失败，再修复并验证转绿。避免锁死 class 名或官网具体色值。

Level 2 使用执行时有效的完整 GUI URL，通过无头 playwright-cli 读取真实页面并验证。不得将当前对话里的旧 URL 硬编码进计划或日志；日志不记录 token。只读历史场景可先执行；若缺少真实流式内容，先核实会话是否已有相应状态，发送新消息或改变业务状态须有对应授权，不能以静态页代替流式证据。若界面需要用户本人刷新前端产物或重启后端，明确提供需要用户执行的动作，不代跑后端构建。

Level 2 检查宽屏及 390px 窄屏、浅色及深色、表格和代码局部滚动、公式基线和容纳、复制/下载/表格全屏等现有可用控件以及流式转静态后的外观。分别记录可用和不可用剪贴板环境，真实环境未覆盖部分不得冒充通过。Level 3 不适用，不打开可见桌面窗口。

## 执行上下文与授权

采用当前 checkout 的 `dev` 分支，不创建 worktree 或分支。实施前重新核对分支与工作区；存在无关改动时保留，精确隔离提交。Git index 为 `/Users/jiangsheng/cnb/codex/.git/index`，主代理是唯一写 owner。任何 Git 远程或 force 操作均不在计划内；不强制暂存忽略文件。

本次任务链有一个共享主题实现边界，第二项消费其运行结果，不通过创建子代理复制同一读写链。主代理负责实施、审查、验证及提交；不声称这是独立审查。无额外 worktree 预配屏障。

下列节点共享字段为权威默认值，节点表补充差异：

- `owner`：主代理；`subdelegation`：禁止。
- `executionContext`：上述 checkout、dev、共享 index。
- `authorizationGate`：当前仅文档创建 active；全部执行节点 waiting，待用户明确开始执行。届时按 action-authorization 建立逐节点最小能力信封，不以计划文字自行产生授权。
- `readSet`：设计、计划、适用规则和当前节点输入；`writeSet`：严格限于节点声明。
- `resourceLocks`：所有源码路径按实际 canonical identity 加读/写锁；编辑和格式化独占对应写集合；测试期间源码只读，独占当前仓库的 Browser runner；stage/commit 独占上述 index；Level 2 独占本任务专用无头会话；执行日志独占写。
- `estimatedCost`：文档 Git 与汇合节点低，实现和自动化验证中，真实验收中。
- `deferralEvidence`：无；同仓库不构成额外依赖。
- `failureDomain`：失败节点及消费其失效产物的后继；不使无关证据失效。
- `replanTriggers`：需要改变产品结果、写入范围、安全或外部副作用，或执行入口被当前证据否定时重判；计划内失败继续定位、修正和验证。
- `verification`：节点的 completionEvidence 及上述入口；程序自动产生的测试缓存/日志属运行副作用，不因此授权主动扩大编辑范围。

## 描述式执行 DAG

每行是一个单一动作节点。`hardPredecessors` 同时说明所消费的稳定产物；`outcome / produces / completionEvidence` 合并表达产出与解锁要求。

| nodeId | taskBoundary | operationKind | hardPredecessors / consumes | outcome / produces / completionEvidence | writeSet / stateEffects / commandScope |
| --- | --- | --- | --- | --- | --- |
| D-S | 文档提交 | stage | 无；当前设计和三份计划文件 | 精确文档 staged snapshot，检查不含产品代码 | 仅 index；git add 精确四文件，git diff --cached 与 --check |
| D-C | 文档提交 | commit | D-S：已审查文档 snapshot | 独立文档 commit id | 仅本地 Git；git commit，不 amend |
| T1-R | 任务 1 | 编辑 | D-C：文档 commit | 能捕获主题错误的回归断言，测试 diff 可审阅 | 声明范围内测试；普通源码 apply_patch |
| T1-RED | 任务 1 | 验证 | T1-R：回归测试快照 | 目标断言因已知主题问题失败；环境错误不算红灯完成 | 仅测试自动产物；过滤 Browser 入口 |
| T1-E | 任务 1 | 编辑 | T1-RED：失败证据 | 集中主题适配、默认行内代码及保留行为的源码快照 | 声明产品范围；apply_patch，无重排或生成编辑 |
| T1-F | 任务 1 | 格式化 | T1-E：完整编辑快照 | 格式合规且 diff 未越界的稳定源码 | 仅明确修改文件；项目格式工具，必要时执行 |
| T1-B | 任务 1 | 验证 | T1-F：稳定源码 | 受影响 Browser 文件完整通过，记录实际三浏览器收集数 | 仅测试自动产物；过滤 Browser 入口 |
| T1-Q | 任务 1 | 验证 | T1-F：稳定源码 | 类型、lint、格式检查通过 | 仅工具自动产物；上述非 fix 入口 |
| T1-S | 任务 1 | stage | T1-B、T1-Q：同快照通过证据 | 精确产品和测试 staged snapshot，差异检查通过 | 仅 index；git add 明确文件、git diff --cached |
| T1-C | 任务 1 | commit | T1-S：已审查 snapshot | 独立代码 commit id | 本地 Git；git commit |
| T2-V | 任务 2 | 验证 | T1-C：待验收代码身份 | 修改后真实 GUI 的场景证据及必要检查结果 | 专用无头浏览器运行状态；playwright-cli，业务写入另核授权 |
| T2-L | 任务 2 | 编辑 | T2-V：真实场景结果 | execution-log 含逐场景结果、限制和各 commit id | 仅本主题执行日志；apply_patch |
| T2-S | 任务 2 | stage | T2-L：完整执行证据 | 仅执行记录的 staged snapshot | index；git add 精确日志与差异审查 |
| T2-C | 任务 2 | commit | T2-S：记录 snapshot | 独立验收记录 commit id | 本地 Git；git commit |
| FINAL | 无提交 | fan-in | T1-C、T2-C 及所有计划内修正验证 | 最终合并状态满足设计；工作区核验和自包含报告 | 无主动写；只读 Git 与证据核对 |

文档当前尚未提交。用户确认执行后，初始 ready set 为 D-S；D-C 是所有实施节点的文档提交屏障。T1-F 后 T1-B 与 T1-Q 可并发执行，前者和后者消费同一稳定源码，T1-S 汇合二者。关键路径为文档提交、回归红灯、实现、较慢的验证分支、代码提交、真实验收、记录提交、最终汇合。

任务 2 依赖任务 1 是已确认的真实产物边：没有主题实现就无法验收修改后 GUI。其他串行边均消费前置节点的 snapshot、证据或 commit，不按任务编号引入额外依赖。

## 修正与完成边界

任务 2 发现本设计范围内问题时，在执行记录中插入独立编辑、格式化、验证、stage、commit 节点，再重跑受影响真实场景；不得 amend 任务 1。所有修正提交和其验证结果进入 FINAL。已有证据不因无关修改全部重跑，受影响证据必须失效并补验。

只有全部任务、计划内修正和适用最终验证完成才声明完成。必要工具、真实运行时或业务动作授权缺失，只暂停相关节点，其他无依赖检查继续；报告未执行场景。中间提交不必单独满足整个计划，但最终必须只有一条权威主题适配路径，不能保留临时双路径。

计划完成后不追加新一轮工作；后续问题需用户另行发起任务。
