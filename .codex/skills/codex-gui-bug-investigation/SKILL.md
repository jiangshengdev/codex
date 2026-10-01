---
name: codex-gui-bug-investigation
description: Investigate Codex GUI bugs using dedicated worktrees and official isolated test entrypoints when independent chats investigate concurrently and need to protect user services and retain evidence.
---

# Codex GUI Bug Investigation Isolation

Each chat uses this skill independently. A worktree belongs to the investigation task in that chat; services, caches, and reports belong to an individual test run. An Issue number must not serve as the identity of shared writable resources.

## Authoritative Dependencies

Resolve this skill's external diagnostic dependency link relative to `.codex/skills/codex-gui-bug-investigation/` in the main checkout. From a worktree, use `git rev-parse --path-format=absolute --git-common-dir` to locate the shared Git directory and its main checkout, then resolve the diagnostic dependency link in that main checkout. Do not infer dependency locations from the Issue or the current worktree's directory name.

- [codex-gui-worktree](../codex-gui-worktree/SKILL.md): Read it and use its scripts to prepare and verify the worktree. Use the skill and scripts included in the target checkout; do not duplicate the preparation workflow.
- [diagnosing-bugs](../../../../codex-config/.agents/skills/diagnosing-bugs/SKILL.md): Read it and actually follow its diagnostic stages. Isolation provides the investigation environment; it does not replace a failure signal, a minimal reproduction, or root-cause verification.

If a dependency cannot be resolved, stop the affected step and identify the missing item. Follow the target repository's AGENTS, tracker configuration, and toolchain. First check the latest Issue body, comments, labels, and investigation scope.

## Prepare or Resume a Task

1. Record the original request's authorization: investigation only, permission to add diagnostic code, or permission to fix. Preparing and running existing tests does not automatically authorize product changes, diagnostic code changes, commits, merges, external writes, or worktree cleanup.
2. Use the actual chat identity or a unique identifier created and retained when this task first starts as `--task-id`. Record the task identity, Issue, worktree name, `codex/` branch, and base commit. Another chat investigating the same Issue gets a different identity and resources. Do not borrow another task's branch or directory.
3. For a new task, check the worktree skill's prerequisites, read `git rev-parse HEAD` in the starting checkout, and explicitly pass the full resulting commit to the preparation script's `--base`, together with `--task-id`, a dedicated `--name`, and `--branch`. Do not carry over uncommitted content. Changes in the main checkout alone do not block preparation.
4. To resume the same task, first check its original record, then use the same directory, branch, identity, and path arguments with `--resume`. This mode preserves the base and investigation changes and rejects inconsistencies in ownership, branch, resource links, or preparation state. If the identity is unknown, preparation fails, or paths conflict, stop dependent steps. Do not overwrite resources or falsely report that the worktree is ready.
5. After successful preparation, provide evidence of the worktree, task identity, actual base, branch, sparse inputs, and resource links as required by the worktree skill's verification workflow. Then investigate in that worktree. Retain the worktree by default.

## Select an Official Test Seam

First follow diagnosing-bugs to establish a feedback loop that detects the original symptom. Select an entrypoint and existing filter arguments based on the bug's execution path. Run from `codex-gui` in the prepared worktree, using the fnm environment required by `codex-gui-toolchain`:

| Target | Official entrypoint |
| --- | --- |
| Storybook Playwright | `pnpm run test:storybook <spec file> --grep <test case>` |
| GUI E2E | `pnpm run test:e2e <spec file> --grep <test case>` |
| Vitest Browser parallel suite | `pnpm run test:browser:parallel --run <test file>` |
| Vitest Browser sequential suite | `pnpm run test:browser:sequential --run <test file>` |
| Storybook stories | `pnpm run test:storybook:stories <stories file>` |

Official entrypoints allocate the individual run identity, actual port, isolated caches, and artifact directories, print the address and evidence locations, and clean up services owned by that run on success, failure, or cancellation. Use their output. Do not temporarily rewrite test configuration in each bug worktree or create another port-allocation or process-cleanup implementation in this skill. If an implemented official isolated entrypoint is missing, report incomplete preparation; do not fall back to a fixed-port path.

Services on 6007 and other user services may only be observed. Do not reuse, take over, terminate, or restart them. Do not clean up by port or broad process name; handle cancellation through the entrypoint for this run. Retain reports, screenshots, traces, and attachments on both normal completion and failure. Do not proactively delete other tasks' artifacts.

Verification is headless by default. Do not automatically open reports or a trace viewer. Check the actual collected, executed, and skipped scope; zero collected tests do not count as a pass. Report missing tools, dependencies, or preparation inputs as blockers for the user to resolve. Do not install components or proactively build backend or native programs.

## Deliver Evidence

Report this task's Issue and authorization scope, task identity, worktree, branch, actual base, test commands and filter scope, actual service address, pass/fail/not-reproduced results, retained artifact locations, and unfinished items. Determine results from actual execution evidence; repeated green runs do not prove that the original bug is fixed.

Distinguish Level 1 evidence supported by isolation from the real-runtime or visible-desktop acceptance required for the specific bug. Do not substitute isolated tests for either of the latter. Redact formal tracker records to avoid exposing private paths or credentials.

At task completion, retain the worktree, uncommitted diagnostics, and existing commits by default. Only when the user explicitly requests cleanup, hand it to the existing authorization and worktree workflows. This skill does not create an orchestrator chat, automatically commit or merge, operate Git remotes, or rely on MCP automatic discovery. Maintain this project skill directly in `.codex/skills/codex-gui-bug-investigation/`, consistent with existing project skills. Do not install a global skill or add discovery symlinks. Report only discovery methods that have actually been verified; do not promise that existing chats refresh immediately.
