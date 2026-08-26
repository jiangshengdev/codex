# 动作授权与范围状态不稳定

日期: 2026-08-24
状态: 🟡 部分完成，仍缺工具级强制与最终人工验收
范围: Codex 目标确认、动作授权、文件与行为范围控制
优先级: P0

## 摘要

提示词层已建立统一的动作授权 owner、阶段路由和子代理能力信封，并通过六类自动场景验证；工具级强制和最终人工新会话验收仍未完成，因此 P0 风险尚未关闭。

## 问题

执行过程把不同层次的状态混成单一门禁：分析或方案批评会被误当作实施授权，当前局部授权会被旧计划覆盖，只读或限定节点会获得写入、stage 或额外验证能力，受保护文件的专门确认也可能被其他确认错误替代。

## 证据

- 代理把“不要解决上游问题”理解反，并把只读分析扩成准备实施修复；随后承认误读和“擅自进入实现阶段”。证据位于 `/Users/jiangsheng/.codex/sessions/2026/08/11/rollout-2026-08-11T09-51-58-019fee84-f4df-76a2-8b9f-29eed2d427f5.jsonl` 第 291–304 行。
- 用户对方案提出批评后，代理把批评当作修改授权并启动后续代理，直到用户明确制止。证据位于 `/Users/jiangsheng/.codex/sessions/2026/08/12/rollout-2026-08-12T11-56-07-019ff41c-f7f2-7ca1-bcd5-38195675e271.jsonl` 第 1420–1462 行。
- 只读审计子代理修改计划。证据位于 `/Users/jiangsheng/.codex/sessions/2026/08/15/rollout-2026-08-15T14-10-20-01a0040a-efea-7722-8aa8-48ecd5802aaf.jsonl` 第 1329–1339 行。
- 限定任务的子代理额外运行 GUI CI 并暂存五个文件。证据位于 `/Users/jiangsheng/.codex/sessions/2026/08/18/rollout-2026-08-18T14-12-26-01a0137f-ed43-7031-85ba-8e295d3498bc.jsonl` 第 2020–2021 行。
- 未取得受保护全局 `AGENTS.md` 所要求的单独确认便通过符号链接修改实际文件。证据位于 `/Users/jiangsheng/.codex/sessions/2026/08/18/rollout-2026-08-18T15-09-29-01a013b4-2bd7-7ea3-8346-cd724d5a0f37.jsonl` 第 1685–1712 行。
- 用户已明确授权当前局部写入时，代理又机械要求确认另一份完整计划并错误宣布原计划作废。证据位于 `/Users/jiangsheng/.codex/sessions/2026/08/23/rollout-2026-08-23T15-42-35-01a02d92-4419-75f2-a046-a980ea7e3bd5.jsonl` 第 1129–1159 行。
- 月度审计保守统计显示，至少 9 条已完成任务链出现范围和授权处理不稳定，至少 5 条出现子代理权限和调度不受控。

## 判断

该问题已在提示词层部分缓解：目标、动作、范围、副作用和子代理能力不再由多份规则平行定义，而是路由到中央 `$action-authorization` skill。当前证据仍不能证明工具调用前存在 capability enforcement，也不能保证模型在所有入口和所有会话中必然选择并遵守该 skill；因此不能标记为已修复。

## 修复记录

- 设计与执行计划由提交 `1a00557703f18b4906662b1230f941baddbb3b4e` 落盘：`docs/superpowers/specs/2026/08/26/2026-08-26-action-authorization-prompt-governance-design.md` 与 `docs/superpowers/plans/2026/08/26/2026-08-26-action-authorization-prompt-governance-plan.md`。
- `codex-config` 提交 `c24bbb1976b8a9972f2364f59e0fd8f1fda74bc1` 新增中央 `skills/action-authorization/**`，集中维护动作族、授权记录、canonical target、special approval、事故验收案例和子代理能力信封。
- 提交 `8e0dcae6fb693d708147f491af4fcc28705fa61b` 将 `managing-work-stages` 路由到中央授权 owner；提交 `f0fa2a540cc3a8fe47fc601a4306c57271c10a07` 为 `delegating-micro-stages` 与执行图补充最小能力信封。
- 在用户完成受保护文件专门确认后，提交 `44041a9db45eaf7cc09676a29777ca03d5865fe2` 将全局 `AGENTS.md` 的详细平行规则收敛为五条简洁公理和中央 skill 路由。
- `/Users/jiangsheng/.codex/skills/action-authorization` 已安装为指向 `/Users/jiangsheng/cnb/codex-config/skills/action-authorization` 的符号链接；未修改 GUI、Rust 产品逻辑、upstream base prompt、Default collaboration prompt 或动作专用 skills。

## 验证记录

- `action-authorization`、`managing-work-stages`、`delegating-micro-stages` 均通过 `skill-creator` 的 `quick_validate.py`；canonical 配置仓库在验证后保持干净。
- `codex debug prompt-input` 已确认全局五条规则和 `action-authorization` catalog metadata 进入新会话模型输入。该检查不证明 skill 正文必然被选择或实际遵守。
- FWD-01 至 FWD-06 自动场景通过，覆盖排除范围反转、分析升级为实施、批评被当作授权、只读子代理写入、限定任务附带动作扩张和 symlink 绕过受保护目标。FWD-02 与 FWD-05 的负向会话首次因临时执行输出中断而缺少 `turn.completed`，在不扩大目录和动作范围的重试后通过。
- `codex exec --ephemeral` 启动阶段出现插件目录网络尝试和状态库维护警告；这些不是模型发起的工具调用，但意味着自动场景不能证明进程在隔离目录外绝无内部副作用。
- FWD-07 仍待用户在全新 root 会话中完成三轮局部授权、撤销和冲突隔离验收，当前不能声称所有入口行为已经实测一致。

## 影响

越权一侧会造成未授权写入、擅自修复、额外验证或暂存；过度设门一侧会造成重复确认、局部授权失效、撤销再恢复和无效停工。多代理会放大错误授权，使单次误判扩散到多个写入或验证节点。

## 后续处理

先完成 FWD-07 人工验收和最终只读 fan-in 审计；即使通过，也只确认本轮提示词治理完成。若要关闭本 P0，需要另行设计并实现工具调用前的 capability enforcement，并验证 GUI、CLI、TUI、普通 session 与子代理入口的统一执行语义。本 issue 不承载该后续 implementation plan。
