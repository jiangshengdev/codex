# B10 输入操作与界面控制评审

日期：2026-09-08。

代码基线：`63762612e56d332f474a5ba3861b22be761f0479`。调查节点：`I-B10-1`；报告节点：`E-B10`。

## 范围与结论

主覆盖 `codex-gui/src/features/composerTurnControl/**` 的 37 个实现与测试文件，均已全文读取；逐文件归属见 [覆盖与进度清单](./coverage-and-progress.md)。本批没有排除文件。只读追踪了直接关联的 live session 编辑能力、attach 生命周期与当前任务挂载入口；关联读取不代替这些文件所属批次的主评审。

本批未确认独立新增缺陷或单列可维护性建议。已从界面消费者闭合 [QR-B03-001](./batch-03-sessions.md)：普通运行增量使待发送编辑能力过期，保存失败后界面销毁未保存修改。该确定缺陷统一为 P2，正文和整改交接归 B03，本批不重复计数。原排队消息保留，但本次编辑的新输入丢失。

以下源码位置均相对仓库根。阅读现有测试属于静态证据，不表示测试已运行或通过。

## 七维检查

| 维度 | 检查结论与依据 |
| --- | --- |
| 行为正确性 | `composerTurnApplication.ts` 将普通发送、Guide、恢复与停止投影为统一控制状态；仅 accepted 后清除匹配 capture。待发送编辑的跨模块保存缺陷见 QR-B03-001。 |
| 状态与生命周期 | 提交 latch 在调用角色前设置，owner generation 隔离旧解锁回调；抽屉区分 preparing、active、closing，语义焦点效果携带 generation。`ComposerPendingInputEditorAdapter.tsx` 使用已提交 facts 和 connection generation 挂接 controller，避免 StrictMode effect replay 提前 detach。 |
| 异常恢复 | 草稿持久化错误阻断发送且保持主输入编辑器可用；恢复暂停、unknown-send 记录分别展示，移除 unknown 本地记录不重发被移除项；其余合法待发项的推进缺口见 QR-B09-002。Stop 的 accepted/unknown 保持 pending，明确未受理才允许重试。待发送编辑失败清空新输入的问题引用 QR-B03-001。 |
| 契约与安全 | role 与 reservation 使用 active session 的权威类型；队列 lane、页面、预览和移动结果直接消费队列契约。线程状态使用 `Thread["status"]` 与 `ThreadActiveFlag`；本批未发现手写复制协议、HTML 字符串注入或 unknown-delivery 自动重发路径。 |
| 性能 | 待发送列表初次按两条 lane 的同一 detail revision 读取，Show more 仅增长选中 lane；移动刷新保留独立加载预算，不为定位超出前缀的条目读取完整队列。未进行性能测量，不能据此宣称无性能风险。 |
| 职责与耦合 | 提交控制、抽屉事务、页面读取和 DOM adapter 的职责可追踪；未以文件长度或命名偏好提出拆分。浏览器 harness 与真实编辑能力的差异纳入 QR-B03-001 的验证缺口，不另计结构问题。 |
| 测试有效性 | 已读模型、StrictMode、发送、中断、恢复、持久化、分页重排、焦点、技能和压缩用例；其断言覆盖相关局部行为。浏览器 harness 直接返回 queue reservation，未覆盖 live owner 的长期 revision 约束，因此成功编辑用例无法排除 QR-B03-001。 |

## 关联发现的界面消费证据（QR-B03-001）

问题完整正文见 [B03 会话报告](./batch-03-sessions.md)。本节仅补充本批责任范围内的证据，作为同一问题的关联记录。

1. `codex-gui/src/features/activeThreadSession/liveActiveThreadSession.ts:255-289` 在开始编辑后捕获整个 session revision；过期操作会取消 child reservation。其既有测试 `__tests__/liveActiveThreadSession.test.ts:446-504` 明确构造正常 delta 与 flush 后保存返回 `staleRevision`，并断言原消息 `edit me` 恢复、新内容 `changed` 未保存。
2. `codex-gui/src/features/composerTurnControl/composerPendingInputSession.ts:388-390` 将最新 editor capture 交给原 reservation；`714-723` 将返回的 session unavailable 映射为 `sessionInvalidated`。
3. 同文件 `691-702` 的 `handleLiveFailure` 清空 `this.edit`、刷新队列。`ComposerPendingInputDrawer.tsx:256-268` 仅在 edit 存在时挂载待发送编辑器，因此失败会卸载 editor，未保存修改没有转存路径。该 alert 使用一般的刷新后重试说明，不能恢复新输入。
4. `__tests__/composerTurnControlBrowserTestSupport.tsx:111-114` 仅在开始编辑时核对 session revision，随后直接返回 coordinator reservation，绕过生产 live owner 的 capability 包装。现有成功编辑浏览器测试不包含这一失效机制。

可重现条件为 active turn 存在时编辑普通待发送项，在编辑期间收到正常消息增量并 flush，再点击 Save。对象和 owner 未改变，仍会保存失败并丢弃新修改。此结论由实现与现有测试内容支持，完整浏览器复现未执行。

后续整改应保留真正 owner 更换、断线、目标终止和过期 callback 的防护，区分普通展示更新与编辑能力失效，并保护失败后的未保存输入；验收条件及统一整改说明由 B03 正文维护。

## 已排除的疑点与关键依据

- 普通发送与 Guide 并非两套清稿路径：共享 application，采用 `clearIfCurrent(capture)`；空 Guide shortcut 走普通队首提升，不清除另一个 capture。
- 抽屉不是投影失效后一律不可见：浏览模式保持只读，正在编辑才关闭。关闭之后等待 presence 结束恢复焦点，避免将关闭动画当作 owner 可继续操作的时期。
- 页面读取失败没有发布两个不同 revision 的 lane；过期刷新结果会原子重读，移动成功但刷新耗尽时单独报告已移动/无法加载，且等待更新的 revision。
- viewport 监听保留旧 editor DOM 的疑点在生产入口被排除：`CurrentTaskPage.tsx:276` 以 `identity.instanceId` 重挂整个 `CurrentTaskReady`，`activeThreadMemberLifecycle.ts:260` 在新 attach 时创建新 identity；live subscriptionId 为只读。不能仅依据子 editor 的 subscription key 判定监听失效。
- `ContextUsagePopover` 无 percentage 时隐藏入口是 `ContextUsagePopover.browser.test.tsx` 明确覆盖的既有行为，不作为本批缺陷。运行状态 token usage 还按 thread instance identity 核对，避免旧线程实例数据混入。

## 验证与证据边界

本调查没有运行测试、修改源码或新增测试。Level 1 仅完成静态测试内容检查，未作本批执行通过声明；Level 2 未执行，Level 3 可见桌面验收未执行，均不在本计划默认授权内。

父节点已执行包含 `liveActiveThreadSession.test.ts` 的 V-01，结果与命令见 [B03](./batch-03-sessions.md)。该测试通过意味着当前拒绝语义与测试一致，不意味着缺陷已修复；不计入 B10 独立测试数量。

尚缺“真实 live session + streaming delta + UI 编辑保存”的现有集成用例。本批的 `composerPendingInputSession.test.ts` 可证明失效结果的局部处理，但浏览器 harness 不能补足该生产 seam。本轮不新增测试，缺口保留至后续整改。

领域核验读取了本地 Vitest Browser assertions 文档、HeroUI Drawer guide、controlled demo 和 Drawer 源码；本地 HeroUI react/styles 与项目 resolved 版本均为 `3.2.4`。受控 `Drawer.Backdrop` 用法与对应资料一致。未执行真实浏览器交互，文档核验不替代 DOM 验证。

## 覆盖登记与交接

主覆盖包含 19 个实现文件与 18 个测试/测试支撑文件，全部读取；精确清单及文件身份统一维护在 [覆盖与进度清单](./coverage-and-progress.md)，不重复维护第二份覆盖状态。

本批结果已交给发送到展示及会话恢复跨模块复核。编辑失效关联为 QR-B03-001，队列恢复影响引用 B09，投影恢复入口引用跨模块 QR-X03-002；没有未经说明的待调查问题。编辑期间失效的真实集成验证缺口已在总报告中保留，不能被局部成功编辑测试覆盖。
