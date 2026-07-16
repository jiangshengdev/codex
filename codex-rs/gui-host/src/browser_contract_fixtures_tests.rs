use std::collections::BTreeMap;
use std::path::Path;
use std::path::PathBuf;

use anyhow::Context;
use anyhow::Result;
use pretty_assertions::assert_eq;

use super::write_browser_contract_fixture_tree;

#[test]
fn staging_write_failure_preserves_existing_destination_tree() -> Result<()> {
    let temp_dir = tempfile::tempdir().context("create temporary fixture parent")?;
    let schema_root = temp_dir.path().join("schema");
    std::fs::create_dir_all(schema_root.join("json"))?;
    std::fs::write(schema_root.join("json/existing.json"), b"existing\n")?;
    std::fs::write(schema_root.join("keep.txt"), b"keep\n")?;
    let before = read_tree(&schema_root)?;

    let mut generated = BTreeMap::new();
    generated.insert(PathBuf::from("first.txt"), b"first\n".to_vec());
    generated.insert(PathBuf::from("first.txt/child.txt"), b"child\n".to_vec());

    let error = write_browser_contract_fixture_tree(&schema_root, generated)
        .expect_err("staging write should fail when a parent path is already a file");

    assert_eq!(read_tree(&schema_root)?, before);
    assert!(
        error.to_string().contains("backup"),
        "error should report the backup path: {error:#}"
    );
    Ok(())
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
    for entry in std::fs::read_dir(directory)? {
        let entry = entry?;
        let path = entry.path();
        if entry.file_type()?.is_dir() {
            read_directory(root, &path, files)?;
        } else {
            files.insert(path.strip_prefix(root)?.to_path_buf(), std::fs::read(path)?);
        }
    }
    Ok(())
}
