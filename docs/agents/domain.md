# Domain docs

## Layout

Use single-context:

- Root `CONTEXT.md`: shared domain terms, relationships, and constraints.
- Root `docs/adr/`: durable architectural decisions.

Cover both the GUI and Rust backend, including their protocol and
responsibility boundaries. Programming languages do not define separate
domain contexts.

## Before exploring

Read `CONTEXT.md` and the ADRs relevant to the task.
Also follow the applicable directory-level `AGENTS.md` instructions.

If domain documents do not exist, proceed silently. Do not report their
absence or propose empty documents upfront. Use `domain-modeling` to record
terms and decisions lazily as they are resolved, within the current
authorization and document workflow.

## Vocabulary

Use the glossary's terms in issue titles, proposals, hypotheses, and tests.
Avoid synonyms that the glossary explicitly excludes.

If a needed concept is missing, check existing project terminology first.
Record genuine gaps as input for domain modeling.

## ADR conflicts

Explicitly identify any existing ADR that a proposal contradicts.
Explain the conflict and why reconsideration may be warranted;
do not silently override the decision.
