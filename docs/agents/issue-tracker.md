# Issue tracker: CNB

Use CNB Issues in `jiangshengdev/codex` for specs and implementation tickets.

Repository: https://cnb.cool/jiangshengdev/codex
Documentation: https://docs.cnb.cool/zh/

## CLI and authentication

Use the installed `cnb` CLI with an explicit `--repo jiangshengdev/codex`.
Do not infer the repository by running Git remote commands.

Run `cnb status` before tracker operations. Authentication must be available
to the executing process. Never print credentials or embed them in documents.

Use `cnb <module> <tool> --help` to verify arguments.
The pagination option is `--page-size`, not `--pageSize`.
Use `--body-file` for multiline Markdown.

## Operations

All commands below use the repository above. Replace placeholders before use.

```sh
cnb issues list-issues --repo jiangshengdev/codex --state open --page 1 --page-size 100
cnb issues get-issue --repo jiangshengdev/codex --number <number>
cnb issues list-issue-comments --repo jiangshengdev/codex --number <number> --page 1 --page-size 100
cnb issues list-issue-labels --repo jiangshengdev/codex --number <number> --page 1 --page-size 100

cnb issues create-issue --repo jiangshengdev/codex --title '<title>' --body-file <path>
cnb issues update-issue --repo jiangshengdev/codex --number <number> --body-file <path>
cnb issues post-issue-comment --repo jiangshengdev/codex --number <number> --body-file <path>

cnb repo-labels list-labels --repo jiangshengdev/codex --page 1 --page-size 100
cnb repo-labels post-label --repo jiangshengdev/codex --name '<label>' --color '<hex-color>'
cnb issues post-issue-labels --repo jiangshengdev/codex --number <number> --labels '<label>'
cnb issues delete-issue-label --repo jiangshengdev/codex --number <number> --name '<label>'

cnb issues update-issue --repo jiangshengdev/codex --number <number> --state closed --state-reason completed
```

- "Publish to the issue tracker" means create a CNB Issue.
- "Fetch the relevant ticket" means read its full body, comments, and labels.
- Follow pagination until all relevant records have been read.
- Issue list responses do not include the full body; fetch issue details.
- Use `--labels` and `--state` to filter issue lists.
- Read existing labels before creating missing ones. Use the mapping in
  `triage-labels.md`.
- Add and remove individual state labels without replacing unrelated labels.
- For rejected work, use `--state-reason not_planned` when closing.
- Post any required resolution comment separately before closing.
- Check the HTTP status and read back mutations; do not rely only on exit codes.
- Re-read the current body before editing it to avoid overwriting newer changes.
- These conventions do not grant permission for external writes.

## Ticket relationships

Use `## Parent` and `## Blocked by` in ticket bodies as required by `to-tickets`.
Reference actual CNB issue numbers and include the repository when ambiguous.

Native parent-child and blocking relationships have not been verified.
Before work requiring these relationships, check current CNB documentation
and API support. Use native relationships when available. Use body references
as the dependency representation only when native support is confirmed absent.

Do not silently treat an unknown capability as unsupported.

## Wayfinding operations

Full `wayfinder` integration is not yet verified.

A map is an issue labelled `wayfinder:map`; ticket types use
`wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or
`wayfinder:task`.

Before using this workflow, resolve how CNB represents map membership and
blocking relationships. Verify assignee operations before using assignment
as a claim. The frontier consists of open, unclaimed children whose blockers
are all complete.

Resolve a ticket by posting its answer, closing it, and updating the map
with a context pointer.

## Verification

With cnb 1.15.20 on 2026-09-14, issue #1 verified:
creation, body updates through --body-file, body readback, comment creation
and readback, label creation, attachment, filtering, removal, deletion,
and issue closing with readback.

The test issue is closed and the temporary label was deleted.
Assignment, reopening, and native issue relationships were not tested.

## Existing local documents

Keep existing `docs/superpowers/issues/` documents under their existing rules.
This setup does not migrate them or establish automatic synchronization.
