# Release Promotion Disable Git Pager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure release-promotion scripts never enter a Git pager, so dry-run output does not require pressing `q`.

**Architecture:** All release-promotion Git calls flow through `rp_git()` in `lib-release-promotion.sh`. Update that single wrapper to invoke `git --no-pager "$@"`, preserving the existing safety checks for forbidden remote commands and `git reset --hard`.

**Tech Stack:** Bash, Git, repo-local Codex skill scripts.

---

## File Structure

- Modify: `.codex/skills/release-promotion/scripts/lib-release-promotion.sh`
  - Responsibility: shared release-promotion helpers, including the only approved Git command wrapper.
- No new source files.
- No project tests.

### Task 1: Disable Git Pager In Shared Git Wrapper

**Files:**
- Modify: `.codex/skills/release-promotion/scripts/lib-release-promotion.sh`

- [ ] **Step 1: Inspect the current wrapper**

Run:

```bash
sed -n '1,90p' .codex/skills/release-promotion/scripts/lib-release-promotion.sh
```

Expected: `rp_git()` performs validation and ends with:

```bash
git "$@"
```

- [ ] **Step 2: Update the wrapper implementation**

Change only the final Git invocation in `rp_git()`:

```bash
git --no-pager "$@"
```

Do not change the preceding argument validation, forbidden remote command checks, or `git reset --hard` rejection.

- [ ] **Step 3: Verify Bash syntax**

Run:

```bash
for script in .codex/skills/release-promotion/scripts/*.sh; do bash -n "$script"; done
```

Expected: command exits with status 0 and prints no syntax errors.

- [ ] **Step 4: Verify dry-run does not enter pager**

Run:

```bash
.codex/skills/release-promotion/scripts/promote-dev-to-release.sh --dry-run
```

Expected: command prints preflight, merge diff, and bump-version output directly, then returns to the shell prompt without requiring `q`.

- [ ] **Step 5: Confirm final diff is scoped**

Run:

```bash
git diff -- .codex/skills/release-promotion/scripts/lib-release-promotion.sh
```

Expected: the only code change is replacing `git "$@"` with `git --no-pager "$@"`.

## Out Of Scope

- Do not modify Git global config.
- Do not add new CLI flags or environment variables.
- Do not run project tests.
- Do not operate git remotes.
