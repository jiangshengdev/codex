# Streamdown 操作控件采用 HeroUI 实施计划

日期：2026-09-12

状态：用户已确认两个无相互阻塞的任务并授权计划落盘；等待确认开始实现。本轮不修改产品代码，不创建工作树，不运行产品测试，不提交。

设计依据：[设计规格](../../../../../specs/2026/09/12/2026-09-12-streamdown-heroui-controls-design.md)。

## 目标与任务边界

1. [代码块仅保留 HeroUI 复制](issues/01-code-copy-controls.md)，Blocked by：无。
2. [表格采用 HeroUI 复制菜单与全屏](issues/02-table-copy-and-fullscreen.md)，Blocked by：无。

两项都是包含生产接线、用户行为与验证的完整切片，不把组件、状态、测试拆成相互阻塞的水平任务。各自只接管自己的控件，不创建临时兼容层；所有下载入口最终均移除。表格保留所选格式纯文本与 HTML 双表示，不修改 Streamdown、不提取私有映射、不维护依赖补丁。

按项目现有日期目录与一票一文件的约定落盘，不新建 .scratch 工作体系，不连接外部 tracker。ticket 的 ready-for-agent 表示定义已具备，不等于已经获得执行授权。

## 计划前证据闭包

| 字段 | 当前证据与计划结论 |
| --- | --- |
| 权威入口 | CurrentTaskPage 挂载 CommittedTranscriptSurface，ThreadHistoryDetailContent 挂载只读 surface；两者通过 renderer、turn fragment 与 TranscriptEntryRenderer 到达 MarkdownText／LiveMarkdownText。共有 streamdownCommonProps 是组件覆盖与 controls 的接线位置。 |
| 已追踪链路 | 静态和流式入口使用同一配置；LiveMarkdownText 传入 isAnimating。Streamdown 公开 CodeBlock、StreamdownContext、useIsCodeFenceIncomplete 和表格数据提取／序列化函数。表格旧外壳、全屏状态、滚动跟随属于内部实现，替换 table 后由应用承担，不能假设只换按钮就自动保留。复制 Promise 的成功／拒绝、反馈定时器、菜单关闭、弹层卸载和焦点恢复均在影响面内。 |
| 修改范围 | code 与 table 局部组件、共享配置、控件局部 CSS、现有与新增 Browser 测试，以及 Lingui 的两个 catalog。正文解析、消息状态、协议和 chunk selector 仅作为只读消费者证据。 |
| 验证映射 | 复用 MarkdownText／LiveMarkdownText 的 MarkdownCopyControls 系列和 MarkdownScopedStyles 测试；新增代码复制和表格交互行为测试。组合验证覆盖同一消息中的两类控件、能力矩阵、下载移除、主题、正文及全屏。surface 消费者测试覆盖生产挂载与分块边界。 |
| 排除项 | streamdownCommonProps 仅配置 code/cjk 与可选 math，不启用 Mermaid；img 被过滤，linkSafety 关闭。本次不修改这些行为。复制／弹层不需要新的协议或持久化数据，现有源字符串与 context 足够。 |
| 剩余未知 | 当前真实 GUI URL、合适的现有对话样本和实施时浏览器二进制状态需执行前核验；它们影响对应验收的可执行性，不改变设计。HeroUI Modal 内 Dropdown 的实际 portal／焦点组合由明确的自动回归与 Level 2 验收证明，不能由类型存在推断通过。若公开组件能力无法满足已定行为，暂停受影响路径并返回设计，不新增依赖补丁。 |

当前分支为 dev，计划前 HEAD 为 c2b07bef2813e4dd88cd3710c31f068d5958817b；只有本次设计文档未跟踪。该值仅为调查快照，执行时以完成文档提交后的稳定基线为准，不覆盖后来出现的其他工作。

独立只读审计确认两个 ticket 无产品依赖，实际交集为 markdownRendering、index.css 中代码／表格共用选择器、MarkdownCopyControls 与 MarkdownScopedStyles 测试，以及两个 catalog。现有测试以下载按钮存在作为等待锚点，必须替换为正文或保留控件就绪条件，再验证下载确实不存在，不能直接删掉相邻正文与主题覆盖。

## 实现与修改集合

根目录 R0 为 /Users/jiangsheng/cnb/codex。以下路径均相对各执行上下文的根目录，集合在对应工作树中展开成 canonical 路径。

- D：本设计、本 plan.md 和 issues 下两个任务文件。执行前作为一个独立文档提交。
- S1：codex-gui/src/features/committedTranscriptSurface 下拟新增的 MarkdownCode.tsx、MarkdownCodeCopyButton.tsx；同目录现有 markdownRendering.tsx，以及仅为该接线所必需的 MarkdownText.tsx、LiveMarkdownText.tsx；codex-gui/src/index.css 中仅影响代码控件的部分。
- S2：同一 feature 下拟新增的 MarkdownTable.tsx、MarkdownTableCopyMenu.tsx、MarkdownTableFullscreen.tsx、useMarkdownTableScroll.ts；共享 markdownRendering.tsx 及必要的两个 Markdown 入口；index.css 中表格菜单和全屏相关部分。
- B1：该 feature 的 __tests__ 下新增 MarkdownCodeControls.browser.test.tsx，现有 MarkdownCopyControlsAvailable、MarkdownCopyControlsUnavailable、MarkdownCopyControlsMissingClipboardWrite、MarkdownScopedStyles、MarkdownFileLinks Browser 文件中与代码相关的变化。
- B2：该 feature 的 __tests__ 下新增 MarkdownTableControls.browser.test.tsx，现有上述复制能力及样式测试中与表格相关的变化。
- BC：上述 B1 与 B2 的并集，以及同目录 CommittedTranscriptSurfaceMessages、CommittedTranscriptSurfaceDisclosure、CommittedTranscriptSurfaceSessions Browser 测试。后者用于验证共用渲染、挂载／卸载及内容边界；只有当前目标引入的变化才允许修改其 fixture 或断言。
- G：codex-gui/src/locales/en.po、codex-gui/src/locales/zh-CN.po。
- RF：设计、两任务源码与测试、transcript surface 生产调用链、现有 I18nProvider 与测试包装方式、Streamdown 已安装包、已核验的 HeroUI/Vitest 本地文档和源码、项目规则、package scripts、Lingui/Vite/Vitest/TypeScript 配置及 GUI CI workflow。只读；不把消费者调查自动变成写权限。
- L：执行时新建的本计划目录 execution-log.md，唯一协调 owner 维护节点事件、提交、失败与验收结果。本轮不创建占位执行记录。

新模块命名属于实现组织，不是必须保持的外部 API。执行时可在已授权 feature 与职责边界内进行等价调整，并更新节点实际集合；不能借此扩大产品范围或修改其他 feature。

### 两项共守的实现规则

- 直接采用公开类型或机械派生类型，稳定定义 components 映射；不手工镜像 Streamdown 合约，也不使用私有 deep import。
- T1 保留 inline／fenced 分支、原始代码与 CodeBlock 高亮、meta、incomplete、限高和行号配置；HeroUI Button 为 ghost、sm，按实际写入结果反馈。流式状态以 StreamdownContext 为准。
- T2 使用 Dropdown compound API 与 Modal full、内部滚动；复制触发器和全屏按钮为 ghost、sm。表格正文仍是原生语义 children。局部 Alert 表达失败，所有名称与提示沿用 Lingui。
- T2 直接使用公开表格序列化函数；能力判断与代码独立。仅 writeText 时不显示表格复制；支持 write 和 ClipboardItem 时不额外要求 writeText。失败不改走纯文本，不吞错。
- T2 实现一个局部表格滚动 owner，维持默认限高、贴底跟随和手动上滚不被抢回；不照搬私有 hook、数值阈值或状态 DTO。滚动语义由用户行为测试验证，具体实现参数须有当前几何证据。
- 弹层焦点、Escape、背景滚动锁交给 HeroUI；不保留旧表格弹层或 document 监听。全屏内部菜单优先响应 Escape；退出后恢复触发器焦点及原阅读位置，卸载清理局部资源。
- 两任务各自只删除本任务对应的旧样式与下载路径；合并后旧控件覆盖全部收拢，不删除正文样式，不增加全局主题映射。
- 新控件需要本地化上下文时，测试使用项目已有 I18nProvider 包装，补齐所有受影响渲染入口；不增加产品侧无 provider 兜底或第二个 i18n 实例。
- 不进行纯重排；如确有必要的非行为顺序调整，单独建提交边界，不混入行为提交。中间提交无需完成另一 ticket 的目标，也不得为通过中间检查新增双路径兼容。

## 执行上下文与预配

计划拟在主 checkout 内创建两个稀疏工作树，分别持有 branch 与 index。执行确认后先提交 D，再预配全部工作树；预配完成前任何任务不得开始编辑。创建不安装依赖，只复用已有资源。

| 上下文 | 路径 | 分支 | 基线／职责 |
| --- | --- | --- | --- |
| C0 | R0 | dev | 文档、工作树预配、最终集成与验收；主代理为唯一 Git owner |
| C1 | R0/.worktrees/streamdown-code-controls | codex/streamdown-code-controls | 文档提交后的 dev，ticket 1 独立编辑与提交 |
| C2 | R0/.worktrees/streamdown-table-controls | codex/streamdown-table-controls | 与 C1 相同的文档 commit，ticket 2 独立编辑与提交 |

已核验 .worktrees 存在且被 ignore；两目标目录与两个目标 branch 均不存在。默认稀疏路径都存在于当前基线 Git tree，额外包含 .github 以保留 GUI CI 入口。创建前重新核验，名称冲突时停止预配，不覆盖。

在 C0 执行以下已审查的项目脚本；此处仅声明未来动作，本轮不执行：

```sh
bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh --name streamdown-code-controls --branch codex/streamdown-code-controls --base dev --repo-root /Users/jiangsheng/cnb/codex --worktree-root /Users/jiangsheng/cnb/codex/.worktrees --vitest-root /Users/jiangsheng/cnb/vitest --include .github
bash .codex/skills/codex-gui-worktree/scripts/create-codex-gui-worktree.sh --name streamdown-table-controls --branch codex/streamdown-table-controls --base dev --repo-root /Users/jiangsheng/cnb/codex --worktree-root /Users/jiangsheng/cnb/codex/.worktrees --vitest-root /Users/jiangsheng/cnb/vitest --include .github
```

两次创建之间禁止集成产品提交，确保 dev 始终等于同一个 D commit。记录实际 base hash。默认 include 为 .codex/skills、.agents/skills、codex-gui、docs/superpowers、app-server-protocol 与 gui-host 的 TypeScript/JSON schema；不改 Rust 内容。

现有 .worktrees/vitest 的直接链接是 /Users/jiangsheng/cnb/vitest，物理目标为 /Users/jiangsheng/GitHub/vitest。脚本按直接链接比较，因此保持 --vitest-root 的 cnb 路径，不把物理路径替换进去。

为让工作树中的 heroui-react 按“仓库根的 sibling”定位同一份已验证源码，拟在项目内增加以下只用于源码读取的链接；目前该链接不存在：

```sh
ln -s /Users/jiangsheng/cnb/heroui /Users/jiangsheng/cnb/codex/.worktrees/heroui
```

只在链接目标不存在时创建，不改动外部 HeroUI 源码。已有 node_modules 与 HeroUI/Redux 文档资源已核验可读，由项目脚本链接；不安装、不下载、不修改链接指向的依赖。核验全部脚本后置条件、默认 sparse 输入、实际 status、两个 index 身份后发布预配完成证据。

创建 worktree 改变项目内 .worktrees 与 .git/worktrees 的状态；两个任务提交仅改变各自 branch，最终本地 merge 更新 dev。不在本计划内删除工作树或 branch，不执行脚本错误提示中的强制清理命令。需要范围外动作时只暂停其后继。

## 执行 DAG 与节点契约

以下公共字段与节点表逐项合并展开为节点记录；i 取 1 或 2，代表两个独立任务链。节点 schema 遵循 delegating-micro-stages 执行图契约，不使用图形或 parallelizable 布尔值代替依赖和资源。

- authorizationGate：当前仅 D 文档写入 active。未来编辑、预配、生成、验证、stage、commit、merge 和运行验收均 waiting，直到用户明确开始本计划。协调 owner 按 action-authorization 为每节点建立最小能力信封，grantSource、允许动作、精确集合与副作用必须与本计划及后续授权相交；未声明的能力不下放。
- owner：C0 主代理负责协调、预配、集成、最终验证与记录；C1、C2 分别由一个有界任务子代理负责该 ticket。各上下文仅该 owner 能格式化、生成、stage、commit。最终只读独立审查由未编辑产物的审查子代理执行。subdelegation 全部 false。
- executionContext：D/P/I/FINAL 使用 C0；Ti 使用 Ci。只读审查读取集成后的固定 commit。没有共享 index 写入；预配与集成时由 C0 独占公共 Git 管理状态。
- resourceLocks：按下节逐个 canonical 文件、index、共享增量缓存与会话计算；源码稳定读为 read，编辑／生成／暂存／集成为 write。同一物理资源不因工作树内路径不同而分成不同锁。
- readSet：对应设计与 ticket、RF 内该节点实际所需稳定输入；生成读取所属上下文 Lingui 配置下全部 src；最终验证读取最终集成源码及 BC。禁止验证读取同上下文正在编辑的不稳定文件。
- writeSet/stateEffects：E 为 Si 与 Bi；G 为 G；F 为当前任务需格式化的源码和测试；V 仅工具正常产生的测试／缓存产物；S 为所属 index；C 为本地 Git 对象与任务 branch；I 为共享文件冲突解决、G、index 和 dev；P 为上述工作树／链接及 Git 元数据；L 仅 C0。不得借工具副作用获得后续主动修改其他产物的权限。
- commandScope：只读定位；普通源码 apply_patch；文件移动／删除使用 git mv／git rm；项目已有生成、格式化、lint、type-check、Browser 入口；精确路径 git add、本地 commit、merge --no-ff --no-commit。无 install、远程 Git、force、amend、squash、后端 build/run 或可见窗口。
- verification：各 ticket 验收、非 fix 格式检查、当前入口真实收集目标、完整 diff 与 staged diff 检查；完成证据必须是退出状态、实际结果、稳定 diff 或 commit id，不接受“已完成”声明代替。
- deferralEvidence：无预设暂缓。独立编辑立即并行；只按下述实际文件／缓存／index／浏览器锁等待，资源释放即重算 ready set，不形成全局 wave 栅栏。
- failureDomain：失败节点及读取其不稳定产物的后继。C1 失败不暂停 C2；集成冲突暂停该 merge 的消费者；共享缓存问题只影响使用该缓存的运行，不暂停独立编辑。
- replanTriggers：产品语义、公开接口假设、实际写集合或授权边界改变，以及命令输入、生成 owner 或资源身份与计划不符。计划内错误插入诊断、修正、验证节点；新权限或新产品决策才请求用户。

| nodeId | taskBoundary | operationKind | hardPredecessors／consumes | outcome／produces／completionEvidence | estimatedCost |
| --- | --- | --- | --- | --- | --- |
| D-S | 文档提交 | stage | 执行授权、稳定 D | 仅 D 暂存，staged 路径与空白检查通过 | 小 |
| D-C | 文档提交 | commit | D-S index | 独立文档 commit id | 小 |
| P | 无提交 | 预配 | D-C 的稳定基线 | C1、C2、链接和 schema 全部验证，实际 base 与 index 记录 | 小 |
| T1-E | ticket 1 | 编辑 | P 与设计／ticket 1 | S1/B1 的代码复制完整切片，稳定 diff | 中 |
| T2-E | ticket 2 | 编辑 | P 与设计／ticket 2 | S2/B2 的表格复制／全屏完整切片，稳定 diff | 大 |
| Ti-G0 | ticket i | 生成 | Ti-E 稳定源码 | 首次提取后的 G 与完整 diff | 小 |
| Ti-L | ticket i | 编辑 | Ti-G0 与源码消息 | 仅本任务消息的翻译补全，逐字段审查后的 G | 小 |
| Ti-G1 | ticket i | 生成 | Ti-L 稳定翻译 | 同一入口再次提取后的 G | 小 |
| Ti-GV | ticket i | 验证 | Ti-G1 与 Ti-L 的稳定快照 | 再提取无新增结构漂移、翻译与 comment 保留的证据 | 小 |
| Ti-F | ticket i | 格式化 | Ti-GV 通过的产物 | 限定文件格式修正及非 fix 复验通过 | 小 |
| Ti-V | ticket i | 验证 | Ti-F 稳定源码／catalog | 本任务完整受影响文件、类型和 lint 结果 | 中 |
| Ti-S | ticket i | stage | Ti-V 通过与稳定 diff | 仅该 ticket 文件暂存，staged 审查通过 | 小 |
| Ti-C | ticket i | commit | Ti-S index | 一个独立行为 commit id | 小 |
| Ii | 集成 | 集成 | Ti-C；当前 C0 无未完成 merge | 保留任务 commit 身份的本地 merge，冲突逐文件解决并立即暂存；稳定候选 index | 中 |
| Ii-G0 | 集成 | 生成 | Ii 合并源码 | 根据合并源码首次提取的 G | 小 |
| Ii-L | 集成 | 编辑 | Ii-G0 与两任务消息 | 合并范围内翻译补全，逐字段审查后的 G | 小 |
| Ii-G1 | 集成 | 生成 | Ii-L 稳定翻译 | 同一入口再次提取后的 G | 小 |
| Ii-GV | 集成 | 验证 | Ii-G1 与 Ii-L 快照 | catalog 重复提取稳定证据 | 小 |
| Ii-V | 集成 | 验证 | Ii-GV 通过的稳定候选 | 格式非 fix、类型、lint 与受冲突影响的组合行为验证通过 | 中 |
| Ii-S | 集成 | stage | Ii-V 通过及合并源码／G | 精确暂存生成后的 G 与必要修正，确认无 unmerged、staged 路径及空白检查通过 | 小 |
| Ii-C | 集成 | commit | Ii-S index | 独立 merge commit，记录所含任务 commit | 小 |
| FINAL-V | 无提交 | 验证 | I1-C、I2-C 的稳定组合 | 下述 Level 1/2 及最终范围证据；全量最终条件通过 | 中 |
| FINAL-R | 无提交 | 审查 | I1-C、I2-C 的固定 commit 与设计 | 独立设计／规则核对结果；可与 FINAL-V 只读并行 | 小 |
| FINAL-L | 执行记录 | 编辑 | FINAL-V、FINAL-R 及其必要修正完成 | L 保存实际 DAG、提交和证据的稳定正文 | 小 |
| FINAL-S | 执行记录 | stage | FINAL-L 稳定正文 | 仅 L 暂存并通过 staged 内容／空白检查 | 小 |
| FINAL-C | 执行记录 | commit | FINAL-S index | 独立本地执行记录 commit id | 小 |
| CLOSE | 无提交 | fan-in | FINAL-C 与所有必要节点 | 最终状态审查、任务提交与验收证据汇总 | 小 |

首次生成、人工翻译、重复生成和稳定性验证分别使用不同节点与能力信封。翻译编辑仅限本任务或合并范围内新增／改变的消息；没有需要补充的翻译时以审查无变更证据完成，不为节点制造编辑。Ii-V 发现必要格式修正时先插入对应格式节点，不在验证节点暗中 fix。最终审查或验证引入修正时，失效相应旧证据并重验后才能进入 FINAL-L。

初始执行 ready set 为 D-S；D-C 后 P；P 完成后 T1-E、T2-E 同时 ready。逻辑关键路径为 D-C、P、较长的 T2 链、该任务集成、最终验收。任务编号不产生依赖；哪个任务先形成可集成提交就先集成，两个 I 链只因 C0 index／merge 状态互斥。最终验证 fan-in 必须等两个任务的合并状态，不能拿各分支单独通过替代。

### 资源锁与集成处理

- C0 index 当前为 R0/.git/index；C1/C2 的 index 由预配后 git rev-parse --git-path index 确认，记录 canonical 路径。公共 .git/worktrees 预配锁与 C0 merge 锁串行，不影响已就绪的独立源码编辑。
- 各工作树源码和 G 是不同 canonical 文件，read/read 可并行，write/read 或 write/write 相交时互斥。合并时 C0 的 markdownRendering.tsx、index.css、共享测试与 G 由主代理独占。
- node_modules 指向 R0/codex-gui/node_modules。已核验各 TypeScript 配置将 tsBuildInfoFile 写到该目录的 .tmp，因此读取／写入这些相同增量状态的 type-check 和相应检查不能并发。记录 .tmp 下具体 tsconfig.app、node、vitest、vitest.browser.tsbuildinfo 资源，结束后释放锁。
- 共享 node_modules 本身不推出所有命令必须串行。Browser/Vite 运行前核验实际 cache、端口、输出目录及 canonical 写集合；只有相同缓存或同一会话存在冲突时持互斥锁。不同工作树内的 catalog 提取不因名称相同就串行。不能把未知缓存风险扩张成两个任务全程串行。
- FINAL-V 的真实应用验收会话由主代理独占；不复用用户正在操作的桌面或其他任务会话。只读固定 commit 审查可与其并行。
- 合并采用本地 merge 保留两项提交身份，不 cherry-pick 重写身份、不 squash、不 amend。冲突按 resolving-merge-conflicts 与用户逐文件要求执行：完成单文件、核验 marker 与 git diff --check 后立即 git add，再处理下一文件；未解决或生成物待处理时不能暂存。
- controls/components 合并保留两项覆盖与独立能力判断；CSS 只去除两项已替换控件的旧规则，保留正文；测试合并保留双方断言；catalog 根据合并后的源码由权威入口再生成，不手工复制 references 拼接结果。

## 验证、工具链与生成边界

已读取 package scripts、GUI workflow、Browser 配置与 Lingui 配置。GUI workflow 的 quick 调用 ci，ci 选择 format:oxfmt、lint 与 type-check；不因另有 prettier script 而新增第二套格式化 owner。Browser parallel 实际收集 src 下 browser.test.ts/tsx，排除 sequential，配置 Chromium/Firefox/WebKit 且 headless=true。

已见 fnm 及项目 oxfmt、lingui、vitest、tsc 入口；未运行它们。执行前按 codex-gui-toolchain 验证 fnm 管理的 Node/pnpm 真实来源、版本、输入与测试目标，以及已有浏览器二进制。缺失由用户安装，不自动安装或切换 shim。

- 所有 pnpm 操作在目标上下文的 codex-gui 内，经 /opt/homebrew/bin/fnm exec --using-file pnpm 调用。
- 使用项目 type-check 和 lint 非 fix 入口。修正普通源码／测试格式优先项目 oxfmt，限定当前任务实际文件并以非 fix 检查复验；固定全目录脚本无法限制写范围时，按 owner 核对其底层 oxfmt 参数后只处理明确文件，不运行全目录 fix 后再回退无关变化。
- Browser 使用 test:browser:parallel 的 --run 与明确文件参数；不调用 aggregate test:browser 传过滤器，不插入额外脚本级 --。最终受影响文件验证不带 -t，不把零收集或意外全量当成通过。
- T1 验证 B1 中实际受影响的完整文件；T2 验证 B2；最终验证 BC，覆盖静态／流式共同注册、独立能力矩阵、三个位置无下载、复制载荷与反馈、全屏和菜单键盘焦点、卸载清理、表格滚动、主题窄屏及分块消费者。
- 原下载按钮等待条件改用稳定正文／保留控件就绪后，必须保留无下载的显式断言。修正“仅 writeText 即有表格复制”这一已证实错误的检查，不减少其他覆盖、不放宽数值断言、不用 sleep 掩盖焦点问题。
- 分支验证与最终合并验证针对不同输入，不能互相替代；最终合并已有通过证据可复用，只有新合并、修正、失败或未覆盖的交互才要求再次运行，不为测试数量重复扫描全套。

Lingui 生成入口为 messages:extract，sourceLocale=en，include=src，排除截图／trace 目录，完整输出 G。新增和修改的消息使用当前项目宏与 translator comment 规则，英文及简体中文都补齐。首次提取审查全部 references、comments、msgid、msgstr、fuzzy／obsolete，再运行同一入口要求稳定。允许本目标翻译人工补充，不允许手工恢复生成 references 或接受无关语义漂移。生成边界外输出暂停其后继，先调查，不修改依赖／锁文件或新增 locale。

## 验收层级

- Level 1：上述三引擎 Browser、类型、lint、格式及本地化稳定性。新剪贴板测试捕获模拟 API 的纯文本与 HTML，不写系统剪贴板。按成功、拒绝、重试和仅部分 API 存在验证实际行为。
- Level 2：在 C0 最终合并状态对应的真实 Codex GUI 中无头验收。通过当前 /gui 或 launch_gui 获取完整 URL，核验 route、现有 thread 内容与非 headed 会话，覆盖代码复制入口、表格普通／全屏菜单、下载全部移除、焦点圈定／恢复、Escape 层级、滚动、窄屏和主题。复制载荷由 Level 1 证明，不能自动扩大为写 OS 剪贴板。现有真实样本不足且需要发送消息／创建任务时，仅暂停相应场景，先明确副作用取得授权；不能用隔离 fixture 冒充真实状态。
- Level 3：当前不适用，不启动可见浏览器、DevTools 或报告窗口。后续只有证明结果依赖可见桌面，才单独申请该次窗口授权。

当前三个层级均未执行；Level 3 为不适用。URL／运行时／样本缺失不能阻止无依赖实现与 Level 1，但会阻止 Level 2 通过及完全验证的声明。

## 失败处理与结束条件

执行期按执行图契约记录实际开始／完成、锁、ready set、产物身份、失败域与动态节点。只在 L 中更新运行事实，不把本计划正文改成动态日志。主代理是唯一日志写 owner；子代理只返回结果。

验证失败后继续当前授权内的诊断、根因修正与必要再验证；提交后的修正创建新的独立提交。只有正面证据说明授权、工具、环境、产品约束或安全边界确实阻塞时，才暂停相应后继，其他 ready 节点继续。

完成条件为两个 ticket、合并后的全部验收条件、必要修正与最终独立审查闭环。最终只保留一个 code 控件 owner、一个 table 控件 owner；所有代码／表格下载入口及执行路径移除；没有 Streamdown 修改或依赖补丁。记录文档 commit、两任务 commit、merge／修正 commit、最终测试和 Level 1/2/3，并报告实际并行、关键路径和未及时启动 ready 节点的具体原因。

全部任务、计划内修正和适用最终验证完成后结束本轮实现，不自行追加新的审计目标。未获开始实现指令前，本计划只是一份已落盘的待执行方案。
