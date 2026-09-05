# Unicode grapheme bounding primitive 重复实现

日期: 2026-09-04
状态: ✅ 已修复
范围: `codex-gui/src/text`, `codex-gui/src/features/composerInputQueue`, `codex-gui/src/features/transcriptState`, `codex-gui/src/features/documentTitle`
优先级: P2

## 摘要

三处 formatter 已共用 `boundGraphemes`，统一 Unicode 分段与有界截断；各自的产品长度、ellipsis、空白处理和返回值策略保持不变。

## 问题

修复前，Composer preview、协作 transcript preview 和 document title 都必须避免按 UTF-16 code unit 截断用户文本，因此各自创建 grapheme segmenter 并遍历分段。公共的 Unicode 机制被重复维护，同时产品 formatter policy 又混在具体实现中。

真实共享候选仅是 segmentation/bounding primitive。不能强行统一三个 formatter：Composer 与 transcript 使用 `...`，document title 使用 `…`；长度预算和返回值也不同。

## 证据

- 当前实现：`codex-gui/src/text/grapheme.ts` 的 `boundGraphemes` 统一持有 segmenter，按完整 grapheme 记录截断位置，观察到第一个超限 grapheme 后停止遍历。
- 三处原 formatter 均调用该函数，本地保留长度预算及后缀拼接；共享层不添加省略号、不规范化空白。
- 以下为修复前研究基线的历史证据，行号不代表当前实现：
- 研究基线：`f5647bb6aec9641c2346b170d9247a26d915e46e`（`docs/superpowers/research/2026/09/04/2026-09-04-codex-gui-shared-infrastructure-analysis.md`）。
- `codex-gui/src/features/composerInputQueue/composerInputPreview.ts:3-6,92-105`: 定义 160 grapheme 上限、同配置 segmenter，并返回 `{ text, truncated }`；截断文本以三个 ASCII 点结束。
- `codex-gui/src/features/transcriptState/transcriptItemPolicy.ts:47-68`: 独立定义同配置 segmenter 和按调用方 limit 截断的 preview helper，同样使用三个 ASCII 点。
- `codex-gui/src/features/documentTitle/documentTitle.ts:1-18`: 独立定义同配置 segmenter，并使用单字符 `…` 和标题专属预算。

## 判断

重复机制已收敛，三处产品输出回归测试通过，满足本 issue 的关闭条件。共享范围仅为 grapheme bounding primitive。

## 修复记录

- 修复日期：2026-09-05。
- 本地代码提交：`49ceea368`（`refactor(gui): share grapheme bounding primitive`）。
- 新增 `codex-gui/src/text/grapheme.ts` 及其单元测试，替换三处重复分段循环；标题不再先将全文分段为数组。

## 验证记录

- Level 1：`grapheme.test.ts`、`composerInputPreview.test.ts`、`transcriptCollabAgentItemPolicy.test.ts`、`documentTitle.test.ts` 共 4 个文件、89 项测试全部通过，Vitest 未报告类型错误。
- 新增测试覆盖空文本、长度边界、零预算、组合字符、ZWJ emoji、旗帜、肤色修饰符及原始空白保留。
- `format:oxfmt`、`lint`、`type-check` 和 `git diff --check` 均通过。
- Level 2、Level 3：本次仅调整内部文字处理，均不适用，未执行真实 GUI 或可见桌面验收。

## 影响

Unicode 分段与超限判定现在只需维护一处。Composer 的 160、协作预览的 160/240、标题内容的 52 grapheme 上限，以及各自 ellipsis 和返回值语义保持不变。

## 后续处理

本 issue 已关闭，无剩余修复项。后续若调整产品长度、ellipsis 或返回值，应在对应 feature 中单独处理。
