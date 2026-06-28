# Debug Responsive GUI LAN URL Preference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the `debug-responsive-gui` skill so GUI launch flows prefer the `launch_gui` LAN URL and fall back to Local only when needed.

**Architecture:** This is a skill-documentation-only change. The existing automation script continues to accept exactly one `--gui-url`; the caller chooses the `launch_gui` LAN URL first, preserving the existing Vite recovery and responsive verification behavior.

**Tech Stack:** Markdown skill documentation, repo-local skill validation with `quick_validate.py`, shell checks with `rg`.

---

## File Structure

- Modify: `.codex/skills/debug-responsive-gui/SKILL.md`
  - Replace Local-only guidance with LAN-first, Local-fallback guidance.
  - Keep the script interface unchanged: `--gui-url '<launch_gui 返回的 URL>'`.
  - Keep the existing 502/Vite recovery semantics intact.
- Read only: `docs/superpowers/specs/2026-06-28-debug-responsive-gui-lan-url-preference-design.md`
  - Use as the accepted behavior boundary.
- Do not modify: `.codex/skills/debug-responsive-gui/scripts/**`
  - No script changes are needed because URL selection happens before invoking the script.

## Task 1: Update Skill Wording

**Files:**
- Modify: `.codex/skills/debug-responsive-gui/SKILL.md`
- Read: `docs/superpowers/specs/2026-06-28-debug-responsive-gui-lan-url-preference-design.md`

- [ ] **Step 1: Re-read the design and current skill**

  Run:

  ```bash
  sed -n '1,220p' docs/superpowers/specs/2026-06-28-debug-responsive-gui-lan-url-preference-design.md
  sed -n '1,220p' .codex/skills/debug-responsive-gui/SKILL.md
  ```

  Expected: the design says LAN is preferred with Local fallback; the skill still contains Local-only guidance.

- [ ] **Step 2: Edit the stable usage block**

  In `.codex/skills/debug-responsive-gui/SKILL.md`, change the stable usage example from:

  ```bash
  node .codex/skills/debug-responsive-gui/scripts/debug-responsive-gui.mjs --gui-url '<launch_gui 返回的 Local URL>'
  ```

  to:

  ```bash
  node .codex/skills/debug-responsive-gui/scripts/debug-responsive-gui.mjs --gui-url '<launch_gui 返回的 LAN URL；没有 LAN 或 LAN 不可用时使用 Local URL>'
  ```

- [ ] **Step 3: Edit the run-mode rules**

  In the same file, replace the current URL selection bullets with this wording:

  ```markdown
  - 先由 Codex 外层调用 `launch_gui` 获取当前 GUI URL。
  - 如果 `launch_gui` 返回 LAN URL，默认优先把 LAN URL 传给 `--gui-url`；只有没有 LAN URL、LAN URL 明确不可用，或用户明确要求本机地址时，才使用 Local URL。
  - URL 中的 `threadId` 和 `token` 必须完整保留；不要手写、猜测或从旧 URL 拼接。
  ```

  Expected: the skill no longer states that GUI URL must be Local-only.

- [ ] **Step 4: Edit restart/recovery examples**

  Replace Local-only restart and single-step wording with LAN-first wording:

  ```markdown
  当用户说“重启 GUI”“重启后端”“GUI 不可用”或页面显示 `Codex GUI dev server unavailable` 时，先调用外层 `launch_gui` 重新获取当前 GUI URL，再优先选择返回的 LAN URL；没有 LAN URL、LAN URL 明确不可用，或用户明确要求本机地址时，才使用 Local URL。
  ```

  Update the single-step command placeholder to:

  ```bash
  node .codex/skills/debug-responsive-gui/scripts/steps/20-open-gui-if-needed.mjs --gui-url '<launch_gui 返回的 LAN URL；没有 LAN 或 LAN 不可用时使用 Local URL>'
  ```

- [ ] **Step 5: Preserve Vite recovery text**

  Keep the HTTP 502 guidance semantically unchanged:

  ```markdown
  如果 `launch_gui` URL 返回 HTTP 502，通常表示代理背后的 `codex-gui` Vite dev server 未运行或不可达。
  ```

  Expected: the plan does not reinterpret 502 as a Chrome, Playwright, or LAN-selection failure.

## Task 2: Validate the Skill Documentation

**Files:**
- Validate: `.codex/skills/debug-responsive-gui/SKILL.md`

- [ ] **Step 1: Run skill metadata validation**

  Run:

  ```bash
  python3 /Users/jiangsheng/.codex/skills/.system/skill-creator/scripts/quick_validate.py .codex/skills/debug-responsive-gui
  ```

  Expected: exit code 0 with no skill validation errors.

- [ ] **Step 2: Search for obsolete Local-only requirements**

  Run:

  ```bash
  rg -n -e '必须使用 `launch_gui` 返回的 Local|返回的 Local URL|Local HTTP\\(S\\) URL' .codex/skills/debug-responsive-gui/SKILL.md
  ```

  Expected: no matches.

- [ ] **Step 3: Confirm LAN-first wording exists**

  Run:

  ```bash
  rg -n -e '优先.*LAN|LAN URL|Local URL' .codex/skills/debug-responsive-gui/SKILL.md
  ```

  Expected: matches include LAN-first selection and Local fallback wording.

- [ ] **Step 4: Confirm only intended files changed**

  Run:

  ```bash
  git status --short
  git diff -- .codex/skills/debug-responsive-gui/SKILL.md
  ```

  Expected: the implementation diff is limited to `.codex/skills/debug-responsive-gui/SKILL.md`; existing design/plan docs may remain untracked if they are part of the current documentation workflow.

## Stop Conditions

- Stop before editing if the current branch is not `dev`.
- Stop before editing if the design file is missing or contradicts LAN-first behavior.
- Stop if implementing the wording requires changing `.codex/skills/debug-responsive-gui/scripts/**`; that would exceed this plan and needs a revised design.
- Do not stage or commit unless the user explicitly asks.

## Self-Review

- Spec coverage: the tasks cover LAN-first selection, Local fallback, token preservation, unchanged script interface, and unchanged Vite recovery semantics.
- Placeholder scan: no unresolved placeholder markers or unspecified implementation steps are present.
- Type and command consistency: all paths match the current repository layout, and the validation command uses the existing `quick_validate.py` script.
