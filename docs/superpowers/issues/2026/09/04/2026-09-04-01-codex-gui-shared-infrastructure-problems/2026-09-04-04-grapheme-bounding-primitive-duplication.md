# Unicode grapheme bounding primitive 重复实现

日期: 2026-09-04
状态: 🔴 未修复
范围: `codex-gui/src/features/composerInputQueue`, `codex-gui/src/features/transcriptState`, `codex-gui/src/features/documentTitle`
优先级: P2

## 摘要

三个 feature 独立实现同配置的 `Intl.Segmenter` 与 grapheme 有界截断机制，但各自的产品长度、ellipsis 和返回值策略并不相同。

## 问题

Composer preview、协作 transcript preview 和 document title 都必须避免按 UTF-16 code unit 截断用户文本，因此各自创建 grapheme segmenter 并遍历分段。公共的 Unicode 机制被重复维护，同时产品 formatter policy 又混在具体实现中。

真实共享候选仅是 segmentation/bounding primitive。不能强行统一三个 formatter：Composer 与 transcript 使用 `...`，document title 使用 `…`；长度预算和返回值也不同。

## 证据

- 研究基线：`f5647bb6aec9641c2346b170d9247a26d915e46e`（`docs/superpowers/research/2026/09/04/2026-09-04-codex-gui-shared-infrastructure-analysis.md`）。
- `codex-gui/src/features/composerInputQueue/composerInputPreview.ts:3-6,92-105`: 定义 160 grapheme 上限、同配置 segmenter，并返回 `{ text, truncated }`；截断文本以三个 ASCII 点结束。
- `codex-gui/src/features/transcriptState/transcriptItemPolicy.ts:47-68`: 独立定义同配置 segmenter 和按调用方 limit 截断的 preview helper，同样使用三个 ASCII 点。
- `codex-gui/src/features/documentTitle/documentTitle.ts:1-18`: 独立定义同配置 segmenter，并使用单字符 `…` 和标题专属预算。

## 判断

重复问题仍成立，且共享机制与 feature-local policy 的边界已有充分源码证据。问题不要求统一产品输出，也不能据此推出建设通用字符串工具箱。

## 影响

Unicode 分段、超限判定和预算计算的修正需要重复传播，三处实现可能出现边界行为漂移。反之，若过度统一 formatter，可能错误改变可见 ellipsis、最大长度或调用方所需的 `truncated` 结果。

## 后续处理

需要进入设计阶段，只定义无领域的 grapheme segmentation/bounding primitive 契约，并明确三个 formatter 保留的本地 policy；只有共同机制收敛且各 feature 的 ellipsis、预算和返回值语义保持不变后才能关闭，设计确认后再编写计划和验证范围。
