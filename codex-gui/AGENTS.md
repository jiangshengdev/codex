# codex-gui

## Repository `just fmt` Scope Hard Override

- Run the repository-level `just fmt` command only when the current task modifies at least one file that is actually managed by the live `scripts/format.py` implementation. Its current managed scopes are the repository Justfile, Rust files handled by `cargo fmt`, Bazel/Starlark files handled by buildifier, Python files under `sdk/python`, and Python files under `scripts`.
- Do not run `just fmt` merely because the task changes another repository file. In particular, changes confined to frontend files under `codex-gui/**`, `docs/**`, Markdown files, or other paths not handled by `scripts/format.py` do not trigger it. Pure frontend formatting must use the applicable scripts defined in `codex-gui/package.json`.
- If a task changes both unmanaged files and at least one `just fmt`-managed file, run `just fmt`. Treat the live `scripts/format.py` implementation as authoritative if its managed scope changes.
- This rule explicitly overrides the repository-root `AGENTS.md` requirement to run `just fmt` after making code changes anywhere in the repository.

## GUI Module Size Override

- Within `codex-gui/**`, the repository-root guidance to target Rust modules under 500 LoC applies only to Rust code. Do not apply it to TypeScript, TSX, or JavaScript files.
- The repository-root guidance that complex logic changes should stay under 500 changed lines is change-size review guidance. It is not a per-file LoC limit and must not be converted into a hard stop based on `wc -l`.
- Do not add or enforce a GUI plan, completion criterion, or implementation gate that fails solely because a TypeScript, TSX, or JavaScript file reaches an exact line count such as 500. Any existing project work document that does so is overridden for files under `codex-gui/**`.
- Do not impose per-file line-count limits on frontend test code anywhere in the workflow. This includes unit, Browser Mode, and end-to-end tests, files under `__tests__/**`, test fixtures, and test helpers. Do not split, compress, weaken, or remove test coverage merely to satisfy a file-length target.
- Evaluate GUI module extraction using responsibilities, state ownership, coupling, function scope, testability, and reviewability. File length is only supporting evidence; it does not decide the result by itself.

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

- Before planning a high-risk GUI change, trace the real production and mount entrypoints, public exports, direct and indirect consumers, state lifecycle and failure recovery, DOM/ARIA selectors, fixtures, and the verification layer that exercises the behavior.
- For contract-bearing changes, apply the Authoritative Contract Invariants above and trace the existing authoritative contract, runtime validator, and generation path instead of inventing parallel frontend definitions.
- Do not proceed while a missing link could change the root-cause conclusion, affected scope, or verification strategy.

## Frontend State and Runtime Defense Invariants

- Treat typed, in-process frontend modules as trusted TypeScript boundaries by default. Use `Readonly` to express non-mutating contracts and copy caller-owned inputs when alias isolation is required.
- Do not add `Object.freeze`, deep-freeze utilities, proxies, runtime immutability wrappers, or equivalent defensive machinery unless a documented, realistic mutation path crosses an untrusted JavaScript or external boundary.
- Do not freeze module-internal state, transition records, effects, or other newly allocated return values merely because they are conceptually immutable. Runtime hardening must address a concrete failure that `Readonly`, ownership, copying, or encapsulation cannot address.
- Existing runtime immutability patterns are evidence to investigate, not precedent to copy. Before adding a runtime guard, identify who can trigger the guarded mutation through a supported path and what invariant would otherwise fail.
- Do not assert `Object.isFrozen` or otherwise lock runtime immutability implementation details in tests unless runtime tamper resistance is an explicit product or security requirement.
- A small public interface does not justify concentrating the implementation in one large factory or closure. Factories should construct instances, not contain an entire multi-operation state machine.
- When one instance owns shared mutable state across multiple public operations, prefer a non-exported implementation class or explicit state-transition functions. Keep input validation, ownership transitions, fact classification/reconciliation, and effect construction in separately named methods or functions.
- Review function scope independently from file size. A module remaining below its line limit does not excuse a function that accumulates many nested helpers, state owners, transition families, or unrelated responsibilities.
- Use TypeScript `private` for ordinary in-process encapsulation. Add `#private` fields or runtime enforcement only when the same concrete threat-model test above demonstrates that compile-time privacy is insufficient.

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
- Changes to transcript rendering or grouping must include regression coverage or an issue-note update that explains the performance impact.

## Test Fixture Invariants

- For legal projection protocol payloads in frontend tests, prefer the shared fixtures and builders in `src/features/projection/__tests__/projectionFixtures.ts` and `src/features/projection/__tests__/projectionTestBuilders.ts` over hand-written protocol objects.
- When a test needs a new legal projection payload variant, extend the shared projection test builder surface first instead of adding a local ad hoc builder or manually expanding `ThreadProjectionAttachResponse`, `ThreadProjectionEventNotification`, `ThreadRuntimeRecord`, or `Turn` shapes in the test file.
- Keep malformed payloads, JSON-RPC envelopes, outbound request assertions, and UI/selector expected-state objects explicit in the test that owns the assertion.
