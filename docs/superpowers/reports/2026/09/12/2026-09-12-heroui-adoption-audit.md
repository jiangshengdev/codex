# HeroUI 采用情况深度审计报告

日期：2026-09-12。对象：当前 Codex GUI。性质：审计，不是修复设计或实现授权。

## 结论

当前前端确实大量使用 HeroUI React，但**不能认定所有适合使用 HeroUI 的控件都已采用**。应用自身的按钮、导航、抽屉、诊断、队列管理、分页和反馈基本采用了 HeroUI；确定的采用缺口集中在 Streamdown 代码操作、表格菜单与全屏控制，以及当前线程状态徽标。另有发送、取消、历史恢复等动作的 variant 语义偏差。Chrome 隔离验证还实际复现了表格全屏焦点泄漏、内部 Escape 无效、下载菜单键盘行为缺失与部分剪贴板能力下的无反馈路径。

Lexical 编辑器本体与候选菜单有可核实的模型、选择、键盘和焦点所有权理由，列为合理例外。历史整卡链接和待发送项视觉容器列为适配候选，不将原生结构机械判错。旧候选全部重新裁定，未沿用此前报告的强结论。

运行证据包含类型检查、定向 Browser、完整单元/Browser/E2E 测试。完整 Browser 出现失败，真实应用 Level 2 尚缺当前完整 GUI URL；因此本报告不宣称完整运行验收通过，也不把源码判断冒充浏览器复现。

## 基线、范围与判据

| 项目 | 本轮核验结果 |
|---|---|
| 产品基线 | `dev`，`26200a1ca5c3e1327a3f07a7c2b96963a05349c7`；开始时产品工作树无修改 |
| 工作文档提交 | `1d82ed2b3`，独立提交规格、计划与 6 个本地任务；未修改原计划正文 |
| HeroUI | `pnpm-lock.yaml` 解析 `@heroui/react` / `@heroui/styles` 均 `3.2.4` |
| 匹配源码 | 逻辑路径 `/Users/jiangsheng/cnb/heroui`，canonical `/Users/jiangsheng/GitHub/heroui`，HEAD `1d2164e7b9a60221e39501081f0fe4f6c564bccf`；两个 package 均 `3.2.4`，工作树干净 |
| 其他实际依赖 | Lexical `0.49.0`，Streamdown `2.6.0`，React Aria Components `1.19.0` |
| 依赖限制 | HeroUI peer 声明 RAC `^1.20.0`、react-aria `^3.51.0`，lock 实际连接 `1.19.0` / `3.50.0`（`pnpm-lock.yaml:618,4656`）；当前 package/workspace 文件未见 override。记录兼容性限制，未证明它导致任何测试失败，未改依赖 |
| 工具 | fnm Node `v24.17.0`，pnpm `10.34.5`，Vitest `4.1.11`；已有 Chromium/Firefox/WebKit，无安装 |
| 规范来源 | 用户指定 [Design Principles](https://heroui.com/en/docs/react/getting-started/design-principles) 对应本地 `.heroui-docs/react/getting-started/(overview)/design-principles.mdx`；离线读取，未在线刷新 |

以下前端路径均相对 `codex-gui/src/`，`H/` 指匹配 HeroUI 源码的 `packages/react/src/`，`D/` 指 `codex-gui/.heroui-docs/react/`。第三方 `S` 指 `codex-gui/node_modules/streamdown/dist/chunk-YOKDWASO.js`；该包代码已压缩，引用物理行号并附符号以便复核。

官方原则第 1 节：primary 为推进主动作、secondary 为替代、tertiary 为取消/跳过、danger 为破坏性。第 2 节强调可访问性，第 3 节强调组合，第 7、9、10 节明确允许样式/逻辑分离、定制和包装。`outline`、`ghost`、`danger-soft` 都是当前版本合法 API，合法不等于适合每种动作语义。

本项目严格判据来自已确认规格与 `codex-gui/AGENTS.md`：优先 HeroUI React；自定义实现须有具体适配、语义或性能理由。仅复用 token/variants 不足以直接通过，但不能将本项目偏好称为官方禁止自定义 HTML。

覆盖通过生产入口 `main.tsx:22 → router.tsx:35 → App.tsx:87`，再追至四条页面路由、共享包装、动态菜单和第三方实际构造。原生标签/事件搜索仅用作反向查漏；未以导入数量计算“采用率”。清单按控件族合并重复实例，不宣称每个渲染实例均独立验收。

## 控件覆盖矩阵

### 应用导航与会话访问（T02）

| 控件族 | 源码定位 | 实际采用 / 审计判断 |
|---|---|---|
| 顶栏、菜单、导航关闭与滚动 | `features/appShell/AppShellTopBar.tsx:89,117,128` | Button secondary/ghost、Badge、Drawer compound；已采用 |
| 活跃任务选择、更多、移除 | `features/appShell/ActiveThreadCollectionMenu.tsx:113,139` | Button、Dropdown.Menu/Item、Badge；禁用按 canRemove；已采用 |
| 连接、集合错误、Toast | `features/appShell/ConnectionRecoveryNotice.tsx:14`、`AppShell.tsx:21,67,84` | Alert、RetryActionButton primary、Toast.Provider；已采用 |
| 新会话目录、输入外层 | `features/newSession/NewSessionWorkingDirectory.tsx:15`、`NewSessionPage.tsx:129` | Popover/Button ghost、Surface；编辑器归 T04 |
| 新会话发送与恢复打开 | `features/newSession/NewSessionPage.tsx:110,156` | Button secondary / RetryActionButton outline；发送见 F04，恢复层级见候选 |
| 历史加载、状态、加载更多 | `features/threadHistory/ThreadHistoryListPage.tsx:169,186,267` | Skeleton、Card、Chip、RetryActionButton secondary；已采用 |
| 历史整卡链接 | 同文件 `:213–263` | TanStack Link + cardVariants + Card 子组件；混合采用，见 C01 |
| 历史列表与详情恢复 | 同文件 `:292`、`ThreadHistoryDetailContent.tsx:97` | Alert + tertiary RetryActionButton + secondary 诊断入口；见 F06 |
| 历史详情状态与继续任务 | `ThreadHistoryDetailContent.tsx:49,63`、`ContinueTaskAction.tsx:252` | Typography、Surface、primary RetryActionButton；已采用 |
| 继续任务失败、返回已有任务 | `ContinueTaskFailureAlert.tsx:38,125,157` | Alert 与 secondary Button；已采用，返回已有任务是替代方向 |
| 当前任务载入、刷新、恢复、移除 | `features/currentTask/CurrentTaskPage.tsx:197,260,320,381` | Alert、primary/danger RetryActionButton、Spinner/Surface；已采用 |
| 当前任务连接与投影恢复 | `ConnectionTaskRecoveryNotice.tsx:21`、`ProjectionRecoveryNotice.tsx:34` | Alert + primary RetryActionButton；已采用 |
| 扫码入口与弹层 | `features/qrAccess/QrAccessPopover.tsx:29` | Button tertiary、Popover、Typography、QRCodeSVG；控件已采用，见 F07 |
| 分叉与失败恢复 | `features/threadFork/ThreadForkAction.tsx:42`、`ThreadForkNotice.tsx:25,40,62` | secondary Button、Spinner、Alert、Dismiss tertiary；已采用 |
| 共享重试/诊断/404 | `feedback/RetryActionButton.tsx:17`、`FailureDiagnosticModal.tsx:17`、`NotFoundPage.tsx:16` | HeroUI Button/Spinner、Modal、Link/Typography；不是自制按钮 |

### 输入与待发送管理（T03）

| 控件族 | 源码定位 | 实际采用 / 审计判断 |
|---|---|---|
| 输入外层、Stop、Guide、Send | `features/composerTurnControl/ComposerTurnControl.tsx:193,254,263,277` | Surface；Button danger-soft/secondary/outline、Tooltip；Send 见 F04 |
| 当前线程状态 | `CurrentThreadStatus.tsx:24` | 自定义 span + 圆点；见 F03 |
| 上下文用量、压缩 | `ContextUsagePopover.tsx:49,98` | ghost Button、Popover、ProgressCircle/Spinner、secondary RetryActionButton；已采用 |
| 持久化失败、暂停恢复、未知记录 | `ComposerPersistenceStatus.tsx:25,57,85` | Alert、primary 恢复与 danger 移除；已采用 |
| 队列状态、恢复、入口、计数 | `ComposerPendingInputRegion.tsx:84,115,141`、`ComposerPendingInputDrawer.tsx:379` | Chip、Surface、Separator、secondary Button/RetryActionButton；已采用 |
| 抽屉、关闭、标题、滚动、管理错误 | `ComposerPendingInputDrawer.tsx:190,402` | Drawer compound、Alert；已采用 |
| 分组、预览、分页、长内容展开 | `ComposerPendingInputList.tsx:133,166,230` | section/ul/li 结构 + Chip/Separator、tertiary Button、Disclosure；已采用交互，按需读取正文 |
| 待发送项视觉与焦点容器 | 同文件 `:259` | 自定义 group div、ref/tabIndex；见 C02 |
| 排序、移动到、编辑 | 同文件 `:301,324,356` | tertiary Button、Dropdown.Menu/Item；边界禁用；已采用 |
| 删除确认/Keep | 同文件 `:277,286,366` | secondary Keep、danger Delete、danger-soft 初始删除；已采用 |
| 待发送编辑/保留文字 | `ComposerPendingInputEditor.tsx:65,85`、`ComposerPendingInputDrawer.tsx:250` | Surface、Alert、TextArea readOnly；编辑器归 T04 |
| Cancel/Save、复制/丢弃 | `ComposerPendingInputDrawer.tsx:283,286,293,303` | secondary/primary/secondary/danger Button；Cancel 见 F05 |
| 丢弃确认与恢复焦点 | 同文件 `:105,318`、`ComposerPendingInputProvider.tsx:30` | AlertDialog；安全动作 autoFocus；由业务 session 决定焦点目标，保留编辑有独立宿主 |

### Lexical 集成（T04）

| 控件族 | 源码定位 | 实际采用 / 审计判断 |
|---|---|---|
| 编辑器本体及三处消费者 | `features/composerEditor/ComposerEditor.tsx:119,169,314`；NewSession `:134`、TurnControl `:202`、PendingInputEditor `:67` | LexicalComposer/RichTextPlugin/ContentEditable；合理例外 E01 |
| 技能候选及 portal | `SkillTypeaheadPlugin.tsx:153,217,279` | Lexical Typeahead + 原生 option + HeroUI variants；合理例外 E02，不标为 React 采用 |
| 加载、刷新、错误与重试 | 同文件 `:380–430` | live 文本、FailureLayout、secondary RetryActionButton；交互已采用 |
| 已选技能标记 | `SelectedSkillToken.tsx:235–262` | Chip/Chip.Label、Tooltip；已采用 |
| 技能详情可达性 | 同文件 `:239–241,276–289` | Tooltip trigger 排除 Tab；见 R03，组件采用不等于详情键盘可达 |
| SkillNode 宿主 | `SkillNode.ts:89–112` | Lexical span、文本导出；文档/模型语义合理例外 |

### 对话内容与第三方控件（T05）

| 控件族 | 源码定位 | 实际采用 / 审计判断 |
|---|---|---|
| 中间过程折叠、状态、错误 | `features/committedTranscriptSurface/CommittedTranscriptTurnFragment.tsx:87,146,227` | Disclosure、outline Button、Chip、Alert；已采用 |
| 上下文分页、边界 | `TranscriptContextPagination.tsx:46–118`、`TranscriptContextBoundary.tsx:12` | Pagination compound、Separator/Typography；已采用；横向滚动边界保留 |
| 消息、推理、活动、时间 | `TranscriptEntryRenderer.tsx:79,123,148,168,190`、`TranscriptActivityEntries.tsx:356,423`、`TranscriptTimeLabel.tsx:46` | Card/Chip/Typography；time/内容结构保留 |
| 静态与流式 Markdown | `MarkdownText.tsx:17`、`LiveMarkdownText.tsx:22`、`markdownRendering.tsx:73–118` | 共享 props → Streamdown；未覆写 components |
| 代码复制/下载 | `S:5 ge/It`，实际由 `S:14 Xs` 构造 | 原生 button，含名称、流式禁用、复制反馈；仅样式接入，见 F01 |
| 表格复制/下载菜单 | `S:14 Le/De`，`Xo` 构造 | 原生 button/div，自管展开、点击外部关闭；见 F02、R02、R04 |
| 表格全屏打开/关闭、内部菜单 | `S:14 Wo` | body portal、自管 dialog/body overflow/Escape；见 F02、R01 |
| Markdown 表格、外链、脚注、数学等正文 | `markdownRendering.tsx:32–64,86–91` 与 `S:14` 默认 renderer | 原生文档结构合理例外 E03 |
| Mermaid 控件、图片下载、链接安全弹层 | `markdownRendering.tsx:66–70,91,113,118`，`S:14 Xs` | 未启用 mermaid plugin；img 被过滤；linkSafety 关闭；不纳入实际启用控件遗漏 |

## 确定发现与建议

分级：P2 为影响一组实际交互的一致性或恢复操作层级；P3 为局部语义/呈现一致性。它们是本次审计优先级，不暗示已证实数据丢失或完整无障碍违规。运行风险单独列出。

| ID | 分类 / 优先级 | 证据、影响与建议 |
|---|---|---|
| F01 | 采用遗漏 / P2 | Streamdown 代码复制、下载为原生按钮；`S:5 ge/It`、`:14 Xs`。HeroUI Button 可保留名称、pending/disabled、复制反馈。真实 seam 为 `components.code` + 公开 CodeBlock 的 actions children（`S:4–5 Tt`、`:36 components 合并），不是在原生按钮里嵌套按钮。保留高亮、meta、incomplete 与流式禁用，不改 transcript 分块。 |
| F02 | 采用遗漏 / P2 | 表格菜单与全屏控制完全自管（`S:14 Le/De/Wo/Xo`）。适合局部 `components.table` 接管唯一 toolbar/弹层 owner，采用 Dropdown 与 Modal，保留原生 table children、公开序列化函数、300px 表格滚动和全屏滚动。`H/components/dropdown/dropdown.tsx:35–124`、`H/components/modal/modal.tsx:103–211` 与 `D/components/(overlays)/modal.mdx:202,266` 提供真实能力证据。 |
| F03 | 采用遗漏 / P3 | `CurrentThreadStatus.tsx:24–35` 自建紧凑状态徽标，缺少专有模型/性能保留理由。Chip 支持同类状态圆点（`D/demos/en/chip/statuses.tsx:8`），`H/components/chip/chip.tsx:38–64` 透传 role/aria。建议 Chip/Chip.Label，保留映射与 live 语义；当前 ARIA 未因此被证明失效。 |
| F04 | 动作语义 / P3 | `ComposerTurnControl.tsx:277`、`NewSessionPage.tsx:156` 的主要 Send 使用 outline；Guide secondary、Stop danger-soft 已有区别，Send 未体现 primary 推进意图。建议评估 primary；outline 合法，不能报 API 错误。 |
| F05 | 动作语义 / P3 | `ComposerPendingInputDrawer.tsx:283` 显式 Cancel 使用 secondary，与同区域 Save primary 对照，应使用 tertiary 的取消语义。不要连带改动确认框的安全返回焦点。 |
| F06 | 恢复层级 / P2 | `ThreadHistoryListPage.tsx:299`、`ThreadHistoryDetailContent.tsx:104` 恢复重试使用 tertiary，旁边诊断入口为 secondary（`FailureDiagnosticModal.tsx:19`）。恢复职责不是取消/跳过；初次恢复建议 primary，保留内容时的分页重试可 secondary，避免机械统一。 |
| F07 | 辅助动作语义 / P3 | `QrAccessPopover.tsx:30` 打开扫码功能使用 tertiary，并非 dismissive。可按辅助入口语境采用 ghost/secondary；二维码本体不是遗漏。 |

`index.css:103–174` 的局部 surface、border、hover、focus-visible 和 body portal 样式证明视觉接入，但不能补充焦点圈定、菜单键盘或 React 组件采用，因此不能消除 F01/F02。

## 适配候选与合理例外

- **C01 历史整卡链接：官方认可的混合采用，严格标准下待验证。** `D/components/(layout)/card.mdx:170–185` 明示锚点 + cardVariants；TanStack 保留实际路由与单一锚点。CardRoot 是 `dom.div`（`H/components/card/card.tsx:27–64`），`H/utils/dom.tsx:20–30` 要求 render 保持预期元素，不能声称直接 render 成锚点已被支持。外层 Link + 内层 Card 的组合仍可能成立，须验证整卡 focus/hover/尺寸与 SurfaceContext，不能把“路由必须保留”扩张为“Card root 永远不能用”。
- **C02 待发送项视觉容器：低优先 Card 候选。** `ComposerPendingInputList.tsx:259–269` 自建边框圆角 group；Card transparent 保持 div 且透传 ref/role/tabIndex，不注入 SurfaceContext。源码未证明一定需要自建，但它也有焦点/分组职责，先核验尺寸与焦点后决定，不把普通 div 批量替换。
- **C03 其他按钮层级：已采用，需结合语境。** Edit/Move/Show more/Disclosure 多用 tertiary；Keep/Return to edit、分叉恢复打开、新会话 unknownHandoff 打开用 secondary。重复弱操作、安全替代和主恢复需分别判断，不按通用表批量报错。
- **E01 编辑器本体保留。** SkillNode、光标中间替换、撤销、组合输入与结构化草稿依赖 Lexical；HeroUI Input/TextArea 不承担该模型。TextArea 只用于已经只读的保留内容，当前分工合理。
- **E02 候选菜单保留，理由不只是样式。** `SkillTypeaheadPlugin.tsx:105–120,153–165,217–261` 消费 Lexical query replacement、selectedIndex、唯一 active descendant 和滚动。安装 Lexical `src/shared/LexicalMenu.tsx:351–394,470–584,628` 拥有选择、键盘与 listbox anchor，内层 `ul role=presentation` 不是漏掉 listbox。HeroUI Autocomplete 实际是 Select + SearchField；ListBox 包装 RAC collection/useListState/useOption。实际 RAC `dist/private/ListBox.mjs:75–103,145–151,317–324` 会引入另一状态管理层；公开 ListBoxProps 未暴露底层 shouldUseVirtualFocus，虽底层确实支持虚拟焦点。未证明直接替换能保留单一 owner，未来只能以独立原型闭合，不能增加双向同步层来满足表面采用。
- **E03 内容与性能边界保留。** main/section/article/time、Markdown AST table/headings/links、数学、QRCodeSVG、SkillNode span、滚动 sentinel、portal 几何宿主、分块/按需 Disclosure 都不是待替换的普通操作控件。导航装饰圆点有 aria-current/名称补充，不按独立状态 Chip 漏项处理。
- **E04 HeroUI render 不是遗漏。** `ComposerTurnControl.tsx:265` Guide 的 `<button {...props}>` 由 HeroUI Button 管理，保留快捷键属性；共享 RetryActionButton 也直接返回 HeroUI Button。

## 行为发现与未闭合证据

| ID | 已证实源码事实 | 尚未验证 / 影响 |
|---|---|---|
| R01 | `S:14 Wo` 自建 aria-modal dialog，没有焦点移入、圈定和恢复实现；内部 presentation 容器对 keydown stopPropagation，外层/document 才监听 Escape | **P2，已在 HeadlessChrome 153 隔离组件实测**：打开后焦点留在后台触发器，Tab 移到后台 After audit，Shift+Tab 返回后台触发器；内部关闭按钮获焦后 Escape 不关闭，点击关闭后焦点落在 body。Firefox/WebKit 同场景及真实应用未验证 |
| R02 | `S:14 Le/De` 是按钮集合，没有 menu/aria-expanded/aria-haspopup 或方向键/Escape 处理，只监听 mousedown outside | **P2，已在 HeadlessChrome 153 实测下载菜单**：打开后焦点留在触发器，ArrowDown 不移动，Escape 后 CSV 项仍存在；expanded/haspopup 均 null。原生按钮仍可 Tab/Enter 激活，不夸称完全不能键盘使用。复制菜单共用同类实现，但未逐项重复键盘运行 |
| R03 | `SelectedSkillToken.tsx:239–241` Tooltip trigger `tabIndex=-1`；现有 Presentation 测试 `:116–165` 明确断言 Tab 跳过且不出现 tooltip | 技能主体名称仍有宿主 group 的 aria-label；描述/来源/路径等额外详情是否有等效键盘路径未闭合。不要为 Tooltip 直接破坏 Lexical 编辑焦点模型 |
| R04 | 应用仅探测 secureContext + clipboard.writeText（`markdownRendering.tsx:73–79`），表格复制 `S:14 Le` 实际调用 clipboard.write + ClipboardItem；默认调用者不提供 onError | **P2，已在 HeadlessChrome 153 页面内模拟 API 实测**：writeText-only 下代码复制成功，选择表格 CSV 后无写入且菜单仍开、无错误反馈；补齐模拟 write 后收到正确 text/plain 与 text/html，菜单关闭。没有写系统剪贴板；真实环境支持率/权限未验证，HeroUI 替换不会自动修好 |

`MarkdownCopyControlsAvailable.browser.test.tsx:4–10,51` 只 stub writeText 并检查表格复制存在；`MarkdownCopyControlsMissingClipboardWrite.browser.test.tsx:14–26` 实际是空 clipboard 隐藏代码复制，不覆盖 R04。`MarkdownScopedStyles.browser.test.tsx:210–217,250–264` 使用程序 focus 检查 outline、Enter 关闭，不能代替真实 Tab 到达、自动焦点圈定和恢复。本轮已用下述独立隔离交互补齐关键证据；未将其写成已新增回归测试。

## 运行验证记录

下表项目测试命令在 `codex-gui` 使用 `/opt/homebrew/bin/fnm exec --using-file pnpm run ...`；补充交互使用下文的 playwright-cli。前端配置 `vitest.browser.shared.config.ts` 与 `playwright.config.ts` 明确 headless；E2E 设置 `PLAYWRIGHT_HTML_OPEN=never`。没有可见窗口、依赖安装、后端构建或真实业务写入。E2E 的 WebSocket 由项目既有 harness 拦截，是 Level 1，不是真实 Codex 后端。

| 层级 / 命令 | 本轮实际结果 |
|---|---|
| 类型：`type-check` | 通过，tsc -b --noEmit |
| 定向 Browser：`test:browser:parallel --run`，AppRouting、ComposerEditorTypeaheadSelection、ComposerPendingInputProvider、MarkdownScopedStyles 四个完整文件 | 三引擎共 12 个测试实例文件、108 项通过；无类型错误 |
| 完整单元：`test:unit` | 99 文件、1250 项通过；无类型错误 |
| 完整 Browser：`test:browser` 的 parallel 阶段 | 192 个实例文件中 189 通过、3 失败；1713 项中 1709 通过、4 失败；无类型错误；脚本退出 1，因此未自动执行 sequential |
| 补足完整 Browser：`test:browser:sequential` | 27 个实例文件、57 项通过；无类型错误 |
| 完整 E2E：`test:e2e` | 三引擎 111 项通过（1.1 分钟）；项目现有模拟 host，不代表 Level 2 |
| 失败文件定向复核：`test:browser:parallel --run`，Provider、MarkdownScopedStyles、ComposerEditorLifecycle 三个完整文件 | 三引擎 9 个实例文件、60 项通过，无类型错误。结果随执行范围不同而变化；不覆盖完整运行失败，不证明根因或已修复 |
| 补充 Level 1：生产组件隔离无头交互 | HeadlessChrome 153；复现 R01/R02/R04，代码/CSV 下载内容正确，QR Tab→Enter 打开→Escape 回焦点通过；方法与边界见下 |
| Level 2 真实应用 | 未执行：当前工具没有 launch_gui，尚未取得本次 /gui 完整 URL；已请求该信息，不拼接或复用历史 URL |
| Level 3 可见桌面 | 本轮排除，未执行；未以无头结果替代 OS/IME 等可见桌面证明 |

完整 Browser 失败明细（保留失败，不以复跑覆盖）：

1. `ComposerPendingInputProvider.browser.test.tsx:85`：backdrop 点击后未出现 alertdialog；同文件先前定向通过，失败后完整文件三引擎复核也通过。当前保留的摘要未完整记录此次失败引擎，不按历史记录补写。
2. Firefox，`MarkdownScopedStyles.browser.test.tsx:254`：light/dark 两项，全屏菜单 CSV 程序 focus 后 outlineStyle 为 none，预期 solid；先前定向通过。
3. Firefox，`ComposerEditorLifecycle.browser.test.tsx:140`：40 次 ArrowUp 后 line 0 未满足可见性断言。未据此假定是编辑器、测量层或并发根因。

这些是本次原样代码的实际失败，不是本轮修复对象。报告记录受影响行为和证据缺口；未放宽断言、重写基线、添加 skip 或对产品作修复。

### 独立隔离交互的复现方法与结果

为补足现有测试缺少的行为，在既有前端入口启动 `CODEX_GUI_VITE_HOST=127.0.0.1 CODEX_GUI_VITE_PORT=5187 /opt/homebrew/bin/fnm exec --using-file pnpm run dev --strictPort`。`playwright-cli -s=heroui-audit open http://127.0.0.1:5187/` 创建独立非持久会话，`list --json` 确认 `headed:false`。此 URL 是本轮隔离 Vite 页面，不是猜测的真实 GUI URL。

通过 `run-code` 在页面内导入 Vite 提供的生产 `MarkdownText.tsx`，挂载于独立 React root，前后各放一个普通按钮用于观察焦点逃逸；隐藏原 404 根界面。输入为 JS 代码 `const answer = 42;` 及两列表格（Name/Value、Audit/42），使用生产 CSS、Streamdown 和共享 props，未修改仓库源文件或新增产品测试接口。

1. 点击 View fullscreen，读取 activeElement；真实 Tab/Shift+Tab 验证后台可达。为单独定位内部 Escape 事件路径，明确程序 focus 内部 Exit fullscreen，再按 Escape；dialog 数仍为 1。点击关闭后 activeElement 为 body。此内部 focus 是探针，未冒充键盘自然到达。
2. 点击 Download table，读取 aria 属性，按 ArrowDown/Escape，CSV 仍可见。选择 CSV 等待真实 download 事件，结果 `table.csv`、failure=null；内容为 BOM + `Name,Value\nAudit,42`。代码下载 `file.js`、failure=null，内容为 `const answer = 42;\n`。程序下载产物位于 `.playwright-cli/`，未暂存。
3. 用页面内 `navigator.clipboard` 模拟替换避免系统剪贴板副作用。仅 writeText 时，代码复制捕获正确文本；表格 CSV 不产生新调用。增加 write 实现后等待捕获完成，验证 `text/plain` 为 `Name,Value\nAudit,42`，`text/html` 为实际表格 HTML，菜单关闭。该证据证明应用序列化与 API 选择，不证明 OS 剪贴板权限。
4. 单独挂载生产 QrAccessPopover，使用虚构 token、fixture threadId 与 I18nProvider。真实 Tab 到触发器、Enter 打开、Escape 关闭并回到触发器均通过；390×844 下弹层观察边界约 x=20、y=44、宽259、高342，处于视口内。尺寸为当次动画观察值，不作为稳定布局基线。

预览挂载曾因未使用 Vite 相同版本查询的 Lingui 模块导致 provider identity 错误；根据实际服务的模块 import 修正后场景才开始执行，此错误属于探针环境，不计产品失败。早期 ReactDOM import 默认导出识别错误同理。验证完成后关闭本轮 browser session 并停止 Vite；没有连接真实 host、修改真实队列或系统剪贴板。动态 JSON 原始结果位于本轮工具对话（chunk `8de938`、`8104e3`、`95fe20`、`edee05`），本节保存其步骤与关键观察；没有另存完整 run-code 日志，不能从初始 snapshot/console 单独还原全部交互。

剩余边界：上述新探针仅覆盖 Chrome，Firefox/WebKit 完整对应交互未新增；R03 的等效键盘详情路径、真实应用 Level 2、OS 剪贴板权限仍未闭合。所有运行失败与未验证项保留在结论中。

## 执行与复核

用户后续 implement 明确启动已确认工作，结束了原计划“仅落盘、未开始”的门禁；本次仍只审计。其收尾完整测试与本地提交要求用于本轮交付，未扩张成产品修复。T01 主代理核对版本、生产路由、隔离验证入口与唯一分区归属；T02–T05 四个只读分区独立返回证据，主代理核对关键源码后汇合 T06。

浏览器 runner、浏览器共享状态由主代理独占调度，分区子代理没有写入、测试、Git 或继续委派能力。四分区实际发生并行重叠；关键路径为文档提交 → T01 → 分区源码/串行验证 → T06 报告与独立复核。没有因任务编号搁置 ready 分区；顺序测试在 parallel 失败释放 runner 后运行。原计划和任务文件保留历史状态，本节承载本次执行事实。

首轮独立 Standards 复核无发现；Spec 复核指出第三方键盘/焦点/复制下载与 QR 行为只部分满足，因此插入上述隔离验证节点并补充实证。最终 Standards 复核无硬违规，要求收窄“全部 pnpm”表述，已修正；其下载内容独立读取通过，其他动态结果对照本轮工具输出摘要核验。最终 Spec 复核无新增可执行发现，认可审计报告交付，保留运行验收缺口。两轴均未重新运行测试，不将复核声明等同于独立重现全部动态场景。

T01–T06 的审计交付已完成；完整运行验收未通过，失败与缺口如上。最终只提交报告；不发布外部 issue、不执行 Git 远程操作。报告中 F/R/C 项是后续工作输入，不自动启动下一轮修改。
