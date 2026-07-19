# Domain Docs

This repository uses a multi-context domain documentation layout.

## Before exploring

- Read the root `CONTEXT-MAP.md` if it exists.
- Follow it to each `CONTEXT.md` relevant to the current task.
- Read relevant system-wide ADRs under `docs/adr/`.
- Read context-specific ADRs located beside the owning context.

If these files do not exist, proceed silently. Create them lazily through domain modeling only when terminology or an architectural decision has actually been resolved.

## Context layout

The root `CONTEXT-MAP.md` is the authority for context locations.

Likely context-owned documentation includes:

- `codex-gui/CONTEXT.md` and `codex-gui/docs/adr/`
- `codex-rs/gui-host/CONTEXT.md` and `codex-rs/gui-host/docs/adr/`
- Additional contexts listed in `CONTEXT-MAP.md` when they are introduced

System-wide decisions belong under root `docs/adr/`.

## Vocabulary

Use the terminology defined by the relevant `CONTEXT.md`. If a required term is absent, either reconsider whether the term belongs to the codebase or record the gap for domain modeling.

## ADR conflicts

If proposed work contradicts an existing ADR, surface the conflict explicitly instead of silently overriding it.
