# Codex GUI system performance check summary

## 总体结论

本轮完成 `codex-gui/**` 系统性前端静态复杂度审计的 5 个切片复核，结论仅基于源码路径、状态生命周期和同步工作边界；未运行 build、profiling、browser automation、FPS、layout 或 paint 实测。

确认 P0 为无；确认 P1 两项，均为已有 issue 仍成立；确认 P2 三组，其中 retained-state-memory 仅保留两个 `证据不足` 观察项，不能写成确认泄漏；未确认 P3 finding。本轮无确认的新发现复杂度 finding，主要结论是把既有 issue 状态校准为已修复、仍成立、非 finding、非本轮可归因或证据不足。

## 切片索引

- `01-startup-resources`: 未发现本轮允许归因的静态复杂度 finding；`05-heroui-full-css-import` 只作为后续资源量化入口，状态为 `非 finding` / `非本轮可归因`。
- `02-state-projection-ingest`: `01`、`08` action/subscription frequency、`02`、`03`、`10` 旧 selector cache invalidation 均为 `非 finding` / `已修复`；`07` 作为 future invariant 仍成立但不是当前已证实 hot path。
- `03-transcript-rendering`: `04-long-transcript-no-windowing` 为 P1 且已有 issue 仍成立；`06` 和 `02` 为 `非 finding` / `已修复`。
- `04-live-streaming-input-scroll`: `09-projection-delta-transient-text-concat` 为 P1 且已有 issue 仍成立；live markdown/source consumption and live item scans 为 P2；composer-input 为 `非 finding` / `已修复`；scroll-sticky-bottom-layout 为 P2 且已有 issue 仍成立。
- `05-retained-state`: 未确认 P0/P1 retained-state 泄漏；retained-state-memory 为 P2 / `证据不足`，保留 RAF pending delta queue hard bound 与 detached live slot cleanup 两个观察项。

## P0 findings

无。

## P1 findings

- `04-long-transcript-no-windowing`: P1，当前状态 `已有 issue 仍成立`。源码层面 long transcript mounted DOM/render traversal 随历史线性增长；本轮不包含浏览器 layout/paint/FPS 实测。
- `09-projection-delta-transient-text-concat`: P1，当前状态 `已有 issue 仍成立`。text accumulation 写入侧仍有 batch 内 bucket 字符串追加和每 bucket `transientText` 追加；该结论与 markdown consumption 成本分开。

## P2 findings

- `live markdown/source consumption and live item scans`: P2，当前状态 `已有 issue 仍成立`。`10` 旧 selector cache 已修复，但 live consumption `.some()` / `.filter()` 和 full source markdown consumption 边界仍需记录。
- `scroll-sticky-bottom-layout`: P2，当前状态 `已有 issue 仍成立`。pinned 状态下 `liveScrollPulse` / commit key 触发 `useLayoutEffect` 中 `scrollHeight` 读取和 `scrollTo`；本轮不包含 FPS/layout 实测。
- `retained-state-memory`: P2，当前状态 `证据不足`。保留两个观察项：RAF pending delta queue 缺少硬上限证据、manual reconnect/closed 后 detached live slot cleanup 证据不足。不能写成确认泄漏。

## P3 / 非 finding

- P3: 无确认 P3 finding。
- `05-heroui-full-css-import`: `非 finding` / `非本轮可归因`，仅作为资源量化入口。
- `01-projection-event-top-level-react-state`: `非 finding` / `已修复`。
- `08-projection-delta-redux-action-frequency`: action/subscription frequency 为 `非 finding` / `已修复`；batch reducer work 在 live-streaming-text 里作为边界记录，不复用旧 action-frequency finding。
- `02-transcript-chunk-selector-view-rebuild`: `非 finding` / `已修复`。
- `03-item-started-dirties-transcript-state`: `非 finding` / `已修复`。
- `06-temporary-grouping-full-turn-scan`: `非 finding` / `已修复`。
- `07-transcript-revision-invariant`: `非 finding` / `已有 issue 仍成立`，作为 future invariant 记录，不是当前已证实 hot path。
- `10-live-slot-selector-cache-invalidation`: 旧 selector cache invalidation 为 `非 finding` / `已修复`；当前 live consumption scan 在 P2 中记录。
- `composer-input`: `非 finding` / `已修复`。

## 已有 issue 状态汇总

- `已有 issue 仍成立`: `04-long-transcript-no-windowing`、`09-projection-delta-transient-text-concat`、live markdown/source consumption and live item scans、scroll-sticky-bottom-layout、`07-transcript-revision-invariant` future invariant。
- `已修复`: `01-projection-event-top-level-react-state`、`08-projection-delta-redux-action-frequency` 的 action/subscription frequency、`02-transcript-chunk-selector-view-rebuild`、`03-item-started-dirties-transcript-state`、`06-temporary-grouping-full-turn-scan`、`10-live-slot-selector-cache-invalidation` 旧 selector cache invalidation、composer-input。
- `非本轮可归因`: `05-heroui-full-css-import`，只能作为后续资源量化入口。
- `证据不足`: retained-state-memory 的 RAF pending delta queue hard bound、manual reconnect/closed 后 detached live slot cleanup。

## 新发现问题索引

本轮无确认的新发现复杂度 finding；只有 retained-state-memory 的两个 `证据不足` 观察项。

## 非本轮可归因或证据不足

- `05-heroui-full-css-import`: CSS/JS 体积、CSS 解析/匹配耗时和首屏阻塞严重度需要 build 或浏览器量化，本轮禁止且不作为静态复杂度 finding。
- `RAF pending delta queue hard bound`: `pendingDeltaNotifications` 正常 cleanup 依赖 RAF 或同步 flush；若 RAF 长时间不运行，静态证据不足以证明 pending queue 始终有界。
- `detached live slot cleanup after manual reconnect/closed`: live item 正常 completion 会清理，但 manual reconnect/closed 后 detached live items 的明确清理证据不足；不能确认泄漏。
- `browser layout/paint/FPS measurement for long transcript and sticky-bottom`: `04-long-transcript-no-windowing` 和 scroll-sticky-bottom-layout 只确认源码复杂度路径，不包含浏览器实测结论。

## 后续 issue 或专项入口

- `05-heroui-full-css-import`: 需要后续资源量化专项；本轮不作为静态复杂度 finding。
- `RAF pending delta queue hard bound`: 需要后续按 `codex-issue-doc-workflow` 创建或更新 issue；本轮只记录入口，不修改 `docs/superpowers/issues/**`。
- `detached live slot cleanup after manual reconnect/closed`: 需要后续按 `codex-issue-doc-workflow` 创建或更新 issue；本轮只记录入口，不修改 `docs/superpowers/issues/**`。
- `browser layout/paint/FPS measurement for long transcript and sticky-bottom`: 需要单独进入设计/计划阶段；本轮不提出修复方案。
