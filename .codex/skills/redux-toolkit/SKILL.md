---
name: redux-toolkit
description: "Use when working with @reduxjs/toolkit in codex-gui, including configuring Redux stores, writing createSlice reducers, typing Redux Toolkit code with TypeScript, using Immer reducer patterns, choosing createAsyncThunk or createListenerMiddleware, managing normalized data with createEntityAdapter, using RTK Query, or reviewing Redux Toolkit architecture. For ordinary documentation lookup, use local repository files and do not browse or fetch remote Redux docs ad hoc; an explicit cache-refresh request may use the bundled updater."
---

# Redux Toolkit

## Authoritative Documentation

Read and apply the shared [local frontend dependency documentation contract](../codex-gui-toolchain/references/local-frontend-dependency-docs.md). For Redux Toolkit, use `./codex-gui/.redux-toolkit-docs/` relative to the repository root as the documentation root.

Useful roots:

```text
./codex-gui/.redux-toolkit-docs/toolkit/usage/
./codex-gui/.redux-toolkit-docs/toolkit/api/
./codex-gui/.redux-toolkit-docs/toolkit/rtk-query/
./codex-gui/.redux-toolkit-docs/redux/style-guide.md
```

## Minimal Lookup

1. For ordinary tasks, use only the local cache and search the task's Redux Toolkit API or architecture terms.
2. Read the relevant RTK usage guide or API reference, plus the Redux style guide when making architecture or review decisions.
3. Base recommendations and code changes on the local docs and existing `codex-gui` conventions.

## Explicit Cache Refresh

Only for an explicit cache-refresh task, use the bundled updater:

```bash
bash ./.codex/skills/redux-toolkit/scripts/update-docs.sh
```

The script downloads GitHub archives with `gh api`, syncs Redux Toolkit `docs/` into `./codex-gui/.redux-toolkit-docs/toolkit/`, and copies Redux `docs/style-guide/style-guide.md` into `./codex-gui/.redux-toolkit-docs/redux/style-guide.md`. The docs cache is ignored by git. Do not browse remote Redux docs ad hoc or assemble another remote-fetch workflow.

## Domain Rules

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

## Handoff

After code changes, use `$codex-gui-toolchain` to resolve and run the current lint and type-check entrypoints; both checks remain required. Use other applicable project skills for React components, HeroUI, routing, browser testing, or visual UI work.
