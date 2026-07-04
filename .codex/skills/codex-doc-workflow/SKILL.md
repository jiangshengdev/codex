---
name: codex-doc-workflow
description: "Use when working in the openai/codex checkout on docs/superpowers research, specs, plans, implementation-plan handoffs, design/plan document creation, or task-by-task local commit boundaries for accepted plans. Covers Codex project doc locations, dev-branch document creation, dated document history, research logs, and plan execution commit hygiene."
---

# Codex Doc Workflow

Use this skill for Codex project planning and research artifacts under `docs/superpowers/**`.
It does not replace global approval gates: design, plan, implementation, global AGENTS edits, installs, and git remote operations still follow the user's global rules.

## Document Locations

- Research notes: `docs/superpowers/research/YYYY-MM-DD-<topic>/`
- Current findings: `docs/superpowers/research/YYYY-MM-DD-<topic>/current-findings.md`
- Execution log: `docs/superpowers/research/YYYY-MM-DD-<topic>/execution-log.md`
- Design specs: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
- Implementation plans: `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`

Use an existing research directory only when it is clearly the same investigation.
For new specs or plans, prefer a new date-named file and keep older documents as history.

## Branch Gate

Before creating a new spec or plan file, verify the current branch.
New design and plan files may be created only on `dev`.
Do not create new design or plan files on `test`, `release`, or `release/*`.

## Research Workflow

For complex debugging, cross-file investigation, long logs, multiple failures, or work likely to survive context compaction:

1. Prepare the research directory before deep investigation.
2. Append each meaningful step to `execution-log.md` before moving on.
3. Keep `current-findings.md` focused on stable facts, evidence paths, excluded hypotheses, risks, and next steps.
4. Update `current-findings.md` whenever a finding becomes a stable conclusion or a future entry point.
5. Before waiting on long work, agents, or possible context compaction, update the log and current findings.

Research notes are temporary working records by default. Do not stage or commit them unless the user asks to submit, archive, or deliver them.

## Spec And Plan Workflow

- Do not create or update plan files before the corresponding design has been accepted.
- If a design document already exists and the user asks to write an implementation plan, create or update the plan document rather than printing a long checklist in chat.
- If the user asks only for a draft, discussion, or "do not write", keep the plan in chat.
- If the target design, plan goal, path, or branch is unclear, ask before writing.
- When copying an old document for later edits, make a pure-copy local commit before modifying the copy.

## Accepted Plan Execution

When executing an accepted plan:

1. Work by the plan's task or stage boundary.
2. Run only verification needed for that task.
3. Stage only files related to that task.
4. Inspect the staged diff.
5. Create one local commit for that task.

Do not batch multiple plan tasks into one commit unless the user explicitly asks for that.
Do not use git remote commands.
