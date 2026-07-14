# Codex GUI 无协议 Markdown 文件链接 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Codex GUI 的 live 与 committed assistant Markdown 将无 URI scheme 的链接显示为不可点击的标准 Markdown 文本，同时保持协议链接和现有安全过滤行为。

**Architecture:** 在共享 Streamdown 配置中加入一个 remark 插件，先收集 reference definitions，再把无 scheme 的 direct link 和 link reference 替换为普通 Markdown AST 内容。两个 Markdown 入口显式复用 Streamdown 默认 remark 插件加自定义插件，协议链接继续走 Streamdown 原生 anchor、sanitize 和 harden。

**Tech Stack:** React 19、TypeScript 6、Streamdown 2.5、remark/mdast AST、Vitest Browser Mode、Playwright browser provider、oxfmt、oxlint、ESLint。

---

## 文件结构

- Modify: `codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx`
  - 定义 URI scheme 分类、reference definition 收集、无 scheme link AST 转换和共享 remark plugin 列表。
- Modify: `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx`
  - committed Streamdown 接入共享 remark plugin 列表。
- Modify: `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx`
  - live Streamdown 接入相同的共享 remark plugin 列表。
- Test: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
  - 覆盖 committed 分类矩阵以及 live 到 committed 的语义稳定性。

不创建新源码文件，不修改 `package.json` 或 `pnpm-lock.yaml`，不新增依赖。

### Task 1: 添加 committed 与 live 的失败行为测试

**Files:**
- Test: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx:157`
- Test: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx:308`

- [ ] **Step 1: 在 committed Markdown 测试之后添加链接分类测试**

在 `renders assistant transcript markdown` 之后加入：

```tsx
test("renders protocol-less assistant links as literal markdown while preserving scheme links", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
  const schemeLinks = [
    ["HTTP", "http://example.invalid/docs"],
    ["HTTPS", "https://example.invalid/docs"],
    ["Mail", "mailto:user@example.invalid"],
    ["VS Code", "vscode://file/work/file.rs"],
  ] as const;
  const protocolLessLinks = [
    ["POSIX", "/Users/example/work/file.rs:10"],
    ["Relative", "src/file.rs"],
    ["Current", "./file.rs"],
    ["Parent", "../src/file.rs"],
    ["Windows", "C:/work/file.rs:10"],
    ["Fragment", "#section"],
  ] as const;

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-link-classification", [
          agentMessage(
            "agent-link-classification",
            [
              ...schemeLinks.map(([label, target]) => `[${label}](${target})`),
              ...protocolLessLinks.map(([label, target]) => `[${label}](${target})`),
              '[Titled](src/titled.rs "ignored title")',
              "[Reference][source]",
              "",
              '[source]: src/reference.rs "ignored title"',
              "",
              "[Unsafe](<javascript:alert(1)>)",
            ].join("\n\n"),
          ),
        ]),
      ]),
    ),
  );

  await expect
    .element(screen.getByRole("article", { name: "Turn turn-link-classification" }))
    .toBeVisible();

  for (const [label, target] of schemeLinks) {
    await expect
      .element(screen.getByRole("link", { name: label, exact: true }))
      .toHaveAttribute("href", target);
  }

  for (const [label, target] of protocolLessLinks) {
    await expect.element(screen.getByText(`[${label}](${target})`)).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: label, exact: true }))
      .not.toBeInTheDocument();
  }

  await expect.element(screen.getByText("[Titled](src/titled.rs)")).toBeVisible();
  await expect.element(screen.getByText("[Reference](src/reference.rs)")).toBeVisible();
  await expect.element(screen.getByText("ignored title")).not.toBeInTheDocument();

  const markdown = document.querySelector<HTMLElement>(".committed-transcript-entry-markdown");
  expect(markdown).not.toBeNull();
  expect(markdown?.querySelector('a[href^="javascript:"]')).toBeNull();
});
```

该测试只锁用户可见语义：协议链接仍是 anchor，无 scheme 目标显示为 `[标签](目标)` 且没有 link role，危险协议没有可导航 anchor。不要断言 Streamdown 内部 class 或危险协议的具体降级文本。

- [ ] **Step 2: 在现有 live 测试之后添加 live 到 committed 一致性测试**

在 `renders live assistant text between intermediate updates and final answers` 之后加入：

```tsx
test("keeps protocol-less and scheme link semantics stable from live to committed", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
  const markdown = [
    "[Live file](src/live.rs)",
    "",
    "[Live web](https://example.invalid/live)",
  ].join("\n");

  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: turnStarted(
        eventTurnStarted,
        "commit-turn-live-links",
        inProgressTurn("turn-live-links"),
      ),
      replay: "live",
    }),
  );
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemStarted(
        eventItemStarted,
        "commit-started-live-links",
        "turn-live-links",
        agentMessage("agent-live-links", ""),
      ),
      replay: "live",
    }),
  );
  store.dispatch(
    threadRuntimeDeltaAccepted({
      notification: agentMessageDelta(
        eventAgentMessageDelta,
        "turn-live-links",
        "agent-live-links",
        markdown,
      ),
    }),
  );

  await expect.element(screen.getByText("[Live file](src/live.rs)")).toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: "Live file", exact: true }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("link", { name: "Live web", exact: true }))
    .toHaveAttribute("href", "https://example.invalid/live");
  expect(document.querySelector(".committed-transcript-live-assistant-message")).not.toBeNull();

  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemCompleted(
        eventItemCompleted,
        "commit-completed-live-links",
        "turn-live-links",
        agentMessage("agent-live-links", markdown),
      ),
      replay: "live",
    }),
  );

  await expect
    .element(screen.getByRole("article", { name: "Turn turn-live-links" }))
    .toBeVisible();
  expect(document.querySelector(".committed-transcript-live-assistant-message")).toBeNull();
  await expect.element(screen.getByText("[Live file](src/live.rs)")).toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: "Live file", exact: true }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("link", { name: "Live web", exact: true }))
    .toHaveAttribute("href", "https://example.invalid/live");
});
```

- [ ] **Step 3: 运行两个新增测试并确认它们因现有链接行为失败**

在 `codex-gui` 目录运行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx -t 'renders protocol-less assistant links as literal markdown while preserving scheme links|keeps protocol-less and scheme link semantics stable from live to committed'
```

Expected: FAIL。现有 Streamdown 会为无 scheme 目标生成 anchor，因此找不到 `[POSIX](/Users/example/work/file.rs:10)` 或 `[Live file](src/live.rs)` 普通文本，并且对应 link role 仍然存在。

不要提交此失败状态；继续完成 Task 2。

### Task 2: 实现共享 remark 转换并接入两个 Streamdown 入口

**Files:**
- Modify: `codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx:1-33`
- Modify: `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx:1-25`
- Modify: `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx:1-28`

- [ ] **Step 1: 在共享 Markdown 配置中实现两遍 AST 转换**

将 `markdownRendering.tsx` 更新为：

```tsx
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import {
  defaultRehypePlugins,
  defaultRemarkPlugins,
  type AllowElement,
  type Components,
  type StreamdownProps,
} from "streamdown";

type MarkdownNode = {
  children?: MarkdownNode[];
  identifier?: string;
  type: string;
  url?: string;
  value?: string;
};

const isMarkdownNode = (value: unknown): value is MarkdownNode =>
  typeof value === "object" &&
  value !== null &&
  typeof Reflect.get(value, "type") === "string";

const hasUriScheme = (target: string) =>
  !/^[A-Za-z]:/.test(target) && /^[A-Za-z][A-Za-z0-9+.-]*:/.test(target);

const collectLinkDefinitions = (node: MarkdownNode, definitions: Map<string, string>) => {
  if (
    node.type === "definition" &&
    typeof node.identifier === "string" &&
    typeof node.url === "string"
  ) {
    const identifier = node.identifier.toUpperCase();
    if (!definitions.has(identifier)) {
      definitions.set(identifier, node.url);
    }
  }

  for (const child of node.children ?? []) {
    collectLinkDefinitions(child, definitions);
  }
};

const protocolLessLinkTarget = (
  node: MarkdownNode,
  definitions: ReadonlyMap<string, string>,
) => {
  const target =
    node.type === "link" && typeof node.url === "string"
      ? node.url
      : node.type === "linkReference" && typeof node.identifier === "string"
        ? (definitions.get(node.identifier.toUpperCase()) ?? null)
        : null;

  return target !== null && !hasUriScheme(target) ? target : null;
};

const rewriteProtocolLessLinks = (
  node: MarkdownNode,
  definitions: ReadonlyMap<string, string>,
) => {
  if (!node.children) {
    return;
  }

  const children: MarkdownNode[] = [];
  for (const child of node.children) {
    const target = protocolLessLinkTarget(child, definitions);
    if (target !== null) {
      children.push(
        { type: "text", value: "[" },
        ...(child.children ?? []),
        { type: "text", value: "](" },
        { type: "text", value: target },
        { type: "text", value: ")" },
      );
      continue;
    }

    rewriteProtocolLessLinks(child, definitions);
    children.push(child);
  }

  node.children = children;
};

const renderProtocolLessLinksAsMarkdown = () => (tree: unknown) => {
  if (!isMarkdownNode(tree)) {
    return;
  }

  const definitions = new Map<string, string>();
  collectLinkDefinitions(tree, definitions);
  rewriteProtocolLessLinks(tree, definitions);
};

export const streamdownPlugins = { code, cjk };

export const streamdownRemarkPlugins: NonNullable<StreamdownProps["remarkPlugins"]> = [
  ...Object.values(defaultRemarkPlugins),
  renderProtocolLessLinksAsMarkdown,
];

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

- 先收集 definitions，再改写 link/linkReference；reference link 的定义可以位于引用之后。
- definition key 使用 uppercase，且只保留第一个定义，与当前 `mdast-util-to-hast` 解析规则一致。
- `^[A-Za-z]:` 优先按 Windows drive 路径处理；其他符合 URI scheme 语法的目标保持 link。
- 自定义 remark 列表必须包含 `defaultRemarkPlugins`。Streamdown 收到 `remarkPlugins` prop 后会替换默认列表；遗漏默认项会破坏 GFM 和 code metadata 行为。
- 不导入 `unified`、`unist-util-visit` 或 `@types/mdast`，不依赖未声明的传递依赖。

- [ ] **Step 2: committed Streamdown 接入共享 remark plugin 列表**

将 `MarkdownText.tsx` 更新为：

```tsx
import { Streamdown } from "streamdown";
import {
  allowMarkdownElement,
  markdownContainerClassName,
  markdownStreamdownClassName,
  streamdownComponents,
  streamdownPlugins,
  streamdownRehypePlugins,
  streamdownRemarkPlugins,
} from "./markdownRendering";

export const MarkdownText = ({ source }: { source: string }) => (
  <div className={markdownContainerClassName}>
    <Streamdown
      allowElement={allowMarkdownElement}
      className={markdownStreamdownClassName}
      components={streamdownComponents}
      linkSafety={{ enabled: false }}
      lineNumbers={false}
      mode="static"
      plugins={streamdownPlugins}
      rehypePlugins={streamdownRehypePlugins}
      remarkPlugins={streamdownRemarkPlugins}
      skipHtml
    >
      {source}
    </Streamdown>
  </div>
);
```

- [ ] **Step 3: live Streamdown 接入相同的共享 remark plugin 列表**

将 `LiveMarkdownText.tsx` 更新为：

```tsx
import { Streamdown } from "streamdown";
import {
  allowMarkdownElement,
  markdownContainerClassName,
  markdownStreamdownClassName,
  streamdownComponents,
  streamdownPlugins,
  streamdownRehypePlugins,
  streamdownRemarkPlugins,
} from "./markdownRendering";

export const LiveMarkdownText = ({ source }: { source: string }) => (
  <div className={`${markdownContainerClassName} committed-transcript-live-markdown`}>
    <Streamdown
      allowElement={allowMarkdownElement}
      caret="block"
      className={markdownStreamdownClassName}
      components={streamdownComponents}
      isAnimating
      linkSafety={{ enabled: false }}
      lineNumbers={false}
      mode="streaming"
      plugins={streamdownPlugins}
      rehypePlugins={streamdownRehypePlugins}
      remarkPlugins={streamdownRemarkPlugins}
      skipHtml
    >
      {source}
    </Streamdown>
  </div>
);
```

- [ ] **Step 4: 格式化本次触及的四个 GUI 文件**

在 `codex-gui` 目录运行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm exec oxfmt src/features/committedTranscriptSurface/markdownRendering.tsx src/features/committedTranscriptSurface/MarkdownText.tsx src/features/committedTranscriptSurface/LiveMarkdownText.tsx src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx --write
```

Expected: exit 0，只格式化列出的四个文件。

- [ ] **Step 5: 运行两个聚焦测试并确认通过**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx -t 'renders protocol-less assistant links as literal markdown while preserving scheme links|keeps protocol-less and scheme link semantics stable from live to committed'
```

Expected: PASS，Chromium、Firefox、WebKit 中两个测试均通过。

### Task 3: 完成聚焦回归、静态检查和本地提交

**Files:**
- Verify: `codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx`
- Verify: `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx`
- Verify: `codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx`
- Verify: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`

- [ ] **Step 1: 运行完整的 committed transcript Browser Mode 测试文件**

在 `codex-gui` 目录运行：

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: PASS，整个文件在 Chromium、Firefox、WebKit 中通过；现有 Markdown、安全、live、折叠和 sticky-bottom 行为无回归。

- [ ] **Step 2: 运行 GUI 格式检查**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
```

Expected: PASS，无格式差异。

- [ ] **Step 3: 运行 GUI lint**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
```

Expected: PASS，oxlint 与 ESLint 均无错误。

- [ ] **Step 4: 运行 TypeScript 类型检查**

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected: PASS，Streamdown `remarkPlugins` 类型和本地 AST 结构通过检查。

- [ ] **Step 5: 检查最终 diff 只包含确认范围**

在仓库根目录运行：

```bash
git status --short
git diff --check -- codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
git diff -- codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: 本功能只修改上述四个 GUI 文件。保留并忽略工作区中不属于本计划的用户变更，尤其不要 stage 其他 `docs/superpowers/**` 文件。

- [ ] **Step 6: 创建一个本地实现提交**

```bash
git add codex-gui/src/features/committedTranscriptSurface/markdownRendering.tsx codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx codex-gui/src/features/committedTranscriptSurface/LiveMarkdownText.tsx codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
git diff --cached --check
git diff --cached --stat
git commit -m "fix(gui): render protocol-less markdown links as text"
```

Expected: 创建一个仅包含四个 GUI 文件的本地提交。不得执行 `git fetch`、`git pull`、`git push` 或其他远程命令。

## 完成条件

- 无 scheme 的 direct link 和 reference link 在 live、committed 中都显示为 `[标签](目标)`。
- 无 scheme 目标不生成 anchor，也不会被浏览器解析到 GUI HTTP origin。
- `http:`、`https:`、`mailto:`、允许的自定义 scheme 继续使用 Streamdown 原生 anchor。
- `javascript:`、`data:`、`file:`、`vbscript:` 等危险 scheme 继续由现有 harden 阻止。
- raw HTML、图片、GFM、code metadata 和现有 live/committed 行为无回归。
- 不新增依赖，不修改 package/lockfile，不修改 Rust、projection、transcript state 或 issue 文档。
- 聚焦 Browser Mode 测试、完整相关测试文件、格式、lint、类型检查全部通过。
- 最终本地提交只包含已确认的四个 GUI 文件。
