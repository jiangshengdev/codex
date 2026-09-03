# Codex GUI Skill Token Browser 大测试拆分设计

> 日期：2026-09-03
> 状态：已确认
> 设计基线：`968cbf2661c1fab19ea9f88263c05bf73f36065a`

## 唯一主目标

拆分
`codex-gui/src/features/composerEditor/__tests__/ComposerEditorSkillTokenPresentation.browser.test.tsx`
中的超时大测试，在不减少现有行为覆盖的前提下消除单测试 15 秒超时风险。

本设计只改变测试组织，不改变生产行为、测试配置、浏览器矩阵或超时阈值。

## 当前问题与根因

失败测试
`reprojects invalid sibling collision paths through delete, undo, redo, and draft restore`
把以下状态转换串在同一个测试中：

- 单一 Skill 进入同名碰撞状态；
- 删除 sibling 后路径从消歧形式收缩；
- undo 恢复碰撞，redo 再次收缩；
- 恢复 colliding draft，再恢复 single draft。

每个稳定状态都通过完整 Tooltip 生命周期验证必要路径。整条测试共执行 9 轮 Tooltip
打开、内容与安全披露检查、关闭及 selection 不变检查，并叠加输入、删除、undo、redo、
draft capture/restore 和对应的异步状态断言。

同一测试在 Chromium 和 WebKit 中分别耗时 10.526 秒和 11.625 秒；Firefox 运行到
15.875 秒后越过 15 秒单测试上限。当前 `SelectedSkillToken` 已显式设置 `delay={0}` 与
`closeDelay={0}`，测试内部也没有 `sleep` 或显式定时等待。因此现有证据支持的根因是：
单个测试聚合了过多真实浏览器交互，Firefox 的累计执行成本耗尽了单测试预算；不是 Tooltip
仍存在产品延迟。

15 秒阈值是当前失败的观测边界，不是拆分数量的机械指标。拆分依据是独立的行为族、状态转换和
失败定位边界。

## 设计

### 共享场景初始化

在当前测试文件内提取私有场景初始化 helper，建立每个拆分测试独占的 fixture：

1. 在 primary catalog 中选择 Alpha，并捕获 single draft；
2. 切换到 colliding catalog，选择 Beta，并捕获 colliding draft；
3. 切换到 empty ready catalog，确认两个 token 都被标记为 invalid；
4. 返回 controller、screen、editor、两个 Skill、路径集合及两个 draft。

每个测试重新 render 并初始化自己的 ComposerEditor，不共享 DOM、controller、draft 或其他可变状态。
helper 只隐藏 fixture construction，不拥有生产行为语义。

### 文件内私有 Tooltip 断言

把现有 `expectPathDetails` 提升为当前测试文件内的私有 helper，完整保留每轮检查：

- Tooltip 打开前不存在；
- hover 前后 Chip 的 `data-selected` 不变；
- hover trigger 后路径可见且位于真实 Tooltip 内；
- Tooltip 不泄露 `/private/` 和 `SKILL.md`；
- unhover 后路径和 Tooltip 都从 DOM 移除；
- 关闭后 selection 仍保持不变。

不得把该 helper 导出到共享 Browser test support。它只服务本文件的路径重投影场景，扩大共享
test-only API 会引入没有跨文件复用价值的接口。

### 三个独立行为测试

原测试拆成以下三个独立测试，每个测试执行 3 轮完整 Tooltip 验证：

1. **同名碰撞与删除收缩**
   - 初始双 token 分别显示 `alpha/shared` 与 `beta/shared`；
   - 删除 Beta 后 selected paths 只剩 primary；
   - Alpha 路径收缩为 `shared`。
2. **历史 undo/redo 重投影**
   - 删除 Beta 形成单 token 前置状态；
   - undo 后恢复双 selected paths，并分别显示两个消歧路径；
   - redo 后再次只剩 primary，路径收缩为 `shared`。
3. **draft restore 重投影**
   - 从单 token 当前状态恢复 colliding draft，确认双 selected paths 与两个消歧路径；
   - 再恢复 single draft，确认只剩 primary 且路径为 `shared`。

原有 9 个有意义的 Tooltip checkpoint 全部分配给新的行为测试，不删除、合并或改成只读 DOM
直查。删除、历史和恢复各自由一个测试拥有，失败时能够直接定位对应状态转换。

## 文件与 owner 边界

计划内唯一允许修改的代码文件为：

- `codex-gui/src/features/composerEditor/__tests__/ComposerEditorSkillTokenPresentation.browser.test.tsx`

测试仍通过现有 `ComposerEditorFixture`、controller、catalog 和 production Interface 验证真实行为。
不新增测试文件，不移动 collected test，不修改共享 fixture owner，也不新增 production test seam。

## 明确排除

- 不修改 `SelectedSkillToken.tsx` 或其他生产代码；
- 不提高全局或单测试 timeout；
- 不降低 worker 或浏览器并发；
- 不把测试或文件移入 sequential suite；
- 不拆分 `ComposerTurnControlPendingInput.browser.test.tsx`；
- 不减少 Chromium、Firefox、WebKit 覆盖；
- 不删除、放宽或改写现有路径、Tooltip、selection、invalid 与安全披露断言；
- 不以本次拆分承诺降低完整 Browser suite 的墙钟时间。

`ComposerTurnControlPendingInput.browser.test.tsx` 的 Firefox 文件总耗时虽为 38.889 秒，但它包含
22 个均通过的测试，最慢单测试为 5.656 秒，与当前单测试越过 15 秒的失败模型不同。当前证据不支持
把它或全局并发配置纳入同一设计。

## 风险与约束

- 三个测试重复初始化 fixture，文件累计执行时间可能持平或略增；这是换取单测试余量、测试隔离和
  精确失败定位的明确代价。
- 新增 helper 必须保持文件私有，不能变成跨 suite 的共享状态 owner。
- 不能仅凭一次通过宣称超时风险消失；Firefox 必须在完整并发入口中通过，因为当前失败是在该环境
  下出现。
- 若拆分后任一测试仍接近或越过 15 秒，应返回诊断边界定位具体等待，不能继续拆断言、提高 timeout
  或降低并发来隐藏失败。

## 验收

Level 1 必须确认：

- focused 文件在 Chromium、Firefox、WebKit 中非零收集并通过；
- 三个新测试分别拥有删除、undo/redo 和 draft restore 行为，原 9 轮 Tooltip checkpoint 及全部
  状态、安全披露和 selection 断言保持；
- 每个拆分测试都低于现有 15 秒测试上限；
- 完整 parallel Browser suite 通过，证明 Firefox 在原失败环境中不再超时；
- 完整 sequential Browser suite 继续通过；
- frontend formatter check、lint 与 type-check 通过。

本次是纯测试组织修改，不改变真实 Codex runtime、布局或产品交互，Level 2 与 Level 3 均不适用；
不需要可见桌面验收。
