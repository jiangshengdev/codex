# Website

This website is built using [Docusaurus](https://docusaurus.io/), a modern static website generator.

## Installation

```bash
npm install
```

**Note**: feel free to use the package manager of your choice.

## Local Development

```bash
npm run start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

## Build

```bash
npm run build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

## Translation maintenance

English (`en`) is the source language in `docs/` and is served without a locale
prefix. Keep the corresponding Simplified Chinese (`zh-Hans`) documents in
`i18n/zh-Hans/docusaurus-plugin-content-docs/current/` in sync whenever English
content changes. Chinese pages are served under `/zh-Hans/`. Preserve document
slugs, matching explicit heading IDs, and machine-facing literals in both languages.

Generate interface translation entries with the existing command, then translate
new messages in the JSON files under `i18n/zh-Hans/`:

```bash
pnpm run write-translations --locale zh-Hans
```

This preserves existing translations; do not use `--override`. It does not
translate or synchronize Markdown. Commit both the JSON and Markdown translation
sources with their English changes, and rerun extraction to check stability.

Build and verify both languages together:

```bash
pnpm run typecheck
pnpm run build
pnpm run serve --host 127.0.0.1 --no-open
```

Check direct access, refresh, links, and language switching for all three pages
in each language. A development server runs one locale at a time, so use the
complete build for cross-language checks. For development in a single language:

```bash
pnpm run start --locale en --no-open
pnpm run start --locale zh-Hans --no-open
```

See the Docusaurus [i18n tutorial](https://docusaurus.io/docs/i18n/tutorial) and
[Git translation workflow](https://docusaurus.io/docs/i18n/git).

## Deployment

Using SSH:

```bash
USE_SSH=true npm run deploy
```

Not using SSH:

```bash
GIT_USER=<Your GitHub username> npm run deploy
```

If you are using GitHub Pages for hosting, this command is a convenient way to build the website and push to the `gh-pages` branch.
