---
name: heroui-react
description: "Use when working with HeroUI React v3 in codex-gui, including adding or changing @heroui/react components, styling with @heroui/styles and Tailwind CSS v4, reading local HeroUI docs or demos, or avoiding HeroUI v2 patterns. Offline only: use local repository files and do not browse or fetch remote HeroUI docs."
---

# HeroUI React v3

Use this skill for HeroUI work in `codex-gui`. Keep context small: search local docs, then read only the files needed for the component or topic.

## Offline Rule

- Do not browse the web.
- Do not run scripts that fetch remote HeroUI docs.
- Use only local repository files, primarily `./codex-gui/.heroui-docs/react/` relative to the repository root.
- If `./codex-gui/.heroui-docs/react/` is missing, report an error and stop.
- If the relevant local docs are incomplete, report the gap instead of fetching remote docs.

## Workflow

1. Confirm `./codex-gui/.heroui-docs/react/` exists; if it does not, stop with an error.
2. Search targeted terms with `rg`; do not load generated all-docs indexes.
3. Read the relevant component guide and, when useful, one or two matching demo files.
4. Implement using HeroUI v3 patterns and the existing `codex-gui` conventions.
5. After code changes, run checks from `codex-gui`:

   ```bash
   pnpm run lint
   pnpm run type-check
   ```

## Local Docs

Useful roots:

```text
./codex-gui/.heroui-docs/react/components/
./codex-gui/.heroui-docs/react/demos/
./codex-gui/.heroui-docs/react/getting-started/
```

Search examples:

```bash
rg "Button" ./codex-gui/.heroui-docs/react
rg "onPress" ./codex-gui/.heroui-docs/react
rg "Card.Header" ./codex-gui/.heroui-docs/react
```

Prefer direct component docs when the path is known, for example:

```text
./codex-gui/.heroui-docs/react/components/(buttons)/button.mdx
./codex-gui/.heroui-docs/react/components/(layout)/card.mdx
./codex-gui/.heroui-docs/react/components/(overlays)/modal.mdx
```

## HeroUI v3 Rules

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

## Scope

This skill is only HeroUI guidance. For broader frontend app structure, state management, routing, browser testing, or React performance work, use the relevant project conventions and other applicable skills.
