# B04 新建会话与历史评审

日期：2026-09-08。

状态：主审与独立复核完成。

代码基线：`63762612e56d332f474a5ba3861b22be761f0479`。调查节点：`I-B04-1`；报告节点：`E-B04`。内容身份与主要归属见 [覆盖与进度清单](./coverage-and-progress.md)，范围依据见 [设计](./design.md) 与 [计划](./plan.md)。

## 范围与结论

检查新建会话、历史加载和继续任务在导航变化及失败恢复下是否正确归属。`newSession` 与 `threadHistory` 的 22 个主归属文件均已只读检查，无主范围排除文件。关联读取 App、连接生命周期、命令 gateway 和对应生命周期测试，仅用于直接调用链，不代表完成这些文件所属批次的评审。

发现 1 项确定缺陷：QR-B04-001（P2），历史详情永久保留首次读取能力，连接替换后重试仍访问失效 gateway。未新增其他确定缺陷、待验证风险或可维护性建议。未发现问题仅针对本批范围与证据，不表示产品完全验证通过。

未运行测试、构建或真实运行验收；未修改源码、测试或执行 Git 写操作。

## 七维检查结论

| 维度 | 结论与依据 |
| --- | --- |
| 行为正确性 | 新建输入仅在既有队列 accepted 后清空；历史读取携带 `includeTurns:true`，拒绝不匹配 threadId；只有详情 ready 后出现继续操作。QR-B04-001 阻断连接替换后的历史重试。 |
| 状态与生命周期 | 新建 owner 使用 generation、导航意图、连接身份及实例/revision 检查交接；列表按 cwd 和 listThreads 重建 owner，旧 owner dispose/generation 阻断迟到结果。详情快照与连接能力寿命混淆，见详细发现。 |
| 异常恢复 | 列表 append error 保留已有内容与 cursor；创建结果未知需显式重试，handoffUnknown 禁止重投；继续任务区分 operationFailed、connectionLost 的提交前后。详情 Retry 不能采用替换后的能力，见 QR-B04-001。 |
| 契约与安全 | Thread、命令参数与结果来自权威类型；历史读取不 resume/attach，查看与激活分离。标题及 preview 按文本展示。继续任务 ready 使用权威返回 threadId，现有测试明确覆盖，不因返回 ID 与点击 ID 不同直接判为漏洞。 |
| 性能 | 列表由用户显式分页；本批未根据页大小、文件长度或测试数量判断性能或拆分需求。未执行耗时、内存或真实运行测量。 |
| 职责与耦合 | 列表、详情、输入交接各有 owner，展示文案及日期分组独立。发现的具体边界问题是详情把保留数据实现为保留命令能力；没有额外以风格或行数为依据的结构建议。 |
| 测试有效性 | 单测覆盖 owner 参数、互斥、失败重试、身份及迟到结果；Browser 测试有 StrictMode、导航、能力替换、布局和滚动断言。但详情只测 commands 变 null 后保留快照，没有 commands 替换后读取恢复的完整现有用例。读取测试不代表测试通过。 |

## 关键链路与排除依据

- 新建会话：`newSessionOwner.ts:98-104` 固定 capture 与 generation；`:116-131` 保留迟到创建成功的 threadId，但阻止失效导航/连接继续激活或交接；`:136-151` 检查 active thread、instanceId、revision；`:156-158` 仅在 accepted 后清空输入。当前测试直接检查这些条件，不把手动重试创建未知结果误报为自动重发。
- 列表：`threadHistoryListOwner.ts` 固定 cwd、互斥分页并按 threadId 去重，append 失败重试保留原 cursor；`ThreadHistoryListPage.tsx` 以 `commands.listThreads,cwd` 创建 owner。Browser 测试检查新 cwd 请求未完成时旧卡片已移除，未发现额外确定归属缺陷。
- 详情：`threadHistoryDetailOwner.ts:75-89` 校验响应身份并创建只读 transcript；`ThreadHistoryDetailContent.tsx` 以 thread ID 为 surface/action key。这里的只读快照保留本身有明确测试，不建议为修复能力更新而直接删除该行为。
- 继续任务：`ContinueTaskAction.tsx:180-211` 使用 mounted、capability token 和 inFlight 请求身份阻止旧结果推进，失败保持详情；ready 使用权威结果导航并展示 warning。现有测试覆盖 pending 去重及 activate 能力替换，不等同于 readThread 替换覆盖。
- StrictMode：`useStrictModeSafeOwner.ts` 延后 dispose 到微任务，同一 owner 的 effect replay 可取消销毁；详情和列表的 deferred resolve/reject 测试覆盖该机制。未发现新的确定异常。
- 布局与可访问性：读取了卡片整体链接、相对日期分组、诊断 modal、滚动锁及继续操作占位高度的 Browser 断言；本批没有执行，不能标为实际可见验收通过。

## QR-B04-001：连接替换后历史详情重试仍调用失效读取能力

分类：确定缺陷。优先级：P2。验证状态：静态调用链证实，未执行 Browser 或真实 BFCache 复现。

### 证据与根因

`codex-gui/src/features/threadHistory/ThreadHistoryDetailPage.tsx:24-27` 保存首次 `commands.readThread`；`:35-37` 使用 `retained ?? { readThread: commands.readThread }`，所以后续非空 commands 永远不会替换已保存函数。`:63-68` 把旧函数继续传给 owner，`:90-93` 的 useMemo 在同一 thread 下不会重建 owner。

这不是仅存在于测试中的能力替换：`codex-gui/src/features/appShell/guiHostConnectionLifecycle.ts:123-128` 在 `pageshow.persisted` 时调用 restart，`:81-83` 在同一个页面 mount 中释放旧 round 并创建新连接。旧连接 cleanup 位于 `guiHostClient.ts:249-258`，会 invalidate transport 和 commands。

`guiHostCommandGateway.ts:112-115` 将旧 gateway 永久设为 invalidated；`:134-141` 对后续命令返回 `GUI host WebSocket is not available`，而不是转发给新连接。新连接持有新的 gateway。`threadHistoryDetailOwner.ts:53-59,72-75` 的 retry 仍使用构造时的旧函数。

根因是把“保留已加载的只读快照”实现为“永久保留最初命令能力”，将数据寿命与连接能力寿命绑定。

### 触发条件、影响与优先级

历史详情初次读取失败，或在途读取因 BFCache 返回时连接替换而失败；新连接恢复后，用户点击 Retry 仍调用旧失效能力，新连接不会收到读取请求。即使原快照已加载，在同一详情组件实例内切换 thread 参数，新 owner 也会收到旧读取能力并失败。

退出该详情组件后重新进入可重建能力，因此不声称必须刷新整个应用。正常支持的连接替换会使局部恢复操作持续失效，定为 P2；未测试最终可见页面形态，不夸大为整个应用不可用。

### 整改交接

涉及模块：`ThreadHistoryDetailPage`、`ThreadHistoryDetailOwner` 的快照与命令边界，以及对应 owner/Browser 测试。连接生命周期和 gateway 是关联契约证据，不自动扩大修复范围。

修正方向：保留断线期间已加载的只读快照，同时让后续读取和重试采用当前可用能力；旧请求结果仍应按请求/能力归属失效。

必须保留的约束：历史查看不触发 resume/attach；已加载只读快照在断线期间仍可阅读；thread 身份校验、StrictMode 生命周期及迟到结果隔离保持有效；不得通过删除快照保留或静默忽略读取失败规避问题。

后续修复验收条件：

- 初次读取失败后 commands A→null→B，Retry 只调用 B，且读取目标仍为当前 thread。
- A 的在途请求被 B 替换后，旧结果不能覆盖当前状态。
- ready 快照在断线期间保留；B 可用后的后续读取使用新能力。
- 同一详情组件切换到另一 thread 时，以 B 读取该 thread，旧内容不能错误归属。
- 只读历史不因恢复能力而自动激活会话或发送输入。

关联事项：X02 与 X03 复核引用本编号核对恢复及连接交接，不另建重复问题正文。当前未确认其他同根因编号。

## 验证记录与证据缺口

本批未运行测试。Level 1 未运行；Level 2 未运行且不在默认授权内；Level 3 不属于此静态判断所需证据，未运行。

`ThreadHistoryDetailRead.browser.test.tsx` 已有 commands 变 null 后保留快照的用例，但未覆盖恢复成另一 readThread 后 Retry。`ThreadHistoryDetailContinuation.browser.test.tsx` 的 stale capability 用例仅覆盖 activate。关联 `guiHostConnectionLifecycle.test.ts:171-210` 独立检查 BFCache 替换，却没有与详情读取 owner 组合。

因此没有现有测试能够完整复现 QR-B04-001。运行这些既有用例可验证其各自旧行为，不能证明新连接恢复链路正确；本批未为增加测试数量启动无关测试。保留上述具体缺口，后续修复任务才补充组合回归，本轮不修改测试。

## 逐文件覆盖

以下路径相对 `codex-gui/src/features/`。22 文件均已读静态检查；实际内容身份以全局覆盖清单为准。

| 文件 | 覆盖状态 |
| --- | --- |
| `newSession/NewSessionPage.tsx` | 已读 |
| `newSession/newSessionOwner.ts` | 已读 |
| `newSession/__tests__/newSessionOwner.test.ts` | 已读 |
| `threadHistory/ContinueTaskAction.tsx` | 已读 |
| `threadHistory/ContinueTaskFailureAlert.tsx` | 已读 |
| `threadHistory/ThreadHistoryDetailContent.tsx` | 已读 |
| `threadHistory/ThreadHistoryDetailPage.tsx` | 已读 |
| `threadHistory/ThreadHistoryListPage.tsx` | 已读 |
| `threadHistory/threadHistoryDateGroups.ts` | 已读 |
| `threadHistory/threadHistoryDetailOwner.ts` | 已读 |
| `threadHistory/threadHistoryListOwner.ts` | 已读 |
| `threadHistory/threadHistoryPresentation.ts` | 已读 |
| `threadHistory/useStrictModeSafeOwner.ts` | 已读 |
| `threadHistory/__tests__/ThreadHistoryDetailContinuation.browser.test.tsx` | 已读 |
| `threadHistory/__tests__/ThreadHistoryDetailRead.browser.test.tsx` | 已读 |
| `threadHistory/__tests__/ThreadHistoryListPage.browser.test.tsx` | 已读 |
| `threadHistory/__tests__/threadHistoryDateGroups.test.ts` | 已读 |
| `threadHistory/__tests__/threadHistoryDetailBrowserHarness.tsx` | 已读 |
| `threadHistory/__tests__/threadHistoryDetailOwner.test.ts` | 已读 |
| `threadHistory/__tests__/threadHistoryListOwner.test.ts` | 已读 |
| `threadHistory/__tests__/threadHistoryListPageBrowserTestSupport.tsx` | 已读 |
| `threadHistory/__tests__/threadHistoryPresentation.test.ts` | 已读 |
