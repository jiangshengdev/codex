# Projection Typed Fixtures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `codex-gui` 增加测试专用 projection typed fixture 入口，并迁移现有 unit、browser、e2e 测试，消除重复的 JSON fixture 本地类型断言。

**Architecture:** 新增 `src/features/projection/__tests__/projectionFixtures.ts`，集中导入 Rust 生成的 JSON fixtures 并导出 typed constants。调用点只替换 import 和本地 cast，不改变测试断言、fixture builders、生产代码或 Rust fixture 生成逻辑。

**Tech Stack:** TypeScript、Vitest、Vitest Browser、Playwright e2e、pnpm。

---

## 文件结构

- Create: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/projection/__tests__/projectionFixtures.ts`
  - 测试专用 typed fixture 入口，只依赖 JSON fixtures 和 `@codex-protocol/v2` type。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/projection/__tests__/projectionFixtures.test.ts`
  - 作为入口的第一层覆盖，改用 typed fixtures，同时保留原有 fixture payload 历史字段扫描。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts`
  - 改用 typed fixtures，保留派生对象所需 protocol type imports。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`
  - 改用 typed fixtures，保留 `ThreadProjectionEventNotification` 用于派生对象。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`
  - 改用 typed fixtures。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/liveEventHandling/__tests__/liveEventHandling.test.ts`
  - 改用 typed fixtures。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
  - 改用 typed fixtures。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/App.browser.test.tsx`
  - 改用 typed fixtures，保留手写 mismatch attach response 所需 protocol type imports。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
  - 改用 typed fixtures。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/__tests__/guiHostClient.test.ts`
  - 改用 typed fixtures，保留事件数组声明所需 protocol type imports。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/snapshotReplay/__tests__/snapshotReplay.test.ts`
  - 改用 typed fixtures。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts`
  - 改用 typed fixtures。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/appBrowserTestSupport.ts`
  - 改用 typed `attachBaseline` 导出 `attachResponse`。
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/e2e/app.spec.ts`
  - 改用同一个 typed fixture 入口，保留 import attribute 的需求只在验证失败时作为例外处理。

---

### Task 1: 新增 typed fixture 入口并迁移 fixture 校验测试

**Files:**

- Create: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/projection/__tests__/projectionFixtures.ts`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/projection/__tests__/projectionFixtures.test.ts`
- Depends on: `/Users/jiangsheng/cnb/codex/docs/superpowers/specs/2026-06-23-projection-typed-fixtures-design.md`

- [ ] **Step 1: 新增 typed fixture 入口**

Create `/Users/jiangsheng/cnb/codex/codex-gui/src/features/projection/__tests__/projectionFixtures.ts` with:

```ts
import attachBaselineJson from "../__fixtures__/attach-baseline.json";
import attachReplacementJson from "../__fixtures__/attach-replacement.json";
import closedBackpressureJson from "../__fixtures__/closed-backpressure.json";
import eventItemCompletedJson from "../__fixtures__/event-item-completed.json";
import eventItemStartedJson from "../__fixtures__/event-item-started.json";
import eventSubscriptionReplacementJson from "../__fixtures__/event-subscription-replacement.json";
import eventTurnCompletedJson from "../__fixtures__/event-turn-completed.json";
import eventTurnStartedJson from "../__fixtures__/event-turn-started.json";
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";

export const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
export const attachReplacement = attachReplacementJson as ThreadProjectionAttachResponse;
export const closedBackpressure = closedBackpressureJson as ThreadProjectionClosedNotification;
export const eventTurnStarted = eventTurnStartedJson as ThreadProjectionEventNotification;
export const eventItemStarted = eventItemStartedJson as ThreadProjectionEventNotification;
export const eventItemCompleted = eventItemCompletedJson as ThreadProjectionEventNotification;
export const eventTurnCompleted = eventTurnCompletedJson as ThreadProjectionEventNotification;
export const eventSubscriptionReplacement =
  eventSubscriptionReplacementJson as ThreadProjectionEventNotification;
```

- [ ] **Step 2: 更新 projection fixture 校验测试的 imports**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/projection/__tests__/projectionFixtures.test.ts`, replace the JSON imports, protocol type import, and local cast constants with:

```ts
import { describe, expect, it } from "vitest";
import {
  attachBaseline,
  attachReplacement,
  closedBackpressure,
  eventItemCompleted,
  eventItemStarted,
  eventSubscriptionReplacement,
  eventTurnCompleted,
  eventTurnStarted,
} from "./projectionFixtures";
```

Then replace the existing `fixturePayloads` definition with:

```ts
const fixturePayloads = [
  attachBaseline,
  attachReplacement,
  closedBackpressure,
  eventTurnStarted,
  eventItemStarted,
  eventItemCompleted,
  eventTurnCompleted,
  eventSubscriptionReplacement,
];
```

- [ ] **Step 3: 运行第一层验证**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:unit -- src/features/projection/__tests__/projectionFixtures.test.ts
```

Expected:

```text
PASS  src/features/projection/__tests__/projectionFixtures.test.ts
```

If this command does not accept a file argument in the local Vitest wrapper, run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:unit
```

Expected: the unit suite passes, including `projectionFixtures.test.ts`.

---

### Task 2: 迁移 src 下的 unit 测试

**Files:**

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/liveEventHandling/__tests__/liveEventHandling.test.ts`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/snapshotReplay/__tests__/snapshotReplay.test.ts`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts`

- [ ] **Step 1: 迁移 projection ingress adapter 测试 imports**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/projectionIngress/__tests__/projectionIngressAdapter.test.ts`, remove the six JSON imports and replace them with:

```ts
import {
  attachBaseline,
  attachReplacement,
  closedBackpressure,
  eventItemStarted,
  eventSubscriptionReplacement,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
```

Remove these local constants:

```ts
const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
const attachReplacement = attachReplacementJson as ThreadProjectionAttachResponse;
const eventTurnStarted = eventTurnStartedJson as ThreadProjectionEventNotification;
const eventItemStarted = eventItemStartedJson as ThreadProjectionEventNotification;
const eventSubscriptionReplacement =
  eventSubscriptionReplacementJson as ThreadProjectionEventNotification;
const closedBackpressure = closedBackpressureJson as ThreadProjectionClosedNotification;
```

Keep the `@codex-protocol/v2` type import for `ThreadProjectionAttachResponse`, `ThreadProjectionClosedNotification`, `ThreadProjectionEventNotification`, and `Turn`, because this file constructs derived typed values.

- [ ] **Step 2: 迁移 thread runtime reducer 测试 imports**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/threadRuntime/__tests__/threadRuntimeSlice.test.ts`, remove the six JSON imports and replace them with:

```ts
import {
  attachBaseline,
  attachReplacement,
  eventItemCompleted,
  eventItemStarted,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
```

Remove these local constants:

```ts
const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
const attachReplacement = attachReplacementJson as ThreadProjectionAttachResponse;
const eventTurnStarted = eventTurnStartedJson as ThreadProjectionEventNotification;
const eventTurnCompleted = eventTurnCompletedJson as ThreadProjectionEventNotification;
const eventItemStarted = eventItemStartedJson as ThreadProjectionEventNotification;
const eventItemCompleted = eventItemCompletedJson as ThreadProjectionEventNotification;
```

Keep `ThreadProjectionEventNotification` imported from `@codex-protocol/v2`, because the test creates `nonMatchingCompleted`.

- [ ] **Step 3: 迁移 transcript state 测试 imports**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/transcriptState/__tests__/transcriptStateSlice.test.ts`, remove the five JSON imports, remove the `@codex-protocol/v2` fixture-cast type import if it becomes unused, and add:

```ts
import {
  attachBaseline,
  eventItemCompleted,
  eventItemStarted,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
```

Remove these local constants:

```ts
const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
const eventTurnStarted = eventTurnStartedJson as ThreadProjectionEventNotification;
const eventItemStarted = eventItemStartedJson as ThreadProjectionEventNotification;
const eventItemCompleted = eventItemCompletedJson as ThreadProjectionEventNotification;
const eventTurnCompleted = eventTurnCompletedJson as ThreadProjectionEventNotification;
```

- [ ] **Step 4: 迁移 live event handling 测试 imports**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/liveEventHandling/__tests__/liveEventHandling.test.ts`, remove the five JSON imports, remove the `@codex-protocol/v2` fixture-cast type import if it becomes unused, and add:

```ts
import {
  attachBaseline,
  eventItemCompleted,
  eventItemStarted,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
```

Remove these local constants:

```ts
const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
const eventTurnStarted = eventTurnStartedJson as ThreadProjectionEventNotification;
const eventItemStarted = eventItemStartedJson as ThreadProjectionEventNotification;
const eventItemCompleted = eventItemCompletedJson as ThreadProjectionEventNotification;
const eventTurnCompleted = eventTurnCompletedJson as ThreadProjectionEventNotification;
```

- [ ] **Step 5: 迁移 snapshot replay 测试 imports**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/snapshotReplay/__tests__/snapshotReplay.test.ts`, remove the three JSON imports, remove the `@codex-protocol/v2` fixture-cast type import if it becomes unused, and add:

```ts
import {
  attachBaseline,
  eventItemStarted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
```

Remove these local constants:

```ts
const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
const eventTurnStarted = eventTurnStartedJson as ThreadProjectionEventNotification;
const eventItemStarted = eventItemStartedJson as ThreadProjectionEventNotification;
```

- [ ] **Step 6: 迁移 composer turn control model 测试 imports**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/composerTurnControlModel.test.ts`, remove the `attach-baseline.json` import, remove the `ThreadProjectionAttachResponse` type import if it becomes unused, and add:

```ts
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
```

Remove this local constant:

```ts
const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
```

- [ ] **Step 7: 运行 unit 验证**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:unit
```

Expected:

```text
Test Files  ... passed
Tests       ... passed
```

- [ ] **Step 8: 检查 unit 迁移后没有残留 JSON cast 模式**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
rg -n "features/projection/__fixtures__|\\.\\./__fixtures__/| as ThreadProjection(AttachResponse|ClosedNotification|EventNotification)" codex-gui/src --glob '*.{ts,tsx}' --glob '!**/*.browser.test.ts' --glob '!**/*.browser.test.tsx' --glob '!src/__tests__/appBrowserTestSupport.ts'
```

Expected: the only matches are inside `/Users/jiangsheng/cnb/codex/codex-gui/src/features/projection/__tests__/projectionFixtures.ts`. Matches in browser tests or shared browser support are handled in Task 3.

---

### Task 3: 迁移 browser 测试和 App 测试支撑文件

**Files:**

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/App.browser.test.tsx`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/__tests__/guiHostClient.test.ts`
- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/appBrowserTestSupport.ts`

- [ ] **Step 1: 迁移 committed transcript browser 测试 imports**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`, remove the four JSON imports, remove the `@codex-protocol/v2` fixture-cast type import if it becomes unused, and add:

```ts
import {
  attachBaseline,
  eventItemCompleted,
  eventItemStarted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
```

Remove these local constants:

```ts
const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
const eventItemStarted = eventItemStartedJson as ThreadProjectionEventNotification;
const eventItemCompleted = eventItemCompletedJson as ThreadProjectionEventNotification;
const eventTurnStarted = eventTurnStartedJson as ThreadProjectionEventNotification;
```

- [ ] **Step 2: 迁移 App browser 测试 imports**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/App.browser.test.tsx`, remove the three JSON imports and add:

```ts
import {
  closedBackpressure,
  eventItemStarted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
```

Replace local event and closed casts:

```ts
const projectionEvent = eventTurnStartedJson as ThreadProjectionEventNotification;
const projectionClosed = closedBackpressureJson as ThreadProjectionClosedNotification;
const projectionEvent = eventItemStartedJson as ThreadProjectionEventNotification;
```

with direct typed values:

```ts
const projectionEvent = eventTurnStarted;
const projectionClosed = closedBackpressure;
const projectionEvent = eventItemStarted;
```

Keep `ThreadProjectionAttachResponse` imported from `@codex-protocol/v2`, because this file defines `mismatchedAttachResponse`.

- [ ] **Step 3: 迁移 composer turn control browser 测试 imports**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/composerTurnControl/__tests__/ComposerTurnControl.browser.test.tsx`, remove the two JSON imports, remove the `@codex-protocol/v2` fixture-cast type import if it becomes unused, and add:

```ts
import {
  attachBaseline,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
```

Replace:

```ts
const attachResponse = attachBaselineJson as ThreadProjectionAttachResponse;
const event = eventTurnStartedJson as ThreadProjectionEventNotification;
```

with:

```ts
const attachResponse = attachBaseline;
const event = eventTurnStarted;
```

- [ ] **Step 4: 迁移 GUI host client 测试 imports**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/features/guiHost/__tests__/guiHostClient.test.ts`, remove the three JSON imports and add:

```ts
import {
  attachBaseline,
  closedBackpressure,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
```

Remove this local constant:

```ts
const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
```

Replace local casts inside tests:

```ts
const projectionEvent = eventTurnStartedJson as ThreadProjectionEventNotification;
const projectionClosed = closedBackpressureJson as ThreadProjectionClosedNotification;
```

with:

```ts
const projectionEvent = eventTurnStarted;
const projectionClosed = closedBackpressure;
```

Keep protocol type imports for arrays such as `ThreadProjectionAttachResponse[]`, `ThreadProjectionEventNotification[]`, and `ThreadProjectionClosedNotification[]`.

- [ ] **Step 5: 迁移 App browser test support imports**

In `/Users/jiangsheng/cnb/codex/codex-gui/src/__tests__/appBrowserTestSupport.ts`, remove the `attach-baseline.json` import and add:

```ts
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
```

Replace:

```ts
export const attachResponse = attachBaselineJson as ThreadProjectionAttachResponse;
```

with:

```ts
export const attachResponse: ThreadProjectionAttachResponse = attachBaseline;
```

Keep `ThreadProjectionAttachResponse` imported from `@codex-protocol/v2`, because exported function signatures still use it.

- [ ] **Step 6: 运行 browser 验证**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:browser
```

Expected:

```text
Test Files  ... passed
Tests       ... passed
```

- [ ] **Step 7: 检查 src 下 fixture JSON imports 和本地 cast 已清理**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
rg -n "features/projection/__fixtures__|\\.\\./__fixtures__/| as ThreadProjection(AttachResponse|ClosedNotification|EventNotification)" codex-gui/src --glob '*.{ts,tsx}'
```

Expected: the only allowed matches are inside `/Users/jiangsheng/cnb/codex/codex-gui/src/features/projection/__tests__/projectionFixtures.ts`.

---

### Task 4: 迁移 e2e 并做最终验证

**Files:**

- Modify: `/Users/jiangsheng/cnb/codex/codex-gui/e2e/app.spec.ts`

- [ ] **Step 1: 迁移 e2e app spec imports**

In `/Users/jiangsheng/cnb/codex/codex-gui/e2e/app.spec.ts`, remove:

```ts
import attachBaselineJson from "@/features/projection/__fixtures__/attach-baseline.json" with { type: "json" };
```

Add:

```ts
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
```

Remove:

```ts
const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
```

Keep `ThreadProjectionAttachResponse` imported from `@codex-protocol/v2`, because this file still annotates `attachResponse` and `mobileStressAttachResponse`.

- [ ] **Step 2: 验证 e2e TypeScript 边界**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm exec tsc -p e2e/tsconfig.json --noEmit
```

Expected: the command exits `0` and prints no TypeScript diagnostics.

If this fails because Playwright runtime or E2E TypeScript cannot consume `@/features/projection/__tests__/projectionFixtures`, revert only the e2e import change in `/Users/jiangsheng/cnb/codex/codex-gui/e2e/app.spec.ts`, keep the original JSON import with `with { type: "json" }`, and leave the `src` migration intact. Do not move the helper into a production path to satisfy e2e.

- [ ] **Step 3: 运行全量前端类型检查**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run type-check
```

Expected: the command exits `0` and prints no TypeScript diagnostics.

- [ ] **Step 4: 运行 unit 测试**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run test:unit
```

Expected:

```text
Test Files  ... passed
Tests       ... passed
```

- [ ] **Step 5: 运行格式检查**

Run:

```sh
cd /Users/jiangsheng/cnb/codex/codex-gui
pnpm run format:prettier
```

Expected:

```text
All matched files use Prettier code style!
```

- [ ] **Step 6: 最终残留扫描**

Run:

```sh
cd /Users/jiangsheng/cnb/codex
rg -n "features/projection/__fixtures__|\\.\\./__fixtures__/| as ThreadProjection(AttachResponse|ClosedNotification|EventNotification)" codex-gui/src codex-gui/e2e --glob '*.{ts,tsx}'
```

Expected:

```text
codex-gui/src/features/projection/__tests__/projectionFixtures.ts:1:import attachBaselineJson from "../__fixtures__/attach-baseline.json";
codex-gui/src/features/projection/__tests__/projectionFixtures.ts:2:import attachReplacementJson from "../__fixtures__/attach-replacement.json";
codex-gui/src/features/projection/__tests__/projectionFixtures.ts:3:import closedBackpressureJson from "../__fixtures__/closed-backpressure.json";
codex-gui/src/features/projection/__tests__/projectionFixtures.ts:4:import eventItemCompletedJson from "../__fixtures__/event-item-completed.json";
codex-gui/src/features/projection/__tests__/projectionFixtures.ts:5:import eventItemStartedJson from "../__fixtures__/event-item-started.json";
codex-gui/src/features/projection/__tests__/projectionFixtures.ts:6:import eventSubscriptionReplacementJson from "../__fixtures__/event-subscription-replacement.json";
codex-gui/src/features/projection/__tests__/projectionFixtures.ts:7:import eventTurnCompletedJson from "../__fixtures__/event-turn-completed.json";
codex-gui/src/features/projection/__tests__/projectionFixtures.ts:8:import eventTurnStartedJson from "../__fixtures__/event-turn-started.json";
codex-gui/src/features/projection/__tests__/projectionFixtures.ts:15:export const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
codex-gui/src/features/projection/__tests__/projectionFixtures.ts:16:export const attachReplacement = attachReplacementJson as ThreadProjectionAttachResponse;
codex-gui/src/features/projection/__tests__/projectionFixtures.ts:17:export const closedBackpressure = closedBackpressureJson as ThreadProjectionClosedNotification;
codex-gui/src/features/projection/__tests__/projectionFixtures.ts:18:export const eventTurnStarted = eventTurnStartedJson as ThreadProjectionEventNotification;
codex-gui/src/features/projection/__tests__/projectionFixtures.ts:19:export const eventItemStarted = eventItemStartedJson as ThreadProjectionEventNotification;
codex-gui/src/features/projection/__tests__/projectionFixtures.ts:20:export const eventItemCompleted = eventItemCompletedJson as ThreadProjectionEventNotification;
codex-gui/src/features/projection/__tests__/projectionFixtures.ts:21:export const eventTurnCompleted = eventTurnCompletedJson as ThreadProjectionEventNotification;
codex-gui/src/features/projection/__tests__/projectionFixtures.ts:23:  eventSubscriptionReplacementJson as ThreadProjectionEventNotification;
```

If e2e had to keep its JSON import exception, the final scan may also show `/Users/jiangsheng/cnb/codex/codex-gui/e2e/app.spec.ts`; include that exception explicitly in the final implementation summary.

---

## 实施顺序

1. Task 1 creates the single typed fixture entry and proves the fixture validation test still works.
2. Task 2 migrates node-based unit tests and runs the unit suite.
3. Task 3 migrates browser-facing test files and runs browser tests.
4. Task 4 migrates e2e, verifies TypeScript boundaries, and runs final checks.

Do not install dependencies. Do not stage, commit, push, pull, fetch, or operate git remotes unless the user explicitly asks for that later.
