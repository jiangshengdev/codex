use anyhow::Context;
use anyhow::Result;
use pretty_assertions::assert_eq;
use std::collections::BTreeMap;
use std::path::Path;
use std::path::PathBuf;

#[test]
fn browser_contract_fixtures_match_generated() -> Result<()> {
    let schema_root = schema_root()?;
    let fixture_tree = read_tree(&schema_root)?;
    let generated_tree = codex_gui_host::generate_browser_contract_fixture_tree_for_tests()
        .context("generate in-memory GUI Host browser contract fixtures")?;

    assert_eq!(
        fixture_tree, generated_tree,
        "vendored GUI Host browser contract fixtures differ from fresh generation; run `just write-gui-host-browser-contract`"
    );

    Ok(())
}

fn schema_root() -> Result<PathBuf> {
    let browser_contract =
        codex_utils_cargo_bin::find_resource!("schema/typescript/browserContract.ts")
            .context("resolve GUI Host browser contract fixture")?;
    browser_contract
        .parent()
        .and_then(Path::parent)
        .map(Path::to_path_buf)
        .context("derive GUI Host schema root")
}

fn read_tree(root: &Path) -> Result<BTreeMap<PathBuf, Vec<u8>>> {
    let mut files = BTreeMap::new();
    read_directory(root, root, &mut files)?;
    Ok(files)
}

fn read_directory(
    root: &Path,
    directory: &Path,
    files: &mut BTreeMap<PathBuf, Vec<u8>>,
) -> Result<()> {
    for entry in std::fs::read_dir(directory)
        .with_context(|| format!("read fixture directory {}", directory.display()))?
    {
        let entry = entry.with_context(|| format!("read entry in {}", directory.display()))?;
        let path = entry.path();
        if entry
            .file_type()
            .with_context(|| format!("read file type for {}", path.display()))?
            .is_dir()
        {
            read_directory(root, &path, files)?;
            continue;
        }

        let relative = path
            .strip_prefix(root)
            .with_context(|| format!("derive fixture path for {}", path.display()))?
            .to_path_buf();
        let bytes = std::fs::read(&path)
            .with_context(|| format!("read browser contract fixture {}", path.display()))?;
        files.insert(relative, bytes);
    }

    Ok(())
}
