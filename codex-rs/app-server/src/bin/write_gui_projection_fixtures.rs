#[cfg(unix)]
use std::path::PathBuf;

#[cfg(unix)]
use anyhow::Result;
#[cfg(unix)]
use clap::Parser;

#[cfg(unix)]
#[derive(Debug, Parser)]
#[command(about = "Regenerate GUI projection JSON fixtures")]
struct Args {
    /// Output directory for generated GUI projection fixtures.
    #[arg(long = "out-dir", value_name = "DIR")]
    out_dir: Option<PathBuf>,
}

#[cfg(unix)]
fn main() -> Result<()> {
    let args = Args::parse();
    let out_dir = args.out_dir.unwrap_or_else(default_out_dir);

    codex_app_server::write_gui_projection_fixtures(&out_dir)
}

#[cfg(unix)]
fn default_out_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../codex-gui/src/features/projection/__fixtures__")
}

#[cfg(not(unix))]
fn main() {
    std::process::exit(1);
}
