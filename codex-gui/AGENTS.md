# codex-gui

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

## HeroUI Design System Invariants

- UI design, implementation plans, and code changes in `codex-gui` should default to HeroUI v3 as the component system. Prefer `@heroui/react` components for interactive controls, overlays, feedback, layout primitives, and typography before creating custom HTML/CSS controls.
- When a HeroUI component supports compound composition, prefer the documented compound API over one-off DOM structures, as long as it does not violate transcript rendering performance boundaries.
- Use semantic variants to express intent: `primary` for the main action in a context, `secondary` for alternatives, `tertiary` for dismissive actions, and `danger` for destructive or critical actions. Do not choose variants primarily by visual appearance.
- Use HeroUI semantic color tokens and component variants for color. Avoid component-level hardcoded foreground, text, icon, border, or background colors unless the design explicitly justifies the exception.
- Use surface, background, separator, and field tokens to express hierarchy and state instead of ad hoc strong color shifts.
- Prefer HeroUI `onPress` and accessibility-aware interaction APIs when the component provides them. If native elements are used instead, keep ARIA, keyboard, and focus behavior explicit.
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
