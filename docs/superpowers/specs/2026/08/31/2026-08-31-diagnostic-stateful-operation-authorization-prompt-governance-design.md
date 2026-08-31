# 计划外有状态诊断授权提示词治理设计

日期：2026-08-31

状态：已确认

确认日期：2026-08-31

确认原文：确认

设计分支：`dev`

设计时 HEAD：`1b6b3dc6a68a1c2844f9d02baafd6efc4aef8315`

关联 research：

- `docs/superpowers/research/2026/08/31/2026-08-31-diagnostic-stateful-operation-authorization.md`

## 唯一主目标

修正本机提示词治理，使未从已确认计划开始的调查在需要有状态诊断动作时先向用户请求授权，避免助手通过临时目录、项目快照、项目副本、throwaway harness、临时 worktree 或其他载体绕过授权，也避免明确授权后的调查被绝对只读规则卡住。

本设计只定义全局提示词与相关 skills 的职责分层、授权语义、调查期诊断测试例外、跨阶段生命周期和静态验收边界。它不是 implementation plan，不定义任务调度、提交顺序或实施命令，也不授权修改任何提示词或 skill。

## 保证边界

本方案属于提示词层治理，只能降低模型误读、错误扩张授权和过度设门的概率。它不提供工具调用前的 capability enforcement，也不能证明未来模型一定遵循自然语言规则。

本次已确认只进行结构与静态语义验证，不建设或运行新的提示词行为测试 harness。因此后续实施即使全部静态检查通过，也只能报告规则结构与静态语义已经验证；不得声称实际提示词遵循行为已经运行验证。

## 已确认设计决策

### 请求授权是计划外有状态诊断的正确路径

调研、排查、分析、诊断、审计、解释或报告默认只包含只读事实核验。若完成调查需要新增测试、写入文件、生成反馈环、建立项目快照或副本、创建 throwaway harness 或 worktree，或者执行其他尚未授权的有状态动作，助手必须先向用户请求授权。

授权请求必须披露并记录会改变执行结果的边界，包括：

- 具体动作及所属动作族；
- 精确目标与 canonical target；
- 使用的载体；
- 添加、运行、生成或其他允许操作；
- 预期副作用；
- 诊断产物的保留期限；
- 正式进入修复阶段后的删除、重写和验证生命周期。

工具可用、skill 强制流程、模型认为动作必要、系统临时目录豁免或换用另一种载体，都不能补足缺失授权。

### 授权前禁止载体绕行，授权后只按实际授权执行

在取得授权前，助手不得通过换目录、系统临时目录、项目副本、快照、throwaway harness、临时 worktree 或其他载体实施原本未获授权的有状态诊断动作。载体的临时性质、门禁豁免或技术可用性不产生动作授权。

取得授权后，只按实际授权的动作、目标、载体、参数和副作用执行。规则不得反向演变成对 worktree、临时目录、项目快照或其他方法的永久禁止；用户可以明确授权其中任一精确方法。

### 已确认计划覆盖时不重复请求

已确认计划若已经明确覆盖有状态诊断动作、目标、载体和副作用，该计划可以成为对应动作的授权来源，不得仅因执行到调查步骤而重复请求没有变化的授权。

计划外新增动作、目标、载体或副作用仍须重新判断授权。局部缺口只暂停受影响动作及其后继，不得无依据使整份计划或其他独立授权失效。

### 明确授权的诊断测试是调查期窄例外

纯调查仍默认严格只读。只有用户当前直接授权或已确认计划精确覆盖时，才允许在调查阶段添加并运行诊断测试；该例外不授权产品修复、重构、stage、commit、remote 或其他未声明动作，也不表示调查已经进入实现阶段。

诊断测试不得因为当前调查回合停止、等待用户决定、进入设计或进入计划而删除。它必须持续保留到正式进入已授权的修复阶段，确保后续调查仍能复核同一诊断证据。

### 修复阶段删除诊断测试并重写正式回归测试

只有正式进入已授权的修复阶段，才能确定调查阶段已经结束。此时按已确认生命周期删除诊断测试，并依据已经确认的根因重新编写正式回归测试。

正式回归测试不得直接沿用、改名或简单整理诊断测试。执行顺序必须是：

1. 删除调查期诊断测试；
2. 根据已确认根因重新编写正式回归测试；
3. 在修改产品代码前验证正式回归测试失败；
4. 实施修复；
5. 验证正式回归测试转绿，并完成计划内其他验证。

## 根因与 owner 分层

### 当前规则缺口

全局 `AGENTS.md` 的“系统临时目录不受项目外主动改动二次确认门禁”只豁免该门禁，本身不产生动作授权；当前文字没有就地写明这一点，容易被误读成临时载体已经获得有状态诊断授权。

`skills/managing-work-stages/references/read-only-and-exceptions.md` 当前又绝对禁止调查阶段的 workspace 变更，缺少“已经取得精确授权的诊断测试”窄例外。这会使中央授权已经成立时，阶段规则仍然阻止执行。

第三方 `diagnosing-bugs` 要求先建立可产生红色反馈的反馈环，并列出 failing test、headless script 和 throwaway harness 等方法。该规则形成真实冲突压力，但它属于自动安装的第三方 skill，不是本次手工修改 owner。

### 全局 `AGENTS.md`

全局文件只保留一条必须在 skill 加载前生效的简洁不变量：临时目录或其他载体的门禁豁免、临时性质和可用性不产生有状态诊断授权；计划外动作应先请求用户授权。

全局文件不复制授权记录字段、载体分类、阶段生命周期或事故案例。详细算法继续路由到 owning skills。

### `action-authorization`

`action-authorization` 是以下详细语义的 canonical owner：

- 计划外有状态诊断的动作族判断；
- 授权前禁止换载体绕行；
- 授权后按动作、目标、载体和副作用精确执行；
- 已确认计划覆盖时不重复请求；
- 计划外新增边界的局部重新授权；
- 临时载体绕权及明确授权后的正反事故案例。

主 `SKILL.md` 必须提供计划外有状态诊断与载体变化的 reference 路由，避免详细规则写入 reference 后无法稳定到达。详细规则由 `references/action-families.md` 和 `references/incident-acceptance-cases.md` 承载；现有 `authorization-record.md` 与 `capability-envelope.md` 已拥有所需字段和程序内部副作用边界，无需重复修改。

### `managing-work-stages`

`managing-work-stages` 是调查阶段例外与跨阶段生命周期的 canonical owner。`references/read-only-and-exceptions.md` 承载：

- 已明确授权的调查期诊断测试窄例外；
- 该例外与修复、重构和其他动作族的边界；
- 诊断测试跨当前回合停止、等待、设计和计划的保留；
- 正式进入已授权修复阶段时的删除、重写、先红后修复再转绿顺序。

`stage-gates.md` 已拥有计划内连续执行和阶段确认规则，不复制上述生命周期。

## 预期修改范围

后续实施计划应只考虑以下 5 个文件：

- `codex-config/AGENTS.md`
- `codex-config/skills/action-authorization/SKILL.md`
- `codex-config/skills/action-authorization/references/action-families.md`
- `codex-config/skills/action-authorization/references/incident-acceptance-cases.md`
- `codex-config/skills/managing-work-stages/references/read-only-and-exceptions.md`

`codex-config/AGENTS.md` 同时是 `~/.codex/AGENTS.md` 的 canonical 实际目标，实施前必须展示精确拟写内容并取得该受保护资源的独立明确写入确认。设计确认、计划确认、项目外修改确认或一般“继续”均不能替代该 special approval。

## 明确排除范围

- 不修改 `codex-gui/AGENTS.md`；它只拥有前端专属工程与验收规则。
- 不修改项目根 `AGENTS.md`；它只路由 `codex-gui/**` 的前端规则。
- 不修改 `.agents/skills/diagnosing-bugs/**` 或其他自动安装第三方 skills。
- 不修改 `action-authorization/references/authorization-record.md`、`capability-envelope.md`。
- 不修改 `managing-work-stages/references/stage-gates.md`。
- 不修改两个 skills 的 `agents/openai.yaml`、产品代码、GUI 测试或 Chip 焦点 BUG。
- 不创建临时项目、临时快照、临时测试、throwaway harness 或临时 worktree。
- 不建设提示词行为测试基础设施，不执行真实 negative/positive 行为验收。
- 不使用 Git remote、force、amend 或 squash。

## 静态验证设计

后续实施必须分别对两个受改 skill 运行全局规则指定的结构验证命令：

```text
uv run --no-project --with pyyaml python <quick_validate.py绝对路径> <skill目录>
```

该验证只证明 skill 结构有效。实施还必须：

- 审查精确 allowlist diff 和 `git diff --check`；
- 检查主 `SKILL.md` 到新增详细语义的 reference 可达性；
- 检查全局不变量、动作授权算法和阶段生命周期没有重复 owner 或相互冲突；
- 逐项审查事故案例是否同时覆盖未授权禁止、明确授权允许及计划已覆盖不重复请求；
- 独立反向审计最终组合状态，确认没有遗漏 owner、错误排除或生命周期断点。

这些检查不得被描述为实际模型行为证明。最终报告必须明确标记“实际提示词遵循行为未验证”。

## 风险与控制

### 全局规则过长或复制详细算法

控制：全局文件只增加结果级不变量；动作字段、案例与生命周期分别留在 canonical skill owner。

### 授权规则演变成永久方法禁令

控制：明确区分授权前禁止绕行与授权后按实际授权执行，正反案例必须同时证明不会越权和不会过度设门。

### 调查期例外被解释成修复授权

控制：例外只覆盖已明确授权的诊断测试添加与运行；产品修复、重构和其他动作族继续需要独立授权。

### 诊断测试过早删除或被直接转成回归测试

控制：生命周期终点绑定“正式进入已授权修复阶段”，并显式覆盖等待、设计和计划；修复阶段先删除，再依据已确认根因重新编写正式回归测试。

### Reference 存在但未被加载

控制：同步更新 `action-authorization/SKILL.md` 的按需路由，确保计划外有状态诊断会读取 owning reference。

## 实施门禁

- 本设计落盘后必须先由用户确认设计文件，才能创建计划文件。
- 计划文件落盘后必须由用户确认，才能进入实施。
- 执行已落盘设计与计划前，必须先把本次工作文档创建为独立本地 Git 提交。
- 修改 `codex-config/AGENTS.md` 前，必须展示精确拟写内容并取得面向其 canonical 受保护目标的独立明确写入确认。
- 修改当前项目根目录之外的 `codex-config` 前，还必须说明精确动作、canonical targets 和副作用，并取得项目外主动改动的单独确认。

## 设计结论

目标结构是一条简洁的全局消歧不变量、一个详细的动作授权 owner 和一个详细的阶段生命周期 owner。未授权时先请求用户授权，不得换载体绕行；已经获得授权或计划明确覆盖时，只按实际边界执行且不重复设门；调查期诊断测试保留到正式修复，再删除并依据根因重写正式回归测试。
