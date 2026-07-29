# Codex GUI 暗黑模式适配设计

## 背景

当前 `codex-gui` 已通过 `ThemeProvider` 根据系统 `prefers-color-scheme` 在 `<html>` 上同步 `.dark` / `.light` class 和 `data-theme="dark"` / `data-theme="light"`。HeroUI v3 的暗黑模式文档说明，组件会从根元素读取主题变量，因此不需要额外的 HeroUI provider。

实际截图显示，暗黑模式下 committed transcript 区域已经进入深色语义，但底部 composer 仍保留浅色白底。白天模式下这个问题不明显，因为 composer 的硬编码白底与页面整体浅色背景一致；暗黑模式下它会形成明显断层。

代码层面的直接原因是 `ComposerTurnControl` 中 composer 面板使用了 `bg-white`，并且浏览器测试也把 “white composer panel” 固化为契约。另一个缺口是 `AppShell` 的主 `<main>` 没有挂 HeroUI 文档建议的 `bg-background text-foreground`，页面画布没有明确声明跟随主题 token。

## 目标

- 让 app shell 页面画布使用 HeroUI 主题语义色，随 light/dark 自动切换。
- 让底部 composer 面板使用 HeroUI surface 语义，不再硬编码 `bg-white`。
- 保持现有 composer 移动端布局：固定在底部、贴近 viewport bottom、输入区尽量占满宽度、QR / Stop / Send 行为不变。
- 让测试契约从“白色 composer 面板”升级为“主题感知 composer surface”。
- 通过浏览器截图验证暗黑模式下底部 composer 不再出现浅色断层。

## 非目标

- 不新增主题切换 UI。
- 不引入 `next-themes`。
- 不新增第二套 theme controller。
- 不重写 HeroUI token 或全局调色板。
- 不改动 QR access、send、stop 的业务行为。
- 不为 composer 编写一套脱离 HeroUI 的自定义主题系统。

## 已确认依据

本地 HeroUI v3 暗黑模式文档 `codex-gui/.heroui-docs/react/getting-started/(handbook)/dark-mode.mdx` 给出以下约束：

- 暗黑模式由 `<html>` 上的 `.dark` / `data-theme="dark"` 驱动。
- app shell 应保留 `bg-background text-foreground`，让页面画布随主题变化。
- 双主题样式应优先使用语义 token，例如 `bg-background`、`text-foreground`、`bg-surface`、`text-surface-foreground`。
- `dark:` variant 适合一次性的暗黑模式差异，不应作为主要主题体系。
- plain React / Vite 可以使用 `@heroui/react` 的 `useTheme`，但一个 app 应只有一个 theme controller。

当前项目已有 `ThemeProvider` 负责同步 `<html>` class 和 `data-theme`，所以本设计不引入新的 theme controller，只补齐主题语义样式。

## 设计

### App shell 画布

`AppShell` 的主 `<main>` 增加 HeroUI 语义类：

```tsx
className="min-h-svh w-full bg-background px-4 py-6 pb-44 text-foreground sm:px-6 lg:px-8"
```

这样页面根画布明确跟随当前主题。`NotFoundPage` 已经使用同类语义写法，`AppShell` 应与它保持一致。

### Composer 面板

`ComposerTurnControl` 的固定定位 shell 继续保留当前布局职责：

- `fixed inset-x-0 bottom-0 z-10`
- `pt-3 pb-0`
- 不恢复外层 `px-4`

内部 composer 面板从普通 `div bg-white` 改成 HeroUI 语义 surface。优先实现为 HeroUI `Surface`：

```tsx
<Surface className="mx-auto grid w-full max-w-6xl gap-2 p-2" variant="default">
  ...
</Surface>
```

这会让面板背景、前景和阴影使用 HeroUI surface token，而不是固定白色。若实现时发现 `Surface` 默认样式带来的边框、圆角或阴影与当前底部贴边交互不符，可以退回到同等语义类：

```tsx
<div className="mx-auto grid w-full max-w-6xl gap-2 bg-surface p-2 text-surface-foreground shadow-surface">
  ...
</div>
```

两种实现的设计目标相同：使用 HeroUI surface token，禁止继续使用 `bg-white` 作为 composer 面板背景。

### Composer 输入框

本地 HeroUI `Surface` 文档建议表单组件放在 `Surface` 内时使用低强调变体。`TextArea` 因此从：

```tsx
variant="primary"
```

改为：

```tsx
variant="secondary"
```

输入框仍保持：

- `fullWidth`
- 当前 `placeholder`
- Enter 提交 / Shift+Enter 换行行为
- disabled 逻辑
- draft 保留与清空逻辑

### 操作按钮

按钮继续使用现有 HeroUI semantic variant：

- QR access 组件不改变结构。
- `Stop` 保持 `variant="danger-soft"`。
- `Send` 保持 `variant="outline"`。

这部分已经是语义 variant，不需要改为 `dark:` 补丁。

## 测试策略

更新 `ComposerTurnControl.browser.test.tsx` 中的视觉结构测试：

- 测试名从 “renders a white composer panel ...” 改成 “renders a theme-aware composer surface ...”。
- 删除 `bg-white` 必须存在的断言。
- 增加 composer 面板具备 surface 语义的断言，例如 `surface` / `surface--default` class，或在采用语义 `div` 时断言 `bg-surface` 和 `text-surface-foreground`。
- 保留现有布局断言：`p-2`、没有 `p-3`、shell 没有 `px-4`、shell 有 `pb-0`、没有 `py-3`。
- 将 textarea 断言从 `textarea--primary` 更新为 `textarea--secondary`。
- 保留 QR 按钮禁用态、icon-only class、Stop / Send 顺序断言。

可补充一个暗黑主题状态测试：

- 在测试中给 `document.documentElement` 设置 `.dark` 和 `data-theme="dark"`。
- 渲染 composer。
- 断言 composer 面板不包含 `bg-white`，并具备 surface 语义 class。

该测试不需要断言具体计算颜色值，避免把 HeroUI 内部 token 数值固化到项目测试中。

## 验证

已确认 `codex-gui/package.json` 存在以下脚本。实现阶段应在 `codex-gui` 目录下使用用户 fnm 环境中的 `pnpm` 后运行：

```bash
pnpm run test:unit -- src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx
pnpm run lint
pnpm run type-check
```

视觉验证使用现有 `debug-responsive-gui` 流程：

- 在暗黑模式 responsive viewport 下截图。
- 对比修复前截图，确认底部 composer 面板不再是浅色白底。
- 切换到白天模式再截图，确认浅色模式仍保持自然的 surface 外观。

## 风险与回退

主要风险是 `Surface` 默认样式可能引入与当前底部贴边设计不一致的圆角、边框或阴影。如果出现该问题，回退到语义 `div` 写法，仍使用 `bg-surface text-surface-foreground shadow-surface`，并保留当前布局尺寸。

另一个风险是测试过度依赖 HeroUI 内部 class 名。实现时应只断言项目真正关心的契约：不再使用 `bg-white`、使用 surface 语义、textarea 使用 `secondary` 变体、布局与操作顺序不变。

## 后续计划入口

设计被接受后，计划阶段应拆成小步：

1. 更新 composer/browser test，让现有白底契约失败。
2. 更新 `AppShell` 和 `ComposerTurnControl` 的主题语义样式。
3. 运行 focused test、lint、type-check。
4. 用 `debug-responsive-gui` 截图验证暗黑和白天模式。
