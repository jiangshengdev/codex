# B01 应用入口、页面装配与导航

基线：`63762612e56d332f474a5ba3861b22be761f0479`。状态：静态主审、独立复核与跨模块收敛完成。

## 覆盖与结论

主归属为覆盖清单 B01 的 29 个文件，包含全部 appShell、currentTask、documentTitle、app 及根入口/路由组件。主代理读取全部实现与本批测试正文；不把测试源码阅读视为运行通过。

本批没有单独保存发现正文。跨模块复核确认连接正常关闭和 projectionUnavailable 的恢复反馈缺口，分别见 [QR-X03-001、QR-X03-002](./cross-module-review.md)。以下结论限于已检查代码链，非真实 GUI 验收。

| 检查维度 | 证据与结论 |
| --- | --- |
| 行为 | `src/main.tsx` 先加载语言，再装配主题、store、router；`router.tsx` 明确当前、新建、历史列表/详情入口；`routerComponents.tsx` 将 search 参数失败交给 404。未见绕过 routeTarget 的页面业务入口。 |
| 状态与生命周期 | `App.tsx` 以持久 NewSessionOwner 组织路由能力；`GuiHostConnectionBridge.tsx` 固定启动目标，连接替换由 `guiHostConnectionLifecycle.ts:91` 起的单轮 owner 管理。旧轮次回调受 active 标记隔离，pagehide 暂停恢复队列，BFCache pageshow 才替换连接。 |
| 异常恢复 | `guiHostConnectionLifecycle.ts:108`、`:180` 两个异常分支延迟发布启动异常并在释放后忽略；`ActiveThreadCollectionMenu.tsx:64` 起在异步 remove 完成后重新读当前路由，避免导航覆盖用户后来选择。连接 unavailable 保留 session 对象引用，但 dispose 会话并清空集合，当前任务正文卸载；已加载历史快照另行保留。恢复反馈缺口见 X03。 |
| 契约与安全 | `AppCapabilities.ts` 消费实际 session 与 runtime 类型，页面不复制协议 DTO。授权由 browserLaunch owner 提供；本批不存第二份可变授权源。 |
| 性能 | `useCommittedTranscriptStickyBottom.ts` 使用提交键与 live pulse，ResizeObserver 卸载清理；`CurrentTaskReady` 按 instanceId 重挂载，旧任务滚动 ref 不跨实例复用。未做性能测量，不宣称吞吐或帧率达标。 |
| 职责与耦合 | shell 负责装配与导航，会话行为留在 session owner。标题发布采用 registration 清理，历史标题受 threadId 筛选。未仅凭页面分支多提出拆分建议。 |
| 测试有效性 | lifecycle 测试覆盖替换、旧回调、启动异常与清理错误；菜单测试覆盖删除后路由变化、导航失败持久化和焦点；标题单测覆盖 Unicode 与空白归一化。顶层集成/滚动测试由 B13 主覆盖。 |

## 已排除与限制

- 清理失败不应静默重连；现有 lifecycle 测试明确保留清理异常，不能把它作为需要吞错的缺陷。
- 页面当前任务与启动目标是不同用途的状态，未把路由切换改写启动目标当作修复建议。
- 顶栏标题、文档标题和菜单标题采用不同展示策略；空白标题边界存在策略差异，尚未证明合法生产输入会造成关键行为失败，不计确定缺陷。
- 无定向测试执行；本批静态证据已足以描述所检查装配行为。布局、焦点、BFCache 的真实运行表现未验收。

## 交接

X02 复核页面 retry/remove 与会话清理、历史去向；X03 复核连接不可用和失败提示。局部页面 state 的异步归属如出现跨会话证据，应回到本批补充，不能凭猜测报错。

稳定问题正文：无。覆盖状态由主代理在总清单统一更新。
