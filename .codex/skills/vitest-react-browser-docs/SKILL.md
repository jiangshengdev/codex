---
name: vitest-react-browser-docs
description: Use when working on React tests or guidance involving Vitest Browser Mode, including `vitest/browser`, `@vitest/browser-react`, render functions, locators, `expect.element`, `userEvent`, browser commands, Browser Mode config, providers, instances, Playwright, or React component tests that should be verified against the local Vitest documentation tree.
---

# Vitest React Browser Docs

## Authoritative Documentation

This skill only navigates documentation. Read and apply the shared [local frontend dependency documentation contract](../codex-gui-toolchain/references/local-frontend-dependency-docs.md). Do not copy Vitest docs into this skill or rely on memory for Browser Mode API details. Use the local docs as the source of truth.

Run `git rev-parse --show-toplevel` as a standalone command to identify the Git repository root. Resolve the Vitest documentation as its sibling path:

```text
<git-repository-root>/../vitest/docs
```

Treat the resolved absolute path as `<vitest-docs-root>`. Do not resolve `../vitest/docs` from a package or other nested working directory.

## Minimal Lookup

1. Resolve `<vitest-docs-root>` from the Git repository root, then apply the shared local documentation contract to it.
2. Search the docs before answering, reviewing, or editing React Browser Mode tests.
3. Prefer searching these subtrees first:
   - `<vitest-docs-root>/api/browser`
   - `<vitest-docs-root>/config/browser`
   - `<vitest-docs-root>/guide/browser`
4. Read only the documents directly relevant to the task.
5. Base recommendations and code changes on the local docs you read.

## Domain Rules

- For React render function behavior, search and read the React Browser API docs first.
- For DOM assertions, search `expect.element` and Browser assertions.
- For element queries, search locator APIs and Browser locator config.
- For user interactions, search interactivity APIs and provider-specific notes.
- For Browser Mode setup or failures, search Browser config docs, provider docs, instances, and Playwright configuration.
- Keep answers scoped to React unless the user explicitly asks about Vue, Svelte, or another framework.

## Handoff

Use `$codex-gui-toolchain` for test execution. Use `$debug-responsive-gui` when the task requires real GUI debugging or acceptance; documentation lookup, automated tests, and real GUI acceptance remain separate responsibilities.
