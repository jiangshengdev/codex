---
name: heroui-react
description: "Use when working with HeroUI React v3 in codex-gui, including adding or changing @heroui/react components, styling with @heroui/styles and Tailwind CSS v4, reading local HeroUI source, docs, or demos, or avoiding HeroUI v2 patterns. Offline only: use local repository files and do not browse or fetch remote HeroUI material."
---

# HeroUI React v3

## Authoritative Local Sources

Run `git rev-parse --show-toplevel` as a standalone command to identify the Codex repository root. Resolve the HeroUI source repository as its sibling path:

```text
<git-repository-root>/../heroui
```

Treat the resolved absolute path as `<heroui-source-root>`. Do not resolve `../heroui` from `codex-gui` or another nested working directory.

Use the source repository for implementation and styling behavior. Search these roots first:

```text
<heroui-source-root>/packages/react/src/components/
<heroui-source-root>/packages/styles/components/
<heroui-source-root>/packages/styles/src/components/
<heroui-source-root>/packages/styles/themes/
<heroui-source-root>/packages/styles/utilities/
```

Verify that `<heroui-source-root>` is a Git repository and that its `@heroui/react` and `@heroui/styles` package versions match the versions resolved by `codex-gui`. If they do not match, report the mismatch and stop using that checkout as exact implementation evidence. Do not fall back to `codex-gui/node_modules/@heroui/**` for HeroUI source inspection.

## Authoritative Documentation

Read and apply the shared [local frontend dependency documentation contract](../codex-gui-toolchain/references/local-frontend-dependency-docs.md). For HeroUI, use `./codex-gui/.heroui-docs/react/` relative to the repository root as the documentation root. Do not run scripts that fetch remote HeroUI docs.

Useful roots:

```text
./codex-gui/.heroui-docs/react/components/
./codex-gui/.heroui-docs/react/demos/
./codex-gui/.heroui-docs/react/getting-started/
```

## Minimal Lookup

1. Resolve and verify `<heroui-source-root>` and the documentation root.
2. Search the task's HeroUI component or API terms in the source repository before making implementation claims.
3. Read the relevant component guide and, when useful, one or two matching demo files for usage guidance.
4. Base recommendations and code changes on the matching local source, local docs, and existing `codex-gui` conventions.

## Domain Rules

- Use `@heroui/react` for components and `@heroui/styles` for styles.
- Do not add HeroUI v2 patterns such as `HeroUIProvider`.
- Do not add `framer-motion` for HeroUI animations.
- Keep CSS import order:

  ```css
  @import "tailwindcss";
  @import "@heroui/styles";
  ```

- Prefer compound component APIs when the local docs show them.
- Prefer `onPress` for HeroUI interactive components when supported by the component docs.
- Use semantic variants such as `primary`, `secondary`, `tertiary`, `danger`, `ghost`, and `outline`; avoid one-off hardcoded colors unless the local design requires them.

## Handoff

Follow `codex-gui/AGENTS.md` for product-level HeroUI design invariants. After code changes, use `$codex-gui-toolchain` to resolve and run the current lint and type-check entrypoints; both checks remain required.
