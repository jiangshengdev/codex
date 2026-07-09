# Issue 文档刷新实施计划

日期: 2026-07-09
状态: 计划待确认
对应设计: `docs/superpowers/specs/2026-07-09-issue-doc-refresh-design.md`
范围: `docs/superpowers/issues/**` 中 29 个 issue 文档

## 目标

按已确认设计刷新 `docs/superpowers/issues/**`，使 issue 状态、证据和判断与当前 `dev` 代码状态一致。

本计划只覆盖文档更新，不修改代码、不修复 issue、不运行测试、不 stage、不 commit。

## 全局约束

- 实现阶段开始前必须由用户明确确认本计划。
- 实现阶段只允许修改 `docs/superpowers/issues/**`。
- 不修改 `docs/superpowers/specs/**`、`docs/superpowers/plans/**`、`docs/superpowers/reports/**`，除非用户另行要求。
- 不把 issue 文档写成 implementation plan；后续处理只能指向单独设计/计划/验证入口。
- 需要真实设备、真实浏览器、网络或发布通道验证的问题，不能仅凭静态代码复核标为已修复。
- 旧证据、历史采样、commit hash、验证记录和日期必须保留或移入 `## 历史记录` / `## 验证记录`。

## 执行方式

实现阶段使用子代理按批次执行文档更新。每个子代理只拥有指定 issue 文件，返回:

- 结论。
- 修改文件列表。
- 当前代码证据路径/行号。
- 保留的历史内容。
- 剩余风险。
- 建议验证命令。

主代理职责:

- 分配批次和文件所有权。
- 抽查关键证据。
- 处理批次之间的措辞一致性。
- 运行最终只读验证。
- 汇报 diff 摘要。

## 批次 0: 基线盘点

文件范围:

- `docs/superpowers/issues/**/*.md`

任务:

- 生成当前 29 个 issue 文件清单。
- 记录每个文件的 `状态:`、章节结构和是否为已拆分索引。
- 标记需要状态重判、证据刷新、一致性检查三类。

证据命令:

```text
rg --files docs/superpowers/issues
rg -n -e '^状态:' -e '^## ' docs/superpowers/issues
```

停止条件:

- 文件数量不是 29 时先停下汇报。
- 发现缺失 `状态:` 或缺失核心章节时纳入后续格式修正。

## 批次 1: 状态重判

文件范围:

- `docs/superpowers/issues/2026-05-30-02-thread-generations-unbounded.md`
- `docs/superpowers/issues/2026-05-30-04-non-npm-update-channels-upstream.md`
- `docs/superpowers/issues/2026-05-30-06-export-annotation-last-writer-wins.md`

代码证据范围:

- `codex-rs/app-server/src/thread_projection.rs`
- `codex-rs/tui/src/update_action.rs`
- `codex-rs/cli/src/doctor/updates.rs`
- `codex-rs/app-server-protocol/src/export.rs`

任务:

- 复核旧状态是否仍成立。
- 更新 `状态:`、`摘要`、`证据`、`判断`、`影响`、`后续处理`。
- 将不再准确的旧表述改为当前边界，不删除有价值的历史记录。

预期重点:

- `thread_generations` 需要区分 `remove_thread`、`invalidate_thread_projection`、captured generation 和 retained generation 的当前语义。
- 非 npm 更新通道需要区分 npm/bun、doctor GitHub release、Homebrew cask、standalone installer。
- schema export 注解合并需要确认当前 bundle/definition 插入行为是否仍可能静默覆盖。

## 批次 2: GUI 行为与运行时验证边界

文件范围:

- `docs/superpowers/issues/2026-07-03-02-codex-gui-markdown-links-render-as-browser-urls.md`
- `docs/superpowers/issues/2026-06-30-03-codex-gui-ime-enter-submits-draft.md`
- `docs/superpowers/issues/2026-07-03-01-codex-gui-streamdown-copy-lan-http.md`
- `docs/superpowers/issues/2026-06-30-04-codex-gui-ios-keyboard-bottom-gap.md`
- `docs/superpowers/issues/2026-06-30-02-codex-gui-mobile-missing-messages.md`
- `docs/superpowers/issues/2026-06-30-01-gui-launch-bullet-rendering.md`

代码证据范围:

- `codex-gui/src/features/committedTranscriptSurface/*`
- `codex-gui/src/features/composerTurnControl/*`
- `codex-gui/src/features/appShell/*`
- `.codex/skills/gui-launch/SKILL.md`
- projection snapshot / attach 相关 Rust 入口，仅限 issue 已引用路径。

任务:

- 对仍需真实环境验证的问题保留 `🟡` 或 `📏` 状态，不静态升级为 `✅`。
- 更新当前代码路径、测试名和具体判断边界。
- 将旧的已排除根因保留在历史或判断中。

预期重点:

- Markdown link 当前仍允许 anchor 渲染时，保留 `🔴 仍需处理`。
- IME 当前已有 Mac Apple WebKit guard，但最终状态仍依赖真实 IME 验证。
- Streamdown copy LAN HTTP 仍需区分 secure context、Clipboard API 和 streaming `isAnimating`。
- iOS keyboard gap 仍不能按简单 `fixed bottom-0` 失效处理。

## 批次 3: GUI 性能热点子 issue

文件范围:

- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/01-projection-event-top-level-react-state.md`
- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/02-transcript-chunk-selector-view-rebuild.md`
- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/03-item-started-dirties-transcript-state.md`
- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/04-long-transcript-no-windowing.md`
- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/05-heroui-full-css-import.md`
- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/06-temporary-grouping-full-turn-scan.md`
- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/07-transcript-revision-invariant.md`
- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/08-projection-delta-redux-action-frequency.md`
- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/09-projection-delta-transient-text-concat.md`
- `docs/superpowers/issues/codex-gui-frontend-performance-hot-paths/10-live-slot-selector-cache-invalidation.md`

代码证据范围:

- `codex-gui/src/features/appShell/GuiHostConnectionBridge.tsx`
- `codex-gui/src/features/threadRuntime/threadRuntimeSlice.ts`
- `codex-gui/src/features/transcriptState/transcriptStateSlice.ts`
- `codex-gui/src/features/committedTranscriptSurface/*`
- `codex-gui/src/index.css`

任务:

- 以当前 03 streaming / 02e live render state 代码校准每个性能 issue。
- 保留已修复条目的修复记录和验证记录。
- 对仍成立或部分过期条目补 fresh code evidence。
- 不提出新的性能修复方案。

预期重点:

- `09` 继续检查 `transientText += delta` 是否仍成立。
- `08` 继续区分 action batch 频率和 reducer 内逐 delta 处理。
- `10` 继续区分旧 selector cache invalidation 和当前 live consumption scan。
- `04` / `05` 分别保持 long transcript windowing 和 HeroUI CSS 的独立边界。

## 批次 4: Rust projection 已修复和测试覆盖类 issue

文件范围:

- `docs/superpowers/issues/2026-05-19-projection-atomicity-review.md`
- `docs/superpowers/issues/2026-05-19-projection-hidden-race-review.md`
- `docs/superpowers/issues/2026-05-30-01-projection-fanout-silent-invalidation.md`
- `docs/superpowers/issues/2026-05-30-05-projection-test-coverage-gaps.md`
- `docs/superpowers/issues/2026-06-01-01-projection-eager-history-cursor.md`
- `docs/superpowers/issues/2026-05-30-03-doctor-update-url-points-upstream.md`

代码证据范围:

- `codex-rs/app-server/src/thread_projection.rs`
- `codex-rs/app-server/src/thread_projection_runtime.rs`
- `codex-rs/app-server/src/request_processors/thread_projection.rs`
- `codex-rs/app-server/src/outgoing_message.rs`
- `codex-rs/cli/src/doctor/updates.rs`

任务:

- 对已修复条目只做一致性补证，不重写历史。
- 对测试覆盖缺口类 issue 判断当前是否仍缺端到端覆盖。
- 对部分过期条目明确当前残留边界。

## 批次 5: 已拆分索引文件

文件范围:

- `docs/superpowers/issues/2026-06-23-01-codex-gui-frontend-performance-hot-paths.md`
- `docs/superpowers/issues/2026-06-28-01-codex-gui-transcript-revision-invariant.md`

任务:

- 确认状态仍为 `✅ 已拆分`。
- 确认拆分索引路径仍存在。
- 不补普通 issue 正文。

## 批次 6: 最终一致性和验证

验证命令:

```text
rg -n -e '^状态:' -e '^## ' docs/superpowers/issues
rg -n -e 'TODO|待补|待写|FIXME' docs/superpowers/issues
git diff -- docs/superpowers/issues
```

人工检查:

- 每个被修改文件都有当前代码证据或明确写明证据不足。
- `状态:` 只使用允许的 emoji 类别: `✅`、`🔴`、`🟡`、`📏`。
- `## 后续处理` 不跳过设计/计划门禁。
- 已修复/已拆分文档没有被无证据重开。
- 需要真实环境验证的问题没有被静态证据标成已修复。

## 完成条件

- 所有 29 个 issue 文档已被分类检查。
- 需要更新的 issue 文档完成刷新。
- 最终 diff 只包含 `docs/superpowers/issues/**`。
- 验证命令已运行并记录结果。
- 用户收到按批次汇总的变更说明和剩余风险。

## 进入实现阶段的门禁

只有用户明确确认本计划后，才能开始修改 `docs/superpowers/issues/**`。

未确认计划前，不得修改 issue 文档、运行格式化、stage 或 commit。
