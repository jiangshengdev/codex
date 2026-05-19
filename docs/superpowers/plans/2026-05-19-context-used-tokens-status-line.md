# Context Used Tokens Status Line Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `context-used-tokens` TUI status line item that displays the same raw context-window used token value shown in `/status`, formatted with the existing compact token formatter and a `ctx` suffix.

**Architecture:** Keep the feature inside the existing status line surface. Add a new selectable `StatusLineItem`, expose a matching preview item, and render the runtime value from the same `last_token_usage.tokens_in_context_window()` source used by the `/status` card. Do not modify `/status`, token accounting, terminal title, or existing `context-used` behavior.

**Tech Stack:** Rust, ratatui TUI, strum enum parsing/display, existing `format_tokens_compact`, existing `codex-tui` async unit tests and insta snapshots.

---

## File Structure

- Modify `codex-rs/tui/src/bottom_pane/status_line_setup.rs`
  - Add the selectable `StatusLineItem::ContextUsedTokens`.
  - Add the Configure Status Line description.
  - Map the item to a preview item.
  - Add focused enum parsing/description coverage.
- Modify `codex-rs/tui/src/bottom_pane/status_surface_preview.rs`
  - Add `StatusSurfacePreviewItem::ContextUsedTokens`.
  - Add the `0 ctx` placeholder and iterator entry.
- Modify `codex-rs/tui/src/bottom_pane/status_line_style.rs`
  - Classify `StatusLineItem::ContextUsedTokens` with the existing usage accent so it uses the same status line styling family as `context-used`.
- Modify `codex-rs/tui/src/chatwidget/status_surfaces.rs`
  - Add runtime rendering for `context-used-tokens`.
  - Add compile-only placeholder arms in the first plumbing task so the crate remains buildable before runtime rendering is implemented.
- Modify `codex-rs/tui/src/chatwidget.rs`
  - Add a small read-only helper near the existing context helper methods. It mirrors the `/status` card fallback shape for this item and deliberately avoids `status_line_total_usage()`.
- Modify `codex-rs/tui/src/chatwidget/tests/status_and_layout.rs`
  - Add tests proving the new item uses `last_token_usage`, displays `0 ctx` when `/status` would show default usage, and omits itself when `/status` would omit `Context window`.
- Modify `codex-rs/tui/src/chatwidget/tests/status_surface_previews.rs`
  - Add or update preview coverage so the setup UI can show `0 ctx`.
  - Review/accept snapshot updates if the Configure Status Line popup changes.

---

### Task 1: Add The Selectable Item And Preview Plumbing

**Files:**
- Modify: `codex-rs/tui/src/bottom_pane/status_line_setup.rs`
- Modify: `codex-rs/tui/src/bottom_pane/status_surface_preview.rs`
- Modify: `codex-rs/tui/src/bottom_pane/status_line_style.rs`
- Modify: `codex-rs/tui/src/chatwidget/status_surfaces.rs`
- Test: `codex-rs/tui/src/bottom_pane/status_line_setup.rs`

- [ ] **Step 1: Add failing enum coverage**

Add this test near `context_used_accepts_context_usage_legacy_id` in `codex-rs/tui/src/bottom_pane/status_line_setup.rs`:

```rust
#[test]
fn context_used_tokens_is_selectable_id() {
    assert_eq!(
        "context-used-tokens".parse::<StatusLineItem>(),
        Ok(StatusLineItem::ContextUsedTokens)
    );
    assert_eq!(
        StatusLineItem::ContextUsedTokens.description(),
        "Raw context-window tokens for the latest model request"
    );
}
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run from `codex-rs`:

```bash
cargo test -p codex-tui context_used_tokens_is_selectable_id
```

Expected: FAIL at compile time with an unresolved `StatusLineItem::ContextUsedTokens` variant. This first red step intentionally proves the new selectable enum surface does not exist yet; Task 2's red step is the runtime assertion failure after Task 1 leaves a compile-only placeholder.

- [ ] **Step 3: Add the status line item enum variant**

In `StatusLineItem`, insert the new variant immediately after `ContextUsed`:

```rust
    /// Raw context-window tokens for the latest model request.
    ContextUsedTokens,
```

In `StatusLineItem::description`, add:

```rust
            StatusLineItem::ContextUsedTokens => {
                "Raw context-window tokens for the latest model request"
            }
```

In `StatusLineItem::preview_item`, add:

```rust
            StatusLineItem::ContextUsedTokens => StatusSurfacePreviewItem::ContextUsedTokens,
```

In `StatusLineAccent::for_item` in `codex-rs/tui/src/bottom_pane/status_line_style.rs`, add the new item to the existing usage group:

```rust
            StatusLineItem::ContextRemaining
            | StatusLineItem::ContextUsed
            | StatusLineItem::ContextUsedTokens
            | StatusLineItem::ContextWindowSize
            | StatusLineItem::UsedTokens
            | StatusLineItem::TotalInputTokens
            | StatusLineItem::TotalOutputTokens => Self::Usage,
```

- [ ] **Step 4: Add the preview item**

In `StatusSurfacePreviewItem`, add `ContextUsedTokens` immediately after `ContextUsed`.

In `placeholder`, add:

```rust
            StatusSurfacePreviewItem::ContextUsedTokens => "0 ctx",
```

In `iter`, add:

```rust
            Self::ContextUsedTokens,
```

In `status_line_value_for_item` in `codex-rs/tui/src/chatwidget/status_surfaces.rs`, add this temporary compile-only arm immediately after `StatusLineItem::ContextUsed`:

```rust
            StatusLineItem::ContextUsedTokens => None,
```

In `status_surface_preview_value_for_item`, add this temporary compile-only arm immediately after `StatusSurfacePreviewItem::ContextUsed`:

```rust
            StatusSurfacePreviewItem::ContextUsedTokens => return None,
```

Task 2 replaces these placeholder arms with the real runtime mapping. They exist only so the crate stays buildable after adding exhaustive enum variants.

- [ ] **Step 5: Run the focused enum test and verify it passes**

Run from `codex-rs`:

```bash
cargo test -p codex-tui context_used_tokens_is_selectable_id
```

Expected: PASS.

---

### Task 2: Render The Runtime Status Line Value

**Files:**
- Modify: `codex-rs/tui/src/chatwidget.rs`
- Modify: `codex-rs/tui/src/chatwidget/status_surfaces.rs`
- Modify: `codex-rs/tui/src/chatwidget/tests/status_and_layout.rs`

- [ ] **Step 1: Add failing runtime tests**

Add these imports if they are not already present in `codex-rs/tui/src/chatwidget/tests/status_and_layout.rs`:

```rust
use crate::token_usage::TokenUsage;
use crate::token_usage::TokenUsageInfo;
```

Add these tests near the existing `status_line_context_used_*` tests:

```rust
#[tokio::test]
async fn status_line_context_used_tokens_matches_status_card_used_value() {
    let (mut chat, _rx, _op_rx) = make_chatwidget_manual(/*model_override*/ None).await;
    chat.config.tui_status_line = Some(vec![
        "context-used".to_string(),
        "context-used-tokens".to_string(),
    ]);

    chat.set_token_info(Some(TokenUsageInfo {
        // Sentinel: this item must not read session cumulative usage.
        total_token_usage: TokenUsage {
            total_tokens: 519_000,
            ..TokenUsage::default()
        },
        last_token_usage: TokenUsage {
            total_tokens: 130_000,
            ..TokenUsage::default()
        },
        model_context_window: Some(258_400),
    }));
    chat.refresh_status_line();

    assert_eq!(
        status_line_text(&chat),
        Some("Context 48% used · 130K ctx".to_string())
    );
}

#[tokio::test]
async fn status_line_context_used_tokens_is_valid_config_item() {
    let (mut chat, mut rx, _op_rx) = make_chatwidget_manual(/*model_override*/ None).await;
    chat.thread_id = Some(ThreadId::new());
    chat.config.model_context_window = Some(258_400);
    chat.config.tui_status_line = Some(vec!["context-used-tokens".to_string()]);

    chat.set_token_info(/*info*/ None);
    chat.refresh_status_line();

    assert_eq!(status_line_text(&chat), Some("0 ctx".to_string()));
    assert!(
        drain_insert_history(&mut rx).is_empty(),
        "context-used-tokens should parse as a valid status line item"
    );
}

#[tokio::test]
async fn status_line_context_used_tokens_displays_zero_for_configured_window_before_usage() {
    let (mut chat, _rx, _op_rx) = make_chatwidget_manual(/*model_override*/ None).await;
    chat.config.model_context_window = Some(258_400);
    chat.config.tui_status_line = Some(vec!["context-used-tokens".to_string()]);

    chat.set_token_info(/*info*/ None);
    chat.refresh_status_line();

    assert_eq!(status_line_text(&chat), Some("0 ctx".to_string()));
}

#[tokio::test]
async fn status_line_context_used_tokens_omits_when_status_card_would_omit_context_window() {
    let (mut chat, _rx, _op_rx) = make_chatwidget_manual(/*model_override*/ None).await;
    chat.config.model_context_window = Some(258_400);
    chat.config.tui_status_line = Some(vec!["context-used-tokens".to_string()]);

    chat.set_token_info(Some(TokenUsageInfo {
        // Sentinel: the helper should omit because the context window is unknown, not because
        // session cumulative usage is zero.
        total_token_usage: TokenUsage {
            total_tokens: 519_000,
            ..TokenUsage::default()
        },
        last_token_usage: TokenUsage {
            total_tokens: 130_000,
            ..TokenUsage::default()
        },
        model_context_window: None,
    }));
    chat.refresh_status_line();

    assert_eq!(status_line_text(&chat), None);
}
```

- `total_token_usage.total_tokens = 519_000` is intentional sentinel data. These tests should fail if the implementation accidentally reuses the `used-tokens`/session cumulative path instead of `last_token_usage`.

- [ ] **Step 2: Run the runtime tests and verify they fail**

Run from `codex-rs`:

```bash
cargo test -p codex-tui status_line_context_used_tokens
```

Expected: FAIL with assertion failures because Task 1 leaves `context-used-tokens` as a compile-only status line placeholder that renders no segment yet.

- [ ] **Step 3: Add a `/status`-aligned helper**

In the `impl ChatWidget` block that already contains `status_line_context_window_size`, add this helper near the other status line context helpers:

```rust
    fn status_line_context_used_tokens(&self) -> Option<i64> {
        match self.token_info.as_ref() {
            Some(info) => info
                .model_context_window
                .map(|_| info.last_token_usage.tokens_in_context_window()),
            None => self
                .config
                .model_context_window
                .map(|_| TokenUsage::default().tokens_in_context_window()),
        }
    }
```

Do not use `status_line_total_usage()` here. That helper returns `total_token_usage` and would make this item show session cumulative usage instead of the `/status` card's `used` value.

Keep `TokenUsage::default().tokens_in_context_window()` instead of hardcoding `0` in the fallback branch. The helper should stay structurally aligned with `/status`, which pairs default usage with `config.model_context_window` before reading `tokens_in_context_window()`.

- [ ] **Step 4: Render the new status line branch**

In `status_line_value_for_item`, replace the temporary `StatusLineItem::ContextUsedTokens => None` arm with:

```rust
            StatusLineItem::ContextUsedTokens => self
                .status_line_context_used_tokens()
                .map(|tokens| format!("{} ctx", format_tokens_compact(tokens))),
```

In `status_surface_preview_value_for_item`, replace the temporary `StatusSurfacePreviewItem::ContextUsedTokens => return None` arm with:

```rust
            StatusSurfacePreviewItem::ContextUsedTokens => StatusLineItem::ContextUsedTokens,
```

- [ ] **Step 5: Run the runtime tests and verify they pass**

Run from `codex-rs`:

```bash
cargo test -p codex-tui status_line_context_used_tokens
```

Expected: PASS.

---

### Task 3: Cover Setup Preview And Snapshots

**Files:**
- Modify: `codex-rs/tui/src/chatwidget/tests/status_surface_previews.rs`
- Potential snapshot updates under: `codex-rs/tui/src/chatwidget/snapshots/`

- [ ] **Step 1: Add focused preview coverage**

Add this test in `codex-rs/tui/src/chatwidget/tests/status_surface_previews.rs` near the other preview line tests:

```rust
#[tokio::test]
async fn status_surface_preview_lines_context_used_tokens_placeholder() {
    let (mut chat, _rx, _op_rx) = make_chatwidget_manual(/*model_override*/ None).await;

    let snapshot = combined_preview_snapshot(
        &mut chat,
        &[
            StatusLineItem::ContextUsed,
            StatusLineItem::ContextUsedTokens,
        ],
        &[TerminalTitleItem::Project],
    );

    assert_chatwidget_snapshot!(
        "status_surface_previews_context_used_tokens_placeholder",
        snapshot
    );
}
```

- [ ] **Step 2: Run the preview snapshot test**

Run from `codex-rs`:

```bash
cargo test -p codex-tui status_surface_preview_lines_context_used_tokens_placeholder
```

Expected on first run: either PASS if the snapshot already exists, or FAIL with a new `.snap.new` file.

- [ ] **Step 3: Review and accept the new snapshot**

If a `.snap.new` file was created, inspect it:

```bash
cargo insta pending-snapshots -p codex-tui
find codex-rs/tui/src/chatwidget/snapshots -maxdepth 1 -name '*.snap.new' -print -exec sed -n '1,220p' {} \;
```

Expected preview content must match this line exactly:

```text
status line: Context 0% used · 0 ctx
terminal title: my-project
```

Accept the snapshot only after confirming the content:

```bash
SNAPSHOT="$PWD/tui/src/chatwidget/snapshots/codex_tui__chatwidget__tests__status_surface_previews_context_used_tokens_placeholder.snap"
cargo insta accept -p codex-tui --snapshot "$SNAPSHOT"
```

- [ ] **Step 4: Run Configure Status Line popup snapshots**

Run from `codex-rs`:

```bash
cargo test -p codex-tui status_line_setup_popup
```

Expected: popup snapshots may change because the selectable item list now includes `context-used-tokens`.

- [ ] **Step 5: Review and accept popup snapshot updates**

If `.snap.new` files were created, inspect them:

```bash
cargo insta pending-snapshots -p codex-tui
```

Confirm the only pending snapshots are the intended `status_line_setup_popup_*` snapshots, and that the Configure Status Line list includes:

```text
context-used-tokens  Raw context-window tokens for the latest model request
```

Accept intended updates:

```bash
cargo insta accept -p codex-tui \
  --snapshot "$PWD/tui/src/chatwidget/snapshots/codex_tui__chatwidget__tests__status_line_setup_popup_live_only.snap" \
  --snapshot "$PWD/tui/src/chatwidget/snapshots/codex_tui__chatwidget__tests__status_line_setup_popup_hardcoded_only.snap" \
  --snapshot "$PWD/tui/src/chatwidget/snapshots/codex_tui__chatwidget__tests__status_line_setup_popup_mixed.snap"
```

---

### Task 4: Final Formatting And Targeted Verification

**Files:**
- Verify only the files touched by Tasks 1-3.

- [ ] **Step 1: Format Rust code**

Run from `codex-rs`:

```bash
just fmt
```

Expected: command completes successfully.

- [ ] **Step 2: Run targeted status line tests**

Run from `codex-rs`:

```bash
cargo test -p codex-tui status_line_context_used_tokens
cargo test -p codex-tui context_used_tokens_is_selectable_id
cargo test -p codex-tui status_surface_preview_lines_context_used_tokens_placeholder
```

Expected: all commands PASS.

- [ ] **Step 3: Run snapshot-adjacent popup tests**

Run from `codex-rs`:

```bash
cargo test -p codex-tui status_line_setup_popup
```

Expected: PASS after intended snapshots are accepted.

- [ ] **Step 4: Run scoped lint fix**

Run from `codex-rs`:

```bash
just fix -p codex-tui
```

Expected: command completes successfully. Per repo guidance, do not re-run tests only because `just fix` or `just fmt` ran; re-run only if `just fix` changes functional code in the touched area.

- [ ] **Step 5: Review final diff**

Run from repo root:

```bash
git diff -- codex-rs/tui/src/bottom_pane/status_line_setup.rs \
  codex-rs/tui/src/bottom_pane/status_surface_preview.rs \
  codex-rs/tui/src/bottom_pane/status_line_style.rs \
  codex-rs/tui/src/chatwidget.rs \
  codex-rs/tui/src/chatwidget/status_surfaces.rs \
  codex-rs/tui/src/chatwidget/tests/status_and_layout.rs \
  codex-rs/tui/src/chatwidget/tests/status_surface_previews.rs \
  codex-rs/tui/src/chatwidget/snapshots
```

Expected:

- No changes to `/status` card rendering.
- No changes to token usage data models.
- No changes to terminal title items.
- `context-used-tokens` uses `last_token_usage` and not `total_token_usage`.
- `0 ctx` displays when the context window is known and usage is default.

---

## Self-Review Checklist

- Spec coverage:
  - New item id `context-used-tokens`: Task 1.
  - Description text: Task 1.
  - User config parsing and invalid-item warning avoidance: Task 2.
  - `/status` parity and `last_token_usage`: Task 2.
  - `0 ctx` default usage behavior: Task 2.
  - Unknown context window omission: Task 2.
  - Preview/setup UI: Tasks 1 and 3.
  - Formatting and targeted tests: Task 4.
- Type consistency:
  - `StatusLineItem::ContextUsedTokens` maps to `StatusSurfacePreviewItem::ContextUsedTokens`.
  - `StatusLineItem::ContextUsedTokens` is included in the status line usage accent group.
  - Runtime value uses `TokenUsage::tokens_in_context_window()` and `format_tokens_compact`.
  - No terminal title enum is introduced.
- Risk notes:
  - The helper in Task 2 intentionally mirrors `/status` card fallback. It must not call `status_line_total_usage()`.
  - The percent item and token item remain intentionally non-convertible because the percent path subtracts `BASELINE_TOKENS` and the token path does not.
