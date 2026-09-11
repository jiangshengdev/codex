# Streamdown HeroUI 主题执行记录

日期：2026-09-11

状态：实现已提交，自动化和独立审查已执行；全局检查存在范围外失败，真实 GUI 已完成现有静态内容验收，流式及缺失内容场景待验收，计划尚未完成。

## 授权与调度

用户通过 `implement` 明确要求开始实现并在当前分支提交。目标和产品边界继续采用已确认设计；不修改后端、依赖、安全或角色语义。执行上下文为 `/Users/jiangsheng/cnb/codex` 的 `dev` 分支，主代理是源码、执行记录及 `.git/index` 的唯一写 owner。

原计划节点的读取、编辑、格式化、验证和本地提交能力在各自边界内激活；节点成功后到期。特殊目标审批不适用，不操作项目外主动状态、远程、force 或可见窗口。真实 GUI 业务消息写入没有授权，不发送消息。

本轮显式使用的 `implement` 增加最终全量测试及 `code-review` 审查要求：最终增加全量 unit、Browser parallel/sequential、E2E 节点，审查采用两个只读节点（规范、设计），仅消费稳定代码提交。它们可以读取本项目、适用规则及只读本地依赖源码，不能编辑、运行测试、stage、commit 或再委派；完成即到期。原计划不委派实现的边界保持不变。

所有执行节点继承计划的字段和最小能力信封；新增验证节点的主动 writeSet 为空，允许权威测试工具自动产物。Browser runner 在本 checkout 独占；质量检查与 Browser 消费相同稳定源码，可以并发；编辑和格式化期间不运行消费源码的验证。完整测试和只读审查汇入最终完成检查。未满足全局质量或真实验收时不能声明计划完成。

## 已完成事件

- D-S / D-C：精确暂存并检查四份设计与计划文件，独立提交 `d894eed7a`。提交前工作区仅有这些文档，分支为 `dev`。
- T1-R / T1-RED：新增 `MarkdownTheme.browser.test.tsx`，穿过现有 transcript 生产入口和 projection fixtures。首次测试查询 columnheader 失败，截图证明表格已渲染；改用可见文本定位后，六个浅深主题断言精确复现 muted 前景色被当作背景的问题。环境/查询失败不计入红灯证据。
- T1-E：使用作用域变量集中映射背景和 sidebar，补齐 muted-foreground；包含 body portal 的 table-fullscreen。HeroUI 的原始 `--muted` 保持不变。原有段落、代码行和数学 CSS 保留。
- 第二个垂直切片：先断言行内代码没有额外边框，六个用例得到实际 `1px`、期望 `0px` 的红灯；再移除唯一自定义 inlineCode 组件，六个用例转绿。
- 扩展验证：静态、流式转静态、390px 代码及表格局部滚动、默认无行号、工具栏文字、全屏表格与完成思考的次要文字/斜体。新增文件最终 18 个浏览器用例通过。
- T1-F：使用项目已安装的 Oxfmt 对三个明确修改文件格式化。package script 固定包含 `.`，不能限定写入范围，因此直接调用同一安装版本的 `pnpm exec oxfmt --write <三个文件>`。测试中无用引号转义由同一 Oxlint 的限定文件 `--fix` 修复；没有手动模拟格式化或自动修复。
- T1-B / T1-Q 并发：首轮七个受影响 Browser 文件收集 126 个用例，125 通过、Firefox 键盘关闭用例一次失败；随后核对 Vitest provider 的 iframe 聚焦实现，在发送真实按键前显式聚焦测试 iframe，保留关闭断言，新增文件 18 个用例通过。全局类型检查通过，格式检查通过，修改文件的 ESLint 通过，Oxlint 通过。
- 最终 unit：99 个文件、1241 个测试通过，无类型错误。
- 最终 Browser parallel：174 个浏览器文件实例，1605 个测试通过、24 个失败，共 1629 个；没有类型错误。失败仅来自下述两个布局文件，本次七个受影响文件的全部 126 个测试通过，包含新增主题文件的 18 个用例。
- 最终 Browser sequential：27 个浏览器文件实例、57 个测试全部通过，没有类型错误。
- 最终 E2E：111 个测试，108 通过、3 个失败；三个浏览器均无头，HTML reporter 未打开窗口。用例使用测试 harness，不属于真实运行时验收。
- T1-S / T1-C：按用户本轮明确的本地提交要求，精确暂存三个源码/测试文件，检查 staged diff 后提交 `f1cf417a9dc27c92db6bee1ff1113505a03aa5eb`。没有 amend、纯重排或范围外修改。该提交保存可审查实现，不代表 T1-Q 的全局 lint 或 FINAL 已通过；完整验收门禁继续保持未满足。
- R-STD / R-SPEC：分别由只读审查节点审查 `git diff d894eed7ade260ac3585d2b9e45dadbc4bf5e391...f1cf417a9`，与 E2E 执行重叠。规范审查 0 项违规、0 项需报告异味；设计审查 0 项确定源码缺陷，明确指出 Level 2 尚未执行。主代理核对了 scope、portal、完成思考继承和默认组件引用。两个节点均未写文件或运行验证，结束后能力到期。

## 失败与限制

全局 ESLint 有 7 个 `@typescript-eslint/no-meaningless-void-operator` 错误，位于以下未修改文件；与文档提交基线的 diff 为空。它们使用 `void` 保留类型测试引用，与本次 CSS 和 inlineCode 删除没有调用依赖；没有扩大范围修复，也不将全局 lint 记录为通过。

- `codex-gui/src/features/composerInputQueue/__tests__/composerInterruptState.test.ts`：43、46 行。
- `codex-gui/src/features/composerInputQueue/__tests__/composerSteerQueueState.test.ts`：64、71、72、75 行。
- `codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlPendingInputBrowserTestSupport.tsx`：125 行。

Streamdown 2.6.0 默认全屏表格内部容器的 keydown stopPropagation 会阻止焦点在关闭按钮时的 Escape 传播到 document listener。主题实现没有更改此行为；新增测试改为验证原生关闭按钮的 Enter 激活。不能据此宣称 Escape 已修复。

Browser parallel 的 24 个失败是 `AppProjectionAvailability.browser.test.tsx` 和 `HistoryPreviewChatLayout.browser.test.tsx` 的页面区域对齐断言，三个浏览器均得到 `4`、要求不大于 `1`。两个测试文件与文档提交基线没有 diff；既有 `composer-frame` 的 `p-1` 及包裹 `.composer-panel` 的结构在该基线中已存在，提供了 4px 内缩的一手源码证据。本次只修改主题颜色和行内代码，不修改该结构或间距。未另建基线 checkout 重跑，不能把源码归因写成已完成的基线动态复现。

E2E 的三个失败均是 `e2e/app.spec.ts:277` 的窄屏布局用例找不到 `main > .surface.task-reading-boundary`。实际页面已采用 `CurrentTaskPage.tsx` 的 `main.task-page` 结构；该 E2E 文件和页面结构未被本次修改。不删除断言、改选择器或放宽容差掩盖失败，范围外修正需另行授权。

## 完成与剩余依赖

本轮源码实现、红绿回归、定向质量检查、全量测试执行和独立审查均已完成并保留证据。全局 lint、Browser 与 E2E 的失败没有修复，因此全局质量门禁不通过。执行记录按独立文档提交保存，不能称为成功验收记录。

T2-V 及 FINAL 仍未解锁。没有额外 ready 的无依赖实现或验证节点；进一步修复上述队列类型测试及页面布局测试会超出已确认修改集合。

Level 2：已请求用户提供当前 `/gui` 完整 URL，目前未取得；所有真实运行时场景未执行。不能复用旧 URL、猜测 token、以 Browser fixtures 或 E2E 替代真实流式验收。

Level 3：不适用，未打开可见窗口。

实际运行的日志位于系统临时目录：`/tmp/streamdown-theme-unit.log`、`/tmp/streamdown-theme-browser.log`、`/tmp/streamdown-theme-sequential.log`、`/tmp/streamdown-theme-e2e.log`。测试框架自动产生的失败截图和报告没有暂存或提交。本记录不包含真实访问 token。

## 真实 GUI 续验：2026-09-11

用户随后提供当前完整任务页 URL，解除访问前提缺口。主代理继续 T2-V；上述“未取得 URL / 所有场景未执行”是此前检查点状态，由本节更新。源码、依赖及测试没有修改，不重复运行已完成的自动化。只有一个真实浏览器会话需要操作，本轮无独立委派收益，由主代理串行验收并独占该会话及执行记录；不发送业务消息。

工具链入口为已安装的 `playwright-cli`，系统临时目录为工作目录。`list --json` 确认专用 `streamdown-acceptance` 会话为 `headed: false`、`persistent: false`、`attached: false`。真实路由是用户提供的 `/task/` 页，页面标题为“查找前端测试过滤支持”，任务状态为空闲。访问令牌不写入记录。页面加载 Vite 的 `src/main.tsx`，实际 Markdown 的 `--streamdown-muted` 等于 `--surface-secondary`，行内代码边框为 `0px`，证明当前运行时已包含本次改动的可观察行为。

已观察结果：

- 通过浏览器媒体偏好触发真实 `ThemeProvider` 切换浅深主题，分别在 1280px 和 390px 检查；四种组合的文档宽度均等于视口宽度。
- 浅色表头背景为 `oklab(0.9524 0.000366391 -0.0012473 / 0.8)`，深色为 `oklab(0.257 0.00102855 -0.00355417 / 0.8)`；对应 HeroUI 次级表面色及 Streamdown 默认透明度。行内代码无额外边框，段落 `white-space: pre-wrap`。
- 代码容器宽屏 `clientWidth=684`、窄屏 `clientWidth=306`，内容 `scrollWidth=1077`，两种主题均实测 `scrollLeft=100`。真实代码的八个行 span 的 `::before` 均为 `none`。最初使用 `.line` 查询收集零项，不计为证据；核对实际 DOM 后使用 `pre > code > span` 完成验证。截图确认窄屏高亮和无行号呈现。
- 当前表格在 390px 会换行，其内部滚动容器 `overflow-x=auto`，`clientWidth=scrollWidth=306`；页面未被撑宽，但这不证明宽表格实际滚动。
- 表格全屏通过真实按钮打开，portal 不在 Markdown 容器内，浅色背景 `oklch(1 0 0)`、深色背景 `oklch(0.2103 0.0059 285.89)`，两者的局部 muted 均对应次级表面色。关闭按钮可聚焦，真实 Enter 按键成功关闭；指针关闭也成功。本轮没有重验 Escape，不改变此前已记录的上游限制。
- 代码 `file.sh`、表格 `table.csv` 和 `table.md` 均通过真实下载控件产生，下载事件的 `failure()` 均为 `null`；本轮没有逐字比对下载内容。
- 当前 HTTP 页面 `isSecureContext=false`、`navigator.clipboard` 不可用，复制控件按已有配置隐藏；保留能力受限行为通过。可用剪贴板环境的实际复制未执行。
- 查看了现有用户与助手 Card、表格和代码的窄屏截图。完成思考内容仍折叠，没有据此声明完成思考样式的真实验收通过。
- 页面控制台没有 error，初始化出现一次 WebSocket 建连前关闭 warning；随后真实记录与空闲状态可用，不将该 warning 认定为本次样式回归，也不声称已修复。

临时截图为 `/tmp/streamdown-real-light-390.png` 和 `/tmp/streamdown-real-dark-390-settled.png`，未提交。首次深色截图在主题切换和滚动后立即获取，代码区域尚未绘制；稳定后的截图显示完整代码，不以首次截图判定产品故障。

剩余：当前会话没有公式，也没有进行中的流式回复；宽表格实际滚动、公式滚动、真实流式到静态转换尚未执行。已请求是否允许向当前会话发送一条包含长代码、宽表格和长公式的验收消息，明确新增一轮对话和模型额度消耗，收到授权前不发送。此前全局质量失败仍然有效，FINAL 未通过。

实际并行：无。关键路径：当前 URL → 无头真实页面 → 主题/几何/下载/全屏 → 等待真实流式内容授权。未启动 ready 节点：无；缺内容及发送授权的场景尚未 ready。
