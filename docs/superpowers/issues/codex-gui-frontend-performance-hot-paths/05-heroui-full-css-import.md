# 首屏同步加载 HeroUI 全量 CSS

日期:2026-06-23
状态:未修复, 待量化
范围:`codex-gui/src/index.css`, `codex-gui/src/main.tsx`

## 问题摘要

入口 CSS 无条件导入 HeroUI 全量样式。这条路径是首屏同步加载, 不受 JS tree-shaking 保护。
当前页面只使用少量 HeroUI 组件, 但打开 app 时仍会下载、解析并匹配整套样式。

## 证据

- `codex-gui/src/index.css:2`
- `codex-gui/src/main.tsx:10`

## 影响

首屏 CSS 可能阻塞初始渲染路径。具体严重程度需要以当前分支 fresh build 的 CSS 体积和加载路径
为准。

## 建议方向

先量化, 再决定优化方式:

1. 用当前分支 fresh build 记录 CSS 体积。
2. 评估 HeroUI 是否支持按组件样式、按 route 或其他方式缩小首屏 CSS。
3. 避免在没有体积数据前做大范围样式加载重构。
