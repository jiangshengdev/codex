use std::collections::BTreeMap;
use std::path::Path;
use std::path::PathBuf;

use anyhow::Context;
use anyhow::Result;
use pretty_assertions::assert_eq;

use super::write_browser_contract_fixture_tree;
use super::write_browser_contract_fixture_tree_with_rename;

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

#[test]
fn install_rename_failure_restores_existing_destination_and_cleans_temporary_directories()
-> Result<()> {
    let temp_dir = tempfile::tempdir().context("create temporary fixture parent")?;
    let schema_root = temp_dir.path().join("schema");
    std::fs::create_dir_all(schema_root.join("json"))?;
    std::fs::write(schema_root.join("json/existing.json"), b"existing\0bytes\n")?;
    std::fs::write(schema_root.join("keep.txt"), b"keep\r\n")?;
    let before = read_tree(&schema_root)?;

    let mut generated = BTreeMap::new();
    generated.insert(PathBuf::from("replacement.txt"), b"replacement\n".to_vec());
    let mut rename_calls = 0;

    let error = write_browser_contract_fixture_tree_with_rename(
        &schema_root,
        generated,
        &mut |source, destination| {
            rename_calls += 1;
            if rename_calls == 2 {
                return Err(std::io::Error::other("injected install rename failure"));
            }
            std::fs::rename(source, destination)
        },
    )
    .expect_err("install rename should fail");

    assert_eq!(rename_calls, 3);
    assert_eq!(read_tree(&schema_root)?, before);
    assert_eq!(read_directory_names(temp_dir.path())?, vec!["schema"]);
    assert!(
        error
            .chain()
            .any(|message| message.to_string().contains("install staged fixtures")),
        "error should identify the failed install rename: {error:#}"
    );
    Ok(())
}

#[test]
fn install_and_restore_rename_failures_preserve_backup_path_in_error_chain() -> Result<()> {
    let temp_dir = tempfile::tempdir().context("create temporary fixture parent")?;
    let schema_root = temp_dir.path().join("schema");
    std::fs::create_dir_all(schema_root.join("json"))?;
    std::fs::write(schema_root.join("json/existing.json"), b"existing\n")?;
    let before = read_tree(&schema_root)?;

    let mut generated = BTreeMap::new();
    generated.insert(PathBuf::from("replacement.txt"), b"replacement\n".to_vec());
    let mut rename_calls = 0;
    let mut backup_path = None;

    let error = write_browser_contract_fixture_tree_with_rename(
        &schema_root,
        generated,
        &mut |source, destination| {
            rename_calls += 1;
            match rename_calls {
                1 => {
                    backup_path = Some(destination.to_path_buf());
                    std::fs::rename(source, destination)
                }
                2 => Err(std::io::Error::other("injected install rename failure")),
                3 => Err(std::io::Error::other("injected restore rename failure")),
                _ => unreachable!("unexpected rename call"),
            }
        },
    )
    .expect_err("install and restore renames should fail");

    let backup_path = backup_path.context("capture backup path")?;
    assert_eq!(rename_calls, 3);
    assert!(!schema_root.exists());
    assert_eq!(read_tree(&backup_path)?, before);
    assert_eq!(
        read_directory_names(temp_dir.path())?,
        vec![
            backup_path
                .file_name()
                .context("derive backup directory name")?
                .to_string_lossy()
                .into_owned()
        ]
    );

    let chain = error.chain().map(ToString::to_string).collect::<Vec<_>>();
    assert!(
        chain
            .iter()
            .any(|message| message.contains("injected install rename failure")),
        "error chain should retain the install failure: {error:#}"
    );
    assert!(
        chain
            .iter()
            .any(|message| message.contains("injected restore rename failure")),
        "error chain should retain the restore failure: {error:#}"
    );
    assert!(
        chain
            .iter()
            .any(|message| message.contains(&backup_path.display().to_string())),
        "error chain should retain the backup path: {error:#}"
    );
    Ok(())
}

fn read_directory_names(directory: &Path) -> Result<Vec<String>> {
    let mut names = std::fs::read_dir(directory)?
        .map(|entry| Ok(entry?.file_name().to_string_lossy().into_owned()))
        .collect::<Result<Vec<_>>>()?;
    names.sort();
    Ok(names)
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
