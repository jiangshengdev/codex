# Codex GUI Streamdown Copy Control Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在当前页面不具备 secure context 或 Clipboard API 写入能力时，隐藏 Codex GUI 中 Streamdown 的代码块、表格和 Mermaid 复制控件，并在能力可用时保持现有行为。

**Architecture:** `markdownRendering.tsx` 在模块初始化时读取一次浏览器能力并生成共享的 `ControlsConfig` 常量，`MarkdownText` 与 `LiveMarkdownText` 只把该常量传给 Streamdown。Browser Mode 使用两个独立测试文件分别建立“能力可用”和“能力不可用”的模块初始化环境，避免在同一原生 ESM 模块实例中伪造重复初始化。

**Tech Stack:** React 19、TypeScript 6、Streamdown 2.5、Vitest 4 Browser Mode、Playwright Chromium/Firefox/WebKit、vitest-browser-react、fnm 管理的 Node/pnpm。

---

## 范围与文件结构

**新增测试文件：**

- `codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsAvailable.browser.test.tsx`
  - 在模块导入前建立 secure context 和可用的 `navigator.clipboard.writeText`。
  - 验证 committed/live 复制控件存在，并保留 live 动画期间的 disabled 语义。
- `codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsUnavailable.browser.test.tsx`
  - 在模块导入前建立非 secure context。
  - 验证代码块和表格复制控件不渲染、下载控件仍保留。
  - 初始化完成后把测试环境改为可用，再次渲染并确认共享配置不重新计算。
- `codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsMissingClipboardWrite.browser.test.tsx`
  - 在 secure context 中提供缺少 `writeText` 的 Clipboard API。
  - 验证方法缺失同样隐藏复制控件。

**修改源码文件：**

- `codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx`
  - 导出模块级 `streamdownControls` 常量。
  - 只在模块初始化时判断 secure context 和 Clipboard API。
- `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx`
  - 把共享 `streamdownControls` 传给静态 Streamdown。
- `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx`
  - 把同一共享配置传给流式 Streamdown，不改变 `isAnimating`。
- `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
  - 在现有 assistant Markdown 回归中断言复制按钮与当前浏览器初始化能力一致。

**不修改：**

- 不修改依赖、`package.json` 或锁文件。
- 不修改 Redux、projection、app-server、Rust 或 issue 状态。
- 不新增 HeroUI 组件、variant 或 semantic token。复制按钮由 Streamdown 内部生成，公开的
  `controls` API 是本需求最窄且稳定的控制边界；使用 HeroUI 无法控制这些协议驱动的 Markdown
  内部控件。
- 不增加 CSS 选择器、Permissions API、复制 fallback 或运行时权限监听。

## Task 1: 用 Browser Mode 锁定模块初始化行为

**Files:**

- Create: `codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsAvailable.browser.test.tsx`
- Create: `codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsUnavailable.browser.test.tsx`
- Create: `codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsMissingClipboardWrite.browser.test.tsx`
- Modify: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`

- [ ] **Step 1: 编写“能力可用”Browser Mode 测试**

创建 `MarkdownCopyControlsAvailable.browser.test.tsx`：

```tsx
import { render } from "vitest-browser-react";
import { expect, test, vi } from "vitest";

vi.hoisted(() => {
  vi.stubGlobal("isSecureContext", true);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

import { LiveMarkdownText } from "../LiveMarkdownText";
import { MarkdownText } from "../MarkdownText";

const markdown = [
  "```ts",
  "const clipboardAvailable = true;",
  "```",
  "",
  "| capability | available |",
  "| --- | --- |",
  "| clipboard | yes |",
].join("\n");

test("shows Streamdown copy controls when clipboard writing is available", async () => {
  const committed = await render(<MarkdownText source={markdown} />);
  const live = await render(<LiveMarkdownText source={markdown} />);

  await expect
    .poll(() =>
      committed.container.querySelector<HTMLButtonElement>(
        '[data-streamdown="code-block-copy-button"]',
      ),
    )
    .not.toBeNull();
  await expect
    .poll(() =>
      live.container.querySelector<HTMLButtonElement>(
        '[data-streamdown="code-block-copy-button"]',
      ),
    )
    .not.toBeNull();

  const committedCopy = committed.container.querySelector<HTMLButtonElement>(
    '[data-streamdown="code-block-copy-button"]',
  );
  const liveCopy = live.container.querySelector<HTMLButtonElement>(
    '[data-streamdown="code-block-copy-button"]',
  );

  expect(committedCopy?.disabled).toBe(false);
  expect(liveCopy?.disabled).toBe(true);
  expect(committed.container.querySelector('button[title="Copy table"]')).not.toBeNull();
});
```

这里使用 `vi.hoisted`，因为 Browser Mode 运行原生 ESM，能力环境必须在
`MarkdownText`/`LiveMarkdownText` 的静态导入执行前建立。

- [ ] **Step 2: 编写“能力不可用且初始化结果固定”Browser Mode 测试**

创建 `MarkdownCopyControlsUnavailable.browser.test.tsx`：

```tsx
import { render } from "vitest-browser-react";
import { expect, test, vi } from "vitest";

vi.hoisted(() => {
  vi.stubGlobal("isSecureContext", false);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

import { LiveMarkdownText } from "../LiveMarkdownText";
import { MarkdownText } from "../MarkdownText";

const markdown = [
  "```ts",
  "const clipboardAvailable = false;",
  "```",
  "",
  "| capability | available |",
  "| --- | --- |",
  "| clipboard | no |",
].join("\n");

test("hides Streamdown copy controls for the lifetime of an unavailable module instance", async () => {
  const committed = await render(<MarkdownText source={markdown} />);

  await expect
    .poll(() =>
      committed.container.querySelector<HTMLButtonElement>(
        '[data-streamdown="code-block-download-button"]',
      ),
    )
    .not.toBeNull();
  await expect
    .poll(() => committed.container.querySelector('button[title="Download table"]'))
    .not.toBeNull();

  expect(
    committed.container.querySelector('[data-streamdown="code-block-copy-button"]'),
  ).toBeNull();
  expect(committed.container.querySelector('button[title="Copy table"]')).toBeNull();

  vi.stubGlobal("isSecureContext", true);
  const live = await render(<LiveMarkdownText source={markdown} />);

  await expect
    .poll(() =>
      live.container.querySelector<HTMLButtonElement>(
        '[data-streamdown="code-block-download-button"]',
      ),
    )
    .not.toBeNull();
  expect(live.container.querySelector('[data-streamdown="code-block-copy-button"]')).toBeNull();
  expect(live.container.querySelector('button[title="Copy table"]')).toBeNull();
});
```

测试先在非 secure context 下初始化模块，然后把全局值改为 `true` 并渲染另一个入口。如果
实现错误地在每次渲染时检查，第二次渲染会出现复制按钮，测试将失败。

- [ ] **Step 3: 编写“缺少 Clipboard API 写入方法”Browser Mode 测试**

创建 `MarkdownCopyControlsMissingClipboardWrite.browser.test.tsx`：

```tsx
import { render } from "vitest-browser-react";
import { expect, test, vi } from "vitest";

vi.hoisted(() => {
  vi.stubGlobal("isSecureContext", true);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {},
  });
});

import { MarkdownText } from "../MarkdownText";

test("hides Streamdown copy controls when clipboard writeText is unavailable", async () => {
  const screen = await render(
    <MarkdownText
      source={["```ts", "const writeTextAvailable = false;", "```"].join("\n")}
    />,
  );

  await expect
    .poll(() =>
      screen.container.querySelector<HTMLButtonElement>(
        '[data-streamdown="code-block-download-button"]',
      ),
    )
    .not.toBeNull();
  expect(
    screen.container.querySelector('[data-streamdown="code-block-copy-button"]'),
  ).toBeNull();
});
```

`navigator.clipboard` 完全缺失时也会走同一 optional chaining 分支；本测试选择更严格的
“对象存在但 `writeText` 缺失”，防止实现只检查对象存在性。

- [ ] **Step 4: 在现有 transcript Browser Mode 测试中增加当前环境接线断言**

在 `CommittedTranscriptSurface.browser.test.tsx` 的
`renders assistant transcript markdown` 测试中，完成 fenced code 行断言后加入：

```tsx
const clipboardWriteAvailable =
  window.isSecureContext && typeof navigator.clipboard?.writeText === "function";
const codeCopyButton = markdown.querySelector(
  '[data-streamdown="code-block-copy-button"]',
);
expect(codeCopyButton !== null).toBe(clipboardWriteAvailable);
```

该断言使用测试浏览器的真实初始化能力，验证完整 `CommittedTranscriptSurface` 路径确实把
共享 `controls` 接到 Streamdown，而不是只测试孤立的 `MarkdownText`。

- [ ] **Step 5: 运行 Chromium 聚焦测试，确认当前实现失败**

Run from `codex-gui/`:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --browser=chromium --run src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsAvailable.browser.test.tsx src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsUnavailable.browser.test.tsx src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsMissingClipboardWrite.browser.test.tsx src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected:

- `MarkdownCopyControlsUnavailable.browser.test.tsx` FAIL。
- 失败证据是当前 Streamdown 仍渲染
  `[data-streamdown="code-block-copy-button"]` 或 `button[title="Copy table"]`。
- “能力可用”测试可以通过；本步只要求整个命令以不可用场景断言失败，证明回归测试有效。

## Task 2: 初始化一次共享 controls 并接入两个 Streamdown 入口

**Files:**

- Modify: `codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx`
- Modify: `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx`
- Modify: `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx`
- Test: `codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsAvailable.browser.test.tsx`
- Test: `codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsUnavailable.browser.test.tsx`
- Test: `codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsMissingClipboardWrite.browser.test.tsx`
- Test: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`

- [ ] **Step 1: 在 Markdown 公共配置模块中初始化一次复制能力**

把 `ControlsConfig` 类型加入 `markdownRendering.tsx` 的 Streamdown import，并在
`streamdownPlugins` 后定义共享常量：

```tsx
import {
  defaultRehypePlugins,
  type AllowElement,
  type Components,
  type ControlsConfig,
} from "streamdown";

export const streamdownPlugins = { code, cjk };

const clipboardWriteAvailable =
  typeof window !== "undefined" &&
  window.isSecureContext &&
  typeof navigator.clipboard?.writeText === "function";

export const streamdownControls: ControlsConfig = clipboardWriteAvailable
  ? true
  : {
      code: { copy: false },
      mermaid: { copy: false },
      table: { copy: false },
    };
```

保持现有插件、rehype、`allowMarkdownElement`、inline code 和 className 配置不变。不要增加
effect、hook、React state、Redux state、事件监听或 Permissions API。

- [ ] **Step 2: 把共享 controls 接入 committed Markdown**

在 `MarkdownText.tsx` 的本地 import 中加入 `streamdownControls`：

```tsx
import {
  allowMarkdownElement,
  markdownContainerClassName,
  markdownStreamdownClassName,
  streamdownComponents,
  streamdownControls,
  streamdownPlugins,
  streamdownRehypePlugins,
} from "./markdownRendering";
```

在 `<Streamdown>` 上加入：

```tsx
controls={streamdownControls}
```

放在 `components={streamdownComponents}` 后，其他 props 不变。

- [ ] **Step 3: 把同一 controls 接入 live Markdown**

在 `LiveMarkdownText.tsx` 的本地 import 中加入 `streamdownControls`，并在 `<Streamdown>`
上加入相同的：

```tsx
controls={streamdownControls}
```

保留 `caret="block"`、`isAnimating`、`mode="streaming"` 和其他现有 props，禁止为本需求改变
live Markdown 生命周期或动画行为。

- [ ] **Step 4: 使用项目格式化命令更新新增和修改文件**

Run from `codex-gui/`:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt:fix
```

Expected: 命令退出码为 0；只产生格式化相关变化，不修改依赖或生成文件。

- [ ] **Step 5: 重新运行 Chromium 聚焦测试，确认红灯转绿**

Run from `codex-gui/`:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --browser=chromium --run src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsAvailable.browser.test.tsx src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsUnavailable.browser.test.tsx src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsMissingClipboardWrite.browser.test.tsx
```

Expected: 两个测试文件全部 PASS；不可用环境无复制按钮，可用环境保留复制按钮，live 按钮仍
为 disabled。

- [ ] **Step 6: 在三种浏览器中运行 Markdown 聚焦回归**

Run from `codex-gui/`:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsAvailable.browser.test.tsx src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsUnavailable.browser.test.tsx src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsMissingClipboardWrite.browser.test.tsx src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: Chromium、Firefox、WebKit 的上述测试全部 PASS，现有 Markdown 渲染、安全过滤和
live transcript 行为没有回归。

- [ ] **Step 7: 运行静态验证**

Run from `codex-gui/`:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
```

Expected: 三条命令退出码均为 0；TypeScript 接受公开 `ControlsConfig` 字段，格式和 lint 无
错误。

- [ ] **Step 8: 检查范围并创建本地实现提交**

Run from repository root:

```bash
git status --short
git diff --check
git diff -- codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsAvailable.browser.test.tsx codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsUnavailable.browser.test.tsx codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsMissingClipboardWrite.browser.test.tsx codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
git add codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsAvailable.browser.test.tsx codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsUnavailable.browser.test.tsx codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownCopyControlsMissingClipboardWrite.browser.test.tsx codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
git diff --cached --check
git diff --cached --stat
git commit -m "fix(gui): hide unavailable markdown copy controls"
```

Expected:

- staged 内容只包含上述七个实现/测试文件；设计和计划文档不混入实现提交。
- 本地提交成功。
- 不执行 `git fetch`、`git pull`、`git push`、`git remote` 或其他远程操作。

## 完成条件

- 非 secure context、缺少 `navigator.clipboard` 或缺少 `writeText` 时，三个 Streamdown
  copy 类别都配置为隐藏。
- 能力判断只在 `markdownRendering.tsx` 模块初始化时执行一次。
- committed 和 live Markdown 共用同一个 `ControlsConfig` 常量。
- 下载、表格全屏等非复制控件保持默认行为。
- live Markdown 在能力可用时仍显示 disabled 的复制按钮。
- 新 Browser Mode 测试在 Chromium、Firefox、WebKit 通过。
- type-check、oxfmt 检查和 lint 通过。
- 不修改依赖、HeroUI、Redux、Rust、issue 状态或 Git 远程。

## 实施门禁

本计划只描述后续实现步骤。用户明确确认计划之前，不得修改 `codex-gui` 源码或测试、运行
格式化和验证命令、stage 或 commit。
