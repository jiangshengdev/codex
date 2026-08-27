# 执行环境预检不足

日期: 2026-08-24
状态: 📏 待复核
范围: Codex 命令入口、cwd、运行用户、工具、schema、skills 与 sparse 输入
优先级: P1

## 摘要

执行环境预检的提示词与 skill 规则层已经落地，并通过结构检查和独立十场景合成审计；这些结果尚不能证明真实任务中的环境误判已经消失，因此当前进入待复核状态。

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

原问题记录的入口、cwd、运行用户、工具、ignore 与 sparse 输入缺口均有真实历史证据，不能因规则提交完成而直接判定消失。当前已经建立按风险缩放的统一执行环境预检契约、通用 owner 与前端差异 owner，规则层修复完成；现有验证只证明文件结构、规则一致性和合成场景符合设计，不证明真实任务会稳定执行这些规则，更不证明存在运行时或工具级 enforcement。因此，该问题应保持“📏 待复核”，等待后续真实任务证据。

## 修复记录

- docs 提交 `8b3517d1a8f7350e31775ba68ecac62e0e0f641e` 记录了本次执行环境预检提示词治理的设计与计划文档。
- CONFIG 提交 `0234fed83755c98cb0368dbb645af453042c0997` 落地了全局短门禁、`$managing-work-stages` 的通用执行环境预检路由和详细 reference。
- GUI 提交 `7ee6b42aa6d87acb2d739e5cdfd584dad561f6d6` 落地了 `$codex-gui-toolchain` 的前端差异预检，同时保持 `codex-gui/AGENTS.md`、`$codex-gui-worktree` 和项目根 `AGENTS.md` 不变。

## 验证记录

- 两个变更 skill 的 `quick_validate` 均通过。
- 空白检查、skill name-set 检查和 staged 审查均通过。
- 独立十场景合成审计结果为 `10/10 PASS`，覆盖入口、cwd/manifest、执行用户、工具来源、ignore、sparse/generated 输入、目标命中、风险缩放、成功静默/失败报告和局部阻断行为。
- 上述结果属于规则结构与合成行为证据，不是后续真实任务复核，也不证明运行时或工具级 enforcement 已经存在。

## 影响

环境缺口会制造不属于用户真实流程的错误结论，重复消耗诊断时间，使验证无法进入目标用例，并可能在批处理或生成流程后期才迫使任务停工。

## 后续处理

后续以真实任务作为复核入口，观察用户真实命令或固化入口、cwd/manifest、执行用户、工具来源、ignore、schema/skills/generated/sparse 输入及验证目标命中是否都在依赖动作开始前完成核验，并确认预检成功时保持静默、失败时只阻断依赖范围且报告可操作差异。

只有在具有代表性的后续真实任务中，不再出现因绕过真实入口产生虚假错误、因环境身份错误重复失败、因 ignore 或 sparse 缺口误判输入不存在、到批处理中后期才发现工具缺失，或验证未命中目标却被当作证据的情况，才能将状态升级为 `✅ 已修复`。若真实任务仍出现任一旧症状，应保留或恢复未修复状态并记录新的运行证据。
