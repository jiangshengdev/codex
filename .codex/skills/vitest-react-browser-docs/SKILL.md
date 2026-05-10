---
name: vitest-react-browser-docs
description: Use when working on React tests or guidance involving Vitest Browser Mode, including `vitest/browser`, `@vitest/browser-react`, render functions, locators, `expect.element`, `userEvent`, browser commands, Browser Mode config, providers, instances, Playwright, or React component tests that should be verified against the local Vitest documentation tree.
---

# Vitest React Browser Docs

This is a documentation-navigation skill. Do not copy Vitest docs into this skill or rely on memory for Browser Mode API details. Use the local docs as the source of truth.

## Documentation Root

Resolve the Vitest documentation from the current project root:

```text
../vitest/docs
```

## Workflow

1. Verify the local documentation root exists.
2. Search the docs with `rg` before answering, reviewing, or editing React Browser Mode tests.
3. Prefer searching these subtrees first:
   - `../vitest/docs/api/browser`
   - `../vitest/docs/config/browser`
   - `../vitest/docs/guide/browser`
4. Read only the documents directly relevant to the task.
5. Base recommendations and code changes on the local docs you read.

## Search Hints

For React Browser Mode work, start with task-specific terms such as:

```text
react
render
browser
vitest/browser
@vitest/browser-react
expect.element
locator
userEvent
interactivity
commands
provider
instances
playwright
```

## Guidance

- For React render function behavior, search and read the React Browser API docs first.
- For DOM assertions, search `expect.element` and Browser assertions.
- For element queries, search locator APIs and Browser locator config.
- For user interactions, search interactivity APIs and provider-specific notes.
- For Browser Mode setup or failures, search Browser config docs, provider docs, instances, and Playwright configuration.
- Keep answers scoped to React unless the user explicitly asks about Vue, Svelte, or another framework.
