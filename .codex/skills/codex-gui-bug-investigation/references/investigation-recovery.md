# Investigation Recovery

Use the external `project-doc-workflow` research records protocol linked from
the skill entrypoint. This reference adds only the investigation's location,
identity, persistence and reconciliation rules; it does not define a second
record format or tracker. CNB remains authoritative for formal conclusions and
status. These drafts are unrelated to Composer input drafts.

## Locate the owned pair

After successful preparation, run these read-only queries **in the task
worktree**:

```sh
git rev-parse --path-format=absolute --git-path codex-gui-task
git rev-parse --absolute-git-dir
git rev-parse --path-format=absolute --git-path codex-gui-investigation
```

The first path is the existing worktree owner's record. Verify its task ID,
repository, worktree, branch and base against the actual task entry and the
worktree skill's successful preparation/resume verification. Do not rewrite
that record. The final path is the draft directory; it must be a dedicated
child of this linked worktree's own Git administrative directory, not the
common Git directory or a path shared by other tasks. Check canonical paths
and reject unexpected symlinks, foreign ownership or conflicting contents
before writing. Do not touch Git's own management files.

Create only `execution-log.md` and `current-findings.md` within that directory.
Record both absolute locations together with the task ID and worktree entry
in the task conversation. Do not add another registry or discovery symlink.
An existing pair is resumed, never reset just because context was lost.

If only the original task identity and repository entry remain, use local
`git worktree list --porcelain` and read the existing `codex-gui-task` records
to locate a unique match, then resolve the pair from that worktree. An Issue
number alone is insufficient. Missing, inconsistent or multiple matching
ownership records block writes and resumption of dependent work; report the
specific missing identity or conflict, without adopting another task's scene.

## Persist enough to resume

Apply the protocol's execution log and stable-findings responsibilities.
Keep the recovery essentials in that pair: original goal and symptom, actual
authorization source and subsequent restrictions/revocations, associated
Issue, task ID, preparation arguments, worktree, branch and committed base;
verified facts and evidence locations, excluded hypotheses, still-open
hypotheses, risks and next executable step. A saved authorization description
is a pointer to the original authority, not a new grant.

Before each consequential action, record intent and its precise target or
command. Record observable completion, failure or cancellation promptly after
the result, with run identity and artifact location. Preserve unfinished
commands, process/session handles and uncertain writes as such. Save before
the next important step, before long waits and before delegation; never wait
for a compression warning. Carry any pre-preparation intent into the log once
ownership is established.

Keep intended Issue comment content and its pending/unknown/verified state,
verified comment identity when available, and the last reconciled Issue state
in the pair. Refresh current findings as one current snapshot: replace stale
Issue states, publication statuses and next steps instead of appending a new
checkpoint beneath contradictory old statements. Keep history in the log.
Record meaningful changes, not repeated unchanged checks. Report
conclusions to the user before promoting them to stable findings. When a
conclusion is corrected, update current findings so the rejected conclusion
cannot remain a current fact; retain its history in the execution log.

Only the task coordinator writes this pair. Delegates return status, evidence,
artifacts and blockers for that coordinator to incorporate. Separate tasks,
including tasks on the same Issue, have separate worktrees and pairs.

## Resume against reality

1. Recover the original task identity and still-effective authorization from
   the task entry. Locate the owned pair as above; read `current-findings.md`
   first, then the last relevant `execution-log.md` entries.
2. Reconcile actual worktree/branch/base, uncommitted diagnostics, resource
   links, owned processes and artifacts. Use the worktree owner's `--resume`
   verification before further execution. Do not recreate the worktree,
   overwrite diagnostics, or restart/terminate an unverified process.
3. Reread the latest Issue and comments before dependent actions or writes.
   An intent entry does not prove execution completed; a missing result does
   not prove it never executed. Resolve an unknown write by readback, not
   replay. If access is blocked, keep the uncertainty and continue only
   independent local work with sufficient requirements and authorization.
4. Reconcile newer user restrictions and corrected conclusions, report the
   verified resume point, update the pair and continue the next supported
   diagnostic step. Request only genuinely missing information or permission,
   rather than asking the user to repeat facts already recoverable here.

The pair survives success, failure, cancellation and ordinary context loss
with its task worktree. It is non-formal and never staged or committed; do not
treat it as automatically disposable system temporary material. Only explicit
task cleanup enters the existing authorization/worktree cleanup workflow.
Use the existing `handoff` workflow for a real cross-session handoff, pointing
to these drafts and the Issue when appropriate, without creating a handoff
document for every checkpoint. This protocol adds no automatic wakeup,
compression runtime or chat scheduler.
