---
name: redux-toolkit
description: "Use when working with @reduxjs/toolkit in codex-gui, including configuring Redux stores, writing createSlice reducers, typing Redux Toolkit code with TypeScript, using Immer reducer patterns, choosing createAsyncThunk or createListenerMiddleware, managing normalized data with createEntityAdapter, using RTK Query, or reviewing Redux Toolkit architecture. Offline only: use local repository files and do not browse or fetch remote Redux docs."
---

# Redux Toolkit

Use this skill for `@reduxjs/toolkit` work in `codex-gui`. Keep context small: search local docs, then read only the files needed for the API, pattern, or architectural question.

## Offline Rule

- Do not browse the web.
- Do not run scripts that fetch remote Redux or Redux Toolkit docs.
- Use only local repository files, primarily `./codex-gui/.redux-toolkit-docs/` relative to the repository root.
- If `./codex-gui/.redux-toolkit-docs/` is missing, report an error and stop.
- If the relevant local docs are incomplete, report the gap instead of fetching remote docs.

## Workflow

1. Confirm `./codex-gui/.redux-toolkit-docs/` exists; if it does not, stop with an error.
2. Search targeted terms with `rg`; do not load broad documentation trees into context.
3. Read the relevant RTK usage guide or API reference, plus the Redux style guide when making architecture or review decisions.
4. Implement using Redux Toolkit patterns and the existing `codex-gui` conventions.
5. After code changes, run checks from `codex-gui`:

   ```bash
   pnpm run lint
   pnpm run type-check
   ```

## Local Docs

Useful roots:

```text
./codex-gui/.redux-toolkit-docs/toolkit/usage/
./codex-gui/.redux-toolkit-docs/toolkit/api/
./codex-gui/.redux-toolkit-docs/toolkit/rtk-query/
./codex-gui/.redux-toolkit-docs/redux/style-guide.md
```

Start with these files for common work:

```text
./codex-gui/.redux-toolkit-docs/toolkit/usage/usage-guide.md
./codex-gui/.redux-toolkit-docs/toolkit/usage/usage-with-typescript.md
./codex-gui/.redux-toolkit-docs/toolkit/usage/immer-reducers.md
./codex-gui/.redux-toolkit-docs/toolkit/api/configureStore.mdx
./codex-gui/.redux-toolkit-docs/toolkit/api/createSlice.mdx
./codex-gui/.redux-toolkit-docs/toolkit/api/createAsyncThunk.mdx
./codex-gui/.redux-toolkit-docs/toolkit/api/createEntityAdapter.mdx
./codex-gui/.redux-toolkit-docs/toolkit/api/createListenerMiddleware.mdx
./codex-gui/.redux-toolkit-docs/toolkit/rtk-query/overview.md
```

Search examples:

```bash
rg "createSlice" ./codex-gui/.redux-toolkit-docs
rg "PayloadAction" ./codex-gui/.redux-toolkit-docs
rg "createAsyncThunk" ./codex-gui/.redux-toolkit-docs
rg "createEntityAdapter" ./codex-gui/.redux-toolkit-docs
rg "RTK Query" ./codex-gui/.redux-toolkit-docs
rg "Do Not Mutate State" ./codex-gui/.redux-toolkit-docs/redux/style-guide.md
```

## Updating Local Docs

Use the bundled script when the local docs cache needs to be refreshed from the official Redux repositories:

```bash
bash ./.codex/skills/redux-toolkit/scripts/update-docs.sh
```

The script downloads GitHub archives with `gh api`, syncs Redux Toolkit `docs/` into `./codex-gui/.redux-toolkit-docs/toolkit/`, and copies Redux `docs/style-guide/style-guide.md` into `./codex-gui/.redux-toolkit-docs/redux/style-guide.md`. The docs cache is ignored by git.

## Redux Toolkit Rules

- Prefer `configureStore` for store setup.
- Prefer `createSlice` for slice reducers and generated action creators.
- In `createSlice` and `createReducer`, Immer-backed "mutating" reducer code is acceptable; do not mutate Redux state outside Immer-managed reducers.
- In TypeScript code, infer `RootState` and `AppDispatch` from the configured store instead of hand-writing those types.
- Use `PayloadAction<T>` for action payload typing when needed, while preserving RTK's inference where possible.
- For server data fetching and caching, evaluate RTK Query first.
- For non-cache async workflows, use the simplest suitable RTK option: thunks for imperative logic, listener middleware for reactive workflows.
- For normalized collections, consider `createEntityAdapter`.
- Keep actions serializable unless middleware intentionally intercepts them before reducers.
- Use the Redux style guide for architectural review: no reducer side effects, one store per app, meaningful event-style action names, minimal derived state in the store, and selectors for reading derived data.

## Scope

This skill is only Redux Toolkit guidance. For broader React component design, HeroUI work, routing, browser testing, or visual UI implementation, use the relevant project conventions and other applicable skills.
