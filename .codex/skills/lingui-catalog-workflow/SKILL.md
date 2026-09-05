---
name: lingui-catalog-workflow
description: Govern Codex GUI Lingui message extraction, catalog diffs, translations, and repeat-extraction stability. Use when extraction changes .po catalogs or when deciding whether catalog drift is generated metadata or a semantic/range change.
---

# Lingui Catalog 工作流

本 skill 管理 Codex GUI Lingui catalog 的字段分类、生成物边界、完整 diff 审查和二次 extraction stability，不授予命令执行或 catalog 修改权限，不复制阶段、计划文档、授权或执行图规则。

## 与其他 Lingui skills 的边界

- 用 `$lingui-best-practices` 决定 message macro、复数、placeholder、locale 与一般 extraction 实践。
- 用 `$enhanced-message-context` 决定哪些 message 需要 translator comment，以及 comment 内容是否准确。
- 用本 skill 判断 extraction 后 catalog 中各字段的意义、哪些变化可能是纯生成元数据、完整 catalog 边界是否保持，以及生成链是否稳定。

上述 skills 可同时适用；Lingui 惯例不能替代字段级 diff 审查。

## 先核验项目权威入口与边界

执行或计划 extraction 前，从当前项目配置、package scripts、适用 `AGENTS.md` 和项目固化入口核验：

- 权威 extraction 入口及其工作目录；
- Lingui 配置、source include/exclude 和 source locale；
- locale 集合、catalog path 模板与本次入口会写入的完整 catalog 文件集合；
- 哪些 catalog 内容允许人工补充翻译。

不得自行编造或绕过项目入口，也不得根据历史命令、预计 diff 或当前已改文件反推完整 catalog 集合。计划和执行都以核验后的完整文件集合为生成物边界；边界内仍须逐字段验收，不能全量放行。

## PO 字段分类

### `#:` source references

`#:` 是 extraction 从当前 source 生成的定位元数据，不是 message identity 或翻译内容。只有同时满足以下条件时，其增加、删除、合并或行号变化才可归为 metadata closure：

- reference 指向当前配置允许的正确 source，且与对应 message 映射一致；
- 变化只落在已核验的 catalog 文件集合内；
- 同一输入可确定地复现，并在重复运行同一权威入口后稳定；
- 没有伴随计划外的 `msgid`、`msgstr`、translator comment 语义或状态变化。

错误 message 映射、意外消失的 source、边界外 source 或重复 extraction 持续漂移，不属于纯 metadata。

### `#.` extracted translator comments

`#.` 来自 source 中的 translator context。它由 extraction 维护，但会影响翻译判断，不能仅因是 comment 就按纯定位元数据接受。

- 对计划内新增或修改的 message，核对 comment 是否准确说明 UI 位置、用途、歧义和 placeholder，并确认再次 extraction 会保留。
- 对既有 message，任何无法由当前 source 解释的 comment 新增、删除或语义变化都必须单独审查。
- comment 质量与必要性由 `$enhanced-message-context` 判断；本 skill 只核验其 catalog 投影和稳定性。

### `msgid`

`msgid` 是 message identity 和源语言语义，不是 metadata。新增、修改、合并、删除或意外 obsolete 必须能回指计划内 source message 变化；任何计划外 drift 都要暂停当前 catalog 后继。

### `msgstr`

`msgstr` 是用户可见翻译，不是 metadata。既有非空翻译必须被 extraction 保留；新增 message 的翻译只能在计划允许的 locale 和人工补充边界内完成。已有翻译被清空、改写、错配，placeholder 或 ICU 结构变化，以及非目标 locale 的翻译变化，都要暂停。

### fuzzy 与 obsolete

fuzzy/obsolete 状态影响翻译可用性和 catalog 完整性，不是纯 metadata。新增 fuzzy、有效翻译变为 fuzzy、意外 obsolete、obsolete 复活或清理策略变化，只有在已确认目标明确包含该状态变化时才可继续，否则暂停。

## Catalog 闭环

1. 使用核验后的权威入口完成首次 extraction。
2. 审查完整 catalog diff，而不只查看预期 message 附近的 hunk。按 `#:`, `#.`, `msgid`, `msgstr`, fuzzy/obsolete 和文件边界分类每类变化，并记录其 source 或生成依据。
3. 仅在计划允许的范围内补充人工翻译；不得手工恢复 extraction 拥有的旧行号或旧 references 来塑造 diff。
4. 使用同一入口再次 extraction，确认所有 catalog 稳定：不产生新结构 diff，不反复移动 references，不丢失 comments 或人工翻译，不新增状态 drift，也不扩大 catalog 边界。
5. 把字段级 diff 结论、完整文件集合和二次稳定结果作为闭环证据交给当前工作阶段判断。

预计 hunk、旧源码行号、旧 source-reference 集合和 diff 行数都不是权威输出白名单。“generated file”也不是免审标签；变化数量多不等于错误，生成器产生也不等于正确。

## 必须停止 catalog 后继的情况

任一字段不满足上述分类条件或二次 extraction 不稳定（包括覆盖 comments、翻译及其他人工内容）时，停止 catalog 后继，不得归为 metadata closure。以下情况同样必须停止：

- 新增 locale、catalog、目录、格式、配置输出或其他边界外文件；
- extraction 入口、输入、配置、工具来源或完整输出集合不明确；
- 接受 diff 需要跳过稳定性验证、放宽检查、修改基线或手工保留生成器已归一化的旧元数据。

返回具体字段、文件、来源证据和受影响的 catalog 后继；由 `$managing-work-stages` 判断是否更新计划或回到其他门禁。
