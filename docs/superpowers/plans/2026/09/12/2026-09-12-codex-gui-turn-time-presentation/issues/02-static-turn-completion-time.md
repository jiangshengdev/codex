# 02：turn 底部静态结束时间

**What to build:** 每个已结束 turn 在底部分叉按钮右侧常驻显示结束时分，让用户直接浏览各轮结束时刻，不增加悬浮提示或键盘操作负担。

**Blocked by:** None (can start immediately)。实施须满足计划的统一授权与文档提交前置；不依赖 ticket 01。

**Status:** ready-for-agent

- [ ] 结束时间直接使用现有权威 completedAt，以本地时区、24 小时制两位 HH:mm 显示。
- [ ] 成功、失败、中断均适用；进行中不显示，缺少 completedAt 时省略，不推算或补造。
- [ ] 与耗时数据独立判断；分叉不可用或不渲染不隐藏已知结束时间。
- [ ] 最后一个 fragment 底部仅显示一次，位于分叉按钮右侧，窄屏允许必要换行且无横向溢出。
- [ ] 使用静态 HeroUI Typography 与语义 time，不添加 Tooltip、原生 title、额外完整时间提示、焦点入口或键盘事件。
- [ ] 不增加 Tab 停留点，分叉按钮原有键盘、禁用和 pending 行为保持有效。
- [ ] 验证历史、重连、分页、跨日期和数据缺失情形，保留现有状态与 chunk 边界。
- [ ] 受影响 Browser、类型和 lint 通过，形成独立行为提交；真实验收与最终组合验证按计划汇合。
