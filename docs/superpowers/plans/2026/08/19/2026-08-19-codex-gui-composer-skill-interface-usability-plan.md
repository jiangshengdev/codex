# Codex GUI Composer 与 Skill 候选界面可用性实施计划

状态：已确认

日期：2026-08-19

对应设计：`docs/superpowers/specs/2026/08/19/2026-08-19-codex-gui-composer-skill-interface-usability-design.md`

诊断记录：`docs/superpowers/research/2026/08/19/2026-08-19-codex-gui-skill-typeahead-layout-regression.md`

## 目标

在不改变 Lexical 编辑模型、skill identity、catalog、queue 或 app-server 协议的前提下，修复 Composer 与 `$skill` 候选界面的两个根因：让候选菜单由 Composer panel 的真实几何 owner 管理，并恢复统一 Composer 外壳的 HeroUI field、focus、disabled、placeholder 与多行增长契约；最终在桌面和窄屏下达到可读、可操作、布局闭合且具备基本审美的人类可用标准。

## 当前代码证据

- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx:193-213`
  已拥有 sticky `composer-shell` 和 `relative`、`max-w-3xl` 的 `composer-panel`，同时知道完整 Composer 宽度、高度、操作栏和 disabled 状态；这里应成为候选菜单的几何与 Composer field owner。
- `codex-gui/src/features/composerEditor/ComposerEditor.tsx:113-137`
  的 contenteditable 只有 `min-h-24`、透明背景、padding 和 `outline-none`；placeholder 是相对整个 panel 绝对定位的兄弟节点，没有局部编辑区坐标系、增长上限或可见 focus 状态。
- `codex-gui/src/features/composerEditor/SkillTypeaheadPlugin.tsx:135-205`
  将固定 `w-80` 菜单 portal 到 Lexical caret-sized anchor。Lexical 默认把 anchor 追加到 `body`，按 query Range 写入 `top/left/width/height`，并用 contenteditable root 内部空间决定翻转。
- Lexical 0.49.0 的 `LexicalTypeaheadMenuPlugin` 原生支持 `parent` 和
  `anchorClassName`；可以保留其 trigger、query、active descendant 和 selection owner，不需要 fork Lexical 或复制 menu primitive。
- `SkillTypeaheadPlugin.tsx:207-249` 已由 Lexical `selectedIndex`、
  `setHighlightedIndex`、`selectOptionAndCleanUp` 和 `aria-selected` 统一管理候选状态；直接替换为 HeroUI `ListBox` 会引入第二套 focus/selection owner。
- `codex-gui/src/features/composerEditor/skillQuery.ts:9-15,54-60` 当前只返回
  `sourceLabel` 与重名布尔值，还没有“最短唯一父路径”的显示投影。
- `ComposerEditor.browser.test.tsx` 只证明 ARIA、数量和 DOM focus；
  `ComposerTurnControl.browser.test.tsx` 反而断言 `bg-transparent`；
  `composer-viewport.browser.test.tsx` 使用 mocked rect，均不能证明真实 sticky Composer 的 viewport 闭合。
- `codex-gui/src/__tests__/App.browser.test.tsx` 已提供完整
  `RootApp → CurrentTaskPage → ComposerTurnControl` fixture、真实 document scroller、sticky Composer bottom 几何 helper 和 skill catalog command fixture，是响应式布局验收的权威落点。

## 权威边界与组件选择

### 状态与几何 owner

- `ComposerTurnControl`：拥有统一 Composer 外壳的 disabled/field 状态，并提供与 panel 等宽、位于上方的 menu layer。
- `ComposerSkillMenuLayer`：新的叶子组件，只拥有 portal host、visual viewport 可用高度、panel 上方 placement、宽度和 stacking；不读取 query 或候选状态。
- `ComposerEditor`：继续拥有唯一 Lexical editor，新增 portal parent 透传和局部 editor/placeholder 盒模型；不计算菜单几何。
- `SkillTypeaheadPlugin`：继续拥有 trigger、query、候选、active index、选择和 ARIA；通过 Lexical `parent`/`anchorClassName` 使用 Composer 提供的 host。
- `skillQuery`：机械派生候选显示投影，包括重名组的最短唯一父路径；canonical path 本身仍来自权威 `SkillMetadata`。

### HeroUI v3

- Composer 外壳保留 `Surface variant="default"`，并使用 field 语义：
  `bg-field`、`text-field-foreground`、`text-field-placeholder`、
  `shadow-field`、`rounded-field`、`--field-border*`、
  `status-focused-field` 和 `status-disabled`。
- 候选菜单使用 `Surface variant="secondary"`。
- 候选列表滚动区使用 `ScrollShadow`，保持 vertical、`visibility="auto"` 和可见原生滚动条。
- 候选列表与固定详情区之间使用低强调 `Separator variant="tertiary"`。
- 候选项继续使用语义 `<ul>/<li role="option">`；不采用 HeroUI `ListBox`，因为 Lexical 已是键盘、selection 和 active-descendant 的权威 owner。
- 不恢复 HeroUI `TextArea` 或 `InputGroup`；它们会产生第二编辑内核。

## 实施与提交规则

- 用户明确确认本计划前不得开始实施。
- 计划确认后，必须先完成任务 0 的文档独立提交；该提交成功前禁止修改任何生产代码或测试。
- 实施使用 `$managing-work-stages`、`$project-doc-workflow` 和
  `$delegating-micro-stages`；编辑、验证、stage、staged diff 审查和 commit 按依赖顺序拆成微阶段。
- 每个任务只暂存本任务文件，检查 staged diff，并创建一个独立本地提交。
- 已提交任务的任何修正使用新的独立提交，禁止 amend。
- 不做与行为无关的 import、声明、函数、组件或文件重排；若实现中证明必须纯重排，停止并扩展计划为单独提交，不能混入行为提交。
- 使用项目原生命令格式化明确文件；不通过 lint disable、断言放宽、overflow 裁切、fallback、隐藏 textarea 或双写状态通过验证。
- 所有 pnpm 命令在 `codex-gui` 中通过
  `/opt/homebrew/bin/fnm exec --using-file pnpm ...` 执行；不安装或更新依赖。
- 不运行后端或原生构建命令，不操作 Git 远程。

## 提交序列

0. `docs(gui): record composer skill interface usability work`
1. `fix(gui): restore composer field interaction states`
2. `fix(gui): bound composer editor growth`
3. `fix(gui): anchor skill menu to composer`
4. `fix(gui): improve skill candidate scanning`

## 任务 0：提交本次设计与计划文档

**文件**

- 新建并提交：`docs/superpowers/specs/2026/08/19/2026-08-19-codex-gui-composer-skill-interface-usability-design.md`
- 新建并提交：`docs/superpowers/plans/2026/08/19/2026-08-19-codex-gui-composer-skill-interface-usability-plan.md`

**实施**

- 将本计划状态从“待确认”改为“已确认”。
- 只暂存上述两份本次任务文档；不得包含被 ignore 的 research、现有 Composer steer 文档或任何代码变更。
- 检查 staged diff 后创建文档独立提交。该提交是后续实现的强制前置条件。

**验证**

```bash
git diff --check -- \
  docs/superpowers/specs/2026/08/19/2026-08-19-codex-gui-composer-skill-interface-usability-design.md \
  docs/superpowers/plans/2026/08/19/2026-08-19-codex-gui-composer-skill-interface-usability-plan.md
git diff --cached --check
git diff --cached --name-only
```

**提交**

```text
docs(gui): record composer skill interface usability work
```

## 任务 1：恢复统一 Composer 外壳的交互状态

**文件**

- 修改：`codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- 修改测试：`codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`

**实施**

- 保留单一 `Surface variant="default"`，让 `.composer-panel` 本身表达 HeroUI field 背景、边框、圆角、阴影和 transition；不在内部再套第二个完整 field。
- 用 HeroUI field hover/focus/disabled 语义恢复迁移前的状态契约。外壳只在内部 contenteditable 真正 `:focus-visible` 时显示键盘 focus ring，不能只用无差别 `focus-within` 冒充；pointer focus 保持稳定边界。
- 将 `connectionUsable` 派生的 disabled 状态同时表达为外壳 data/ARIA 状态、视觉 opacity/cursor 和现有 editor/button 可交互性；局部 invalid skill token 不改变整个 field 状态。
- 删除测试对回归产物 `bg-transparent` 的认可，改为验证普通、pointer hover/focus、keyboard focus-visible 与 disabled 的 computed visual state 确实可区分，但不锁具体 RGB、padding 或阴影数值。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt \
  src/features/composerTurnControl/ComposerTurnControl.tsx \
  src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx --write
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run \
  --config=vitest.browser.parallel.config.ts --browser=chromium \
  src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

**提交**

```text
fix(gui): restore composer field interaction states
```

## 任务 2：建立编辑区局部盒模型与有界增长

**文件**

- 修改：`codex-gui/src/features/composerEditor/ComposerEditor.tsx`
- 修改测试：`codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`

**实施**

- 在 Lexical editor 内建立局部 `relative` wrapper，使 contenteditable 与 placeholder 共用 padding、字体、行高和起始坐标；placeholder 不再相对整个 Composer panel 漂移。
- 编辑区默认约 3 行；随内容自然增长至约 8 行或 `30vh` 的较小值，达到上限后只滚动 contenteditable。
- 保持 Composer 操作栏在编辑区外部，不让长草稿滚动带走按钮；长不可分割文本必须在编辑区内换行闭合。
- 保留现有 Lexical editor state、IME、Enter、selection 和 clipboard 行为，不增加 JS 高度镜像或 textarea fallback。
- Browser Mode 覆盖 placeholder/首字符对齐、空态三行高度、逐行增长、达到上限后的内部 overflow，以及增长期间操作栏不被纳入编辑区滚动。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt \
  src/features/composerEditor/ComposerEditor.tsx \
  src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx --write
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run \
  --config=vitest.browser.parallel.config.ts --browser=chromium \
  src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

**提交**

```text
fix(gui): bound composer editor growth
```

## 任务 3：由 Composer panel 承担候选菜单定位

**新建文件**

- `codex-gui/src/features/composerTurnControl/ComposerSkillMenuLayer.tsx`

**修改文件**

- `codex-gui/src/features/composerTurnControl/ComposerTurnControl.tsx`
- `codex-gui/src/features/composerEditor/ComposerEditor.tsx`
- `codex-gui/src/features/composerEditor/SkillTypeaheadPlugin.tsx`
- `codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`
- `codex-gui/src/__tests__/App.browser.test.tsx`

**实施**

- `ComposerSkillMenuLayer` 在 `.composer-panel` 内创建脱离文档流的 portal host；host 与 panel 等宽、锚定 panel 上边界、位于其上方，并高于 sticky Composer。
- layer 根据 visual viewport 顶部与 panel 顶部的真实距离计算可用高度，施加
  `min(40vh, 360px, availableHeight)`；监听 viewport resize/scroll 和 panel 几何变化，但不读取 query、候选或 active index。
- 建立 `ComposerTurnControl → ComposerEditor → SkillTypeaheadPlugin` 的 portal parent seam。host 尚未挂载时不渲染 typeahead plugin，禁止短暂退回 body portal。
- 更新独立 `ComposerEditor` Browser fixture，为组件测试创建真实 portal host/parent；生产代码与测试均不得以 body fallback 绕过 host 门禁。
- `SkillTypeaheadPlugin` 使用 Lexical 原生 `parent` 与 `anchorClassName`；中和 caret anchor 的 inline `top/left/width/height`，但保留该 anchor 的 `role="listbox"`、`aria-controls` 以及 option DOM 父子关系。
- 菜单 Surface 改为占满 host 宽度并服从 layer 高度；不得只加 `z-index`、`overflow-hidden` 或修改 editor 高度隐藏问题。
- 在完整 App fixture 中提供真实 skill catalog，并于 `400×876`、`1440×900` 验证：菜单与 panel 左右边界对齐、菜单位于 panel 上方、整个菜单在 visual viewport 内、打开前后 document scroll width/height 不增长、Composer bottom 不漂移。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt \
  src/features/composerTurnControl/ComposerSkillMenuLayer.tsx \
  src/features/composerTurnControl/ComposerTurnControl.tsx \
  src/features/composerEditor/ComposerEditor.tsx \
  src/features/composerEditor/SkillTypeaheadPlugin.tsx \
  src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx \
  src/__tests__/App.browser.test.tsx --write
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run \
  --config=vitest.browser.parallel.config.ts --browser=chromium \
  src/__tests__/App.browser.test.tsx \
  src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx \
  src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

**提交**

```text
fix(gui): anchor skill menu to composer
```

## 任务 4：完成可扫描的候选层级与固定详情区

**文件**

- 修改：`codex-gui/src/features/composerEditor/skillQuery.ts`
- 修改测试：`codex-gui/src/features/composerEditor/__tests__/skillQuery.test.ts`
- 修改：`codex-gui/src/features/composerEditor/SkillTypeaheadPlugin.tsx`
- 修改测试：`codex-gui/src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx`
- 修改测试：`codex-gui/src/__tests__/App.browser.test.tsx`

**实施**

- 扩展 `SkillQueryResult` 的前端显示投影：普通候选保留简短来源；同展示名、不同 path 时，机械计算最短唯一父路径。覆盖 `/` 与 `\` 分隔符、共同长前缀和完整父路径才能消歧的情况，不改变 canonical identity、匹配或排序。
- 候选项第一层显示友好名称、`$canonical-name` 与弱化来源；第二层 description 最多两行并允许自然换行。没有 description 时不制造空行，长名称和说明保持横向闭合。
- 保留 Lexical `<ul>/<li role="option">` owner。keyboard active 使用明确整行 accent 反馈，pointer hover 使用更弱的 surface 反馈，不能让 hover 覆盖 Enter 实际会选择的 active candidate。
- 菜单用 `Surface variant="secondary"`，候选滚动区使用 vertical
  `ScrollShadow visibility="auto"` 且保留原生滚动条；用
  `Separator variant="tertiary"` 分隔固定详情区。
- 详情区以 keyboard active candidate 为默认 owner，pointer hover 时临时预览，离开后恢复 active candidate；完整来源和 path 允许在任意字符断行，不增加菜单总高度或页面宽度。
- 详情区通过 `aria-describedby` 或等价关系与当前 active option/editor 关联；键盘用户无需 hover 即可读取完整来源和路径。active、hover、disabled 和错误状态都保留非颜色线索。
- Browser Mode 覆盖多行说明、重名最短唯一父路径、超长不可分割 path、详情 owner 与可访问关联切换、20+ 候选内部滚动、Arrow 导航后 active candidate 可见且 document 不滚动。
- 保留并复验鼠标与触摸选择，以及 loading、partial error、total error、retry 和 empty result 在新布局中的语义；不能只验证正常键盘路径。

**验证**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt \
  src/features/composerEditor/skillQuery.ts \
  src/features/composerEditor/__tests__/skillQuery.test.ts \
  src/features/composerEditor/SkillTypeaheadPlugin.tsx \
  src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx \
  src/__tests__/App.browser.test.tsx --write
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run \
  src/features/composerEditor/__tests__/skillQuery.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run \
  --config=vitest.browser.parallel.config.ts --browser=chromium \
  src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx \
  src/__tests__/App.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

**提交**

```text
fix(gui): improve skill candidate scanning
```

## 最终验证

全部任务提交合并后按以下顺序执行。由本计划变更引入的问题必须在计划边界内修正并创建新的独立提交；预存或无关失败只汇报。最终验证本身不创建空提交。

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --run \
  src/features/composerEditor/__tests__/skillQuery.test.ts
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:parallel -- \
  src/features/composerEditor/__tests__/ComposerEditor.browser.test.tsx \
  src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx \
  src/__tests__/App.browser.test.tsx
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser:sequential -- \
  src/__tests__/sequential/composer-viewport.browser.test.tsx
```

### 可见浏览器验收

使用 `$debug-responsive-gui` 在可见 Google Chrome for Testing 中检查真实任务页：

- `400×876`：输入 `$` 后菜单与 Composer 等宽并位于上方；候选和详情可读，内部滚动有效，无水平或页面纵向溢出。
- `1440×900`：菜单保持同一拓扑与合理密度，不缩回 caret 附近的小浮层。
- 使用键盘 Tab、Arrow、Enter、Escape 验证 focus-visible、active candidate、详情区和 editor focus；使用 pointer 验证 hover 弱于 active。
- 输入超过 8 行的中英文及长 token，确认编辑区内部滚动、placeholder 对齐和操作栏固定。
- 切换不可用连接状态，确认 Composer 同时具有正确语义与明显 disabled 外观。
- 不以参考 App 做像素级对比，只检查已确认的层级、可读性、空间关系和基本审美。

## 完成条件

- 任务 0 的文档提交先于任何实现提交。
- 任务 1 至 4 各自完成修改、定向验证、staged diff 审查和独立提交。
- 最终代码只保留一个 Lexical editor、一个 skill selection owner、一个菜单几何 owner 和一个 Composer field 外壳。
- 两个基线 viewport、三浏览器 Browser Mode、类型、lint、格式化与可见浏览器验收均通过。
- 没有隐藏问题的裁切、fallback、兼容双路径、测试放宽、固定单行候选或范围外修改。

## 计划确认门禁

本文状态为“已确认”。用户明确回复“确认计划”后，才允许先执行任务 0；任务 0 的文档独立提交成功后，才能开始任务 1 的实现。
