# Startup and resources audit

## 审计范围

- 首屏入口。
- 全局 provider。
- 同步 CSS/JS 入口。
- 初始化 state wiring。

## 审计条目

## 结论

未发现 startup-resources 切片中存在随 thread、history、route、provider 或 retained state 数增长的静态复杂度风险。

`05-heroui-full-css-import.md` 关联的同步 CSS import 证据仍存在，但它归因于首屏资源体积/加载路径，不是本轮允许归因的静态复杂度 finding。因此本轮标记为 `非本轮可归因`。

## 审计字段

- 关联 issue: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/05-heroui-full-css-import.md`
- 触发源: app startup，`main.tsx` 入口加载 `index.css`、创建 fixed provider tree、挂载单个 TanStack router
- 触发频率: 每次应用启动一次；ThemeProvider 额外在系统主题变化时触发一次固定工作
- 单次同步工作: 固定数量 provider 包裹、固定单 route router、固定状态槽初始化、固定 DOM class/data-theme 写入；CSS import 为同步资源入口
- 规模变量: 本轮允许变量中未见 thread/history/route/provider/retained state 数放大；route 数当前为 1，provider 数固定，App state 槽固定
- 累计复杂度: 对本轮规模变量为 `O(1)`；CSS/JS 体积影响需后续量化，不能作为本轮复杂度结论
- 复杂度优先级: `非 finding`
- 当前状态: `非本轮可归因`

## 关键证据路径/行号

- `docs/superpowers/specs/2026-07-09-codex-gui-system-performance-check-design.md:123`-`128`: startup-resources 切片口径；CSS/JS 体积只能作为 `非本轮可归因` 或后续量化输入。
- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/05-heroui-full-css-import.md:14`-`25`: 既有 issue 关注同步 HeroUI CSS import，判断为待 fresh build 量化。
- `codex-gui/src/main.tsx:13`-`31`: 入口只创建一个 root，并挂载固定 provider tree 与 `RouterProvider`。
- `codex-gui/src/router.tsx:5`-`17`: router tree 当前只有 root route 和 index route，启动构造不随 route/history/thread 数增长。
- `codex-gui/src/App.tsx:10`-`24`: initial render wiring 只有 3 个固定 `useState` 槽和固定两个子组件。
- `codex-gui/src/app/ThemeProvider.tsx:13`-`30`: 只注册一个 `matchMedia` listener，cleanup 边界明确。
- `codex-gui/src/index.css:1`-`3`: 同步 import `tailwindcss`、`@heroui/styles`、`streamdown/styles.css`，属于资源入口证据，不是本轮静态复杂度 finding。

## 已排除项

- CSS/JS bundle 体积、CSS 解析/匹配耗时、首屏阻塞严重程度：需要 build 或浏览器量化，本轮禁止且不作为复杂度 finding。
- provider 层级本身：当前为固定数量包装，没有随 provider 数或 route 数动态增长的构造。
- router 初始化：当前静态单 route tree，没有枚举历史、thread 或动态 routes。
- retained state：所列入口文件中未见按 thread/history/route 维度持有 map/cache/list；ThemeProvider listener 有 cleanup。

## 风险

证据仅覆盖计划限定的 7 个文件；`store`、`GuiHostConnectionBridge`、`AppShell`、i18n catalog loader 的内部复杂度不在本切片范围内，不能据此判断其 retained state 或 startup work。

## 报告建议

在 startup-resources 报告中记录为：`05-heroui-full-css-import` 仍可作为后续资源量化入口，但本轮静态复杂度审计不列为 finding；入口/provider/router/initial render wiring 当前无 P0-P3 复杂度问题。
