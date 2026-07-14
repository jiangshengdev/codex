# Codex GUI 无协议 Markdown 文件链接 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Codex GUI 的 live 与 committed assistant Markdown 将无 URI scheme 的链接显示为不可点击的 `[链接文字](目标)`，同时保持带 scheme 链接和 Streamdown 现有安全行为。

**Architecture:** 通过共享 `remarkRehypeOptions.handlers` 包装 `mdast-util-to-hast` 的默认 `link` 与 `linkReference` handler。默认 handler 继续负责 label children、reference resolution 和 anchor 构造；包装层使用 `pathe` 与 `uri-js` 分类目标，只把无 scheme 的默认 anchor 改成普通 HAST 内容，不遍历整棵 AST，也不反向解码 HAST `href`。

**Tech Stack:** React 19、TypeScript 6、Streamdown 2.5、`mdast-util-to-hast` 13.2.1、`pathe` 2.0.3、`uri-js` 4.4.1、Vitest Browser Mode、Playwright browser provider、oxfmt、oxlint、ESLint。

---

## 执行前提

- 从 `dev` 创建新的隔离工作树和 `codex/` 前缀功能分支；不得复用已废弃的旧工作树或旧分支。
- 实施阶段必须使用 `$codex-gui-worktree` / `$using-git-worktrees` 准备工作树，并在运行 pnpm 前使用 `$codex-gui-toolchain`。
- 本计划包含将锁文件中已经存在的三个版本声明为 production direct dependencies。用户明确确认本计划后，才允许执行计划中的离线 pnpm 依赖命令；确认前不得修改依赖。
- 不执行 `git fetch`、`git pull`、`git push`、`git remote` 或任何其他远程命令。

## 文件结构

- Modify: `codex-gui/package.json`
  - 声明 `mdast-util-to-hast@13.2.1`、`pathe@2.0.3`、`uri-js@4.4.1` 为 production direct dependencies。
- Modify: `codex-gui/pnpm-lock.yaml`
  - 只更新 `codex-gui` importer 的直接依赖关系，复用锁中已有版本。
- Modify: `codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx`
  - 定义目标分类、默认 handler 包装和共享 `remarkRehypeOptions`。
- Modify: `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx`
  - committed Streamdown 接入共享 `remarkRehypeOptions`。
- Modify: `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx`
  - live Streamdown 接入相同配置。
- Create: `codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownFileLinks.browser.test.tsx`
  - 直接渲染 committed/live Markdown 组件，覆盖分类、Windows、reference 和安全边界。

不修改现有 issue 状态、`CommittedTranscriptSurface.tsx`、projection fixtures、Redux、app-server、Rust 或设计文档。

### Task 1: 声明默认 handler、URI 与路径解析依赖

**Files:**
- Modify: `codex-gui/package.json`
- Modify: `codex-gui/pnpm-lock.yaml`

- [ ] **Step 1: 确认 fnm 管理的 pnpm 和锁中版本**

在 `codex-gui` 目录运行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm --version
rg -n -e '^  mdast-util-to-hast@13\.2\.1:' -e '^  pathe@2\.0\.3:' -e '^  uri-js@4\.4\.1:' pnpm-lock.yaml
```

Expected: `pnpm` 不从 `/Users/<user>/.cache/codex-runtimes/` 解析；锁文件分别存在 `13.2.1`、`2.0.3`、`4.4.1`。

- [ ] **Step 2: 使用已有锁定版本声明 direct dependencies**

只有用户已经确认本计划时才运行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm add --offline --save-exact mdast-util-to-hast@13.2.1 pathe@2.0.3 uri-js@4.4.1
```

Expected: exit 0，不访问网络；`package.json` 的 `dependencies` 新增三个精确版本，lockfile importer 新增对应 direct dependency，已有 package snapshot 版本不变。

- [ ] **Step 3: 检查依赖 diff 没有扩大范围**

在仓库根目录运行：

```bash
git diff --check -- codex-gui/package.json codex-gui/pnpm-lock.yaml
git diff -- codex-gui/package.json codex-gui/pnpm-lock.yaml
```

Expected: 只出现三个 direct dependency 及 importer 变化；不得出现无关升级、删除、peer 变化或新版本 snapshot。

- [ ] **Step 4: 创建依赖声明提交**

```bash
git add codex-gui/package.json codex-gui/pnpm-lock.yaml
git diff --cached --check
git diff --cached --stat
git commit -m "build(gui): declare markdown link handler dependencies"
```

Expected: 创建一个只包含 `package.json` 和 `pnpm-lock.yaml` 的本地提交。

### Task 2: 先添加 Browser Mode 失败测试

**Files:**
- Create: `codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownFileLinks.browser.test.tsx`

- [ ] **Step 1: 创建专用 Markdown 链接测试文件**

创建 `MarkdownFileLinks.browser.test.tsx`：

```tsx
import { render } from "vitest-browser-react";
import { expect, test } from "vitest";
import { LiveMarkdownText } from "../LiveMarkdownText";
import { MarkdownText } from "../MarkdownText";

test("renders protocol-less links as markdown text while preserving scheme behavior", async () => {
  const schemeLinks = [
    ["HTTP", "http://example.invalid/docs"],
    ["HTTPS", "https://example.invalid/docs"],
    ["Mail", "mailto:user@example.invalid"],
  ] as const;
  const protocolLessLinks = [
    ["POSIX", "/Users/example/work/file.rs:10"],
    ["Relative", "src/file.rs"],
    ["Current", "./file.rs"],
    ["Parent", "../src/file.rs"],
    ["Fragment", "#section"],
    ["Query", "?view=source"],
    ["Protocol relative", "//example.invalid/path"],
    ["Empty", ""],
  ] as const;
  const markdown = [
    ...schemeLinks.map(([label, target]) => `[${label}](${target})`),
    ...protocolLessLinks.map(([label, target]) => `[${label}](${target})`),
    "[Custom](x:resource)",
    "[Drive relative](C:file.rs)",
    '[Titled](src/titled.rs "ignored title")',
    "[Reference][source]",
    "",
    '[source]: src/reference.rs "ignored title"',
    "",
    "[Unsafe](<javascript:alert(1)>)",
  ].join("\n\n");

  const screen = await render(<MarkdownText source={markdown} />);

  for (const [label, target] of schemeLinks) {
    await expect
      .element(screen.getByRole("link", { name: label, exact: true }))
      .toHaveAttribute("href", target);
  }

  for (const [label, target] of protocolLessLinks) {
    await expect.element(screen.getByText(`[${label}](${target})`, { exact: true })).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: label, exact: true }))
      .not.toBeInTheDocument();
  }

  await expect.element(screen.getByText("[Titled](src/titled.rs)")).toBeVisible();
  await expect.element(screen.getByText("[Reference](src/reference.rs)")).toBeVisible();
  await expect.element(screen.getByText("ignored title")).not.toBeInTheDocument();
  await expect.element(screen.getByText("[Custom](x:resource)")).not.toBeInTheDocument();
  await expect.element(screen.getByText("[Drive relative](C:file.rs)")).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("link", { name: "Unsafe", exact: true }))
    .not.toBeInTheDocument();
});

test("shows parsed Windows targets without URI percent encoding", async () => {
  const backslashTarget = String.raw`C:\work\file.rs:10`;
  const spacedTarget = String.raw`C:\work folder\file.rs:10`;
  const uncSourceTarget = String.raw`\\\\server\share\file.rs:10`;
  const uncParsedTarget = String.raw`\\server\share\file.rs:10`;
  const markdown = [
    "[Forward](C:/work/file.rs:10)",
    `[Backslash](${backslashTarget})`,
    `[Spaced](<${spacedTarget}>)`,
    `[UNC](${uncSourceTarget})`,
    "[View **file.rs** and `line 10`](" + backslashTarget + ")",
  ].join("\n\n");

  const screen = await render(<MarkdownText source={markdown} />);
  const paragraphTexts = Array.from(screen.container.querySelectorAll("p")).map(
    (paragraph) => paragraph.textContent,
  );

  expect(paragraphTexts).toEqual(
    expect.arrayContaining([
      "[Forward](C:/work/file.rs:10)",
      `[Backslash](${backslashTarget})`,
      `[Spaced](${spacedTarget})`,
      `[UNC](${uncParsedTarget})`,
      `[View file.rs and line 10](${backslashTarget})`,
    ]),
  );
  expect(screen.container.textContent).not.toContain("%5C");
  expect(screen.container.textContent).not.toContain("%20");

  const strong = screen.container.querySelector('[data-streamdown="strong"]');
  const inlineCode = screen.container.querySelector("p code");
  expect(strong?.textContent).toBe("file.rs");
  expect(strong?.closest("a")).toBeNull();
  expect(inlineCode?.textContent).toBe("line 10");
  expect(inlineCode?.closest("a")).toBeNull();
});

test("uses the same direct-link behavior in live and committed markdown", async () => {
  const markdown = [
    "[Live file](src/live.rs)",
    "",
    "[Live web](https://example.invalid/live)",
  ].join("\n");

  const live = await render(<LiveMarkdownText source={markdown} />, {
    container: document.body.appendChild(document.createElement("div")),
  });
  const committed = await render(<MarkdownText source={markdown} />, {
    container: document.body.appendChild(document.createElement("div")),
  });

  for (const screen of [live, committed]) {
    await expect.element(screen.getByText("[Live file](src/live.rs)")).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Live file", exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("link", { name: "Live web", exact: true }))
      .toHaveAttribute("href", "https://example.invalid/live");
  }
});

test("keeps unresolved live references and resolves committed references", async () => {
  const markdown = [
    "[Reference][source]",
    "",
    '[source]: src/reference.rs "ignored title"',
  ].join("\n");

  const live = await render(<LiveMarkdownText source={markdown} />, {
    container: document.body.appendChild(document.createElement("div")),
  });
  const committed = await render(<MarkdownText source={markdown} />, {
    container: document.body.appendChild(document.createElement("div")),
  });

  await expect.element(live.getByText("[Reference][source]")).toBeVisible();
  await expect.element(live.getByText("[Reference](src/reference.rs)")).not.toBeInTheDocument();
  await expect.element(committed.getByText("[Reference](src/reference.rs)")).toBeVisible();
  await expect
    .element(committed.getByRole("link", { name: "Reference", exact: true }))
    .not.toBeInTheDocument();
});
```

该文件使用 `vitest-browser-react` 的异步 `render` 和 locator + `expect.element`；只在需要检查跨子节点 textContent、格式节点父级或百分号编码时使用 `container.querySelector`。

- [ ] **Step 2: 格式化新增测试文件**

在 `codex-gui` 目录运行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/committedTranscriptSurface/__tests__/MarkdownFileLinks.browser.test.tsx --write
```

Expected: exit 0，只格式化新增测试文件。

- [ ] **Step 3: 在 Chromium 验证测试按预期失败**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --browser=chromium --run src/features/committedTranscriptSurface/__tests__/MarkdownFileLinks.browser.test.tsx
```

Expected: FAIL。现有 Streamdown 为无 scheme direct/committed reference 生成 anchor，只显示 label；Windows backslash `href` 还会 URI-normalize。失败应集中在新断言，不应出现 fixture、import 或 Browser Mode 配置错误。

不要提交失败状态；继续 Task 3。

### Task 3: 包装默认 link handlers 并接入 live/committed

**Files:**
- Modify: `codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx`
- Modify: `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx`
- Modify: `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx`
- Test: `codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownFileLinks.browser.test.tsx`

- [ ] **Step 1: 用默认 handler 实现共享分类与输出**

将 `markdownRendering.tsx` 更新为：

```tsx
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { defaultHandlers, type Handler } from "mdast-util-to-hast";
import { isAbsolute } from "pathe";
import {
  defaultRehypePlugins,
  type AllowElement,
  type Components,
  type ControlsConfig,
  type StreamdownProps,
} from "streamdown";
import { parse as parseUri } from "uri-js";

const isProtocolLessFileTarget = (target: string) =>
  isAbsolute(target) || parseUri(target).scheme === undefined;

const renderProtocolLessLinkAsText = (
  anchor: ReturnType<typeof defaultHandlers.link>,
  target: string,
): ReturnType<Handler> => [
  { type: "text", value: "[" },
  ...anchor.children,
  { type: "text", value: "](" },
  { type: "text", value: target },
  { type: "text", value: ")" },
];

const renderLink: Handler = (state, node) => {
  const linkNode = node as Parameters<typeof defaultHandlers.link>[1];
  const anchor = defaultHandlers.link(state, linkNode);
  return isProtocolLessFileTarget(linkNode.url)
    ? renderProtocolLessLinkAsText(anchor, linkNode.url)
    : anchor;
};

const renderLinkReference: Handler = (state, node) => {
  const referenceNode = node as Parameters<typeof defaultHandlers.linkReference>[1];
  const result = defaultHandlers.linkReference(state, referenceNode);
  const definition = state.definitionById.get(String(referenceNode.identifier).toUpperCase());
  const target = definition?.url ?? "";

  if (
    definition === undefined ||
    !isProtocolLessFileTarget(target) ||
    Array.isArray(result) ||
    result.type !== "element" ||
    result.tagName !== "a"
  ) {
    return result;
  }

  return renderProtocolLessLinkAsText(result, target);
};

export const streamdownPlugins = { code, cjk };

const clipboardWriteAvailable =
  typeof window !== "undefined" &&
  window.isSecureContext &&
  typeof (navigator as Partial<Pick<Navigator, "clipboard">>).clipboard?.writeText === "function";

export const streamdownControls: ControlsConfig = clipboardWriteAvailable
  ? true
  : {
      code: { copy: false },
      mermaid: { copy: false },
      table: { copy: false },
    };

export const streamdownRemarkRehypeOptions: NonNullable<
  StreamdownProps["remarkRehypeOptions"]
> = {
  handlers: {
    link: renderLink,
    linkReference: renderLinkReference,
  },
};

export const streamdownRehypePlugins = [
  defaultRehypePlugins.sanitize,
  defaultRehypePlugins.harden,
].filter((plugin): plugin is NonNullable<typeof plugin> => plugin != null);

export const allowMarkdownElement: AllowElement = ({ tagName }) => tagName !== "img";

export const streamdownComponents: Components = {
  inlineCode: ({ children, className, node: _node, ...props }) => (
    <code
      className={[
        "rounded border border-border bg-default px-1 py-0.5 font-mono text-sm text-default-700 wrap-break-word",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </code>
  ),
};

export const markdownContainerClassName =
  "committed-transcript-entry-markdown committed-transcript-entry-source grid min-w-0 gap-2 wrap-break-word leading-6";

export const markdownStreamdownClassName = "min-w-0 wrap-break-word";
```

关键约束：

- 必须先调用 `defaultHandlers`；不得自行实现 label children、reference lookup 或 position 复制。
- `pathe.isAbsolute` 必须先于 `uri-js.parse(...).scheme`，以正确处理 `C:/...`、`C:\...` 和 UNC。
- `C:file.rs` 与 `x:resource` 均不是绝对路径，继续按 scheme 处理。
- direct 无 scheme link 显示 `linkNode.url`；resolved reference 显示 `definition.url`，不使用默认 anchor 的百分号编码 `href`。
- unresolved reference 或默认结果不是 `<a>` 时，必须原样返回默认结果。
- 不添加 remark/rehype 全树遍历，不引入正则、源码切片、自定义 AST 类型或 URI 反向解码。

- [ ] **Step 2: committed Streamdown 接入共享 options**

在 `MarkdownText.tsx` 的共享 import 中加入 `streamdownRemarkRehypeOptions`，并向 `<Streamdown>` 增加：

```tsx
remarkRehypeOptions={streamdownRemarkRehypeOptions}
```

完整相关部分应为：

```tsx
import { Streamdown } from "streamdown";
import {
  allowMarkdownElement,
  markdownContainerClassName,
  markdownStreamdownClassName,
  streamdownComponents,
  streamdownControls,
  streamdownPlugins,
  streamdownRehypePlugins,
  streamdownRemarkRehypeOptions,
} from "./markdownRendering";

export const MarkdownText = ({ source }: { source: string }) => (
  <div className={markdownContainerClassName}>
    <Streamdown
      allowElement={allowMarkdownElement}
      className={markdownStreamdownClassName}
      components={streamdownComponents}
      controls={streamdownControls}
      linkSafety={{ enabled: false }}
      lineNumbers={false}
      mode="static"
      plugins={streamdownPlugins}
      rehypePlugins={streamdownRehypePlugins}
      remarkRehypeOptions={streamdownRemarkRehypeOptions}
      skipHtml
    >
      {source}
    </Streamdown>
  </div>
);
```

- [ ] **Step 3: live Streamdown 接入同一 options**

在 `LiveMarkdownText.tsx` 使用同一个 `streamdownRemarkRehypeOptions`：

```tsx
import { Streamdown } from "streamdown";
import {
  allowMarkdownElement,
  markdownContainerClassName,
  markdownStreamdownClassName,
  streamdownComponents,
  streamdownControls,
  streamdownPlugins,
  streamdownRehypePlugins,
  streamdownRemarkRehypeOptions,
} from "./markdownRendering";

export const LiveMarkdownText = ({ source }: { source: string }) => (
  <div className={`${markdownContainerClassName} committed-transcript-live-markdown`}>
    <Streamdown
      allowElement={allowMarkdownElement}
      caret="block"
      className={markdownStreamdownClassName}
      components={streamdownComponents}
      controls={streamdownControls}
      isAnimating
      linkSafety={{ enabled: false }}
      lineNumbers={false}
      mode="streaming"
      plugins={streamdownPlugins}
      rehypePlugins={streamdownRehypePlugins}
      remarkRehypeOptions={streamdownRemarkRehypeOptions}
      skipHtml
    >
      {source}
    </Streamdown>
  </div>
);
```

- [ ] **Step 4: 格式化四个源码与测试文件**

在 `codex-gui` 目录运行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/committedTranscriptSurface/markdownRendering.tsx src/features/committedTranscriptSurface/MarkdownText.tsx src/features/committedTranscriptSurface/LiveMarkdownText.tsx src/features/committedTranscriptSurface/__tests__/MarkdownFileLinks.browser.test.tsx --write
```

Expected: exit 0，只格式化列出的四个文件。

- [ ] **Step 5: 运行 Chromium RED/GREEN 测试并确认通过**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --browser=chromium --run src/features/committedTranscriptSurface/__tests__/MarkdownFileLinks.browser.test.tsx
```

Expected: PASS，四个测试在 Chromium 中通过。

- [ ] **Step 6: 运行三浏览器聚焦测试**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec vitest --config=vitest.browser.config.ts --run src/features/committedTranscriptSurface/__tests__/MarkdownFileLinks.browser.test.tsx
```

Expected: PASS，Chromium、Firefox、WebKit 均通过。

- [ ] **Step 7: 检查实现 diff 并创建本地提交**

在仓库根目录运行：

```bash
git diff --check -- codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownFileLinks.browser.test.tsx
git diff -- codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownFileLinks.browser.test.tsx
git add codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownFileLinks.browser.test.tsx
git diff --cached --check
git diff --cached --stat
git commit -m "fix(gui): render protocol-less markdown links as text"
```

Expected: 创建一个只包含 handler、两个 Streamdown 入口和专用测试文件的本地提交。

### Task 4: 完成相关回归与静态验证

**Files:**
- Verify: `codex-gui/package.json`
- Verify: `codex-gui/pnpm-lock.yaml`
- Verify: `codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx`
- Verify: `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx`
- Verify: `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx`
- Verify: `codex-gui/src/features/committedTranscriptSurface/__tests__/MarkdownFileLinks.browser.test.tsx`
- Verify: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`

- [ ] **Step 1: 运行专用链接测试和现有 committed transcript 测试**

在 `codex-gui` 目录运行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser -- src/features/committedTranscriptSurface/__tests__/MarkdownFileLinks.browser.test.tsx src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: PASS，两个文件在 Chromium、Firefox、WebKit 中通过；现有 Markdown、安全、live、折叠和 transcript 行为无回归。

- [ ] **Step 2: 运行 TypeScript 类型检查**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected: PASS，`Handler`、`defaultHandlers` 和 `remarkRehypeOptions` 类型通过。

- [ ] **Step 3: 运行 GUI 格式检查**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
```

Expected: PASS，无格式差异。

- [ ] **Step 4: 运行 GUI lint**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
```

Expected: PASS，oxlint 与 ESLint 无错误。

- [ ] **Step 5: 验证最终提交和工作区状态**

在仓库根目录运行：

```bash
git status --short --branch
git log -3 --oneline --decorate
git show --stat --oneline HEAD
git show --stat --oneline HEAD^
```

Expected: 实现工作树干净；最近两个功能提交分别只包含依赖声明，以及 handler/入口/测试实现。不得出现 issue、设计、计划、projection、Rust 或其他无关文件。

## 完成条件

- 所有无 URI scheme 的 Markdown link 显示 `[默认链接文字](Markdown parser 目标值)`，且不生成 anchor。
- label 中的 emphasis 和 inline code 保持默认样式。
- POSIX、相对路径、fragment、query、protocol-relative、空目标、Windows 绝对路径和 UNC 均有 Browser Mode 覆盖。
- Windows 反斜杠与空格不显示为 `%5C` 或 `%20`。
- `http:`、`https:`、`mailto:` 保持默认 anchor 行为。
- `x:resource`、`C:file.rs` 继续按 scheme 进入 Streamdown 默认安全链路，不被本功能改写。
- 危险 scheme 不获得放行。
- unresolved live reference 保持默认原文；committed reference 使用完整 definition 显示 `[标签](目标)`。
- 不引入 AST 全树遍历、正则、手写 reference lookup、URI 反向解码或跨 block cache。
- 三个生产 import 均为 direct dependency，并复用锁中已有版本。
- 聚焦三浏览器测试、现有 committed transcript Browser Mode、type-check、format 和 lint 全部通过。
- 最终只有两个本地功能提交；不修改 issue 状态，不操作 Git 远程。
