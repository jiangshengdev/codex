# HeroUI Chat Shell Correction Implementation Plan

> 执行本计划时必须逐项推进 checkbox。代码或测试改动必须由 worker 子代理完成；主代理负责协调、审查、验证和提交。执行期间不得修改设计文档或本计划正文，除非只是把已完成任务的 checkbox 打勾。

## 目标

修正 `CommittedTranscriptSurface` 的组件库落地方式: `Entry`、`Empty state` 和 `Global status`
必须实际使用现有 `@heroui/react` 组件, 而不是只使用原生 HTML + Tailwind。

## Source Design

实现已确认的修正设计:

- `docs/superpowers/specs/2026-06-17-yolo-single-session-chat-performance-v2/04a-heroui-chat-shell-design.md`

本计划依赖但不修改:

- `docs/superpowers/specs/2026-06-17-yolo-single-session-chat-performance-v2/04-chat-shell-style-design.md`
- `docs/superpowers/plans/2026-06-17-yolo-single-session-chat-performance-v2/04-chat-shell-style/plan-04-chat-shell-style.md`

如果实施时发现 `04a` 设计不足, 必须停止实现并回到设计层, 不得边实现边改设计或计划。

## 范围

本计划允许修改:

- `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`

本计划只读验证:

- `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
- `codex-gui/e2e/app.spec.ts`
- `codex-gui/.heroui-docs/react/components/(layout)/card.mdx`
- `codex-gui/.heroui-docs/react/components/(feedback)/alert.mdx`

本计划禁止修改:

- `docs/superpowers/specs/**`
- `docs/superpowers/plans/**`
- `codex-gui/src/App.tsx`
- `codex-gui/src/__tests__/App.browser.test.tsx`
- `codex-gui/e2e/app.spec.ts`
- `codex-gui/src/features/transcriptState/**`
- `codex-gui/src/features/guiHost/**`
- `codex-gui/src/features/projectionIngress/**`
- `codex-gui/src/features/threadRuntime/**`
- `codex-gui/src/index.css`
- `codex-gui/package.json`
- `codex-gui/pnpm-lock.yaml`
- 任何 lockfile

除非现有 focused tests 因可访问语义回归失败, 否则不得修改测试。即使测试失败, 也应优先修
`CommittedTranscriptSurface.tsx` 保持现有用户语义, 不得弱化测试来迁就 HeroUI 内部 DOM。

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

自动测试不验证组件库来源。组件库是否真正使用由人工代码审查确认。

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
sed -n '1,220p' docs/superpowers/specs/2026-06-17-yolo-single-session-chat-performance-v2/04a-heroui-chat-shell-design.md
```

Expected: 确认本阶段只要求 `CommittedTranscriptSurface` 的 Entry / Empty / Status 使用 HeroUI React
组件, 不修改 `App` shell。

- [ ] **Step 3: Read local HeroUI Card and Alert docs**

读取:

```bash
sed -n '1,160p' 'codex-gui/.heroui-docs/react/components/(layout)/card.mdx'
sed -n '1,180p' 'codex-gui/.heroui-docs/react/components/(feedback)/alert.mdx'
```

Expected:

- `Card` 从 `@heroui/react` 导入;
- 使用 `Card.Content`, 不使用不存在的 `CardBody`;
- `Alert` 从 `@heroui/react` 导入;
- 使用 `Alert.Content`, 可使用 `Alert.Indicator` / `Alert.Title`。

## Task 2: Convert Entry, Empty, And Status To HeroUI Components

**Files:**

- Modify: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`

- [ ] **Step 1: Import HeroUI components**

在 `CommittedTranscriptSurface.tsx` 中添加:

```tsx
import { Alert, Card } from "@heroui/react";
```

不要新增 provider、样式入口或依赖。

- [ ] **Step 2: Convert committed transcript entries to Card**

把 `CommittedTranscriptEntry` 的外层原生 `<article>` 替换为 HeroUI `Card`。

Required behavior:

- `Card` 必须保留 `committed-transcript-entry` 和 `committed-transcript-entry-${entry.type}` class;
- entry 内容主体必须使用 `Card.Content`;
- role 文本和 source 文本继续可见;
- source 内容继续使用 `whitespace-pre-wrap` 和当前长文本换行策略;
- entry 可以通过 `role="article"` 或语义 wrapper 保留内容分组语义;
- 不改变 `entryText(...)` 和 transcript selector 使用方式。

Allowed shape:

```tsx
const CommittedTranscriptEntry = ({ entry }: { entry: TranscriptEntry }) => (
  <Card
    className={`committed-transcript-entry committed-transcript-entry-${entry.type} ...`}
    role="article"
  >
    <Card.Content className="...">
      ...
    </Card.Content>
  </Card>
);
```

具体 className 可按现有 Tailwind 密度调整, 但必须保留稳定 `committed-transcript-*` hooks。

- [ ] **Step 3: Convert global status to Alert**

把 `globalStatus.map(...)` 中的原生 status `<div>` 替换为 HeroUI `Alert`。

Required behavior:

- 使用 `<Alert status="danger">` 或本地 docs 支持的等价 danger status;
- 保留 `committed-transcript-status` class;
- 保留 `role="status"` 或等价可访问状态语义;
- status 文案仍为 `Connection interrupted. Reconnect required.`;
- 可使用 `Alert.Indicator`、`Alert.Content`、`Alert.Title`;
- 不新增 close button、retry button、loading spinner 或正式 connection error UI。

Allowed shape:

```tsx
<Alert className="committed-transcript-status ..." key={status.id} role="status" status="danger">
  <Alert.Indicator />
  <Alert.Content>
    <Alert.Title>{subscriptionInterruptedStatusText}</Alert.Title>
  </Alert.Content>
</Alert>
```

- [ ] **Step 4: Convert empty state to Card**

把 empty state 的原生 `<p>` 外层替换为 HeroUI `Card`。

Required behavior:

- 使用 `Card` 作为 empty state 容器;
- empty state 内容主体使用 `Card.Content`;
- 保留 `committed-transcript-empty` class;
- 文案仍为 `No committed messages yet.`;
- empty state 仍只由 `!hasCommittedChunks` 控制;
- 不新增 loading UI 或 connection progress UI。

Allowed shape:

```tsx
<Card className="committed-transcript-empty ...">
  <Card.Content>
    <p className="...">No committed messages yet.</p>
  </Card.Content>
</Card>
```

- [ ] **Step 5: Preserve structural HTML boundaries**

保持以下结构继续使用原生 HTML + Tailwind:

- `section[aria-label="Committed transcript"]`;
- `committed-transcript-status-list`;
- `committed-transcript-turn-list`;
- `CommittedTranscriptTurn`;
- `CommittedTranscriptChunk`;
- turn id / turn status metadata wrappers.

不要为了提高组件覆盖率把纯结构层强行 HeroUI 化。

## Task 3: Focused Behavior Verification

**Files:** 验证为主, 默认不修改

- [ ] **Step 1: Run focused committed transcript browser test**

运行:

```bash
pnpm --dir codex-gui run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: PASS.

If this fails because text or accessibility roles changed, fix `CommittedTranscriptSurface.tsx` to preserve existing
user-visible semantics. Do not weaken tests to assert HeroUI internals.

- [ ] **Step 2: Run focused e2e app test**

运行:

```bash
pnpm --dir codex-gui run test:e2e -- e2e/app.spec.ts
```

Expected: PASS.

If Playwright browser assets are missing, stop and report the missing local dependency; do not install browsers or
runtime assets.

- [ ] **Step 3: Run focused lint on the touched source file**

运行:

```bash
pnpm --dir codex-gui exec eslint src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx
```

Expected: PASS.

- [ ] **Step 4: Run TypeScript project check**

运行:

```bash
pnpm --dir codex-gui run type-check
```

Expected: PASS.

Do not run full test suites.

## Task 4: Manual Component-Library Review

**Files:** 只读审查

- [ ] **Step 1: Confirm HeroUI imports and usage**

运行:

```bash
rg -n "@heroui/react|<Card|Card\\.Content|<Alert|Alert\\.Content" codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx
```

Expected:

- `CommittedTranscriptSurface.tsx` imports `Alert` and `Card` from `@heroui/react`;
- `CommittedTranscriptEntry` uses `Card` and `Card.Content`;
- committed empty state uses `Card` and `Card.Content`;
- global status uses `Alert` and `Alert.Content`;
- no test asserts these implementation details.

- [ ] **Step 2: Confirm forbidden APIs and files were not introduced**

运行:

```bash
rg -n "HeroUIProvider|framer-motion|CardBody" codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx codex-gui/src
```

Expected: no matches.

运行:

```bash
git status --short
```

Expected: only `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx` is modified.

If `codex-gui/package.json`, `codex-gui/pnpm-lock.yaml`, `codex-gui/src/index.css`, design docs, plan docs, or any
lockfile appears, stop and report before staging.

## Task 5: Commit

**Files:**

- Stage only: `codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx`

- [ ] **Step 1: Stage the intended source file**

运行:

```bash
git add codex-gui/src/features/committedTranscriptSurface/CommittedTranscriptSurface.tsx
```

- [ ] **Step 2: Commit the HeroUI surface correction**

运行:

```bash
git commit -m "style(gui): use HeroUI transcript surface components"
```

Do not stage or commit docs, package files, lockfiles, generated files, or unrelated changes in this task.
