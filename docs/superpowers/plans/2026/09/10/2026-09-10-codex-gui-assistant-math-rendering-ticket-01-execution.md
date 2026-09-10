# 任务 01 执行记录

## 当前授权与边界

用户指定任务 01 并调用 `implement`，授权实现、测试、独立审查及当前分支本地提交。当前 checkout 为
`/Users/jiangsheng/cnb/codex`，分支 `dev`。本轮仅执行任务 01，不执行任务 02。
用户已自行添加 `katex@0.16.47`；相交范围新增 `codex-gui/package.json` 和 `pnpm-lock.yaml` 的直接依赖
声明提交，助手不安装、不生成或手改锁文件。保留不建 `.scratch`、不建 worktree、不操作远程、
不修改后端、协议、TUI 和项目外源码的约束。

## 执行节点与能力信封

消费原计划公共节点字段与 DOC/MATH/STYLE/TEST 集合；本记录补充本轮授权和调度，不改写历史计划。
主代理是唯一文件编辑、格式化、runner 和 Git index 写 owner；子代理仅只读审查，不允许继续委派。
读集合为设计、计划、票据、适用规则、当前消息入口及消费者、共享 fixtures、工具入口和本地依赖源码。
写集合为任务 01 的 MATH/STYLE/TEST、上述依赖声明及本记录和票据状态；程序内部正常测试产物随验证授权。
无特殊确认缺口；需要扩大目标或出现用户工作冲突时暂停对应节点。每个节点完成后能力到期。

| 节点 | 动作与依赖 | 产物、验证和状态 |
| --- | --- | --- |
| D.stage / D.commit | 原计划 DOC，独占当前 `.git/index` | 四个文档已独立提交 `7bfc904c8` |
| T1.red | 测试编辑后运行，依赖 D.commit | 历史公式测试在三浏览器预期失败：数学输出数量为 0 |
| T1.edit | 消费红灯，写 MATH/STYLE/TEST | 助手入口 opt-in，静态和流式共用插件，KaTeX CSS；不改原消息 |
| T1.format | 消费源码，项目 Oxfmt | check 确认仅本次四文件需格式化，再用固化 fix；diff 无范围外修改 |
| T1.verify | 消费稳定源码，独占 GUI runner | 定向三浏览器和静态检查，结果见下文 |
| T1.review.standards / T1.review.spec | 消费稳定 diff，两个只读代理并行 | 两轴均未发现实现问题；不得以审查代替运行验证 |
| T1.full | 消费稳定源码，独占同一 runner | `ci` 与完整 `test:browser` 串行执行，避免缓存竞争 |
| T1.level2 | 消费稳定源码与当前正规 GUI URL | 当前工具未提供 `launch_gui`，无完整当前 URL；未执行，不能用 fixture 代替 |
| T1.join | 汇总审查与自动化及真实运行证据 | 按实际缺口判断；Level 3 不适用，不打开可见窗口 |
| T1.stage / T1.commit | 消费验证后精确文件 diff | 主代理限定路径暂存、检查、独立提交 |
| R.edit / R.stage / R.commit | 消费本任务结果 | 更新执行记录与票据，单独记录提交 |

所有 verify 命令 cwd 为 `codex-gui`，使用 `/opt/homebrew/bin/fnm exec --using-file pnpm run ...`。
节点失败只影响其证据和后继；已授权范围内的修正、重验继续，已有提交修正必须新 commit。

## 已吸收的验证证据

- Node 使用 fnm v24.17.0，pnpm 10.34.5；KaTeX CSS 可直接解析，三个浏览器二进制均存在。
- 首次插件接入后的 Browser 运行被 Vite 新依赖预优化触发重载，未形成完整结果，已中止后重跑。
- 初次类型检查通过。
- 隔离测试需先展开既有 Intermediate updates 折叠区，已修正测试操作。
- 未知命令在 KaTeX 默认行为中可作为带颜色文字输出，不保证 `.katex-error`。通过已安装 KaTeX 的
  公共 API 核验后，将错误 fixture 改为缺少分母的 `\frac{1}`，准确覆盖解析错误回显；生产错误策略未改。
- 独立 Standards 和 Spec 审查均无发现。最后的 fixture 修正仅校准错误输入，不改变实现。

## 自动化结果与交付

- 任务提交：`f0b75b370`，8 个文件；包括用户自行添加的 KaTeX 直接依赖声明。
- 消息目录三浏览器定向回归：30 个文件、201 项测试全部通过，无类型错误。
- `ci`：通过。包括 validator check、格式、lint、类型、99 个单元测试文件的 1,241 项测试，
  以及 3 个 Browser smoke 文件的 5 项测试。
- 完整 `test:browser`：并行阶段 171 个文件，1,574 项通过、1 项失败；失败是 Chromium 的
  `ComposerTurnControlPendingInput.browser.test.tsx:770`，抽屉未出现 `Pending message changed`。
  随后单独重跑整个文件，三浏览器 72 项全通过。仅确认未复现，不称该失败已修复。
- 补跑 `test:browser:sequential`：24 个文件、45 项通过、3 项失败；失败均为三浏览器的
  `composer-focus.browser.test.tsx:155`，焦点绘制检查返回 false。全量不能宣称通过。
- 针对该失败的独立只读归因未发现直接影响路径：KaTeX 视觉规则限定 `.katex*`，唯一 `body` 规则
  重置公式计数器；composer fixture 不挂载公式，焦点样式来自未修改的组件。该证据不能排除 CSS
  构建或环境差异，故不把失败归类为已证实的既有问题。精确归因需要基线对照或运行时几何诊断，
  涉及本任务写集合之外的诊断动作，不擅自修改 composer 或其测试。
- Level 2：未执行。本会话工具列表没有 `launch_gui`，已向用户请求当前 `/gui` 完整 URL，尚未提供；
  真实历史/流式、窄屏及长公式验收保留缺口。Level 3 不适用。

任务 02 未执行；任务 01 为已实现并提交、验证尚有缺口，不能将整个计划标记完成。
