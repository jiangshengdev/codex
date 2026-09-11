# 执行记录

- D 完成：5897448cd，规格与计划独立提交。原 research 文件被 ignore，未强制暂存；规格已包含完整有效行为。
- T1：历史 URL 接入、共享分页定位、缺失提示及空 turn 边界已实现。最初页面测试按预期因拒绝 query 失败；修复后定位几何暴露历史底部操作区异步预留空间，现等待真实占位高度后定位，不放宽几何断言。临时测试观察已移除。
- T1 验证：路由单测 16 通过；定位与分页 Browser 三引擎共 30 通过；type-check 通过。Lingui 新增一条提示，中英文完整，其他 catalog 变化为来源行号元数据；重复提取 hash 稳定。
- 广泛检查尚有未闭合失败：HistoryPreviewChatLayout 切换到当前聊天时左右相差 4px，12 个实例失败；全局 lint 在未修改的输入队列测试及 pending-input 测试支持文件发现 7 个 void 规则错误。本任务新文件的 lint 问题另行修正；没有豁免、删测试或修改这些失败断言。最终验证及审查继续判断影响归属。
- 当前仅 D、T1 阶段；T2、最终验证与两轴审查待执行。没有真实 GUI URL，Level 2 尚未执行；Level 3 不适用。

## T2

- T1 独立提交：d284665a2。
- 当前聊天接入定位；完成状态保留于页面，避免 projection identity 重建后重复定位。定位期间暂停贴底，完成时重新建立滚动基准。无参数行为保留。
- 先验证 task URL 红灯（默认显示最新页而找不到 target），接入后通过。新增用例覆盖非法原始 query（含重复参数）、两类页面同页导航和前进后退、当前聊天后续输出不重复定位。
- 定位 Browser 三引擎 36/36 通过；既有 AppProjectionScroll 24/24 通过；type-check 和本次修改范围 ESLint 通过。T2 catalog 只更新 source references，无新增文案或翻译变化。
- 真实 GUI 完整 URL 已向用户请求，独立于本地验证继续等待。接下来执行全量 unit/Browser/E2E 各一次及两轴审查，不把尚未运行的检查记为通过。

## 最终验证与修正

- T2 独立提交：f48b05d71。最终修正另行提交，不 amend。
- 全量 unit：99 files / 1250 tests 通过。全量 sequential Browser：27 engine-files / 57 tests 通过。
- 全量 parallel Browser：1626 通过、33 失败。其中 NotFoundPage 的 9 个错误边界断言揭示本次路由校验位置改变了既有错误传播；已把校验恢复至 root，未知 query 保留原错误消息，路由消费者直接使用已校验 search。最终 URL 与 NotFound 两文件三引擎 87/87 通过；路由单测 16/16 通过。
- 剩余 24 个 parallel Browser 失败来自 HistoryPreviewChatLayout 与 AppProjectionAvailability 的当前聊天左右对齐相差 4px。没有运行实施前基线，不声称已证明无关；没有修改相关布局或断言。
- 全量 E2E：108/111 通过。三个引擎的窄屏用例均因 `main > .surface.task-reading-boundary` 匹配 0 个元素而失败。实施前 5897448cd 的 CurrentTaskReady Surface 同样没有该类名，这是静态证据；没有运行旧版本 E2E，不冒充基线复现。
- 全量 lint 存在 7 个未修改文件中的 no-meaningless-void-operator 错误：composerInterruptState.test.ts、composerSteerQueueState.test.ts、composerTurnControlPendingInputBrowserTestSupport.tsx。修改范围 ESLint 通过；最终 type-check、format:oxfmt、git diff --check 通过。没有增加任何检查豁免。
- 独立 Standards / Spec 审查并行进行，未发现确定功能缺陷；建议补充的跨 fragment、窄屏和离页等待覆盖已加入。窄屏夹具使用最后 fragment 的可见长回答，保持原几何断言；离页断言比较浏览器实际滚动值，避免 Firefox 子像素舍入造成伪失败。追加只读复核未发现确定问题。
- 调度实际关键路径：D → T1 → T2 → V → 两轴 R 汇合 → 修正与定向验证 → 独立本地提交。只有两轴审查使用代理并行；主代理独占文件与 Git index 写入。未启动的 ready 实施节点：无。Level 2 缺少用户当前完整 GUI URL，未执行；Level 3 不适用。
- 本轮代码与审查修正已完成，验证结果如上，不能声明全部检查通过或真实运行时验收完成。fork 来源入口保持停止，不修改 Rust。
