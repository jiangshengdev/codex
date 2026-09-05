# 跨 feature 公共 API 边界缺少显式治理

日期: 2026-09-04
状态: ✅ 已修复
范围: `codex-gui/src/features/**`, `codex-gui/scripts/featureBoundaries/**`, `codex-gui/package.json`
优先级: P1

## 摘要

跨 feature 公共模块、导出名称与允许消费方向已显式登记，并由接入 lint 的静态检查器约束；本 issue 于 2026-09-05 依据当前实现复核关闭。

## 问题

原问题是 feature 消费者普遍直接导入目标 feature 的具体文件，仓库没有显式的 public/internal seam，也没有针对 feature 内部路径和允许依赖方向的规则。当前保留既有模块路径，通过显式登记区分公共能力与内部实现，不要求统一 barrel。

这不是“缺少 `shared/` 目录”的问题。已有领域 owner、路由契约、Transcript surface 和 GUI Host gateway 已经被复用；缺口是这些复用入口没有被明确分类和保护。

## 证据

- 修复提交：`56f6017a8a2d4a60a19b88d7056bbf119bb791e8`（`feat(gui): enforce cross-feature public API boundaries`），已包含在本次复核的 HEAD `193309d74` 中。
- `codex-gui/scripts/featureBoundaries/policy.ts`：显式维护公共模块、允许导出、owner、用途、生产/测试身份和允许消费方向；`knownDirectionIssues` 单独保留尚未解决的契约归属问题。
- `codex-gui/scripts/featureBoundaries/analyze.ts:183`：检查生产到测试能力的访问，并约束跨 feature 私有模块、私有导出和未登记方向；继续追踪转导出来源。
- `codex-gui/scripts/featureBoundaries/cli.ts`：违规或分析失败返回非零退出状态。`codex-gui/package.json` 的 `lint:boundaries` 已接入 `lint`、`lint:fix`，现有 `ci` 经 `lint` 执行检查，因此无需修改 ESLint 或 tsconfig 才能形成机械约束。
- `codex-gui/scripts/featureBoundaries/analyze.test.ts`：已有私有访问、方向限制、转导出、动态访问、测试隔离和 CLI 成败等验证用例。

以下为原问题的历史证据，不代表当前仍缺少治理：

- 研究基线：`f5647bb6aec9641c2346b170d9247a26d915e46e`；静态扫描记录了 119 个跨 feature import occurrence、45 个不同方向对和 28 个被直接访问的目标模块（`docs/superpowers/research/2026/09/04/2026-09-04-codex-gui-shared-infrastructure-analysis.md`）。
- `codex-gui/src/features/threadHistory/ThreadHistoryDetailContent.tsx:4-11`: 单一页面直接导入 active session、route target、committed transcript surface 与 document title 的具体模块文件。
- `codex-gui/tsconfig.app.json:17-22`: 只提供统一 `@/*` 和生成协议 alias，没有区分 feature 公共入口与内部路径。
- `codex-gui/eslint.config.ts:69-80`: 现有 `no-restricted-imports` 仅治理未类型化的 React Redux hooks，并未约束 feature public/internal 边界或依赖方向。

## 判断

公共入口、允许方向与机械约束已形成可核验的实现闭环，原先“缺少显式治理”的问题已修复。治理采用现有模块与具体导出登记，不依赖新增万能 `shared/**` 或透传式 `shared/ui`。active-thread/runtime 与 Composer draft/input 的契约归属仍由本组第 02、03 份 issue 跟踪，本次关闭不代表这些方向问题已解决。

## 修复记录

2026-09-05：提交 `56f6017a8` 新增边界登记、分析器、CLI 与测试，接入 lint，并收窄两份 AppRouting 测试的整模块访问。

## 验证记录

2026-09-05：本次状态更新核对了本地 Git 提交、当前登记与检查逻辑、package scripts 接线及测试用例源码。未重新运行 lint、单元测试或 Browser 验收，不将源码中已有测试用例表述为本次测试通过。

## 影响

新增跨 feature 公共能力和消费方向需要显式更新登记，未登记的内部访问可由 lint 报错。静态治理不会自动消除已登记的双向依赖或解决领域 owner 归属，这些剩余影响继续由独立 issue 维护。

## 后续处理

本 issue 关闭。后续公共接口与方向变更应同步维护登记并通过 `lint:boundaries`；契约归属调整继续在第 02、03 份 issue 中单独推进。
