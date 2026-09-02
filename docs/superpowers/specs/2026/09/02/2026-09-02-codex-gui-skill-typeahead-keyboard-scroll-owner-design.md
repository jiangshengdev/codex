# Codex GUI Skill Typeahead 键盘滚动 owner 修复设计

## 状态

- 设计状态：已确认并落盘
- 日期：2026-09-02
- 当前分支：`dev`
- 设计基线：`f31e15eb1e2abf5f23f90621e4d0d8301e22d7a7`
- Lexical 基线：`@lexical/react@0.49.0`
- 关联历史提交：`d7631c45fadee6247ab0887e2bc3cc642993d89c`
- 关联既有计划：
  `docs/superpowers/plans/2026/09/01/2026-09-01-codex-gui-composer-rich-text-skill-equation-parity-plan.md`

本文只设计 Skill Typeahead 键盘滚动失败的根因修复，不构成计划、实现、验证、stage 或
commit 授权。既有 Composer RichText 设计与计划保持不变；本设计作为处理 3 个 AppShell
滚动失败的新主题文档独立保存。

## 唯一目标

在保留多 Composer 唯一 ARIA ID、Lexical 键盘选中 owner 和唯一内部滚动 owner 的前提下，
让 Skill 菜单随键盘选中正确滚动，并恢复首末候选项的精确 Browser 覆盖。

## 已确认根因

当前失败不是 AppShell 菜单锚定、响应式布局或 active index 错误，而是滚动 owner 断链：

1. Lexical `LexicalMenu.tsx` 创建的菜单 anchor 使用固定 `id="typeahead-menu"`。
2. Composer 为支持同时存在的多个编辑器，在 `SkillTypeaheadPlugin.tsx` 中把 anchor ID 同步为
   每个编辑器唯一的 `composer-skill-menu-*`，并据此维护 `aria-controls` 和
   `aria-activedescendant`。
3. Lexical 的私有 `scrollIntoViewIfNeeded()` 通过 `target.closest('#typeahead-menu')` 查找容器；
   固定 ID 被替换后，该函数提前返回，不再滚动 active option。
4. `d7631c45f` 删除了 Composer 原有的
   `activeOption?.ref?.current?.scrollIntoView({ block: "nearest" })`，并同时删除了直接 Browser
   测试中的精确首末滚动边界断言。

因此方向键仍能把 `selectedIndex` 移动到最后一项，ARIA active 状态也正确，但
`[data-skill-menu-scroll-region]` 的 `scrollTop` 保持 `0`，active option 留在可视区域之外。
Chromium、Firefox 和 WebKit 的精确目标测试均复现同一结果。

## 必须保持的合同

- Lexical 继续唯一拥有 query、`selectedIndex`、ArrowUp/ArrowDown、首尾循环、Enter 和 Escape
  的 typeahead 行为。
- Composer 继续维护每个编辑器唯一的 menu/option ID、`aria-controls` 和
  `aria-activedescendant`；不得退回全局 `#typeahead-menu`。
- HeroUI Select 外层 surface 继续只负责视觉 clipping；候选区域继续只有一个
  `[data-skill-menu-scroll-region]` 内部滚动 owner。
- `SkillCatalogStatus` 继续位于候选滚动区域之外，在 `refreshing`、`stale` 和 partial-error
  状态下保持可见。
- pointer hover 继续只改变视觉状态，不改变 active option，也不触发把离屏 active option
  拉回视区的滚动。
- 页面、Composer、菜单 anchor 和菜单 surface 不得因候选项内部滚动而改变位置。
- 不放宽、删除或绕过当前 AppShell 失败断言。

## Owner 设计

| 对象 | 权威 owner | 职责 |
| --- | --- | --- |
| typeahead 键盘与选中状态 | Lexical | 维护 query、索引、方向键、循环导航和事件消费 |
| 当前 active option 的菜单内可见性 | Composer `SkillMenu` | 在选中索引变化后滚动当前 option，不复制键盘状态 |
| 多编辑器 ARIA 关联 | Composer `SkillMenu` | 维护每个编辑器唯一的 menu/option ID 和 root ARIA 属性 |
| 候选滚动 | `[data-skill-menu-scroll-region]` | 作为唯一 `overflow-y` owner 承载长列表滚动 |
| surface clipping | HeroUI Select popover surface | 裁剪圆角与阴影，不承担候选列表滚动 |
| pointer hover | 现有 CSS/DOM 投影 | 仅视觉反馈，不改变 Lexical active 状态 |

Composer 只补齐自定义 renderer 的视图副作用，不注册第二套 ArrowUp/ArrowDown command，
不重新实现 Lexical 的索引或 wrap 逻辑。

## 修复设计

在 `SkillMenu` 内恢复窄的 active-option 滚动接缝：

1. 由现有 `selectedIndex` 和 `options` 派生当前 `activeOption`。
2. 使用 `useLayoutEffect`，在 DOM 绘制前读取 `activeOption.ref.current`。
3. ref 存在时调用 `scrollIntoView({ block: "nearest" })`；不存在时 no-op。
4. effect 只依赖 active option 的变化，不响应 pointer hover，也不改变 query、selection、ARIA
   或菜单生命周期。

该接缝已由 `SkillMenu` 当前输入直接提供，不需要新增 helper、全局查询、DOM ID fallback、
额外状态或 production test hook。

### 为什么不修复 Lexical 固定 ID

- `#typeahead-menu` 是 Lexical 0.49 的内部实现字面量，不是 Composer 可依赖的多实例合同。
- 恢复固定 ID 会使同时打开的多个 Composer 产生重复 ID，并破坏当前已验证的 ARIA 隔离。
- 修改或 patch `node_modules` 会扩大到依赖维护边界，而当前 renderer 已有足够的本地 ref 接缝。

### 为什么不拦截 Lexical 滚动 command

Lexical 的 ArrowDown 会派发 `SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND`，但 ArrowUp 直接调用私有
滚动函数。只拦截公开 command 不能覆盖双向循环，因此不是完整根因修复。

### 为什么不手写 `scrollTop` 几何算法

`scrollIntoView({ block: "nearest" })` 可能影响可滚祖先是需要验证的风险，但当前没有证据证明
现行布局会触发该副作用；相反，历史实现和现有 AppShell 合同已经提供直接的页面、Composer 与
菜单位置稳定检查。仅以“更安全”为由新增边界差值、padding 和 scrollTop 计算，会引入第二套
跨浏览器几何 owner，超出已证实的最小必要动作。

因此设计选择恢复浏览器原生 nearest 滚动，并把外层不滚动作为硬验收。若后续执行证据证明
native API 在受支持场景中确实滚动外层祖先，应停止受影响节点并回到设计，而不是静默加入手写
几何 fallback。

## 生产修改范围

只修改：

- `codex-gui/src/features/composerEditor/SkillTypeaheadPlugin.tsx`

预期行为修改只有恢复 active option 的菜单内可见性。不得同时移动或重排 import、声明、函数、
分支或组件；若格式工具产生纯顺序变化，须按既有提交边界单独处理。

## Browser 回归设计

### 直接 owner 覆盖

修改现有：

- `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`

在现有 catalog-state 参数化测试中恢复 `d7631c45f` 删除的精确断言，不新建平行测试矩阵：

- `ready`、`refreshing`、`stale`、partial-error 均有 25 个候选项；
- 初始首项 active，滚动区域存在真实 overflow，`scrollTop === 0`；
- 首项按 ArrowUp 后循环到末项，末项 active、ARIA 与 editor focus 正确；
- 末项到滚动区底边保持 6px clearance，`scrollTop === maximumScrollTop`；
- 末项按 ArrowDown 后循环到首项，首项到顶边保持 6px clearance，`scrollTop === 0`；
- listbox padding 与 scroll padding 均保持 6px；
- catalog banner 始终位于滚动区域之外并保持可见。

现有下列测试继续负责独立合同，不因本修复扩成组合矩阵：

- clipped Select surface 与唯一 nested scroll owner；
- 同时存在多个 Composer 时的唯一 ID、ARIA 和键盘 owner；
- pointer hover 不改变 active、不把离屏 active 拉回；
- drawer 菜单容器归属与选择后的 focus 恢复。

### AppShell 集成覆盖

保留现有文件及断言：

- `codex-gui/src/__tests__/AppShell.browser.test.tsx`

该测试继续在 400×876 和 1440×900 下证明：

- active option 能移动到最后一项并进入内部滚动区可视范围；
- 内部滚动区 `scrollTop > 0`；
- document scrollTop、document 尺寸、Composer bottom、菜单位置、宽度、间距和高度上限稳定；
- 菜单完整位于 viewport 内。

`AppShell.browser.test.tsx` 是既有集成验收，设计不预设修改它。只有执行证据证明断言本身未覆盖
已确认合同，才允许回到计划重新判断测试修改范围；不得为转绿放宽断言。

### 验证层级

- focused Browser：必须在 Chromium、Firefox、WebKit 中非零收集并通过直接边界测试和 AppShell
  响应式测试。
- frontend 静态验证：按 live `codex-gui/package.json` 入口执行格式检查、oxlint、ESLint 和
  type-check。
- 完整 Browser fan-in：属于既有 RichText 计划的后续节点；本修复完成后仍必须单独报告已知
  composition 失败，不能把 focused 通过表述为原计划 F0、L2、G6 或 F6 完成。
- Level 2：只在后续计划明确纳入且使用当次真实 Codex runtime URL 时执行；本设计不授权启动
  runtime 或浏览器。

## 明确排除

- 不修复或修改现有 11 个 composition 失败。
- 不修改 `AppShell.browser.test.tsx` 的既有失败断言。
- 不修改 app-server、protocol、Skill catalog、draft、queue、clipboard、payload 或隐私合同。
- 不修改 Lexical、HeroUI、package、lockfile、schema、generated artifacts 或 Lingui catalog。
- 不增加 ArrowUp/ArrowDown command、索引状态、全局 DOM 查询、固定 ID fallback 或手写滚动几何。
- 不安装依赖、runtime 或 browser binary。
- 不启动可见浏览器、DevTools 或真实 Safari。
- 不执行 remote、force、amend、squash、stage、commit 或清理失败现场。

## 设计验收条件

设计只有在后续计划同时保留下列结果约束时才可进入实现：

1. 根因修复落在 Composer 自定义 renderer 的 active-option 视图副作用，不改变 Lexical 键盘
   owner 或多编辑器 ARIA ID。
2. 唯一内部滚动 owner、catalog banner、pointer-hover visual-only 和外层几何稳定合同全部保留。
3. 直接 Browser 测试恢复首末 `0`/`maximumScrollTop`、6px clearance 与四种 catalog 状态覆盖。
4. AppShell 现有响应式断言保持严格，不通过豁免、基线修改或断言放宽隐藏失败。
5. composition 失败保持独立，未经新任务授权不得顺手修复。
