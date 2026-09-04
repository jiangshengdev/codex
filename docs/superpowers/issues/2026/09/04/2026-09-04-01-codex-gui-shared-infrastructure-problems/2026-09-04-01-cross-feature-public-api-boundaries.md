# 跨 feature 公共 API 边界缺少显式治理

日期: 2026-09-04
状态: 🔴 未修复
范围: `codex-gui/src/features/**`, `codex-gui/eslint.config.ts`, `codex-gui/tsconfig.app.json`
优先级: P1

## 摘要

跨 feature 复用已经大量发生，但 import 形式无法区分稳定公共契约与 feature 内部实现，依赖方向也没有相应的静态治理。

## 问题

当前 feature 消费者普遍直接导入目标 feature 的具体文件。仓库没有显式的 public/internal seam，也没有针对 feature 内部路径和允许依赖方向的规则，因此新增调用方容易继续扩大事实公共 API，维护者也无法从路径判断兼容责任。

这不是“缺少 `shared/` 目录”的问题。已有领域 owner、路由契约、Transcript surface 和 GUI Host gateway 已经被复用；缺口是这些复用入口没有被明确分类和保护。

## 证据

- 研究基线：`f5647bb6aec9641c2346b170d9247a26d915e46e`；静态扫描记录了 119 个跨 feature import occurrence、45 个不同方向对和 28 个被直接访问的目标模块（`docs/superpowers/research/2026/09/04/2026-09-04-codex-gui-shared-infrastructure-analysis.md`）。
- `codex-gui/src/features/threadHistory/ThreadHistoryDetailContent.tsx:4-11`: 单一页面直接导入 active session、route target、committed transcript surface 与 document title 的具体模块文件。
- `codex-gui/tsconfig.app.json:17-22`: 只提供统一 `@/*` 和生成协议 alias，没有区分 feature 公共入口与内部路径。
- `codex-gui/eslint.config.ts:69-80`: 现有 `no-restricted-imports` 仅治理未类型化的 React Redux hooks，并未约束 feature public/internal 边界或依赖方向。

## 判断

问题仍成立，且是当前“各自为政”开发体验的主要结构性来源。现有证据支持治理事实公共接口，不支持把全部跨 feature 代码迁入万能 `shared/**`，也不支持新增透传式 `shared/ui`。

## 影响

公共契约会在无意中扩张，内部重构需要同时追踪不透明的外部消费者；双向 feature 依赖和重复实现也更难被评审或 lint 提前发现。若仅新建共享目录而不建立准入和依赖规则，问题会从多个 feature 转移到一个高扇入目录，owner 仍然不清。

## 后续处理

需要单独进入设计阶段，定义跨 feature 公共性判据、public/internal 表达方式、允许依赖方向和静态检查边界；设计确认后再编写实施计划。本 issue 只在公共入口、允许方向与机械约束形成可核验闭环后关闭，不预设目录名称或迁移清单。
