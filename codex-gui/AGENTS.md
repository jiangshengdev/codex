# codex-gui

## Repository `just fmt` Scope Hard Override

- Run the repository-level `just fmt` command only when the current task modifies at least one file that is actually managed by the live `scripts/format.py` implementation. Its current managed scopes are the repository Justfile, Rust files handled by `cargo fmt`, Bazel/Starlark files handled by buildifier, Python files under `sdk/python`, and Python files under `scripts`.
- Do not run `just fmt` merely because the task changes another repository file. In particular, changes confined to frontend files under `codex-gui/**`, `docs/**`, Markdown files, or other paths not handled by `scripts/format.py` do not trigger it. Pure frontend formatting must use the applicable scripts defined in `codex-gui/package.json`.
- If a task changes both unmanaged files and at least one `just fmt`-managed file, run `just fmt`. Treat the live `scripts/format.py` implementation as authoritative if its managed scope changes.
- This rule explicitly overrides the repository-root `AGENTS.md` requirement to run `just fmt` after making code changes anywhere in the repository.

Use `$codex-gui-toolchain` to select and run frontend formatters, package scripts, and verification entrypoints.

## Skill Routing

- Use `$gui-launch` for ordinary `GUI 启动`, `启动 GUI`, `/gui`, or URL-only requests. Real GUI debugging and acceptance are routed below.
- Use `$heroui-react` for HeroUI v3 documentation, package, and API details, and `$redux-toolkit` for Redux Toolkit documentation, API, and architecture rules.

## Frontend Engineering Constraints

- Within `codex-gui/**`, Rust module LoC, changed lines, and TypeScript, TSX, or JavaScript file length measure different objects. Do not convert one into another or use any of them alone as a hard stop.
- Evaluate frontend structure by responsibilities, state ownership, coupling, function scope, testability, and reviewability. A small public interface or short file does not justify concentrating multiple operations or state-transition families in one function, factory, or closure.
- Do not split, compress, weaken, or remove frontend tests merely to satisfy a length signal. Add style tests only for stable, user-visible product constraints with a concrete regression risk.
- Typed in-process boundaries should default to types, ownership, copying, and encapsulation. Runtime defense requires a documented actor, supported path, and failure impact that those boundaries cannot address; do not lock the defensive mechanism into tests unless runtime resistance is itself a product or security requirement.
- When a metric, historical implementation, or claim that something is “safer” would determine stopping, splitting, defensive machinery, or test scope, use `$evaluating-engineering-constraints`.

## Authoritative Contract Invariants

- Treat every cross-module or generated contract consumed by `codex-gui` as having a single authoritative source. Use its authoritative artifacts directly or derive from them mechanically.
- Preserve failure propagation from the authoritative source. Incompatible upstream changes that affect referenced fields, types, or variants must fail during generation, type checking, or build.
- Do not replace compile-time contract failures with runtime rejection, silent compatibility, or consumer-owned fallback behavior.
- Do not manually mirror an authoritative contract in consumer-owned DTOs, interfaces, type aliases, literal unions, field lists, schemas, validators, parsers, fixtures, or compatibility adapters.
- Do not erase an authoritative type to `unknown`, a broad record, a broad generic, or an assertion boundary and then reconstruct the contract with consumer-owned declarations or checks.
- Runtime validation that represents an authoritative contract must be mechanically generated from the same authoritative source. If no generated runtime validator exists, do not recreate the contract by hand.
- Mechanically linked derivations such as `Pick`, `Omit`, `Extract`, indexed access, and other type-system transformations are allowed when they preserve dependency on the authoritative type.
- Frontend-owned domain models are allowed only when they express distinct frontend semantics rather than a renamed, narrowed, or duplicated contract. Their conversion boundary must accept the authoritative type and preserve compile-time exhaustiveness for variants.
- Compatible upstream additions that are not consumed locally do not need artificial failures. Do not suppress genuine incompatibilities that affect existing consumers.
- Designs, plans, and reviews must identify the authoritative source and derivation path for affected contracts. If a proposal duplicates a contract or interrupts compile-time failure propagation, stop and redesign before implementation.

## Frontend Evidence Closure

- For high-risk GUI changes, apply the general evidence-closure rules in `$managing-work-stages`; additionally trace real production and mount entrypoints, public and barrel exports, path aliases, dynamic registrations and their indirect consumers, DOM/ARIA selectors, test fixtures, Browser Mode and E2E verification, and applicable mount/unmount, reset, resume, reconnect, retry, rollback, and partial failure lifecycle and recovery paths.
- For contract-bearing changes, apply the Authoritative Contract Invariants above and trace the authoritative TypeScript contract, runtime validator, schema inputs, generated artifacts, and generated fixtures instead of inventing parallel frontend definitions.

## Real GUI Acceptance

- Require real GUI acceptance with `$debug-responsive-gui` when a change can affect user-visible layout or responsive geometry; overlays, opening direction, occlusion, clipping, or scrolling; pointer or keyboard interaction and focus flow; component visual states such as default, hover, disabled, invalid, or `focus-visible`; or integration behavior provable only against real Codex state.
- Pure type changes, generated artifacts, invisible internal logic, and frontend changes with none of those effects do not trigger real GUI acceptance merely because they are under `codex-gui/**`.
- Opening a page, preparing the browser environment, screenshots, DOM or event assertions, and automated test success do not substitute for acceptance of the affected real GUI scenarios. If all triggered scenarios have not passed, do not claim complete completion or verification.

## HeroUI Design System Invariants

- UI design, implementation plans, and code changes in `codex-gui` should default to HeroUI v3 as the component system. Prefer `@heroui/react` components for interactive controls, overlays, feedback, layout primitives, and typography before creating custom HTML/CSS controls.
- Choose component variants by semantic intent rather than visual appearance, and keep main, alternative, dismissive, destructive, and critical actions semantically distinct.
- Use surface, background, separator, and field tokens to express hierarchy and state instead of ad hoc strong color shifts.
- Implementation plans for UI work must list the intended HeroUI components, variants, and semantic tokens. If a plan chooses custom markup or styles instead of HeroUI, it must explain the reason, such as missing component coverage, protocol-driven markup, Markdown semantic output, or transcript performance constraints.
- These rules do not require replacing semantic document or layout elements such as `main`, `section`, `article`, Markdown AST output tags, scroll sentinels, or transcript chunk boundaries when those elements carry accessibility, content, or performance meaning.

## Frontend Performance Invariants

- Transcript rendering must preserve chunk-level performance boundaries. Do not flatten all entries for a turn in render paths, selectors, or display grouping unless the design explicitly justifies the bounded cost.
- UI-only features such as grouping, collapse, disclosure, or labels must not turn chunked transcript data back into full-turn arrays, and must not render every hidden entry while collapsed.
- Prefer chunk-level selectors and chunk-level React components for transcript hot paths. Unchanged chunks should keep stable selector results and avoid re-rendering old entries when new entries append to later chunks.
- Performance verification must target a measurable risk. Regression coverage should encode a stable constraint; the existence of a test or issue note does not by itself establish that the rendering path is performant.

## Test Fixture Invariants

- For legal projection protocol payloads in frontend tests, prefer the shared fixtures and builders in `src/features/projection/__tests__/projectionFixtures.ts` and `src/features/projection/__tests__/projectionTestBuilders.ts` over hand-written protocol objects.
- When a test needs a new legal projection payload variant, extend the shared projection test builder surface first instead of adding a local ad hoc builder or manually expanding `ThreadProjectionAttachResponse`, `ThreadProjectionEventNotification`, `ThreadRuntimeRecord`, or `Turn` shapes in the test file.
- Keep malformed payloads, JSON-RPC envelopes, outbound request assertions, and UI/selector expected-state objects explicit in the test that owns the assertion.
