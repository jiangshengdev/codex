---
name: heroui-react
description: "Use when working with HeroUI React v3 in codex-gui, including adding or changing @heroui/react components, styling with @heroui/styles and Tailwind CSS v4, reading local HeroUI docs or demos, or avoiding HeroUI v2 patterns. Offline only: use local repository files and do not browse or fetch remote HeroUI docs."
---

# HeroUI React v3

## Authoritative Documentation

Read and apply the shared [local frontend dependency documentation contract](../codex-gui-toolchain/references/local-frontend-dependency-docs.md). For HeroUI, use `./codex-gui/.heroui-docs/react/` relative to the repository root as the documentation root. Do not run scripts that fetch remote HeroUI docs.

Useful roots:

```text
./codex-gui/.heroui-docs/react/components/
./codex-gui/.heroui-docs/react/demos/
./codex-gui/.heroui-docs/react/getting-started/
```

## Minimal Lookup

1. Search the task's HeroUI component or API terms.
2. Read the relevant component guide and, when useful, one or two matching demo files.
3. Base recommendations and code changes on the local docs and existing `codex-gui` conventions.

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
