# Codex GUI Streamdown Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the completed assistant Markdown renderer in `codex-gui` with Streamdown while keeping the committed transcript data flow unchanged.

**Architecture:** Keep `MarkdownText` as the only Streamdown integration boundary for committed assistant Markdown. `CommittedTranscriptSurface` continues to choose between plain text and Markdown by entry type, role, and `sourceKind`; no projection delta or streaming transcript state is added in this plan.

**Tech Stack:** React 19, TypeScript, Streamdown, `@streamdown/code`, `@streamdown/cjk`, Tailwind CSS 4, Vitest Browser Mode, pnpm via the user's fnm environment.

---

## File Structure

- Modify: `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx`
  - Replace `react-markdown` with `Streamdown`.
  - Keep the wrapper class names used by the committed transcript surface.
  - Configure `mode="static"`, `plugins={{ code, cjk }}`, `skipHtml`, `linkSafety={{ enabled: false }}`, and image filtering.
- Modify: `codex-gui/src/index.css`
  - Add Tailwind 4 `@source` entries for `streamdown`, `@streamdown/code`, and `@streamdown/cjk`.
  - Do not add `@streamdown/math`.
- Modify: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
  - Keep behavior coverage for Markdown rendering, user plain text, raw HTML rejection, image rejection, clickable links, and collapsed temporary Markdown.
  - Remove assertions tied to old HeroUI/Tailwind classes or `react-markdown` DOM details.
- Modify: `codex-gui/package.json`
  - Remove `react-markdown` after the renderer no longer imports it.
- Modify: `codex-gui/pnpm-lock.yaml`
  - Update through `pnpm remove react-markdown`.

## Shared Command Setup

Before any task runs a `pnpm` command from `codex-gui`, initialize and verify the user's fnm environment:

```bash
/opt/homebrew/bin/fnm env --shell zsh
/opt/homebrew/bin/fnm exec --using-file pnpm --version
```

Expected: `pnpm --version` prints `10.33.0` or the current user-managed project version, and the path must not come from `/Users/jiangsheng/.cache/codex-runtimes/`.

Use the script-specific wrapper forms in the tasks below:

```bash
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
```

The `--using-file` warning is acceptable on this machine; it still selects the user fnm environment.

### Task 1: Record Existing Streamdown Dependency Commit Boundary

**Files:**
- Inspect: `codex-gui/package.json`
- Inspect: `codex-gui/pnpm-lock.yaml`

- [ ] **Step 1: Verify the dependency files contain only dependency preparation for this task**

Run:

```bash
git status --short
git log --oneline -- codex-gui/package.json codex-gui/pnpm-lock.yaml | head -n 5
rg -n -e 'streamdown|@streamdown/(code|math|cjk)|react-markdown' codex-gui/package.json codex-gui/pnpm-lock.yaml
```

Expected:
- `git status --short` is clean before implementation starts.
- The Streamdown dependencies are present in `codex-gui/package.json`.
- `react-markdown` is still present before Task 5.

- [ ] **Step 2: Do not edit files in this task**

This task is only a commit-boundary audit. If the Streamdown dependency commit already exists, leave it as history. If it does not exist, stop and ask the user whether to recreate the dependency-only commit before continuing.

- [ ] **Step 3: Commit**

If no file changes were made, do not create a commit for this task. Record in the execution notes that the dependency boundary already exists.

### Task 2: Migrate MarkdownText To Streamdown With Browser Coverage

**Files:**
- Modify: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
- Modify: `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx`

- [ ] **Step 1: Update the assistant Markdown fixture to include a link and language-tagged code block**

In the `renders assistant transcript markdown` test, replace the Markdown source array with this content:

```ts
[
  "# Heading",
  "",
  "> Quoted text",
  "",
  "- First item",
  "- Second item",
  "",
  "1. First ordered item",
  "2. Second ordered item",
  "",
  "Use `inline code` here.",
  "",
  "[Allowed link](https://example.invalid/docs)",
  "",
  "```ts",
  "const value: string = \"fenced code\";",
  "```",
].join("\n")
```

- [ ] **Step 2: Replace old style-class assertions with behavior assertions**

In the same test, keep the existing heading/list/blockquote checks. Replace the inline code and fenced code class checks with:

```ts
const inlineCode = markdown.querySelector("p code");
expect(inlineCode?.textContent).toContain("inline code");

const fencedCodeBlock = markdown.querySelector("pre");
expect(fencedCodeBlock?.textContent).toContain('const value: string = "fenced code";');

const allowedLink = markdown.querySelector<HTMLAnchorElement>('a[href="https://example.invalid/docs"]');
expect(allowedLink).not.toBeNull();
expect(allowedLink?.textContent).toContain("Allowed link");
```

- [ ] **Step 3: Update the unsafe Markdown test for the intentional link behavior change**

Rename `does not render unsafe markdown nodes as active DOM` to:

```ts
test("keeps raw html and images inactive while allowing markdown links", async () => {
```

Replace the final link assertions with:

```ts
expect(document.querySelector(".committed-transcript-entry-markdown strong")).toBeNull();
expect(document.querySelector(".committed-transcript-entry-markdown img")).toBeNull();
const allowedLink = document.querySelector<HTMLAnchorElement>(
  '.committed-transcript-entry-markdown a[href="https://example.invalid"]',
);
expect(allowedLink).not.toBeNull();
expect(allowedLink?.textContent).toBe("blocked link");
```

- [ ] **Step 4: Run focused browser test and verify it fails before implementation**

Run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: FAIL because the current `react-markdown` implementation does not render Markdown links as active `<a>` elements.

- [ ] **Step 5: Replace the MarkdownText implementation**

Replace `MarkdownText.tsx` with:

```tsx
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { Streamdown } from "streamdown";

const streamdownPlugins = { code, cjk };

const allowMarkdownElement = ({ tagName }: { tagName: string }) => tagName !== "img";

export const MarkdownText = ({ source }: { source: string }) => (
  <div className="committed-transcript-entry-markdown committed-transcript-entry-source grid min-w-0 gap-2 wrap-break-word leading-6">
    <Streamdown
      allowElement={allowMarkdownElement}
      linkSafety={{ enabled: false }}
      mode="static"
      plugins={streamdownPlugins}
      skipHtml
    >
      {source}
    </Streamdown>
  </div>
);
```

- [ ] **Step 6: Run the focused browser test**

Run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: PASS for the committed transcript browser test file.

- [ ] **Step 7: Run type check**

Run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected: PASS. If the `allowElement` callback type is incompatible, import the Streamdown type instead of using a local structural type:

```tsx
import type { AllowElement } from "streamdown";

const allowMarkdownElement: AllowElement = (element) => element.tagName !== "img";
```

- [ ] **Step 8: Commit**

Commit only the test file and `MarkdownText.tsx`:

```bash
git add codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx
git diff --cached --check
git commit -m "feat(gui): render markdown with streamdown"
```

### Task 3: Add Tailwind Sources For Enabled Streamdown Packages

**Files:**
- Modify: `codex-gui/src/index.css`

- [ ] **Step 1: Add Streamdown source entries under imports**

Update the top of `index.css` to:

```css
@import "tailwindcss";
@import "@heroui/styles";

@source "../node_modules/streamdown/dist/*.js";
@source "../node_modules/@streamdown/code/dist/*.js";
@source "../node_modules/@streamdown/cjk/dist/*.js";

:root {
```

Do not add `@streamdown/math`.

- [ ] **Step 2: Run focused browser test**

Run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser -- src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Commit**

Commit only `index.css`:

```bash
git add codex-gui/src/index.css
git diff --cached --check
git commit -m "style(gui): include streamdown tailwind sources"
```

### Task 4: Remove React Markdown Dependency

**Files:**
- Modify: `codex-gui/package.json`
- Modify: `codex-gui/pnpm-lock.yaml`

- [ ] **Step 1: Verify there are no source imports**

Run:

```bash
rg -n -e 'react-markdown|ReactMarkdown' codex-gui/src codex-gui/package.json
```

Expected: only `codex-gui/package.json` still references `react-markdown`.

- [ ] **Step 2: Remove the dependency using pnpm**

Run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm remove react-markdown
```

Expected: `react-markdown` is removed from `codex-gui/package.json` and `pnpm-lock.yaml`.

- [ ] **Step 3: Verify removal**

Run:

```bash
rg -n -e 'react-markdown|ReactMarkdown' codex-gui/package.json codex-gui/pnpm-lock.yaml codex-gui/src
```

Expected: no matches.

- [ ] **Step 4: Commit**

Commit only dependency files:

```bash
git add codex-gui/package.json codex-gui/pnpm-lock.yaml
git diff --cached --check
git commit -m "chore(gui): remove react markdown dependency"
```

### Task 5: Final Verification

**Files:**
- Inspect: `codex-gui/package.json`
- Inspect: `codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx`
- Inspect: `codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx`
- Inspect: `codex-gui/src/index.css`

- [ ] **Step 1: Run format check**

Run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run format:oxfmt
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run lint
```

Expected: PASS.

- [ ] **Step 3: Run type check**

Run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run type-check
```

Expected: PASS.

- [ ] **Step 4: Run browser tests**

Run:

```bash
cd codex-gui
/opt/homebrew/bin/fnm exec --using-file pnpm run test:browser
```

Expected: PASS.

- [ ] **Step 5: Commit verification notes only if files changed**

If no files changed during verification, do not commit. If a formatter changed files, inspect the exact paths from `git status --short`, stage only those formatter-touched files, and commit the formatting result:

```bash
git status --short
git add codex-gui/src/features/committedTranscriptSurface/__tests__/CommittedTranscriptSurface.browser.test.tsx codex-gui/src/features/committedTranscriptSurface/MarkdownText.tsx codex-gui/src/index.css
git diff --cached --check
git commit -m "style(gui): format streamdown migration"
```

## Self-Review

- Spec coverage: The plan covers `Streamdown` replacement, `MarkdownText` wrapper retention, `code` and `cjk` enablement, `math` exclusion, raw HTML skipping, image blocking, link allowance with disabled link safety, Tailwind `@source`, browser behavior tests, and `react-markdown` removal.
- Scope control: The plan does not consume `thread/projection/delta`, does not add streaming transcript state, and does not change `itemStarted` / `itemCompleted` data flow.
- Command verification: Every project command in this plan exists in `codex-gui/package.json`: `test:browser`, `type-check`, `format:oxfmt`, and `lint`.
- Commit boundaries: Each task either creates no commit because it is an audit, or creates one commit for one task-owned file set. The RED browser-test change is not committed by itself; it is committed together with the Streamdown implementation after the focused test passes.
