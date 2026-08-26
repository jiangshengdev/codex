# 用户语义与机器字面量漂移

日期: 2026-08-24
状态: 🟡 已缓解，仍有残留边界
范围: Codex 用户意图解析、对象识别与命令字面量保持
优先级: P1

## 摘要

历史上的语义与机器字面量漂移问题仍成立；全局 `AGENTS.md` 保真规则和 `instruction-fidelity` skill 已生效，当前形成概率性缓解，但尚未达到工具级强制保证。

## 问题

自然语言概括没有保留决定任务结果的语义锚点，命令、字段、路径和阈值也未按字面量核对。漂移既可能把目标扩成用户未要求的产品语义，也可能把参考理解推向逐行复制或极端删减，还可能直接改变 shell 命令含义。

## 证据

- “把反引号改为 Tag”被多次改写成子代理标签、emoji、中文说明或协议身份扩展。证据位于 `/Users/jiangsheng/.codex/sessions/2026/08/14/rollout-2026-08-14T11-41-15-019ffe5c-14b8-7b40-9264-f191f6edaf74.jsonl` 第 201–202、260、279–280、337–370、456、496–504 行。
- “展示分页”被改写成性能分页，并要求用户决定从未提出的目标。证据位于 `/Users/jiangsheng/.codex/sessions/2026/08/15/rollout-2026-08-15T14-10-20-01a0040a-efea-7722-8aa8-48ecd5802aaf.jsonl` 第 188–196 行。
- “参考配置”先被理解成逐行复制，纠正后又摆到只保留一行的另一极端。证据位于 `/Users/jiangsheng/.codex/sessions/2026/08/22/rollout-2026-08-22T14-14-04-01a0281a-de57-7cb3-a074-5f0655222bd3.jsonl` 第 445–486 行。
- `j c` 被合并成 `jc`，改变命令语义并启动受禁止的原生构建。证据位于 `/Users/jiangsheng/.codex/sessions/2026/08/22/rollout-2026-08-22T14-14-04-01a0281a-de57-7cb3-a074-5f0655222bd3.jsonl` 第 1225–1274 行。
- 用户明确要求非折扣美元价格后，代理仍把促销价称为正常价格。证据位于 `/Users/jiangsheng/.codex/sessions/2026/08/23/rollout-2026-08-23T11-01-37-01a02c91-082a-7522-9b28-9be2b8ef1674.jsonl` 第 56–113 行。
- 用户要求评估测试代码重复，代理却评估了重构后的测试覆盖。证据位于 `/Users/jiangsheng/.codex/sessions/2026/08/23/rollout-2026-08-23T14-06-25-01a02d3a-381b-7f60-90d9-5ee4c152f3ad.jsonl` 第 780–796 行。
- “9 分以上”被理解成 9.x，漏掉 10.0。证据位于 `/Users/jiangsheng/.codex/sessions/2026/08/23/rollout-2026-08-23T14-38-01-01a02d57-26d1-7a51-9480-82c7be57ea4c.jsonl` 第 3288–3313 行。
- 月度审计保守统计显示，至少 10 条已完成任务链出现关键名词、对象或字面量漂移。

## 判断

历史问题及其事故机制仍成立。全局规则与专用 skill 的治理已经落地，并通过合成行为场景证明当前版本能够保持所验收的语义锚点和机器字面量，因此问题已从“仍需处理”缓解为“仍有残留边界”。但这些约束仍依赖模型遵循提示词，不是工具执行前的确定性 enforcement；现有证据不能证明历史漂移机制已经消失，也不能把状态提升为已修复。

## 修复记录

- config 仓库提交 `ceb62a7` 新增 `instruction-fidelity` skill，提交 `806c1b9` 将保真规则加入全局 `AGENTS.md`，提交 `2bd4f3f` 将该分支合入 `main`。
- config 仓库提交 `7d2ff2a4d90eb624045c1ecd6b01d389093a3df1` 为 `instruction-fidelity` skill 加入跨 agent、backend、planner 和 execution boundary 的忠实转交契约，要求保留原对象、动作、结果、后续纠正、所有当前约束及精确机器字面量。
- Codex 仓库提交 `31f2cc8df` 记录已确认的设计与计划文档，为本轮治理提供可审计的决策和执行依据。
- 提交 `ce8dc54a7` 对 realtime 项目提示词的改动已由 `63f2ab2c4` 回退，不属于当前有效修复，也不属于用户后续所称“提示词”的范围；这里的“提示词”仅指 `AGENTS.md`，不得把已回退的 realtime 项目提示词文件或相关测试当作当前修复证据。

## 验证记录

- 2026-08-26 使用固定 App CLI `/Applications/ChatGPT.app/Contents/Resources/codex`（`codex-cli 0.150.0-alpha.8`）执行三组 `--ephemeral` 合成行为验收，三次均 exit 0：
  - 转述“评估未重构测试代码中的重复”时保持未重构范围，并明确排除重构后的覆盖率。
  - 原样保留 `j c` 为两个 shell token，且未执行该命令。
  - 保留“只看非折扣美元价格”“评分 9 分以上且包含 10 分”“排除 credits”三项约束。
- 第二、三组验收仅为加载 `instruction-fidelity` skill 进行了只读内部读取，均未执行用户任务。
- `instruction-fidelity` skill 的 `quick_validate.py` 结构验证与 YAML 解析均通过。已回退的 realtime Rust 测试不计入当前有效修复的验证证据。

## 影响

语义漂移会导致做错对象、提出无关决策、错误解释用户限定和重复返工；字面量漂移还可能运行不同命令、进入错误执行路径或触发本应禁止的构建与状态变更。

## 后续处理

继续在真实任务中观察全局规则与 `instruction-fidelity` skill 的稳定性，并记录未覆盖入口和残留漂移。后续治理只通过 `AGENTS.md` 或 skill 补足未覆盖入口，不修改项目中的提示词代码文件。若要将状态升级为 `✅ 已修复`，需先用上述两类载体覆盖残留场景并完成真实任务复核；本 issue 不展开 implementation plan。
