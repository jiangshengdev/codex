# Fork Status Line cdx Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make fork status-line configuration read and write only `<codex_home>/cdx/config.toml`, ignoring `tui.status_line` and `tui.status_line_use_colors` from the main user config.

**Architecture:** Keep normal config loading for all non-status-line settings, but split the two status-line runtime fields out into a small fork-specific config reader. TUI `/statusline` persistence writes the same two TOML keys to the fork-specific file path instead of the active user config path.

**Tech Stack:** Rust, `serde`, `toml`, existing `ConfigBuilder`, `ConfigEditsBuilder`, TUI app tests, `just test`.

---

## Files

- Create: `codex-rs/core/src/config/cdx_status_line_config.rs`
  - Owns the fork-only path helper and minimal TOML reader for `<codex_home>/cdx/config.toml`.
- Modify: `codex-rs/core/src/config/mod.rs`
  - Wires the fork-only reader into runtime `Config` construction.
  - Exports the path helper for TUI persistence.
- Modify: `codex-rs/core/src/config/config_tests.rs`
  - Adds config-loading tests proving main config status-line fields are ignored and cdx fields are honored.
- Modify: `codex-rs/tui/src/app/config_persistence.rs`
  - Adds a focused app method for persisting status-line settings to the cdx config path and updating in-memory state.
- Modify: `codex-rs/tui/src/app/event_dispatch.rs`
  - Delegates `AppEvent::StatusLineSetup` to the focused persistence method.
- Modify: `codex-rs/tui/src/app/tests.rs`
  - Adds a TUI persistence test proving `/statusline` writes only `<codex_home>/cdx/config.toml`.

---

### Task 1: Add cdx Status-Line Config Reader

**Files:**
- Create: `codex-rs/core/src/config/cdx_status_line_config.rs`
- Modify: `codex-rs/core/src/config/mod.rs`
- Test: `codex-rs/core/src/config/config_tests.rs`

- [ ] **Step 1: Write failing config-loading tests**

Add these tests near the existing TUI config tests in `codex-rs/core/src/config/config_tests.rs`:

```rust
#[tokio::test]
async fn cdx_status_line_config_ignores_main_user_config() -> anyhow::Result<()> {
    let codex_home = TempDir::new()?;
    tokio::fs::write(
        codex_home.path().join(CONFIG_TOML_FILE),
        r#"
[tui]
status_line = ["context-used-tokens"]
status_line_use_colors = false
"#,
    )
    .await?;

    let config = ConfigBuilder::without_managed_config_for_tests()
        .codex_home(codex_home.path().to_path_buf())
        .build()
        .await?;

    assert_eq!(config.tui_status_line, None);
    assert!(config.tui_status_line_use_colors);
    Ok(())
}

#[tokio::test]
async fn cdx_status_line_config_reads_fork_config() -> anyhow::Result<()> {
    let codex_home = TempDir::new()?;
    let cdx_config = codex_home.path().join("cdx").join(CONFIG_TOML_FILE);
    tokio::fs::create_dir_all(cdx_config.parent().expect("cdx config parent")).await?;
    tokio::fs::write(
        &cdx_config,
        r#"
[tui]
status_line = ["model-with-reasoning", "context-used-tokens"]
status_line_use_colors = false
"#,
    )
    .await?;

    let config = ConfigBuilder::without_managed_config_for_tests()
        .codex_home(codex_home.path().to_path_buf())
        .build()
        .await?;

    assert_eq!(
        config.tui_status_line,
        Some(vec![
            "model-with-reasoning".to_string(),
            "context-used-tokens".to_string()
        ])
    );
    assert!(!config.tui_status_line_use_colors);
    Ok(())
}

#[tokio::test]
async fn cdx_status_line_config_wins_over_main_user_config() -> anyhow::Result<()> {
    let codex_home = TempDir::new()?;
    tokio::fs::write(
        codex_home.path().join(CONFIG_TOML_FILE),
        r#"
[tui]
status_line = ["current-dir"]
status_line_use_colors = false
"#,
    )
    .await?;
    let cdx_config = codex_home.path().join("cdx").join(CONFIG_TOML_FILE);
    tokio::fs::create_dir_all(cdx_config.parent().expect("cdx config parent")).await?;
    tokio::fs::write(
        &cdx_config,
        r#"
[tui]
status_line = ["context-used-tokens"]
status_line_use_colors = true
"#,
    )
    .await?;

    let config = ConfigBuilder::without_managed_config_for_tests()
        .codex_home(codex_home.path().to_path_buf())
        .build()
        .await?;

    assert_eq!(
        config.tui_status_line,
        Some(vec!["context-used-tokens".to_string()])
    );
    assert!(config.tui_status_line_use_colors);
    Ok(())
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run from the repository root:

```bash
just test -p codex-core cdx_status_line_config
```

Expected: the new tests fail because `Config` still reads `tui_status_line` and `tui_status_line_use_colors` from the main user config and does not read `cdx/config.toml`.

- [ ] **Step 3: Add the focused cdx config module**

Create `codex-rs/core/src/config/cdx_status_line_config.rs`:

```rust
use std::path::Path;
use std::path::PathBuf;

use serde::Deserialize;

const CDX_CONFIG_DIR: &str = "cdx";

#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) struct CdxStatusLineConfig {
    pub(crate) status_line: Option<Vec<String>>,
    pub(crate) status_line_use_colors: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct CdxStatusLineConfigToml {
    tui: Option<CdxStatusLineTuiToml>,
}

#[derive(Debug, Deserialize)]
struct CdxStatusLineTuiToml {
    status_line: Option<Vec<String>>,
    status_line_use_colors: Option<bool>,
}

pub fn cdx_status_line_config_path(codex_home: &Path) -> PathBuf {
    codex_home.join(CDX_CONFIG_DIR).join(super::CONFIG_TOML_FILE)
}

pub(crate) async fn load_cdx_status_line_config(
    codex_home: &Path,
) -> std::io::Result<CdxStatusLineConfig> {
    let config_path = cdx_status_line_config_path(codex_home);
    let contents = match tokio::fs::read_to_string(&config_path).await {
        Ok(contents) => contents,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            return Ok(CdxStatusLineConfig::default());
        }
        Err(err) => return Err(err),
    };

    let config_toml = toml::from_str::<CdxStatusLineConfigToml>(&contents)
        .map_err(|err| std::io::Error::new(std::io::ErrorKind::InvalidData, err))?;
    let Some(tui) = config_toml.tui else {
        return Ok(CdxStatusLineConfig::default());
    };

    Ok(CdxStatusLineConfig {
        status_line: tui.status_line,
        status_line_use_colors: tui.status_line_use_colors,
    })
}
```

- [ ] **Step 4: Wire the module into `config/mod.rs`**

In `codex-rs/core/src/config/mod.rs`, add the module and export near the other config modules:

```rust
mod cdx_status_line_config;
pub use cdx_status_line_config::cdx_status_line_config_path;
```

Inside `Config::load_config_with_layer_stack`, after provider validation and before the final `Config` struct literal is built, load the fork-only status-line settings:

```rust
        let cdx_status_line_config =
            cdx_status_line_config::load_cdx_status_line_config(codex_home.as_path()).await?;
```

In the final `Config` struct literal, replace the two existing main-config-derived assignments:

```rust
            tui_status_line: cdx_status_line_config.status_line,
            tui_status_line_use_colors: cdx_status_line_config
                .status_line_use_colors
                .unwrap_or(true),
```

This deliberately ignores `cfg.tui.as_ref().and_then(|t| t.status_line.clone())` and `cfg.tui.as_ref().map(|t| t.status_line_use_colors)`.

- [ ] **Step 5: Run config tests**

Run:

```bash
just test -p codex-core cdx_status_line_config
```

Expected: the three new tests pass.

- [ ] **Step 6: Commit core loading change**

```bash
git add \
  codex-rs/core/src/config/cdx_status_line_config.rs \
  codex-rs/core/src/config/mod.rs \
  codex-rs/core/src/config/config_tests.rs
git commit -m "fix(config): load fork status line from cdx config"
```

---

### Task 2: Persist `/statusline` to cdx Config

**Files:**
- Modify: `codex-rs/tui/src/app/config_persistence.rs`
- Modify: `codex-rs/tui/src/app/event_dispatch.rs`
- Modify: `codex-rs/tui/src/app/tests.rs`

- [ ] **Step 1: Write failing TUI persistence test**

Add this test near other config persistence tests in `codex-rs/tui/src/app/tests.rs`:

```rust
#[tokio::test]
async fn status_line_setup_persists_only_to_cdx_config() -> Result<()> {
    let (mut app, _app_event_rx, _op_rx) = make_test_app_with_channels().await;
    let codex_home = tempdir()?;
    app.config.codex_home = codex_home.path().to_path_buf().abs();
    std::fs::write(
        codex_home.path().join("config.toml"),
        r#"
model = "gpt-5"

[tui]
status_line = ["current-dir"]
status_line_use_colors = false
"#,
    )?;

    app.persist_status_line_settings(
        vec![
            crate::bottom_pane::StatusLineItem::ModelWithReasoning,
            crate::bottom_pane::StatusLineItem::ContextUsedTokens,
        ],
        /*use_theme_colors*/ true,
    )
    .await;

    let main_config = std::fs::read_to_string(codex_home.path().join("config.toml"))?;
    assert!(main_config.contains(r#"status_line = ["current-dir"]"#));
    assert!(main_config.contains("status_line_use_colors = false"));

    let cdx_config = std::fs::read_to_string(
        codex_home.path().join("cdx").join("config.toml"),
    )?;
    let cdx_value = toml::from_str::<TomlValue>(&cdx_config)?;
    let tui = cdx_value
        .as_table()
        .and_then(|table| table.get("tui"))
        .and_then(TomlValue::as_table)
        .expect("cdx tui table should exist");

    assert_eq!(
        tui.get("status_line"),
        Some(&TomlValue::Array(vec![
            TomlValue::String("model-with-reasoning".to_string()),
            TomlValue::String("context-used-tokens".to_string()),
        ]))
    );
    assert_eq!(
        tui.get("status_line_use_colors"),
        Some(&TomlValue::Boolean(true))
    );
    assert_eq!(
        app.config.tui_status_line,
        Some(vec![
            "model-with-reasoning".to_string(),
            "context-used-tokens".to_string(),
        ])
    );
    assert!(app.config.tui_status_line_use_colors);
    Ok(())
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
just test -p codex-tui status_line_setup_persists_only_to_cdx_config
```

Expected: compilation fails because `persist_status_line_settings` does not exist.

- [ ] **Step 3: Add focused TUI persistence method**

In `codex-rs/tui/src/app/config_persistence.rs`, add this method inside `impl App`:

```rust
    pub(crate) async fn persist_status_line_settings(
        &mut self,
        items: Vec<crate::bottom_pane::StatusLineItem>,
        use_theme_colors: bool,
    ) {
        let ids = items.iter().map(ToString::to_string).collect::<Vec<_>>();
        let items_edit = crate::legacy_core::config::edit::status_line_items_edit(&ids);
        let colors_edit =
            crate::legacy_core::config::edit::status_line_use_colors_edit(use_theme_colors);
        let cdx_config_path =
            crate::legacy_core::config::cdx_status_line_config_path(&self.config.codex_home);
        let apply_result = ConfigEditsBuilder::for_config_path(&cdx_config_path)
            .with_edits([items_edit, colors_edit])
            .apply()
            .await;
        match apply_result {
            Ok(()) => {
                self.config.tui_status_line = Some(ids.clone());
                self.config.tui_status_line_use_colors = use_theme_colors;
                self.chat_widget.setup_status_line(items, use_theme_colors);
            }
            Err(err) => {
                tracing::error!(
                    error = %err,
                    path = %cdx_config_path.display(),
                    "failed to persist fork status line settings; keeping previous selection"
                );
                self.chat_widget.add_error_message(format!(
                    "Failed to save status line settings to {}: {err}",
                    cdx_config_path.display()
                ));
            }
        }
    }
```

This method is the single TUI write path for fork status-line settings. It does not use `ConfigEditsBuilder::for_config(&self.config)` and does not use `ConfigEditsBuilder::new(&self.config.codex_home)`.

- [ ] **Step 4: Delegate `AppEvent::StatusLineSetup` to the focused method**

In `codex-rs/tui/src/app/event_dispatch.rs`, replace the current `AppEvent::StatusLineSetup` branch body with:

```rust
            AppEvent::StatusLineSetup {
                items,
                use_theme_colors,
            } => {
                self.persist_status_line_settings(items, use_theme_colors)
                    .await;
            }
```

- [ ] **Step 5: Run TUI persistence test**

Run:

```bash
just test -p codex-tui status_line_setup_persists_only_to_cdx_config
```

Expected: the new test passes and `~/.codex/config.toml` remains unchanged in the test temp directory.

- [ ] **Step 6: Commit TUI persistence change**

```bash
git add \
  codex-rs/tui/src/app/config_persistence.rs \
  codex-rs/tui/src/app/event_dispatch.rs \
  codex-rs/tui/src/app/tests.rs
git commit -m "fix(tui): persist fork status line to cdx config"
```

---

### Task 3: Final Verification

**Files:**
- Verify: `codex-rs/core/src/config/cdx_status_line_config.rs`
- Verify: `codex-rs/core/src/config/mod.rs`
- Verify: `codex-rs/tui/src/app/config_persistence.rs`
- Verify: `codex-rs/tui/src/app/event_dispatch.rs`
- Verify: `codex-rs/core/src/config/config_tests.rs`
- Verify: `codex-rs/tui/src/app/tests.rs`

- [ ] **Step 1: Run formatter**

Run:

```bash
just fmt
```

Expected: formatting completes successfully. Do not re-run tests solely because formatting ran.

- [ ] **Step 2: Run targeted core tests**

Run:

```bash
just test -p codex-core cdx_status_line_config
```

Expected: all `cdx_status_line_config_*` tests pass.

- [ ] **Step 3: Run targeted TUI persistence test**

Run:

```bash
just test -p codex-tui status_line_setup_persists_only_to_cdx_config
```

Expected: the TUI persistence test passes.

- [ ] **Step 4: Run scoped lint fixes**

Run:

```bash
just fix -p codex-core
just fix -p codex-tui
```

Expected: lint fixes complete successfully. Per repo guidance, do not re-run tests after `fix` or `fmt`.

- [ ] **Step 5: Check for accidental main-config writes**

Run:

```bash
rg -n "StatusLineSetup|status_line_items_edit|status_line_use_colors_edit|cdx_status_line_config_path|for_config\\(&self\\.config\\)" codex-rs/tui/src/app codex-rs/core/src/config
```

Expected:

- `AppEvent::StatusLineSetup` delegates to `persist_status_line_settings`.
- `persist_status_line_settings` uses `cdx_status_line_config_path`.
- No `/statusline` save path uses `ConfigEditsBuilder::for_config(&self.config)`.

- [ ] **Step 6: Commit verification cleanup**

If `fmt` or `fix` changed files, commit them:

```bash
git add \
  codex-rs/core/src/config/cdx_status_line_config.rs \
  codex-rs/core/src/config/mod.rs \
  codex-rs/core/src/config/config_tests.rs \
  codex-rs/tui/src/app/config_persistence.rs \
  codex-rs/tui/src/app/event_dispatch.rs \
  codex-rs/tui/src/app/tests.rs
git commit -m "chore: format fork status line config changes"
```

If no files changed, skip this commit.

---

## Self-Review

- Spec coverage: The plan implements cdx-only read, cdx-only write, main config ignore behavior, missing-file defaults, and targeted tests.
- Scope: The plan does not modify official-version behavior and does not add a full config overlay.
- Type consistency: The plan uses `Config::tui_status_line`, `Config::tui_status_line_use_colors`, `StatusLineItem`, and `ConfigEditsBuilder::for_config_path` consistently.
- Verification: The plan uses targeted `just test -p codex-core` and `just test -p codex-tui` commands, plus formatter and scoped fix commands.
