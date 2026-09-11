# 实施补充与执行契约

用户调用 `implement` 授权实现、验证、审查及当前分支本地提交，随后对两项剩余产品行为均选择 A。此前未决行为已闭合：非法定位查询沿用错误页；每次导航重新定位。

## 当前核验

- 路由参数由 TanStack Router 校验，SearchParamError 已映射到 NotFoundPage；新增定位字段属于前端 URL 领域契约，不是 Rust 协议副本。
- browserAuthorizationSession 清理认证 fragment 时保留 pathname 和 search。不会为了定位更改认证持久化。
- 历史详情仅 ready 状态提供完整 Transcript State；当前聊天 ready 提供活动 identity 和完整 transcript。共享 renderer 已拥有 context page 与最后 fragment 映射。
- 当前聊天的 useCommittedTranscriptStickyBottom 同时响应布局、ResizeObserver 和 projection scroll signals；定位期间需要暂停，完成时建立新的当前位置基准，之后恢复既有判断。
- ComposerTurnControl 的 composer-shell 是 sticky bottom-0。定位按其当前边界计算可读底部，不依赖固定输入框高度。

## 修改与生成范围

前端路由及 guiRouteTarget、共享 transcript surface/renderer 及新定位 hook、历史详情、当前聊天、既有贴底 hook；测试为路由单测和 App Browser 定位/分页/滚动相关测试。普通源代码用 patch；格式化使用 oxfmt 权威工具。采用既有 HeroUI toast 提示，采用 Lingui macro 与准确 translator comment；语义 DOM 边界无需新增视觉组件。

Lingui 权威入口为 codex-gui 的 messages:extract；输入为 lingui.config.ts 声明的 src，完整生成边界是 src/locales/en.po 和 src/locales/zh-CN.po；只人工补充本次新提示的翻译。检查所有字段变化，再次提取验证稳定性，不手改 source references。

## 调度节点

所有节点共同字段：owner 为主代理；executionContext 为当前 /Users/jiangsheng/cnb/codex、dev、该 checkout 的 Git index；不创建 worktree。subdelegation 仅最终 code-review 的两个只读审查代理，不允许其写入或 Git 变更。deferralEvidence 无。authorizationGate 对实施、验证、本地提交为 active，来源为 implement；权限不含安装、远程操作、Rust 构建、可见桌面窗口。resourceLocks 按当前 checkout 内实际读写文件和 Git index 归并，Git index 为主代理独占写。失败按节点消费者传播，修正属于同一目标时继续；产品或 Rust 范围变化才重新确认。

每个任务包含依次依赖的 edit、verify、stage、commit 节点；分别为单一 operationKind。edit 消费前置稳定产物和规格，产生源码/测试；verify 消费这些文件并产生测试/类型/lint 证据；stage 消费通过验证的精确文件 allowlist，产生 staged diff；commit 消费审阅后的 staged diff，产生独立 commit id。任务内 completionEvidence 为各自可观察结果；未形成相应证据不解锁后继。各节点 readSet 为其 consumes，writeSet 为其 produces，stateEffects 仅对应文件、测试自动产物或 Git index/本地提交。commandScope 限 patch、项目 frontend scripts、已核验 fnm 工具链与精确 allowlist 的本地 Git 操作。无 force、无 amend。

| nodeId / taskBoundary | hardPredecessors 与原因 | outcome / consumes / produces | estimatedCost | verification / completionEvidence | failureDomain |
| --- | --- | --- | --- | --- | --- |
| D / 文档提交 | 无，实施前必须保存文档 | 本次规格、计划与决策文档的独立提交 | 小 | 精确 allowlist、diff check、commit id | 全部实现后继 |
| T1.edit/verify/stage/commit / 01 | D；任务内按上述产物依赖 | 历史预览完整 URL 定位与共享接口、对应测试和 locale | 中 | 路由及历史页面 Browser 回归、type-check、lint、生成稳定性；独立 commit | T2 与最终验证 |
| T2.edit/verify/stage/commit / 02 | T1 的稳定接口；任务内按上述产物依赖 | 当前聊天接入、贴底协调、对应滚动回归 | 中 | 当前聊天与历史预览组合回归、type-check；独立 commit | 最终验证 |
| V / 无独立功能提交 | T1、T2 集成状态 | 全部 unit、Browser、E2E 各一次；格式、lint、type-check；审查输入的稳定状态 | 大 | 实际收集及执行结果，基线问题单独报告不豁免 | 完成声明 |
| R.standard、R.spec / 只读审查 | 集成提交和 V 的证据 | code-review 两轴报告 | 中 | 固定实施前文档提交作为比较基点，规格与规则逐项核对 | 有问题时对应修正及完成声明 |

初始 ready set 为 D；关键路径为 D、T1、T2、V、R 汇合。仅两轴审查可 fan-out，最终报告 fan-in；实现任务因共享接口存在实际依赖。review 修正另建独立提交并验证影响范围。

验证入口：/opt/homebrew/bin/fnm exec --using-file pnpm run type-check、lint、test:unit；Browser 使用 test:browser:parallel --run 指定文件和末尾完整 parallel/sequential 两入口；E2E 使用 PLAYWRIGHT_HTML_OPEN=never 的 test:e2e。本轮已核验 pnpm 为 fnm v24.17.0 下的 10.34.5，不安装依赖。

Level 1 使用既定自动化；Level 2 需要当前真实 GUI URL，尚未取得则明确未执行，不猜地址；Level 3 不适用。最终验证不能用 Level 1 代替 Level 2。发生工具缺失停止其依赖验证，继续已授权独立工作。
