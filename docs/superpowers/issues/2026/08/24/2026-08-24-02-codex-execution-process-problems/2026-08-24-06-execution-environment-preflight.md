# 执行环境预检不足

日期: 2026-08-24
状态: 🔴 仍需处理
范围: Codex 命令入口、cwd、运行用户、工具、schema、skills 与 sparse 输入
优先级: P1

## 摘要

固化入口、cwd、运行用户、必要工具和工作树输入经常到执行中后期才核验，导致虚假复现、命令失败或测试尚未进入用例便中断。

## 问题

执行前没有统一核验用户真实入口、alias/function、固化 recipe、cwd、manifest、运行用户、必要工具、ignore 行为，以及任务所需的 schema、skills 和生成产物。Sparse checkout 缺少文件是其中一个已证实的环境预检子问题，但不是本月执行问题的总根因。

## 证据

- `/Users/jiangsheng/.codex/sessions/2026/08/22/rollout-2026-08-22T08-20-30-01a026d7-2b58-7371-ba65-6eacc96f4cd2.jsonl` 第 1218–1295 行记录了绕过 `j`/`just` 固化入口、直接运行底层命令后产生用户真实流程中不存在的 Python 环境错误。
- `/Users/jiangsheng/.codex/sessions/2026/08/22/rollout-2026-08-22T11-32-55-01a02787-52c0-7cb3-a074-5f0655222bd3.jsonl` 第 2202 行记录了新 sparse worktree 缺少 `codex-rs/gui-host/schema/typescript/browserContract.ts`，使 Browser 测试尚未进入用例便中断。
- `/Users/jiangsheng/.codex/sessions/2026/08/23/rollout-2026-08-23T04-10-47-01a02b18-e91e-7620-9571-293255e3e636.jsonl` 第 449–484 行记录了默认 `rg --files` 受 ignore 影响后，被错误提升为目标文档不存在的事件。
- `/Users/jiangsheng/.codex/sessions/2026/08/22/rollout-2026-08-22T20-09-57-01a02960-b0d2-77b0-8ca5-3404949b0ef7.jsonl` 第 194–252 行记录了提供 `cargo clean` 时未核验 cwd、manifest 和执行用户，导致用户连续执行两次失败的事件。
- `/Users/jiangsheng/.codex/sessions/2026/08/20/rollout-2026-08-20T07-16-02-01a01c4f-6b8a-73f2-bd2c-954dad1618e2.jsonl` 第 1171–1212 行记录了处理九个生成物时直到第八个才发现缺少 `zstd`，以及相关工作被串行推进的事件。
- 月度审计保守统计该问题至少涉及 6 条已完成任务链。

## 判断

该问题仍成立。优化 sparse 默认检出范围是合理的局部修正，但 sparse 只是统一执行环境完整性检查的一项输入；它不能解释或解决入口、cwd、运行用户、工具与 ignore 行为造成的其他失败。

## 影响

环境缺口会制造不属于用户真实流程的错误结论，重复消耗诊断时间，使验证无法进入目标用例，并可能在批处理或生成流程后期才迫使任务停工。

## 后续处理

需要单独进入设计阶段，定义执行前环境清单及失败报告边界，覆盖命令字面量、alias/function、固化入口、cwd、manifest、运行用户、必要工具、适用规则、schema、skills、生成产物和 sparse 输入。
