# B07 对话内容展示评审

日期：2026-09-08。

状态：主审与独立复核完成。

代码基线：`63762612e56d332f474a5ba3861b22be761f0479`。调查节点：`I-B07-1`；报告节点：`E-B07`。范围与内容身份见 [覆盖与进度清单](./coverage-and-progress.md)，执行边界见 [计划](./plan.md)。

## 范围与结论

检查 `committedTranscriptSurface` 从读取模型到可见内容的渲染是否保留内容、分块、分页和活动语义。25 个主归属文件均已只读检查，无主范围排除项。关联读取 transcript selectors、item policy、路由错误处理及直接相关的外部 AgentPath 契约，不代表完成这些文件所属批次的主评审。

发现 1 项确定缺陷：QR-B07-001（P2），合法的全下划线子代理任务名可使渲染同步抛错。未新增待验证风险或可维护性建议。除该问题外，声明范围内未发现新的确定缺陷；该结论不等于产品完全验证通过。

调查与报告节点未修改源码或测试，未运行构建、真实验收或 Git 写操作；主代理的定向单测记录见验证节。

## 七维检查结论

| 维度 | 结论与关键依据 |
| --- | --- |
| 行为正确性 | 消息按 plainText/staticMarkdown/streamingMarkdown 分派；reasoning 根据 lifecycle 区分实时标题与完成摘要，活动、消息和状态边界保持顺序。合法全下划线任务名违反展示函数的额外假设，见 QR-B07-001。 |
| 状态与生命周期 | `TranscriptReadContext.ts:24-38` 按 threadId 和 instanceId 隔离 live 读取，fixed 直接消费固定快照；`CommittedTranscriptSurface.tsx:15-20,34-39` 用实例或 surface key 重建局部渲染状态。Sessions 测试覆盖后台更新、固定历史和替换 owner 的旧身份隔离。 |
| 异常恢复 | turn error 只在最后 fragment 展示；全局断线状态独立于当前页。Pagination 测试覆盖 boundary-only 最新页上的失败。QR-B07-001 的展示异常没有局部恢复边界，非 SearchParamError 会经 `routerComponents.tsx:6-10` 重新抛出。 |
| 契约与安全 | 视图类型来自 transcript owner 的派生类型，变体分派保留穷尽检查。Markdown 禁用 raw HTML 和图片，保留 sanitize/harden；协议缺失链接作为字面内容显示。AgentPath 权威允许的名字与展示转换不一致，见详细发现。未凭关闭 linkSafety 确认框单独判定漏洞。 |
| 性能 | `CommittedTranscriptTurnFragment.tsx:49-67,82-120` 按 chunk 读取和渲染，折叠时不创建隐藏 chunk；`transcriptStateSelectors.ts:365-389` 保留 chunk view 缓存。活动分组仅消费当前 chunk entries，未将中间内容展开为全 turn 数组。未做耗时、内存或真实长会话性能测量。 |
| 职责与耦合 | live/fixed 读取边界、page/fragment/chunk 结构和消息/活动/Markdown 展示职责可辨认。没有基于文件长度、少量测试装配重复或命名偏好提出结构建议。 |
| 测试有效性 | 现有测试对卸载、顺序、隔离、aria-current、折叠前未挂载及 Markdown DOM 有具体断言；但 `subAgentActivityPresentation.test.ts:48-54` 将合法 `/root/___` 与不合法空白路径并列并断言抛错，固化了错误假设。阅读测试不表示测试已通过。 |

## 关键链路与排除依据

- 分页：`CommittedTranscriptSurfaceRenderer.tsx:36-55` 区分跟随尾页的 null 与手选页，在页数缩小时 clamp；`:126-134` 只挂载当前页 fragments。现有 Pagination 测试覆盖旧页卸载、live/fixed 一致、历史页选择保持、追加压缩跟随和 replacement shrink。
- 折叠：中间内容无 final 时强制显示，存在 final 时可折叠并卸载隐藏节点；首条用户消息与最终答案单独展示。Disclosure 测试明确覆盖跨 chunk 单一 disclosure、后续用户输入位于中间区、多个最终答案。
- 活动：`TranscriptEntryRenderer.tsx` 在 message/reasoning/status 处切断活动组；`TranscriptActivityEntries.tsx:328-345` 在 collab 条目和活动种类变化处再次切分。三项摘要及省略计数、非交互 chip、重复活动和按最短父级消歧均有明确测试，不将这些既定展示语义误报为缺陷。
- Markdown：live/static 共用 `streamdownCommonProps`；用户文本原样渲染；协议缺失文件链接展示 Markdown 字面量是既定约束，不报为链接功能缺失。copy 控件依据模块初始化时的 secure context 与 clipboard.writeText 可用性设置，已有三个环境分支测试。
- 本批未依赖 HeroUI 内部实现推断可见几何或恢复行为；未完成真实浏览器视觉、响应式、耗时指标或实际运行验收。

## QR-B07-001：合法全下划线任务名导致对话渲染抛错

分类：确定缺陷。优先级：P2。验证状态：静态链路证实，未执行 Browser 或真实运行复现。

### 证据与触发条件

权威源 `codex-rs/protocol/src/agent_path.rs:125-146` 的 `validate_agent_name` 允许非空小写字母、数字和下划线组合，因此 `___` 是合法名字。`:54-56` 的 `join` 使用该校验；真实 spawn 路径 `codex-rs/core/src/tools/handlers/multi_agents_common.rs:118-125` 使用父 AgentPath 的 join 构造任务路径。

`codex-rs/app-server-protocol/src/protocol/v2/item.rs:966-970` 原样将 `activity.agent_path` 转为协议字符串。前端 `codex-gui/src/features/transcriptState/transcriptItemPolicy.ts:356-366` 保留该路径，`transcriptStateSelectors.ts:279-320` 将它交给活动 view，未改变名字语义。

`codex-gui/src/features/committedTranscriptSurface/subAgentActivityPresentation.ts:46-50` 把所有 `_` 替换为空格，随后因没有可见字符抛出 `Expected sub-agent path segment to contain visible text`。`:104-113` 在 `presentSubAgentActivityGroup` 中对每个活动同步执行该转换；`TranscriptActivityEntries.tsx:314` 从渲染分组路径调用它，没有局部捕获。

当 `/root/___` 的活动位于可见中间区域或用户展开对应 disclosure 时，渲染会抛错，至少使整个 transcript 的当前渲染失败。转换发生在三项摘要截断之前，因此即使问题名称位于将被省略的第 4 项及之后也会触发。合法全下划线父级在同名任务需要父级消歧时也会进入相同转换（`subAgentActivityPresentation.ts:70-74`）。

`routerComponents.tsx:6-10` 对非 SearchParamError 再次抛出；未运行浏览器，因此不把最终屏幕具体形态、恢复交互或白屏范围表述为已实测结果。

### 根因、影响与优先级

展示美化引入了比权威 AgentPath 更严格的字符可见性条件。合法业务输入因此变成同步渲染异常。触发名字少见，但其影响越过单个 chip，且刷新或重新读取同一活动仍保留触发输入，因此定为 P2。

现有 `__tests__/subAgentActivityPresentation.test.ts:48-54` 反而明确断言合法 `/root/___` 应抛错，说明测试没有以权威契约约束展示转换。该测试即使通过，也不能证明此输入的产品行为正确。

### 整改交接

涉及模块：`subAgentActivityPresentation.ts`、活动 surface 消费者和对应 presentation/Browser 测试；AgentPath 与 app-server 转换仅作为权威依赖，不自动扩大为后端修复范围。

修正方向：展示转换必须覆盖权威允许的全部任务名，并保留可辨认的原始标识语义。不得通过隐藏活动或在前端禁用合法任务名规避问题。

必须保留的约束：原始任务身份、同名消歧、活动顺序、三项摘要及省略计数、chunk 性能边界、变体编译期穷尽检查。

后续修复验收条件：

- 合法 `___` 叶节点不会使活动及前后消息渲染失败。
- 同名任务消歧涉及全下划线父节点时，仍得到可辨认标签且不抛错。
- 合法特殊名字位于摘要省略部分时不使整个组失败。
- 活动顺序、摘要计数、折叠卸载和 chunk 边界保持原有语义。

关联事项：X01 跨模块复核引用本编号核对输入到展示的契约假设；不得另建重复问题正文。当前未确认其他同根因编号。

## 验证记录与缺口

主代理 V-01 已运行 presentation 现有单测，与 B03 live session 单测合计 2 文件 32 测试通过、无类型错误、退出 0。准确命令与开始时间见 [B03 验证记录](./batch-03-sessions.md)。该测试包含对合法全下划线名字抛错的错误预期，通过不消除缺陷。Browser surface 场景未执行；Level 2 未运行且不在默认授权内；Level 3 不适用，未运行。

可选现有定向入口为 `__tests__/subAgentActivityPresentation.test.ts`，但它只能验证当前错误预期。`CommittedTranscriptSurfaceActivity.browser.test.tsx` 与 `TranscriptContextPagination.browser.test.tsx` 可检查既有活动/分页行为，不能直接验证全下划线任务名的 surface 影响。当前无相关现有 Browser 案例，因此未为增加测试数量启动无关验证。后续修复任务才补充上述验收案例；本轮不修改断言。

## 逐文件覆盖

以下路径均相对 `codex-gui/src/features/committedTranscriptSurface/`，状态均为已读静态检查；文件内容身份以全局覆盖清单为准。

| 文件 | 覆盖状态 |
| --- | --- |
| `CommittedTranscriptSurface.tsx` | 已读 |
| `CommittedTranscriptSurfaceRenderer.tsx` | 已读 |
| `CommittedTranscriptTurnFragment.tsx` | 已读 |
| `LiveMarkdownText.tsx` | 已读 |
| `MarkdownText.tsx` | 已读 |
| `TranscriptActivityEntries.tsx` | 已读 |
| `TranscriptContextBoundary.tsx` | 已读 |
| `TranscriptContextPagination.tsx` | 已读 |
| `TranscriptEntryRenderer.tsx` | 已读 |
| `TranscriptReadContext.ts` | 已读 |
| `TranscriptReadProvider.tsx` | 已读 |
| `markdownRendering.tsx` | 已读 |
| `subAgentActivityPresentation.ts` | 已读 |
| `__tests__/CommittedTranscriptSurfaceActivity.browser.test.tsx` | 已读 |
| `__tests__/CommittedTranscriptSurfaceDisclosure.browser.test.tsx` | 已读 |
| `__tests__/CommittedTranscriptSurfaceMessages.browser.test.tsx` | 已读 |
| `__tests__/CommittedTranscriptSurfaceSessions.browser.test.tsx` | 已读 |
| `__tests__/MarkdownCopyControlsAvailable.browser.test.tsx` | 已读 |
| `__tests__/MarkdownCopyControlsMissingClipboardWrite.browser.test.tsx` | 已读 |
| `__tests__/MarkdownCopyControlsUnavailable.browser.test.tsx` | 已读 |
| `__tests__/MarkdownFileLinks.browser.test.tsx` | 已读 |
| `__tests__/ReasoningTranscriptSurface.browser.test.tsx` | 已读 |
| `__tests__/TranscriptContextPagination.browser.test.tsx` | 已读 |
| `__tests__/subAgentActivityPresentation.test.ts` | 已读 |
| `__tests__/transcriptSurfaceFixtures.tsx` | 已读 |
