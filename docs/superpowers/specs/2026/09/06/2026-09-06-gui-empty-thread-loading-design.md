# GUI 空任务加载修复设计

日期：2026-09-06。用户已确认设计及落盘；仅修复当前加载问题，不重构通用工作流。

## 行为契约

CLI 已创建但未发送消息的任务必须可以在 GUI 打开并发送首条消息。保留任务 ID；打开不创建 rollout 或补写 threads metadata。已持久化任务的历史及运行状态保留。

四种状态分别验证：无 rollout 的 live 新任务；仅有效 session_meta 的 live 空任务；已持久化且加载的任务；已持久化未加载任务。

## 前端

通过现有 thread/loaded/list 查询权威内存集合，遵守 nextCursor；已加载直接 projection attach，未加载 resume 后 attach。沿用身份核验、初始化通知缓存、失败清理与重试。查询失败不等于未加载，attach 失败不自动改成 resume。重试重新查询，不缓存驻留判断。列表并非原子租约，查询后关闭任务仍保留真实错误。

依据：thread_processor.rs:2744 的 list_thread_ids；thread_projection.rs:134 的 get_thread；GUI host filter 已允许此方法。前端 APP_SERVER_REQUEST_METHODS 与 gateway 补入方法，类型与 validator 由现有 schema 生成。

## 存储与投影

ThreadStore 提供独立只读空历史判定，projection 消费；不放宽公共 list_turns/list_items/搜索契约，不改 resume 的既有存储要求。

LocalThreadStore 仅在 live recorder、Paginated、数据库成功读取且无该任务 metadata、canonical rollout 严格解析为唯一合法 SessionMeta、身份匹配且无继承历史时确认 session_meta-only 空历史。使用既有 writer 协调，避免首条 append 与判定穿插；投影继续使用 attach cut 与事件回放。无 rollout 仍支持空任务且不主动 persist。

不能通过 preview 为空、宽容恢复 reader 丢弃记录、捕获所有 Unsupported 或缺 metadata 直接推导空历史。数据库失败、损坏/截断、额外记录、继承历史与身份错误都不得静默变空。

## 验证

测试边界为 ActiveThreadSession/GUI 页面、ThreadStore 和 app-server projection 公共接口。各回归先红后绿，先证明既有问题再修复；已正确的契约测试保持通过，不伪造红灯。未持久化前端 fixture 的 resume 按真实契约失败。

验证四种状态、空任务首条发送转入正常历史、已有历史保留、查询分页/失败/关闭重试，以及 session_meta 的损坏/额外记录/继承与首写竞态。保留原公共分页拒绝语义。真实无头验收分别建立四类专用任务并证明前置状态，不能用一个落盘 URL 替代。不得以诊断读操作提前改变待测状态。

不包含历史页独立 cwd 功能或通用治理改造；本次目标已收窄为任务加载。Rust 运行程序构建由用户执行，Level 2 在包含修复的运行程序可用后完成，Level 1 不替代 Level 2。
