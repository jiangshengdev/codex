# Local Frontend Dependency Documentation

Use this reference when a frontend domain skill points to a local dependency documentation root. The consuming skill owns the exact root, preferred subtrees, search terms, and domain rules.

## Lookup Contract

1. Resolve the documentation root exactly as the consuming skill specifies.
2. Verify that the root exists before relying on it. If it is missing, report the exact path and stop.
3. Search with task-specific `rg` terms before reading documents. Do not load broad documentation trees or generated all-docs indexes into context.
4. Read only the files and sections directly relevant to the current task.
5. Keep documentation lookup offline. Do not browse or fetch replacement docs. If the local material is incomplete, report the gap and stop instead of filling it from memory.

## Boundaries

- This reference governs documentation lookup, not dependency installation, cache maintenance, or frontend command execution.
- A consumer-specific cache refresh workflow remains separate and requires its own applicable instructions and authorization; reading this reference does not authorize it.
- Use `codex-gui-toolchain` to resolve current `codex-gui` lint, type-check, test, or other frontend command entrypoints.
