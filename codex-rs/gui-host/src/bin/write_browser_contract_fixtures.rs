use std::path::PathBuf;

use anyhow::Context;

fn main() -> anyhow::Result<()> {
    let schema_root = std::env::args_os()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("schema"));
    codex_gui_host::write_browser_contract_fixtures(&schema_root).with_context(|| {
        format!(
            "failed to regenerate GUI Host browser contract fixtures under {}",
            schema_root.display()
        )
    })
}
