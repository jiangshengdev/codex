# 依据权威加载集合选择 attach 或 resume

历史决定：2026-09-07。补录日期：2026-09-30。

打开或恢复任务先完整查询 `thread/loaded/list`，已加载直接 attach，未加载才 resume 后 attach。新建空任务可以已在内存而尚无持久 rollout，不能按是否有持久历史或异步状态通知猜测加载状态。

查询失败照实失败，不当作未加载；attach 失败不自动 fallback resume，重试重新查询，查询结果也不是持续有效的租约。此取舍增加分页查询，换取正确区分合法空任务与历史恢复，避免用 fallback 隐藏错误。曾扩展的 Rust session_meta-only 修复已明确撤回，不包含于此决定。

恢复证据与现状核对：[任务身份与活动会话生命周期 #190](https://cnb.cool/jiangshengdev/codex/-/issues/190)。
