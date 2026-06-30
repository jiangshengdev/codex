# codex-gui

## Frontend Performance Invariants

- Transcript rendering must preserve chunk-level performance boundaries. Do not flatten all entries for a turn in render paths, selectors, or display grouping unless the design explicitly justifies the bounded cost.
- UI-only features such as grouping, collapse, disclosure, or labels must not turn chunked transcript data back into full-turn arrays, and must not render every hidden entry while collapsed.
- Prefer chunk-level selectors and chunk-level React components for transcript hot paths. Unchanged chunks should keep stable selector results and avoid re-rendering old entries when new entries append to later chunks.
- Changes to transcript rendering or grouping must include regression coverage or an issue-note update that explains the performance impact.

## Test Fixture Invariants

- For legal projection protocol payloads in frontend tests, prefer the shared fixtures and builders in `src/features/projection/__tests__/projectionFixtures.ts` and `src/features/projection/__tests__/projectionTestBuilders.ts` over hand-written protocol objects.
- When a test needs a new legal projection payload variant, extend the shared projection test builder surface first instead of adding a local ad hoc builder or manually expanding `ThreadProjectionAttachResponse`, `ThreadProjectionEventNotification`, `ThreadRuntimeRecord`, or `Turn` shapes in the test file.
- Keep malformed payloads, JSON-RPC envelopes, outbound request assertions, and UI/selector expected-state objects explicit in the test that owns the assertion.
