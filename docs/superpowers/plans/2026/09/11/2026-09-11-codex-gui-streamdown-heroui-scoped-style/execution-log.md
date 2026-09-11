# 富文本局部 HeroUI 样式执行记录

## 授权与基线

- 2026-09-11：用户确认计划并调用 implement，激活计划实现、验证、审查及当前 dev 本地提交；新增最终一次全套前端测试要求。业务消息发送未授权，可见窗口、远程 Git、依赖安装、后端构建仍禁止。
- 主代理独占产品/测试/本记录写入和 Git index。文档 D-S/D-C 已完成：42c6164c1，仅新版设计和三份计划文件。无分支或 worktree 操作。
- 源码普通内容修改无项目自动迁移工具可表达，使用 patch；格式化使用已有 oxfmt 限定文件入口。
- fnm Node 24.17.0 / pnpm 10.34.5；HeroUI 本地源码（canonical /Users/jiangsheng/GitHub/heroui）及安装版本均 3.2.4，Streamdown 2.6.0。三个 Playwright 浏览器二进制存在。首次预检误查非直接依赖 playwright，改从项目直接依赖 @playwright/test 确认，未安装任何组件。
- 初始 type-check 通过。新测试经已有 CommittedTranscriptSurface 和 projection fixtures；数学已有助手作用域测试继续保留。

## 元素、状态与覆盖边界（I 完成）

| 消费者 | HeroUI 语义 | 局部定位 |
| --- | --- | --- |
| 表头、行内代码 | surface-secondary | Markdown 或 table-fullscreen 内的对应 data-streamdown |
| 代码/表格外框、代码工具栏 | surface-secondary / border | code-block、code-block-actions、table-wrapper |
| 代码正文、表格滚动区、全屏根 | surface | code-block-body、table-wrapper 的直接 table 容器、table-fullscreen |
| 代码标题、辅助按钮、引用 | muted；hover foreground；焦点 focus | 对应标记或已标记控件祖先下的 button |
| 表格复制/下载菜单 | surface / foreground；hover surface-secondary | table-wrapper 工具栏内 button 相邻的菜单容器，菜单项沿该局部结构定位 |

HeroUI border 工具类已有正确语义；无需复制所有边框映射。普通正文继承角色 Card 文字；不强制统一成 foreground。Shiki token 和 pre 高亮主题保留。

## 调度与事件

- 计划节点字段、能力信封、canonical 资源锁、失败域沿用 plan.md。D 完成后 I/T/RED/E/F 顺序消费源码和测试稳定产物；按 TDD 的同一已确认入口逐个切片红绿。主代理唯一编辑者。
- 首次表头测试因 role 查询未命中而失败，不计目标红灯；截图证实表格可见，改为可见文本等待后对真实 thead 断言颜色，再运行 RED。
- 最终全套测试新增 U/B-all/B-sequential/E2E 节点：消费 F 稳定输入，各使用 package.json 原有入口，写入仅工具正常产物；Browser/E2E 共享运行资源串行，Q 与只读 R 可并行。不回写原计划。
- code-review 要求 Standards 与 Spec 双轴独立审查，R 将由两份只读报告汇合，固定比较基线为文档提交 42c6164c1；当前用户技能要求覆盖旧计划单审查节点数量，权限仍只读且禁止再委派。
- V2 等待当前完整 GUI URL及待验收实现；已向用户请求 URL，先推进无依赖自动化。

## 实现与回归证据

- RED：修正可见目标查询后，表头颜色在三浏览器两主题 6/6 失败，收到 muted/80 而非 surface-secondary；局部表头修正后 6/6 通过。
- 第二切片：默认 inline-code 标记缺失 6/6 目标失败，恢复默认组件并补充实际消费者局部样式。修正测试事件输入为既有 fact.payload；该输入错误不计产品红灯。
- 新增测试最终 12/12 通过（Chromium/Firefox/WebKit × 浅深主题），覆盖表头、默认行内代码、代码/表格背景和滚动、引用、工具栏、菜单 hover/focus、全屏 Enter 关闭、流式转静态、挂载/卸载及浮层前后外部 Card/Button/颜色工具类隔离。
- 键盘证据：先真实 Tab 进入键盘模式，再原生 focus 目标并断言轮廓和 Enter 激活；不据此声明 Tab 顺序或可达性已验证。此前测试错误假定 WebKit 原生按钮的默认 Tab 行为，已纠正。颜色过渡的中间帧不属于最终颜色契约，使用已有 disableMotionForTest（finally 恢复），保留全部颜色/焦点/布局断言。
- 初次全部受影响文件结果 118 通过、2 失败，失败限新测试的 WebKit 键盘入口；旧 6 个文件 108/108 通过。最终测试修正后将由全套 Browser 覆盖同一 7 文件。
- type-check 初始、实现后和最终均通过；最终全局 oxfmt 通过。全量 unit 99 文件、1,241 测试通过。
- 前端 build 通过，仅既有大 chunk 提示；未运行后端构建。构建 CSS 核查 bg-background 仍消费 --background，bg-muted/text-muted 仍消费 --muted；新增覆盖全部保留 Markdown/table-fullscreen 前缀。Streamdown 自身 caret 变量为既有样式，不是全局颜色映射。
- 全局 lint：Oxlint 通过，ESLint 7 个 no-meaningless-void-operator 错误，位于 composerInterruptState.test.ts（43、46）、composerSteerQueueState.test.ts（64、71、72、75）、composerTurnControlPendingInputBrowserTestSupport.tsx（125）。与基线比较这些文件无 diff；未修范围外文件，也未记为通过。

## 独立 code-review

### Standards

首次审查及测试修正后的有界复核均未发现已证实规范违反或需要整改的代码异味。使用已标记祖先定位无标记菜单，结构依赖有说明和行为回归。复核确认测试修正保留颜色、焦点与键盘激活契约，但不代表 Tab 顺序证据。

### Spec

未发现已证实实现缺陷或范围扩张。指出代码工具栏缺少直接文字/hover/焦点断言后，主代理补齐，独立复核确认缺口已闭合。排除 skeleton 疑点：仅未启用 customRenderer/Mermaid 使用无标记 skeleton，普通代码 fallback 使用带标记 CodeBlockBody。

审查者均只读，无编辑、测试、Git 写或再委派；主代理核对关键引用。审查与主线程 Browser/质量验证存在实际时间重叠；后续测试修正待前次审查返回后执行，复核读取新稳定输入。两个轴的审查通过不替代全局质量门禁或真实 GUI。

## 全量验证与当前门禁

- Browser parallel：174 个项目文件实例，1,598 通过、25 失败，类型无错误。新增主题文件及计划全部受影响文件 120/120 通过。失败为 AppProjectionAvailability 和 HistoryPreviewChatLayout 各 12 个布局断言（4px，要求 ≤1px），以及 Chromium ComposerPendingInputProvider 的编辑遮罩确认用例无法找到 alertdialog。相关失败文件与基线无 diff；未复跑基线，不声称已动态证明全部是既有失败。
- Browser sequential：27 个项目文件实例，57/57 通过，类型无错误。
- E2E：完整 test:e2e 共 111 个，108 通过、3 失败；三浏览器均在 app.spec.ts:264 的移动布局用例因 main > .surface.task-reading-boundary 匹配 0 个而失败（第 285 行）。PLAYWRIGHT_HTML_OPEN=never，使用既有无头配置和模拟 GUI-host；不属于真实业务消息发送或 Level 2。
- Q 仍受 7 个范围外 ESLint 错误阻断；依计划第 61、103、105 行，S1/C1 尚未解锁。未暂存代码、未通过降级或豁免把检查记为成功。
- Level 2：当前没有新完整 URL；工具目录未提供 launch_gui。playwright-cli list --json 只读确认旧专用 streamdown-acceptance 会话 headed=false、persistent=false；未复用旧 token 导航，也未把旧页面当成本次实现证据。等待当前入口和运行时后验收。真实流式、当前页面交互及其全部要求均未执行。
- Level 3 不适用，未打开可见窗口。没有安装依赖、后端构建、远程操作或主动修改项目外非临时资源。

## 实际调度

- 实际并行：两个只读审查轴与 Browser/质量检查重叠；全量 unit 与前端 build 重叠；最终 Browser parallel 与 type-check/lint 重叠。
- 关键路径：独立文档提交 → 元素清单 → 两轮目标红绿 → 静态样式/键盘测试前提修正 → 完整受影响覆盖与双轴审查 → 全量 Browser/顺序/E2E → 全局质量提交门禁与真实 URL。
- 未立即启动的 ready 节点：后续 Browser/顺序/E2E 等待同一 checkout 的 Browser runner 资源释放，释放后按序启动；源码修正等待所有审查/验证消费者返回，避免 mutable diff；没有其他无理由延迟。S1/C1、V2 尚未 ready，分别缺通过证据和当前 URL。

全部当前可执行验证已收齐，按计划“记录提交可保存限制”形成独立记录提交；它不解锁 S1/C1 或 FINAL。代码保持可审查的工作树 diff，仅两份产品源码和一份新增测试。下一步需要用户明确选择是否在保留范围外失败记录的前提下提交该实现，并提供当前完整 GUI URL；未取得这两项输入前，不声称计划完成。

## 2026-09-11 后续提交与真实 GUI 部分验收

- 用户随后明确要求提交，实现已形成独立提交 `262a050f3`；本次开始时 HEAD 为该提交，工作区干净。以上提交前门禁描述保留为历史事实，范围外检查失败仍未修复或豁免。
- 用户本轮提供完整任务 URL 后，使用专用 `streamdown-acceptance` 会话访问该原始地址；会话明确 `headed=false`、`persistent=false`，未打开可见窗口。记录不保存访问 token。
- 页面标题为“查找前端测试过滤支持”，显示已完成轮次、代码块和表格。运行时样式表包含本次 Markdown/table-fullscreen 局部规则，默认 inline-code 标记存在；此证据确认相关实现已加载，不代表运行时提供了完整 Git 身份证明。
- 浅深主题分别检查 1440px 和 390px 宽度：页面 scrollWidth 与 viewport 一致；表头及默认 inline-code 为 surface-secondary，代码正文为 surface。浅色表头为 `oklch(0.9524 0.0013 286.37)`，深色为 `oklch(0.257 0.0037 286.14)`。无行号，inline-code 的 white-space 为 pre-wrap；块代码保持默认 pre。
- 390px 深色场景，代码容器 clientWidth=306、scrollWidth=1077，真实鼠标横向滚动后 scrollLeft=300，document scrollLeft=0。现有表格宽度为 306，未发生横向溢出，因此不计为宽表格实际滚动证据。
- 代码下载产生 file.sh（415 bytes）；CSV 菜单经 Enter 激活产生 table.csv，检查文件具有当前表格标题和数据行。产物仅保存在系统临时目录。
- 浅深主题菜单背景为 surface，悬停项为 surface-secondary；等待颜色过渡完成后读取最终值。CSV 键盘焦点可见，outline 为 2px，offset=-2px。全屏退出按钮在键盘模式下焦点可见，Enter 能关闭。部分目标由原生 focus 指定，不宣称完整 Tab 遍历顺序已验证。
- 浅深主题 × 两种宽度均打开、关闭表格全屏：portal 根背景为 surface，表头为 surface-secondary，宽度匹配 viewport；真实输入区的文字和背景计算值在全屏前、期间、关闭后相同。这是输入区隔离证据，不泛化为所有外部 HeroUI 组件或工具类均已在 Level 2 验证。
- 当前页面 isSecureContext=false，navigator.clipboard 不存在，复制按钮未显示。仅验证能力受限环境；可用剪贴板的复制成功场景未执行。
- 控制台 0 errors、1 warning：WebSocket 在连接建立前关闭。页面已呈现真实记录和空闲输入区，但本轮没有发送消息或验证实时传输，不能据此判定该 warning 对实时场景无影响。
- 未执行：真实流式到静态、公式滚动、溢出宽表格滚动、全部角色和完成思考样式矩阵、可用剪贴板复制、所有外部组件及全局工具类的完整隔离矩阵。页面缺少相应内容或运行状态；没有发送未经授权的业务消息，没有用 fixtures 替代真实内容。
- Level 2 结论为部分通过，整个计划尚未完全验收。Level 3 不适用。此次仅追加执行记录，不修改产品代码，不重复全套测试。

### Local 地址复制验收补充

- 用户随后提供同一已有内容任务的完整 Local 地址。专用无头会话访问后，isSecureContext=true，代码和表格复制按钮均显示。对该临时浏览器上下文授予该 origin 的剪贴板读写权限后，通过真实按钮执行复制。
- 初次代码读取长度为 0，不计为有效复制证据。将代码滚入视口并等待非空内容后重新执行：复制结果与当前代码 textContent 完全一致，341 字符。表格选择 CSV 后，剪贴板结果为 166 字符，包含实际表头及数据行。
- 本次补齐可用剪贴板环境下的代码和 CSV 复制证据；LAN 非安全上下文结果仍成立。未发送消息，真实流式、公式及溢出宽表格等此前缺失场景仍未执行。
