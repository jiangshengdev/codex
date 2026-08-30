# Skill typeahead 全量候选与来源排序分区设计

日期：2026-08-30

状态：已确认

## 唯一主目标

在不改变 skill typeahead 现有视觉、交互、可访问性、菜单几何与 catalog 权威边界的前提下，让仅输入 `$` 时的全部已启用候选按来源和显示名称形成稳定排序分区，并让仅输入 `$` 与输入搜索词两种状态都不再受前端 20 项上限截断。

## 文档关系与覆盖边界

本文是以下既有设计的定向增量修订：

- `docs/superpowers/specs/2026/08/19/2026-08-19-codex-gui-skill-input-completion-design.md`
- `docs/superpowers/specs/2026/08/19/2026-08-19-codex-gui-composer-skill-interface-usability-design.md`
- `docs/superpowers/specs/2026/08/29/2026-08-29-codex-gui-skill-typeahead-heroui-style-design.md`
- `docs/superpowers/specs/2026/08/29/2026-08-29-codex-gui-skill-typeahead-select-popover-style-design.md`
- `docs/superpowers/specs/2026/08/30/2026-08-30-skill-typeahead-keyboard-scroll-edge-gap-design.md`

发生冲突时，本文只在以下两项上优先：

1. 覆盖既有设计中的前端 20 项硬上限和“候选必须有显式数量上限”要求，改为返回当前 catalog snapshot 中的全部匹配候选。
2. 覆盖仅输入 `$` 时按 canonical `name`、`path` 排序的既有规则，改为按来源排序分区，并在分区内按 `displayName`、canonical `name`、`path` 排序。

输入非空搜索词时继续继承既有全局匹配分数排序及 canonical `name`、`path` tie-break。上述文档中的 HeroUI 视觉、来源标签、碰撞 path、Lexical owner、ARIA、IME、加载与错误状态、菜单 placement、滚动几何、队列和提交身份等其他结论继续有效。

## 当前事实与问题

### 数量限制来自前端查询层

`skills/list` 对当前 cwd 返回完整 skill 数组，不提供 `limit` 或 cursor。GUI catalog owner 只消费 cwd 精确匹配的 entry，并过滤出 `enabled === true` 的候选。

当前 `querySkills()` 在完成匹配与排序后执行 `slice(0, MAX_SKILL_QUERY_RESULTS)`，而 `MAX_SKILL_QUERY_RESULTS` 固定为 `20`。因此截图中的缺项不是 API 分页、服务端上限或菜单可视高度造成的；提高 API 上限不能解决该问题。

### 空查询与搜索查询共用同一排序尾部

仅输入 `$` 时，typeahead 把空字符串传给 `querySkills()`。所有候选的空查询 score 都是 `0`，随后按 canonical `name`、`path` 排序。

输入搜索词时，查询只匹配 canonical `name` 与 `interface.displayName`，按大小写不敏感的子序列匹配分数全局排序；description 与 short description 不参与匹配。当前两种查询状态最终都经过同一个 20 项截断。

### 菜单已经具备长列表滚动能力

候选仍渲染在单一扁平 listbox 中。popover 保持既有最大高度，候选区域是唯一纵向滚动 owner，active option 通过 Lexical 的连续 index 和 `scrollIntoView({ block: "nearest" })` 保持可达。

因此，“一次性全部展示”的准确含义是：所有符合当前查询条件的候选都进入同一份可滚动结果列表，不分页、不提供“显示更多”、不做前端数量截断；它不表示所有候选必须同时出现在可见 viewport 内。

## 已确认产品决策

本次设计共完成 3 项实质决策：

1. 仅输入 `$` 时按来源形成固定排序分区：`repo` → `user` → `admin` → `system`。
2. 输入非空搜索词时不按来源分区，全部匹配项继续按全局匹配分数排序。
3. 仅输入 `$` 时，每个来源分区内部按 `displayName` 排序；相同时依次以 canonical `name`、`path` 打破同序。

用户随后明确纠正：“分组不改变视觉。也就是说。只是先按分组排序”。因此，本文中的“分组”只表示连续排序分区，不表示可见 section 或新的 DOM/ARIA 结构。

## 排序设计

### 仅输入 `$`：浏览排序

空查询返回 catalog snapshot 中的全部候选，并依次使用以下稳定排序键：

1. `scope` 的固定 rank：`repo = 0`、`user = 1`、`admin = 2`、`system = 3`；
2. `displayName`；
3. canonical `name`；
4. canonical `path`。

`displayName` 继续复用现有定义：trim 后非空的 `interface.displayName`，否则回退到 canonical `name`。排序不得改用本地化来源标签、description、short description、可见碰撞 path 或 filesystem 推导值。

固定 scope rank 不随界面语言变化。本地化只改变每行右侧来源标签文本，不改变排序身份或顺序。

### 输入搜索词：搜索排序

非空查询保留现有匹配字段和评分算法：

- canonical `name` 与 `displayName` 分别评分，取较优分数；
- 按 score 降序进行跨 scope 的全局排序；
- score 相同时继续按 canonical `name`、`path` 稳定排序；
- description 与 short description 仍不参与匹配或排序；
- 不插入 scope rank，不因来源把更好的匹配压到较差匹配之后。

### 全量结果

空查询和非空查询都返回全部符合条件的结果，不保留固定常量上限，也不使用一个更大的替代上限。这里的“全部”严格受当前 catalog snapshot 约束：

- 只包含当前 thread cwd 精确 entry 中 `enabled === true` 的 skill；
- 不包含 disabled skill、其他 cwd 的 skill 或未成功加载的数据；
- 不授权 GUI 扫描 `.codex/skills`、`.agents/skills`、插件缓存或 `SKILL.md`；
- refresh、partial error、stale 与 retry 继续沿用既有 catalog owner 语义；
- 非空查询只包含匹配项，不把未匹配候选混入结果。

## 视觉、DOM 与交互不变量

排序变化不得产生任何视觉分组。最终仍满足：

- 只有一个扁平 listbox 和一组连续 option；
- 不新增组标题、分隔线、组间留白、sticky header、折叠区或计数；
- 不新增 `role="group"`、不可选伪 option 或其他 ARIA 层级；
- 每行右侧继续永久显示现有本地化来源标签；
- 候选行名称、canonical name、description、碰撞 path、padding、hover、active 和 focus ring 布局不变；
- option ID 与 Lexical active index 继续按最终扁平 options 数组的连续 index 生成；
- Arrow、Enter、Tab、Escape、pointer/touch、IME 与 editor focus owner 不变；
- canonical `name + path` 继续作为 option key、选择身份、`SkillNode` 和结构化提交身份。

排序分区只是数据顺序，不应在 `SkillTypeaheadPlugin` 的渲染层重新建立一套分组模型。

## 滚动与响应式边界

全量结果不得改变既有菜单几何：

- popover 的宽度、最大高度、above/below placement、viewport 闭合和 drawer host 边界保持不变；
- candidate scroll region 继续是唯一候选纵向滚动 owner；
- 状态区域继续位于候选滚动区域之外；
- listbox padding、scroll padding、完整 focus ring 与严格首尾 `0/max` 键盘滚动契约保持不变；
- 长列表通过内部滚动到达所有候选，不扩张 popover 来同时显示全部行；
- 不新增横向滚动，长名称、canonical name、description、来源标签和碰撞 path 继续满足既有 overflow 约束。

## 验证设计

后续实施计划必须覆盖以下产品性质：

### 查询与排序

- 超过 20 个候选时，空查询返回全部候选，不存在 20 项或替代固定上限。
- 空查询的 scope 连续顺序严格为 `repo`、`user`、`admin`、`system`。
- 每个 scope 分区内部按 `displayName`、canonical `name`、`path` 稳定排序。
- `displayName` 缺失或 trim 后为空时按 canonical `name` 回退。
- 非空查询跨 scope 按全局 score 排序，较优匹配不被 scope rank 压后。
- 非空查询超过 20 个匹配项时返回全部匹配项，并保留 canonical `name`、`path` tie-break。
- description 与 short description 仍不参与匹配。

### 视觉与可访问性无回退

- 排序前后 DOM 中仍只有单一扁平 listbox，不出现标题、separator、group role、伪 option 或额外布局节点。
- 每行来源标签、canonical name 渐进披露、碰撞 path、description 和 accessible name 保持既有结果。
- 初始 active option、Arrow 循环、Enter 选择和 `aria-activedescendant` 对应新的扁平顺序。
- 超过 20 项的真实长列表继续在既有 candidate scroll region 内滚动，键盘可以到达首项和末项，严格 `0/max` 与完整 focus ring 不回退。
- `ready`、`refreshing`、`stale`、partial-error、failed/retry、窄 viewport 与 drawer placement 的既有行为不回退。

本次产品结果不依赖可见桌面状态。后续验证以针对排序函数的自动测试和无头 Browser Mode 几何/交互验收为主；只有另有证据表明结果依赖真实可见桌面状态，才进入需单独授权的有头验收。

## 范围

本设计包含：

- skill query 结果数量限制的移除；
- 空查询的 scope 排序分区和组内 `displayName` 排序；
- 非空查询继续使用全局匹配分数排序；
- 直接受影响的前端查询测试与无头 Browser Mode 回归边界。

## 非目标

- 新增任何可见分组 UI 或改变候选行视觉；
- 修改 HeroUI 样式、来源标签、本地化 catalog、碰撞 path 或 description 展示；
- 修改匹配算法、匹配字段、query trigger 或 IME 行为；
- 引入分页、“显示更多”、虚构的更高固定上限或服务端 limit；
- 引入按使用频率、最近使用、插件、path 目录或本地化标签的排序；
- 修改 Rust、app-server v2、protocol、schema、generated TypeScript、catalog discovery、queue 或提交载荷；
- 编写实施计划、修改 production 代码、运行验证、stage 或 commit。

## 风险与约束

- catalog 候选数不再由 20 项硬上限约束，渲染成本随当前 catalog snapshot 线性增长；不得用静默截断恢复性能。若后续证据显示现实 catalog 规模造成可测量问题，应作为新的事实与设计任务处理，不能在本目标中重新加入数量限制。
- scope rank 必须对四种生成协议枚举值穷尽处理；新增 scope 时应产生明确的编译或测试失败，不能默认落入任意分区。
- 排序 comparator 必须保持确定性，最终以 canonical `path` 收束；不得依赖 catalog 原始返回顺序。
- 全量结果仍必须保留既有碰撞消歧。排序相邻或分区相同不能把不同 canonical path 的合法候选折叠或去重。

## 设计完成标准

- “分组”被准确限定为 repo → user → admin → system 的排序分区，没有任何视觉或 ARIA 分组变化。
- 空查询按 `scope`、`displayName`、canonical `name`、`path` 排列全部候选。
- 非空查询跨 scope 按现有匹配分数排列全部匹配项。
- 两种查询状态均不存在固定结果数量上限，同时继续使用现有最大高度和内部滚动。
- 既有 HeroUI、Lexical、ARIA、来源标签、碰撞 path、菜单几何、catalog 与提交身份契约全部保留。
- 本文经用户明确确认后，下一轮才能落盘实施计划；本文本身不授权实现。
