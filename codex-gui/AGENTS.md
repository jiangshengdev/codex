# codex-gui

## Repository Formatting Scope

- Run repository-level `just fmt` if and only if the task changes at least one file managed by the live `scripts/format.py`, including tasks that also change unmanaged files. Its current scopes are the repository Justfile, Rust files handled by `cargo fmt`, Bazel/Starlark files handled by buildifier, and Python files under `sdk/python` and `scripts`; the live implementation remains authoritative if these scopes change.
- Changes confined to unmanaged paths, including frontend files under `codex-gui/**`, `docs/**`, or Markdown files, do not trigger `just fmt`. Pure frontend formatting uses the applicable scripts in `codex-gui/package.json`.

Use `$codex-gui-toolchain` to select and run frontend formatters, package scripts, and verification entrypoints.

## Skill Routing

- Use `$gui-launch` for ordinary `GUI 启动`, `启动 GUI`, `/gui`, or URL-only requests. Real GUI debugging and acceptance are routed below.
- Use `$heroui-react` for HeroUI v3 documentation, package, and API details, and `$redux-toolkit` for Redux Toolkit documentation, API, and architecture rules.
- Use `$lingui-catalog-workflow` when Lingui message extraction, catalog diffs, catalog translation changes, or extraction stability are in scope.

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

- For high-risk GUI changes, read and apply `$managing-work-stages`'s `references/vertical-impact-closure.md` for all applicable entrypoint, export, consumer, lifecycle, recovery, and verification chains. Include real production and mount entrypoints, dynamic registrations and their indirect consumers, DOM/ARIA selectors, test fixtures, and Browser Mode/E2E verification.
- For contract-bearing changes, apply the Authoritative Contract Invariants above and trace the authoritative TypeScript contract, runtime validator, schema inputs, generated artifacts, and generated fixtures.

## GUI Acceptance Levels

- Level 1 is automated regression in an isolated or test environment. It covers browser tests, DOM and event assertions, accessibility, screenshots, and geometry checks, but does not substitute for real Codex integration when that integration is affected.
- Level 2 is headless real-application acceptance against the current Codex runtime, target route, and required real state. Use it for affected layout and responsive geometry; overlays, opening direction, occlusion, clipping, and scrolling; pointer and keyboard interaction and focus flow; component states such as default, hover, disabled, invalid, and `focus-visible`; and other integration behavior observable without a visible desktop window.
- Level 3 is visible-desktop acceptance and applies only when the result itself depends on operating-system windows, desktop or cross-application focus, DevTools, system IME UI, or another behavior that headless automation cannot prove. Route it to `$debug-responsive-gui`, and obtain separate explicit authorization for the visible-window impact before opening or reusing any visible browser or desktop window.
- Plans and final reports must record each level's applicability and result separately. When all applicable Level 1 and Level 2 scenarios pass and Level 3 is not applicable, the GUI change may be reported as completely verified. When Level 3 applies but is not executed, report `可见桌面验收未执行` and do not claim complete completion or verification.
- Pure type changes, generated artifacts, invisible internal logic, and frontend changes with none of these effects do not trigger GUI acceptance merely because they are under `codex-gui/**`.

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
