# 任务 02 执行记录

日期：2026-09-10。状态：实现、CI 与独立审查完成，已提交 `a2e1fa429`；完整 Browser 和真实 runtime 验收仍有缺口。

## 授权与执行图

用户直接请求 `$implement`「02」，随后亲自添加所需开发依赖并通知继续。
复用原计划节点字段、集合、资源锁、失败域和提交边界；不改写已确认设计或计划正文。
当前 checkout 为 `/Users/jiangsheng/cnb/codex`，分支 `dev`，基点 `22e7c845a`。
文档前置提交 `7bfc904c8` 与任务 01 提交 `f0b75b370` 已存在。

- `T2.edit`：active；主代理编辑 SYNTAX、必要 MATH、TEST。用户添加的
  `codex-gui/package.json`、`codex-gui/pnpm-lock.yaml` 纳入本任务提交集合。
- `T2.red`：新增 verify 节点，消费一个已确认消息展示入口的测试；预期三浏览器因缺少反斜杠数学节点失败。
  predecessor 为测试编辑完成；只解锁该切片实现，不要求全部用例预先编写。
- `T2.format`、`T2.verify`、`T2.stage`、`T2.commit`：依原计划等待稳定源码与验证证据。
- `F.review`：拆为 Standards 与 Spec 两个只读并行节点；消费最终任务提交及原设计、票据。
  独立审查授权来自 `$implement` 要求的 `$code-review`；禁止子代理编辑、运行测试、Git 写与继续委派。
- `F.level1`：主代理唯一 runner owner；完整 `ci` 与 `test:browser` 串行使用同一项目缓存。
- `F.level2`：等待当前完整 `/gui` URL 与真实 runtime 版本证据；不复用历史地址，不开可见窗口。
- `F.join`、`R.edit`、`R.stage`、`R.commit`：消费最终审查和验证结果，记录实际缺口并独立提交文档。

各节点的能力信封继承原计划目标及范围，以本次直接实施请求为 grantSource；仅上述动作 active。
主代理是源码编辑、格式化、runner、执行记录与实际 Git index 的唯一写 owner；独立审查只读稳定输入。
不创建 scratch/worktree，不安装依赖，不操作 Git 远程，不改后端、协议、参考仓库或全局规则。
编辑与读取同一可变源码的验证不并行。节点完成或失败即释放锁，重新计算依赖；范围内缺陷继续修正。

## 已核验事实

- 用户新增的三个包均已直接解析：`unified@11.0.5`、`micromark-util-types@2.0.2`、
  `mdast-util-from-markdown@2.0.3`；lock 中版本已存在，新增直接开发依赖声明。
- fnm Node v24.17.0、pnpm 10.34.5；Chromium、Firefox、WebKit 二进制均存在。
- 使用 `/Users/jiangsheng/GitHub/streamdown` 可读源码核对扩展接口和默认分块；
  仅使用已安装包的公开 `.d.ts` 核对解析器类型，不修改或研究压缩实现。
- 测试 seam 复用 `CommittedTranscriptSurface`、合法 projection builders 与真实数学语义 DOM。

## 事件与验证

- 初始依赖预检通过；开始历史四语法的第一个 TDD 切片。
- 历史测试先在三浏览器得到预期红灯（2 个美元数学节点，预期共 5 个），接入后通过。
- 多行流式测试暴露换行事件协议错误；修正 tokenizer 的逐行 token、编译 buffer 和 paragraph interruption 后通过。
  未闭合公式返回解析失败，由普通 Markdown 接手，不增加补齐、占位或完成屏障。
- Vite 首次优化新增 `mdast-util-from-markdown` 时重载导致未收集测试；缓存稳定后重跑实际目标。
- CRLF 长前文样例先在三浏览器失败（1 个数学节点，预期 2 个），按 Streamdown 已分块的实际字符串计算
  offset 后通过。只合并公式跨越的 Markdown 块，不改变 transcript chunk 或原始消息。
- 边界测试核对 Streamdown 可读源码后，按逐行块元素检查代码字面量；粗体按其现有 `data-streamdown="strong"`
  输出检查。引用链接历史中解析并编码方括号，流式跨块定义保持依赖原有字面输出；不为数学扩展修复引用链接分块。
- 格式检查通过；独立 `type-check` 通过。
- 最新定向 Browser：30 文件、222 测试通过，三浏览器无类型错误。
- Lint 的可修正源码问题已处理。剩余 `consistent-type-definitions` 与 TypeScript module augmentation
  必需 interface 冲突；参照现有 `src/router.tsx` 可用两条局部注释，但用户禁止新增豁免，已单独请求确认，尚未修改。

## 动态调度

`T2.verify` 中 Lint 与提交后继等待授权；将独立审查前置调整为稳定工作树源码，完整测试也消费同一稳定输入，
不等待无关的 Lint 确认。审查期间禁止编辑这些源码；若必须修正，旧审查证据失效并对新快照复审。
稳定基点仍为 `22e7c845a`，新增模块 SHA-256 为
`f33da0acde4d72dac89775a3c814e3665dbaaae09a134a73592a86e863776bea`，
消息测试 SHA-256 为 `958435ab581f5a3136c034ff7413da3d5b5c582ab1042f8fb3ddf4fa9e6715bb`。
主代理继续独占 runner 和文档写；两个审查者只读源码与规则，不读取动态执行记录作为稳定产品输入。

## 最终收集到的证据

所有前端命令 cwd 均为 `/Users/jiangsheng/cnb/codex/codex-gui`，统一经
`/opt/homebrew/bin/fnm exec --using-file pnpm run` 调用；浏览器全部无头。

| 节点/入口 | 实际结果 |
| --- | --- |
| `format:oxfmt` | 通过；项目 fix 只改变本次两个源码文件，随后非 fix 复查通过 |
| `type-check` | 通过 |
| `test:browser:parallel src/features/committedTranscriptSurface/__tests__` | 30 文件、222 测试通过，三浏览器，无类型错误 |
| `ci` | validator check、format、oxlint 通过；ESLint 仅剩新模块第 12、20 行声明合并的 `consistent-type-definitions`，后续步骤被命令链阻断 |
| `test:browser` 的 parallel 阶段 | 171 文件，1595 通过、1 失败；因此自动 sequential 未执行 |
| 显式 `test:browser:sequential` | 24 文件，45 通过、3 失败；无类型错误 |
| 单独复跑 `test:browser:parallel src/features/composerTurnControl/__tests__/ComposerPendingInputProvider.browser.test.tsx` | 3 文件、12 测试通过；只证明此次未复现，不是修复证据 |
| 补跑 CI 被阻断的 `test:unit` | 99 文件、1241 测试通过，无类型错误 |
| 补跑 CI 被阻断的 `test:browser:smoke` | 3 文件、5 测试通过 |

完整 Browser 的失败明细：

- Chromium：`ComposerPendingInputProvider.browser.test.tsx:85`，
  `returns from backdrop confirmation without cancelling the edit or replacing the main draft`；
  点击 backdrop 后未找到 `alertdialog`。该文件及 Composer 消费者没有本任务 diff；本次未修改它们。
  仅只读检查现有测试和入口，随后复跑整个文件通过，未做临时插桩、改基线或其他诊断。
- Chromium、Firefox、WebKit：`src/__tests__/sequential/composer-focus.browser.test.tsx:155`，
  `supports pointer editing and visibly indicates keyboard focus`；焦点绘制综合判断返回 false。
  该测试与本次 CSS 均无 diff；未验证根因，不宣称既有问题或与本次改动无关。
  修复范围外 Composer 行为或引入有状态诊断需要新的对应授权，不把数学任务扩展为 Composer 修复。

## Standards

独立代理 `/root/math02_standards_review`：0 项发现。核验公共类型派生、共享语法责任、助手入口隔离、
原 chunk owner 与 projection fixture 约束，未发现明确规则违反或充分证据的 smell。
已知 Lint 冲突单独保留，不计入人工静态审查。代理仅只读，未运行测试或 Git 写。

## Spec

独立代理 `/root/math02_spec_review`：0 项发现。核验两种反斜杠语法、同一 KaTeX 链路、代码与链接边界、
未闭合恢复、流式分块与 CRLF 位置一致性，未发现可确证需求偏离或范围外行为。
代理仅只读，未运行实验或修改文件。两份审查的 SHA-256 与最终源码复核一致。

## 授权闭环与提交

- 用户随后单独回复「确认」，允许两个 interface 声明前添加此前展示的局部 Lint 注释。
  仅豁免 `consistent-type-definitions`，并注明 TypeScript 声明合并原因；未修改全局检查配置。
- 重新执行 `ci` 完整通过：validator check、format、oxlint、ESLint、type-check、
  99 文件/1241 项单元测试、3 文件/5 项浏览器 smoke。
- 两名独立审查者复核：移除新加的两行注释后，模块 SHA-256 与原审查输入完全一致；
  Standards 0 发现、Spec 0 发现结论保持有效。运行逻辑未改，保留已有定向/完整 Browser 证据，未重复跑全量。
- 主代理精确暂存七个任务文件，检查 staged diff 与 `git diff --cached --check` 后，
  在当前 `dev` 创建独立提交 `a2e1fa429 feat(gui): render backslash math in assistant messages`。
  未 amend、squash、远程操作或强制暂存；用户亲自添加的直接依赖声明随本任务提交。

## 剩余完成边界

- `T2.stage`、`T2.commit` 已完成；执行记录与票据状态作为独立文档提交落盘。
- Level 1 的 CI、定向 Browser 通过；完整 Browser 尚未全绿，不能称完整验收通过。
- Level 2 适用但未执行：已请求当前完整 `/gui` URL，尚未收到；当前工具未暴露 `launch_gui`。
  真实历史、流式、结束、窄屏和长公式场景仍缺证据，不以 fixture 代替。
- Level 3 不适用；未打开可见窗口。
- 两个审查节点已释放只读锁；runner 已结束并释放锁，记录由主代理独占维护。

## Level 2 补验：真实历史与响应式布局

2026-09-10 用户提供当前完整任务 URL 后，恢复 `F.level2` 的历史验收分支。
本次由主代理独占 `math-l2` 无头浏览器会话和执行记录；源码保持不变，已有独立源码审查不重跑。
本段增量记录更新上节「Level 2 未执行」的历史状态，不改写此前验证事实。

- `playwright-cli list --json` 明确返回 `headed: false`、非持久 Chrome 会话；未打开可见窗口。
- 目标任务路由与用户提供的地址一致，页面 runtime 状态为 `initialized`，历史轮次显示「已完成」。
  URL token 不落盘。
- 服务使用 Vite。读取服务响应中的 source map，确认 `remarkBackslashMath.ts`、
  `markdownRendering.tsx`、`MarkdownText.tsx`、`LiveMarkdownText.tsx` 的 `sourcesContent`
  与当前工作区逐字一致；本轮开始时 HEAD 为 `c68ef69ca`。
- 只读核对该任务原始助手消息：23 个反斜杠行内起始分隔符、12 个反斜杠块级起始分隔符，
  不含美元字符。页面对应 35 个 KaTeX 节点，其中 12 个块级节点；没有 KaTeX 错误节点。
  页面存在 MathML，实际使用的 `KaTeX_Main`、`KaTeX_Math` 字体加载成功。
- 在 390 × 844 视口刷新后，runtime 重新初始化，历史仍显示相同的 35 个公式和 12 个块级节点，
  没有 KaTeX 错误节点。
- 1280 × 900 桌面视口下，页面 `scrollWidth` 为 1280，块级公式均未超出自身容器宽度。
- 390 × 844 窄屏下，三个块级公式的内容宽度超过 326px 容器，最大内容宽度为 387px；
  最右公式内容边界约为 418.73px，页面 `scrollWidth` 为 419。
  无头截图也确认长公式右侧超出可视区域。这是实际观察到的横向溢出，不能称窄屏无溢出通过；
  本轮遵循已确认的默认布局与溢出行为约束，没有新增缩放、换行或滚动规则。

当前真实历史与刷新后的反斜杠渲染已有证据；美元语法、真实增量到达与闭合、流式转完成、
非法表达式仍未验收。原计划要求新消息仅在专用验证会话中发送；已请求用户确认新建专用会话并发送
最小数学样例，当前等待回复，未向用户既有任务发送消息。此前完整 Browser 失败仍未闭环。

实际并行：无，浏览器交互消费同一会话状态。关键路径：当前 URL → 无头会话与服务源码核对 →
历史、刷新、桌面及窄屏证据 → 等待专用验证会话确认。未启动 ready 节点：无；
实时分支等待必要授权。文档由主代理检查 diff 后形成新的独立本地提交。

## 已确认修订的实施：公式局部横向滚动

2026-09-10 用户确认 Q4 选择 A，随后确认已落盘的修订实施计划。
本段记录新行为及执行结果；前节「保留默认溢出」是修订前决策，不再作为当前公式溢出要求。
本轮实施前工作树仅有两份已接受文档，先形成独立提交 `d3fa815d3`。
主代理独占源码、测试 runner、浏览器、执行记录与 Git index；未创建 scratch/worktree、安装组件或操作远程。

### 实现与修正提交

- `62070b6b0`：静态和流式 Markdown 通过现有 `enableMath` 标记助手数学作用域，
  共享公式宽度及横向滚动样式，添加四语法的真实消息入口回归。首轮红灯在三浏览器复现页面宽度
  405px 超出 390px 视口；加入局部滚动后通过。测试样例加长以确保行内和块级都实际超过容器宽度。
- `a1a17d294`：独立 Spec 审查指出短公式统一 `vertical-align: middle` 的基线风险。
  改用 `inline-grid` / `grid`，移除强制居中；补充上标、下标、嵌套高分式与原生排版的对照。
  对照测量同一个 `.base` 的实际内容位置与高度，避免拿 inline 与 inline-block 外盒的不同几何定义作比较。
- `02534dc7a`：真实历史发现部分短公式有额外 2px 横向滚动。只读 DOM 核对显示 KaTeX 的
  `.vlist-s` 为宽度和最小宽度均为 2px 的对齐单元；在数学 HTML 末端容纳这部分宽度，
  并限制滚动方向为横向。加入希腊字母下标、boxed 短公式及全部短公式无横向溢出的断言，先红后绿。
  保留实际数学内容上下边界、高度和基线检查；真实历史中可见公式后代没有超出容器底部 1px，
  不以隐藏公式内容实现通过。样例证据不等同于穷尽所有 LaTeX 的边界。

三个源码提交均独立保留，没有 amend、squash、断言放宽或新增豁免。未改解析器、原始消息、
复制链路、后端或非助手消费者。格式化后检查实际 diff，只包含本次四个源码/测试文件。

### 最终验证与独立审查

最终源码为 `02534dc7a`；所有前端命令在 `codex-gui` 目录通过 fnm-backed pnpm 运行，浏览器均无头。

| 验证 | 最终结果 |
| --- | --- |
| `ci` | 全部通过；99 文件/1241 单元测试，3 文件/5 Browser smoke，格式、lint、类型和 validators 检查通过 |
| 定向 `test:browser:parallel src/features/committedTranscriptSurface/__tests__` | 30 文件/228 测试通过，三浏览器、无类型错误 |
| 最终 `test:browser` 的 parallel | 171 文件，1601 通过、1 失败；自动 sequential 被阻断 |
| 显式 `test:browser:sequential` | 24 文件，45 通过、3 失败，无类型错误 |
| 单独复跑 `src/__tests__/HistoryPreviewChatLayout.browser.test.tsx` | 三浏览器 12 项通过，只证明此次未复现 |
| Standards 独立审查 | `/root/math_overflow_standards`：最终 0 发现 |
| Spec 独立审查 | `/root/math_overflow_spec`：短公式基线发现经修正与复核闭环，最终 0 发现 |

审查者按稳定提交逐次复核至 `d3fa815d3...02534dc7a`，只读、无测试、浏览器或 Git 写；
运行证据由主代理提供。最终 parallel 的失败为 WebKit `HistoryPreviewChatLayout.browser.test.tsx:116`：
390px 长内容下，末尾链接未满足位于底部面板上方的断言。只读核对该用例内容没有公式；
其根因未确认，未做有状态诊断或修改。单独复跑通过不能称修复。
最终 sequential 仍为三浏览器 `composer-focus.browser.test.tsx:155` 的焦点绘制断言失败。
更早的 `a1a17d294` 全量 parallel 曾出现 Chromium backdrop 未找到 `alertdialog`，
本轮最终全量未复现该项，也不据此称修复。完整 Browser 仍未全绿，不扩展为 Composer/历史布局修复。

### 真实 runtime 与剩余边界

复用用户本轮提供的完整任务地址重新建立 `math-overflow-l2` 会话，`list --json` 明确 `headed: false`。
runtime 为 `initialized`，路由正确；四个数学模块的服务 source map 与工作区逐字一致，
服务 CSS 包含最终作用域、grid、纵向约束与末端 padding 规则。没有保存 token 或向既有任务发送消息。

- 1280 × 900：页面内容宽度 1280px，35 个公式，无横向溢出的公式。
- 390 × 844：页面内容宽度 390px，短公式无横向溢出；三个长块级公式在 326px 容器内局部滚动。
- 鼠标横向滚轮实际使一个长公式 `scrollLeft` 从 0 到 63，即 389px 内容减去 326px 容器的末端；
  同时页面横向位置为 0、页面内容宽度为 390px。
- 桌面与窄屏的公式计算字号均为 19.36px。刷新后仍为 35 个公式、无 KaTeX 错误节点、页面不撑宽。
- 真实历史、刷新、桌面与窄屏局部滚动已取得证据；四语法实时增量、闭合与转完成的真实 runtime
  场景仍缺专用验证会话授权。自动化生命周期回归不替代这部分 Level 2。
- Level 3 不适用；无头会话验收后已关闭。原计划整体仍受完整 Browser 失败及实时验收缺口限制。

动态调度：`O.doc`、实现与定向验证、源码提交、独立审查和历史 `O.level2` 分支完成；
在原提交后插入两个独立修正提交及对应验证、复审，旧样式证据由新样式证据替代。
实际并行：稳定提交的 Standards/Spec 审查、测试 runner 与真实历史验收有时间重叠。
关键路径：文档提交→滚动实现→基线及对齐单元修正→最终验证/复审→执行记录。
未启动 ready 节点：无；同一 runner 串行执行，实时分支等待必要授权，其他资源锁均已释放。
