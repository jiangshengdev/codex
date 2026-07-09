# Issue 文档刷新设计

日期: 2026-07-09
状态: 设计已确认
范围: `docs/superpowers/issues/**` 中 29 个 issue 文档的当前代码状态校准

## 背景

`docs/superpowers/issues/**` 中部分 issue 文档记录的是早期代码状态。当前 `dev` 分支已经包含新的 projection、Codex GUI streaming、IME、Markdown rendering、更新通道和 schema export 相关实现，因此旧文档中的状态、证据路径和判断可能已经过期。

本设计只定义如何刷新 issue 文档。它不修改代码，不修复 issue，不运行测试，不创建新的 implementation plan，也不把 issue 文档扩写成修复方案。

## 目标

- 对 `docs/superpowers/issues/**` 下全部 29 个 Markdown issue 文档做一次基于当前代码状态的校准。
- 区分“状态需要改变”和“状态基本不变但证据陈旧”两类更新。
- 保留历史证据、日期、旧判断和验证记录，避免因为当前代码变化而抹掉仍有审查价值的上下文。
- 使用 `codex-issue-doc-workflow` 的统一 issue 布局，使每个文档的状态、证据、判断、影响和后续处理可以独立阅读。
- 保持 issue 文档的问题记录属性，不在其中写代码修复方案或 implementation plan。

## 非目标

- 不修改 `codex-gui/**`、`codex-rs/**` 或其它代码。
- 不修复任何 issue。
- 不运行格式化、测试、benchmark、schema 生成、browser automation 或真实设备验证。
- 不创建新的 issue。
- 不 stage、不 commit。
- 不把已拆分索引文件重新展开为正文 issue。
- 不把需要真实环境验证的问题直接标为已修复。

## 范围

纳入范围:

- 根目录 issue 文件: `docs/superpowers/issues/*.md`。
- 已拆分的 GUI 性能热点子 issue: `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/*.md`。

排除范围:

- `docs/superpowers/specs/**` 中既有设计文档。
- `docs/superpowers/plans/**` 中既有实施计划。
- `docs/superpowers/reports/**` 中既有审计报告。
- issue 中指向的代码修复本身。

## 分类设计

### 状态需要重新判断

这类文档的旧状态可能已经被当前代码直接改变。更新时需要优先复核当前代码，并把 `状态:`、`摘要`、`证据`、`判断` 和 `后续处理` 改到同一口径。

初始候选:

- `docs/superpowers/issues/2026-05-30-02-thread-generations-unbounded.md`
- `docs/superpowers/issues/2026-05-30-04-non-npm-update-channels-upstream.md`
- `docs/superpowers/issues/2026-05-30-06-export-annotation-last-writer-wins.md`

### 状态基本不变但证据需要刷新

这类文档的风险仍可能成立，或仍需要真实环境验证，但引用的路径、实现细节或判断措辞需要绑定到当前代码。

初始候选:

- `docs/superpowers/issues/2026-07-03-02-codex-gui-markdown-links-render-as-browser-urls.md`
- `docs/superpowers/issues/2026-06-30-03-codex-gui-ime-enter-submits-draft.md`
- `docs/superpowers/issues/2026-07-03-01-codex-gui-streamdown-copy-lan-http.md`
- `docs/superpowers/issues/2026-06-30-04-codex-gui-ios-keyboard-bottom-gap.md`
- `docs/superpowers/issues/2026-07-04-01-gui-host-dev-proxy-buffering.md`
- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/*.md`

### 已修复或已拆分文档

这类文档默认不重写结论，只做一致性检查。只有当前代码证据直接推翻已修复结论时，才允许改变状态。

包括:

- `状态: ✅ 已修复` 的 issue。
- `状态: ✅ 已拆分` 的索引文件。

## 证据原则

- 当前证据优先使用代码路径、函数名、类型名、测试名和精确行号。
- 若当前代码状态只能证明“仍需真实端验证”，不得写成“已修复”。
- 若旧问题已缩小为残留边界，使用 `🟡 部分过期` 或保留更具体的状态文本。
- 若当前代码证据不足，使用 `📏 待复核` 或 `📏 待验证`，并写清缺少的证据类型。
- 旧的历史判断、运行时采样、真实设备记录和验证记录应移动或保留在 `## 历史记录` / `## 验证记录`，不得无说明删除。

## 输出约束

普通 issue 文档应保持以下结构:

- `# <标题>`
- `日期: YYYY-MM-DD`
- `状态: <emoji> <状态文本>`
- `范围: <模块/目录/功能>`
- `优先级: P0/P1/P2/P3 或 未定`
- `## 摘要`
- `## 问题`
- `## 证据`
- `## 判断`
- 可选 `## 修复记录`
- 可选 `## 验证记录`
- `## 影响`
- `## 后续处理`
- 可选 `## 历史记录`

已拆分索引文件保持索引布局，不强行补普通 issue 正文。

## 风险

- 全量更新 29 个文档容易把“当前代码复核”误写成“问题已解决”。实现阶段必须保留验证门槛。
- 多个 issue 横跨 Rust、Codex GUI、浏览器行为和发布通道，不能用单一证据口径统一判定。
- 文档引用行号会随后续代码变动漂移；本轮只保证基于当前 `dev` 的 fresh evidence。
- 计划阶段需要控制更新批次，避免一次 diff 过大而降低审查可读性。

## 进入计划阶段的门禁

只有本设计文档被用户明确确认后，才能创建或更新对应 implementation plan。

计划阶段必须单独定义:

- 具体计划文件路径。
- 每个更新批次包含哪些 issue 文档。
- 每个批次需要读取的代码证据范围。
- 每个批次的验证命令和人工 diff 检查方式。
- 是否使用子代理执行文档更新。

在计划被用户确认之前，不得修改 `docs/superpowers/issues/**`。
