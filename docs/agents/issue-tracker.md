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

cnb issues list-issue-assignees --repo jiangshengdev/codex --number <number>
cnb issues can-user-be-assigned-to-issue --repo jiangshengdev/codex --number <number> --assignee '<username>'
cnb issues post-issue-assignees --repo jiangshengdev/codex --number <number> --assignees '<username>'
cnb issues delete-issue-assignees --repo jiangshengdev/codex --number <number> --assignees '<username>'
cnb issues list-issues --repo jiangshengdev/codex --state open --assignees '<username>' --page 1 --page-size 100
cnb issues list-issues --repo jiangshengdev/codex --state open --assignees - --page 1 --page-size 100

cnb issues update-issue --repo jiangshengdev/codex --number <number> --state open --state-reason reopened
cnb issues update-issue --repo jiangshengdev/codex --number <number> --state closed --state-reason completed
```

- "Publish to the issue tracker" means create a CNB Issue.
- "Fetch the relevant ticket" means read its full body, comments, and labels.
- Follow pagination until all relevant records have been read.
- Issue list responses do not include the full body; fetch issue details.
- Use `--labels` and `--state` to filter issue lists.
- Use `--assignees <username>` to find assigned issues and `--assignees -`
  to find unassigned issues. An assignability check returning HTTP 204 means
  the user is eligible; it does not assign the user.
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

For this integration, treat capabilities without a public API as temporarily
unsupported. On 2026-09-14, the published OpenAPI at
https://api.cnb.cool/swagger.json exposed no native parent-child or blocking
relationship endpoints or corresponding Issue fields.

Use body references as the current representation of these relationships.
Read each blocker to determine its current state; all blockers must be closed
before a ticket is unblocked. This convention does not provide native CNB
dependency enforcement or visualization. Revisit it when public API support
becomes available.

## Wayfinding operations

The following conventions use the verified basic Issue operations.
The complete multi-ticket `wayfinder` workflow has not been tested end to end.

A map is an issue labelled `wayfinder:map`; ticket types use
`wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or
`wayfinder:task`.

Keep an ordered list of child issue references in the map body. Each child
references the map in `## Parent` and its blockers in `## Blocked by`.
Read these references to determine map membership and blocking relationships.
The frontier consists of open, unassigned children whose blockers are all
closed; choose the first eligible child in map order.

Claim a ticket by assigning it to the developer driving the work before
starting, then read back the assignees. Assignment and filtering were verified;
exclusive claiming across concurrent sessions was not verified.

Resolve a ticket by posting its answer, closing it, and updating the map
with a context pointer.

## Verification

With cnb 1.15.20 on 2026-09-14, issue #1 verified:
creation, body updates through --body-file, body readback, comment creation
and readback, label creation, attachment, filtering, removal, deletion,
and issue closing with readback. Follow-up tests verified reopening with
open/reopened, assignability, assignment and readback, filtering by assignee,
removal and readback, unassigned filtering, and restoration to closed/completed.
Comment pagination was checked with the existing comment on page 1 and an
empty page 2. Assignee and custom-property reads also succeeded.

The test issue is closed/completed with no assignees. The temporary label was
deleted, and the follow-up tests added no comments.
Native Issue relationships are temporarily unsupported through the public API;
they were not write-tested.

## Existing local documents

Keep existing `docs/superpowers/issues/` documents under their existing rules.
This setup does not migrate them or establish automatic synchronization.
