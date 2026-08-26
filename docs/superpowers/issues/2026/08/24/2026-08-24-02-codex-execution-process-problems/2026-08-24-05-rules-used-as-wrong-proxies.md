# 规则被用作错误代理指标

日期: 2026-08-24
状态: 🟡 提示词治理已完成，仍需运行中复核
范围: Codex 执行规则、复杂度门禁与风险判断
优先级: P1

## 摘要

历史执行过程中多次用容易计算的行数、diff 大小、机械串行和无威胁模型的防御替代真实的职责、复杂度、并发风险和安全判断。针对该问题的提示词治理已经落地，但其效果仍需在真实任务中复核。

## 问题

规则本应约束风险，却被当成目标指标：单次 Task diff 行数被用来代表最终模块职责，Rust module LoC、changed lines 和 GUI TypeScript 文件长度被混为一谈，测试为满足行数门槛被压成难读代码；局部 Firefox 并发问题被扩大成三个浏览器全部串行；没有明确威胁模型时又加入大量 `Object.freeze` 和巨型 closure。

## 证据

- `/Users/jiangsheng/.codex/sessions/2026/08/06/rollout-2026-08-06T11-37-20-019fd525-a0ef-7c60-b2f3-fed6c7f1398b.jsonl` 第 1025–1121 行记录了错误使用 per-task diff 行数门禁的事件；第 1646–1716 行记录了没有明确威胁模型却加入 `Object.freeze` 和巨型 closure 的事件。
- `/Users/jiangsheng/.codex/sessions/2026/08/12/rollout-2026-08-12T11-56-07-019ff41c-f7f2-7ca1-bcd5-38195675e271.jsonl` 第 1867–1874 行记录了把局部 Firefox 并发问题扩大为三个浏览器全部串行的事件。
- `/Users/jiangsheng/.codex/sessions/2026/08/19/rollout-2026-08-19T13-16-49-01a01873-5de5-7dd0-8292-bb416113841c.jsonl` 第 6242–6252 行记录了把 Rust 500 LoC 规则错误套用到 GUI TypeScript 文件的事件。
- 月度审计保守统计该问题至少涉及 5 条已完成任务链。

## 判断

历史错误代理问题成立。问题不在于行数门槛、并发约束或防御性编码规则本身，而在于没有先判断规则所保护的具体风险，就用可量化代理指标替代技术判断。

当前治理已经完成规则层落地：全局提示词加入简短稳定规则和 owner 路由，新建 `$evaluating-engineering-constraints` 承载详细判断，委派规则已按有价值工作和最小冲突域校准，GUI 已加入 `Frontend Engineering Constraints` 与 formatter authority rule。以上改动提高提示词层判断的一致性，但不构成工具级 enforcement，也不能仅凭合成验证证明历史问题在真实运行中不再发生，因此仍需运行中复核。

## 修复记录

- `codex-config` 提交 `f448efc`：新增 `$evaluating-engineering-constraints` 中央 skill。
- `codex-config` 提交 `c89b250`：校准 delegation 并发规则，使调度依据有价值工作和最小冲突域，而不是槽位数量本身。
- `codex-config` 提交 `7fa0d2e`：更新全局短规则并路由到中央 skill。
- `codex-config` `main` 合并提交 `77584f1`：汇合上述提示词治理变更。
- `codex` 提交 `6f97ed1`：更新 GUI `Frontend Engineering Constraints`、formatter authority rule 和基于可测风险的性能规则。
- `codex` 提交 `d9f83f2`：落盘本次治理的已确认设计与实施计划。

## 验证记录

- `$evaluating-engineering-constraints` 与 `$delegating-micro-stages` 的 `quick_validate` 当前均通过。
- 6 个显式触发案例和 2 个隐式路由案例全部通过，覆盖已知错误代理事故与 owner 路由边界。
- `/Users/jiangsheng/cnb/codex/.codex/skills/**` 与 `/Users/jiangsheng/cnb/codex/.agents/skills/**` 均未修改，符合不修改上游 SKILL 的边界。
- GUI `format:oxfmt` 检查 211 个文件通过。
- formatter authority 新规则是在上述行为矩阵完成后新增，目前尚无独立行为探针；该项不能由既有合成案例代替。

## 影响

历史错误代理指标会造成无价值停工、性能损失、可读性下降、复杂度上升和立即返工；同时可能让形式上满足门禁的改动掩盖真实职责或用户体验风险。当前提示词治理降低了再次误判的可能性，但在真实任务复核完成前，仍不能排除模型绕过、误读或错误路由规则的残留风险。

## 后续处理

在后续真实任务中观察是否再次出现错误 measurement target、无证据扩大串行域、无威胁模型的防御性编码或 formatter owner 冲突。若复发，应基于具体证据补充 tool-level enforcement 或对应行为案例；在出现证据前，不继续堆叠新的纯文本规则。
