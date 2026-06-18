# HeroUI Page Shell Redesign Implementation Plan

> 执行本计划时必须逐项推进 checkbox。代码或测试改动必须由 worker 子代理完成；主代理负责协调、
> 审查、验证和提交。执行期间不得修改设计文档或本计划正文，除非只是把已完成任务的 checkbox 打勾。

## 目标

按已确认的 `04a` 设计重写当前首屏页面可见 UI: 让 HeroUI React v3 接管 `App` 页面壳和
`CommittedTranscriptSurface` 的主要视觉所有权, 清理旧的手写 Tailwind card / alert / pill
视觉实现。

本计划不是“给现有 HTML 套 HeroUI wrapper”。实现必须先识别并移除旧视觉 ownership, 再用
`Surface`、`Card`、`Alert`、`Chip`、`Typography` 等本地 HeroUI v3 组件重建页面层级。

## Source Design

实现已确认的页面级设计:

- `docs/superpowers/specs/2026-06-17-yolo-single-session-chat-performance-v2/04a-heroui-chat-shell-design.md`

本计划依赖但不修改:

- `docs/superpowers/specs/2026-06-17-yolo-single-session-chat-performance-v2/04-chat-shell-style-design.md`
- `docs/superpowers/specs/2026-06-17-yolo-single-session-chat-performance-v2/03-committed-transcript-surface-design.md`
- `docs/superpowers/plans/2026-06-17-yolo-single-session-chat-performance-v2/04-chat-shell-style/plan-04-chat-shell-style.md`

如果实施时发现 `04a` 设计不足, 必须停止实现并回到设计层, 不得边实现边改设计或计划。

## 范围

本计划允许修改:

- `codex-gui/src/App.tsx`
- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`
- `codex-gui/src/__tests__/App.browser.test.tsx`
- `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
- `codex-gui/e2e/app.spec.ts`

测试文件只允许为适配新页面结构和保持用户语义契约而修改。不得添加测试来断言 HeroUI 内部 DOM、
HeroUI BEM class、具体 Tailwind class 或 import 细节。

本计划只读验证:

- `codex-gui/.heroui-docs/react/components/(layout)/surface.mdx`
- `codex-gui/.heroui-docs/react/components/(layout)/card.mdx`
- `codex-gui/.heroui-docs/react/components/(feedback)/alert.mdx`
- `codex-gui/.heroui-docs/react/components/(data-display)/chip.mdx`
- `codex-gui/.heroui-docs/react/components/(typography)/typography.mdx`

本计划禁止修改:

- `docs/superpowers/specs/**`
- `docs/superpowers/plans/**`, 但执行时允许勾选本计划 checkbox
- `codex-gui/src/features/transcriptState/**`
- `codex-gui/src/features/guiHost/**`
- `codex-gui/src/features/projectionIngress/**`
- `codex-gui/src/features/threadRuntime/**`
- `codex-gui/src/index.css`
- `codex-gui/package.json`
- `codex-gui/pnpm-lock.yaml`
- 任何 lockfile

## 实施契约

必须使用本地 HeroUI v3 docs, 不得联网读取 HeroUI 文档:

```text
codex-gui/.heroui-docs/react/
```

必须使用现有依赖:

```text
@heroui/react
@heroui/styles
```

不得运行:

```bash
pnpm install
pnpm update
```

不得新增:

```text
HeroUIProvider
framer-motion
new component library
new CSS dependency
lockfile changes
```

自动测试不验证组件库来源。组件库是否真正接管页面视觉由人工代码审查确认。

## Task 1: Preflight And Local HeroUI Docs Check

**Files:** 只读

- [ ] **Step 1: Confirm clean working tree and branch**

运行:

```bash
git status --short --branch
```

Expected: 没有未预期 dirty 文件。若出现 `codex-gui/package.json`、`codex-gui/pnpm-lock.yaml` 或任何
lockfile 变更, 停止并汇报; 不要 restore、stage 或 commit。

- [ ] **Step 2: Read the source design**

读取:

```bash
sed -n '1,320p' docs/superpowers/specs/2026-06-17-yolo-single-session-chat-performance-v2/04a-heroui-chat-shell-design.md
```

Expected:

- 本阶段范围覆盖 `App` 页面壳和 `CommittedTranscriptSurface`;
- HeroUI 接管 page shell、status、empty、entry、metadata 的主要视觉所有权;
- Tailwind 只保留布局 glue、响应式约束、长文本换行和稳定 hook;
- 自动测试不验证是否使用 HeroUI。

- [ ] **Step 3: Read local HeroUI docs**

读取:

```bash
sed -n '1,180p' 'codex-gui/.heroui-docs/react/components/(layout)/surface.mdx'
sed -n '1,210p' 'codex-gui/.heroui-docs/react/components/(layout)/card.mdx'
sed -n '1,170p' 'codex-gui/.heroui-docs/react/components/(feedback)/alert.mdx'
sed -n '1,180p' 'codex-gui/.heroui-docs/react/components/(data-display)/chip.mdx'
sed -n '1,120p' 'codex-gui/.heroui-docs/react/components/(typography)/typography.mdx'
```

Expected:

- `Surface`, `Card`, `Alert`, `Chip`, `Typography` 均从 `@heroui/react` 导入;
- `Card` 使用 `Card.Content`, 不使用不存在的 `CardBody`;
- `Alert` 使用 `Alert.Content` / `Alert.Title` / `Alert.Description`;
- `Chip` 用于 standalone labels / statuses;
- `Typography` 用于 body / small text / muted text 等文本层级。

## Task 2: Rebuild The App Page Shell With HeroUI Surface

**Files:**

- Modify: `codex-gui/src/App.tsx`
- May modify: `codex-gui/src/__tests__/App.browser.test.tsx`

- [ ] **Step 1: Import and use HeroUI Surface**

在 `App.tsx` 中使用 `Surface` 承担首屏页面可见 surface:

```tsx
import { Surface } from "@heroui/react";
```

Required behavior:

- `main[data-gui-host-status]` 保留;
- host connection、projection ingress、Redux dispatch 逻辑不变;
- 不展示 `GUI host`、`status`、`attached`、`events`、`last event`;
- `main` 只保留语义、test hook、viewport 和布局 glue;
- 可见 page shell 使用 `Surface`, 优先使用 `variant="default"`;
- 不新增 header、sidebar、toolbar、debug inspector、loading UI 或 connection error UI。

- [ ] **Step 2: Move page visual ownership away from main**

清理 `main` 上承担页面视觉的旧 Tailwind ownership。

Remove or avoid preserving as main visual ownership:

```text
bg-background
text-foreground
```

Allowed on `main`:

```text
min-h-svh
w-full
responsive padding
centering/layout glue
```

`Surface` 可以承载必要的 layout class, 但不得把旧页面视觉 class 原样搬到 `Surface className` 里来模拟
旧界面。

- [ ] **Step 3: Update App browser test structure assertions**

当前 App browser test 可能假设 `main.firstElementChild` 直接是 committed transcript region。页面重写后
允许 `main -> Surface -> region`。更新断言时必须保持用户语义:

- `main` 仍有 `data-gui-host-status`;
- `Committed transcript` region 可见;
- empty state 可见;
- `GUI host` debug details 不可见;
- 不断言 HeroUI DOM、BEM class、Tailwind class 或 `Surface` 内部结构。

## Task 3: Rebuild The Committed Transcript Surface With HeroUI Components

**Files:**

- Modify: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`

- [ ] **Step 1: Import HeroUI components**

在 `CommittedTranscriptSurface.tsx` 中使用本地 docs 支持的 HeroUI 组件:

```tsx
import { Alert, Card, Chip, Typography } from "@heroui/react";
```

`Separator` 只有在确实需要 turn / section 分隔时才引入。不要新增 provider、样式入口或依赖。

- [ ] **Step 2: Replace global status visual implementation with Alert**

把 `globalStatus.map(...)` 中的手写 status panel 替换为 HeroUI `Alert`。

Required behavior:

- 使用 `<Alert status="danger">`;
- 使用 `Alert.Content` 和 `Alert.Title` 或 `Alert.Description`;
- 保留 `committed-transcript-status` stable class;
- 保留 `role="status"` 或等价可访问状态语义;
- status 文案仍为 `Connection interrupted. Reconnect required.`;
- 不新增 close button、retry button、loading spinner 或正式 connection error UI。

Must remove as status visual ownership:

```text
rounded-md
border-danger/30
bg-danger/10
text-danger
```

- [ ] **Step 3: Replace empty state visual implementation with Card/Typography**

把 empty state 的手写 dashed panel 替换为 HeroUI `Card` 或 `Surface`。本计划优先使用 `Card`。

Required behavior:

- 使用 `Card` 作为 empty state 容器;
- 使用 `Card.Content`;
- 使用 `Typography` 表达文案;
- 保留 `committed-transcript-empty` stable class;
- 文案仍为 `No committed messages yet.`;
- empty state 仍由 `!hasCommittedChunks` 控制, 包括有 turn 但没有 committed chunks 的场景;
- 不新增 loading UI 或 connection progress UI。

Must remove as empty visual ownership:

```text
rounded-md
border-dashed
border-foreground/20
text-muted
```

- [ ] **Step 4: Replace entry visual implementation with Card/Typography**

把 committed transcript entry 的手写 `<article>` card 替换为 HeroUI `Card` 结构。

Required behavior:

- 使用 `Card` 作为 entry 内容容器;
- 使用 `Card.Content` 承载 entry role 和 source;
- 使用 `Typography` 表达 role 和 source 文本层级;
- 保留 `committed-transcript-entry` 和 `committed-transcript-entry-${entry.type}` stable classes;
- role 文本和 source 文本继续可见;
- source 内容继续保留 `whitespace-pre-wrap`、`wrap-break-word` 和必要 line-height;
- 不改变 `entryText(...)` 和 transcript selector 使用方式。

Must remove as entry visual ownership:

```text
rounded-md
border-foreground/10
bg-background
shadow-sm
text-foreground
```

- [ ] **Step 5: Replace turn metadata pill with Chip**

把 turn metadata 中的 hand-written status pill 替换为 HeroUI `Chip`。

Required behavior:

- turn article 继续保留 `aria-label={`Turn ${turn.id}`}`;
- turn id 继续可见;
- turn status 继续可见;
- status label 使用 `Chip`, 优先 `size="sm"` 和 neutral/default color;
- 可用 `Typography` 表达 turn id;
- 保留 `committed-transcript-turn-*` stable classes。

Must remove as metadata visual ownership:

```text
rounded-sm
bg-foreground/5
px-2
py-0.5
```

- [ ] **Step 6: Preserve structural and selector boundaries**

保持以下事实和结构边界:

- `section[aria-label="Committed transcript"]`;
- `committed-transcript-status-list`;
- `committed-transcript-turn-list`;
- `CommittedTranscriptTurn`;
- `CommittedTranscriptChunk`;
- reducer / selector 调用路径;
- `hasCommittedChunks` 语义。

不要通过 `App` 或 shell helper 重新 materialize transcript tree。不要修改 transcript state、runtime、
projection ingress 或 host client。

## Task 4: Update Focused E2E Structure Assertions

**Files:**

- Modify: `codex-gui/e2e/app.spec.ts`

- [ ] **Step 1: Remove direct-child page structure assertion**

当前 e2e 若断言:

```ts
page.locator("main > section")
```

应替换为用户语义断言, 因为新页面结构允许 `main -> Surface -> section`。

Required assertions:

- `main[data-gui-host-status]` 仍按场景更新;
- `Committed transcript` region 可见;
- `No committed messages yet.` 可见;
- 页面不展示旧 `GUI host` debug panel;
- host event 场景中即使已有 turn 但没有 committed chunks, empty state 仍可见;
- 不断言 HeroUI DOM、BEM class、Tailwind class 或 direct-child 结构。

## Task 5: Focused Verification

**Files:** 验证为主

- [ ] **Step 1: Run focused App browser test**

运行:

```bash
pnpm --dir codex-gui run test:browser -- src/__tests__/App.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run focused committed transcript browser test**

运行:

```bash
pnpm --dir codex-gui run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run focused e2e app test**

运行:

```bash
pnpm --dir codex-gui run test:e2e -- e2e/app.spec.ts
```

Expected: PASS.

If Playwright browser assets are missing, stop and report the missing local dependency; do not install browsers or
runtime assets.

- [ ] **Step 4: Run type-check**

运行:

```bash
pnpm --dir codex-gui run type-check
```

Expected: PASS.

- [ ] **Step 5: Run scoped lint**

运行:

```bash
pnpm --dir codex-gui exec eslint src/App.tsx src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx src/__tests__/App.browser.test.tsx src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx e2e/app.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Run scoped formatting check**

运行:

```bash
pnpm --dir codex-gui exec prettier --check src/App.tsx src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx src/__tests__/App.browser.test.tsx src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx e2e/app.spec.ts
```

Expected: PASS.

Do not run full test suites. If formatting issues are reported, only format the files touched by this plan and rerun
the same scoped formatting check. Do not run `pnpm --dir codex-gui run ci` unless the user explicitly authorizes a
broader frontend check.

## Task 6: Manual Component-Library Review

**Files:** 只读审查

- [ ] **Step 1: Confirm HeroUI page/component usage**

运行:

```bash
rg -n "@heroui/react|<Surface|<Card|Card\\.Content|<Alert|Alert\\.Content|<Chip|<Typography" codex-gui/src/App.tsx codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx
```

Expected:

- `App.tsx` imports and uses `Surface`;
- `CommittedTranscriptSurface.tsx` imports and uses `Alert`, `Card`, `Chip`, and `Typography`;
- committed empty state uses `Card` / `Card.Content`;
- committed entry uses `Card` / `Card.Content`;
- global status uses `Alert` / `Alert.Content`;
- turn status uses `Chip`;
- no test asserts these implementation details.

- [ ] **Step 2: Confirm legacy visual ownership was not carried forward**

运行:

```bash
rg -n "border-danger/30|bg-danger/10|border-dashed|border-foreground/10|bg-foreground/5|shadow-sm|CardBody" codex-gui/src/App.tsx codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx
```

Expected: no matches, unless a match is demonstrably not part of page/status/empty/entry/metadata visual ownership.
If a match remains, review against the `04a` ownership matrix before proceeding.

- [ ] **Step 3: Confirm forbidden APIs and dependency changes were not introduced**

运行:

```bash
rg -n "HeroUIProvider|framer-motion|CardBody" codex-gui/src
git status --short
```

Expected:

- no forbidden API matches;
- no `codex-gui/package.json`, `codex-gui/pnpm-lock.yaml`, `codex-gui/src/index.css`, design docs, unrelated docs,
  or lockfiles in the implementation diff.

## Task 7: Commit

**Files:**

- Stage only files modified by this plan.

- [ ] **Step 1: Review final diff**

运行:

```bash
git diff -- codex-gui/src/App.tsx \
  codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx \
  codex-gui/src/__tests__/App.browser.test.tsx \
  codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx \
  codex-gui/e2e/app.spec.ts
git status --short
```

Expected: diff only contains the page shell redesign, committed transcript HeroUI component rewrite, and focused test
updates allowed by this plan.

- [ ] **Step 2: Stage intended files only**

运行:

```bash
git add codex-gui/src/App.tsx \
  codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx \
  codex-gui/src/__tests__/App.browser.test.tsx \
  codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx \
  codex-gui/e2e/app.spec.ts
```

Do not stage docs, package files, lockfiles, generated files, or unrelated changes in this implementation task.

- [ ] **Step 3: Commit the page shell redesign**

运行:

```bash
git commit -m "style(gui): rebuild chat shell with HeroUI"
```

Do not push unless the user explicitly requests it.
