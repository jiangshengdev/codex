use std::collections::BTreeMap;
use std::fmt;
use std::io;
use std::path::Path;
use std::path::PathBuf;
use std::sync::atomic::AtomicU64;
use std::sync::atomic::Ordering;

use anyhow::Context;
use anyhow::Result;
use schemars::JsonSchema;
use schemars::schema_for;
use serde_json::Map;
use serde_json::Value;
use ts_rs::TS;

use crate::browser_contract::AUTHENTICATE_METHOD;
use crate::browser_contract::GuiAuthenticateParams;
use crate::browser_contract::GuiAuthenticateResult;
use crate::browser_contract::THREAD_QUERY_KEY;
use crate::browser_contract::TOKEN_FRAGMENT_KEY;
use crate::browser_contract::WEBSOCKET_PATH;

#[cfg(test)]
#[path = "browser_contract_fixtures_tests.rs"]
mod tests;

const GENERATED_HEADER: &str = "// GENERATED CODE! DO NOT MODIFY BY HAND!\n\n";
static NEXT_TEMPORARY_DIRECTORY_ID: AtomicU64 = AtomicU64::new(0);

pub fn generate_browser_contract_fixture_tree_for_tests() -> Result<BTreeMap<PathBuf, Vec<u8>>> {
    let mut files = BTreeMap::new();
    files.insert(
        PathBuf::from("typescript/browserContract.ts"),
        generate_typescript_contract()?.into_bytes(),
    );
    files.insert(
        PathBuf::from("json/GuiAuthenticateParams.json"),
        generate_json_schema::<GuiAuthenticateParams>()?,
    );
    files.insert(
        PathBuf::from("json/GuiAuthenticateResult.json"),
        generate_json_schema::<GuiAuthenticateResult>()?,
    );
    Ok(files)
}

pub fn write_browser_contract_fixtures(schema_root: &Path) -> Result<()> {
    write_browser_contract_fixture_tree(
        schema_root,
        generate_browser_contract_fixture_tree_for_tests()?,
    )
}

fn write_browser_contract_fixture_tree(
    schema_root: &Path,
    files: BTreeMap<PathBuf, Vec<u8>>,
) -> Result<()> {
    write_browser_contract_fixture_tree_with_rename(
        schema_root,
        files,
        &mut |source, destination| std::fs::rename(source, destination),
    )
}

fn write_browser_contract_fixture_tree_with_rename(
    schema_root: &Path,
    files: BTreeMap<PathBuf, Vec<u8>>,
    rename: &mut impl FnMut(&Path, &Path) -> io::Result<()>,
) -> Result<()> {
    let staging = unique_sibling_path(schema_root, "staging")?;
    let backup = unique_sibling_path(schema_root, "backup")?;
    replace_fixture_tree(schema_root, &staging, &backup, files, rename).with_context(|| {
        format!(
            "atomically replace browser contract fixtures at {} using backup {}",
            schema_root.display(),
            backup.display()
        )
    })
}

fn replace_fixture_tree(
    schema_root: &Path,
    staging: &Path,
    backup: &Path,
    files: BTreeMap<PathBuf, Vec<u8>>,
    rename: &mut impl FnMut(&Path, &Path) -> io::Result<()>,
) -> Result<()> {
    if let Err(error) = write_fixture_tree(staging, files) {
        let _ = std::fs::remove_dir_all(staging);
        return Err(error);
    }

    let had_destination = schema_root
        .try_exists()
        .with_context(|| format!("check fixture root {}", schema_root.display()))?;
    if had_destination && let Err(error) = rename(schema_root, backup) {
        let _ = std::fs::remove_dir_all(staging);
        return Err(error).with_context(|| {
            format!(
                "move existing fixture root {} to backup {}",
                schema_root.display(),
                backup.display()
            )
        });
    }

    if let Err(error) = rename(staging, schema_root) {
        let restore_error = if had_destination {
            rename(backup, schema_root).err()
        } else {
            None
        };
        let _ = std::fs::remove_dir_all(staging);
        return match restore_error {
            Some(restore_error) => Err(InstallAndRestoreError {
                staging: staging.to_path_buf(),
                destination: schema_root.to_path_buf(),
                install_error: error,
                restore_error: RestoreBackupError {
                    backup: backup.to_path_buf(),
                    destination: schema_root.to_path_buf(),
                    source: restore_error,
                },
            }
            .into()),
            None => Err(error).with_context(|| {
                format!(
                    "install staged fixtures from {} at {}",
                    staging.display(),
                    schema_root.display()
                )
            }),
        };
    }

    if had_destination {
        std::fs::remove_dir_all(backup)
            .with_context(|| format!("remove fixture backup {}", backup.display()))?;
    }
    Ok(())
}

#[derive(Debug)]
struct InstallAndRestoreError {
    staging: PathBuf,
    destination: PathBuf,
    install_error: io::Error,
    restore_error: RestoreBackupError,
}

impl fmt::Display for InstallAndRestoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "install staged fixtures from {} at {}: {}",
            self.staging.display(),
            self.destination.display(),
            self.install_error
        )
    }
}

impl std::error::Error for InstallAndRestoreError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(&self.restore_error)
    }
}

#[derive(Debug)]
struct RestoreBackupError {
    backup: PathBuf,
    destination: PathBuf,
    source: io::Error,
}

impl fmt::Display for RestoreBackupError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "restore backup {} at {}",
            self.backup.display(),
            self.destination.display()
        )
    }
}

impl std::error::Error for RestoreBackupError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(&self.source)
    }
}

fn write_fixture_tree(directory: &Path, files: BTreeMap<PathBuf, Vec<u8>>) -> Result<()> {
    std::fs::create_dir_all(directory)
        .with_context(|| format!("create fixture root {}", directory.display()))?;
    for (relative_path, contents) in files {
        let path = directory.join(relative_path);
        let parent = path
            .parent()
            .with_context(|| format!("derive parent directory for {}", path.display()))?;
        std::fs::create_dir_all(parent)
            .with_context(|| format!("create fixture directory {}", parent.display()))?;
        std::fs::write(&path, contents)
            .with_context(|| format!("write browser contract fixture {}", path.display()))?;
    }
    Ok(())
}

fn unique_sibling_path(destination: &Path, role: &str) -> Result<PathBuf> {
    let parent = destination
        .parent()
        .with_context(|| format!("derive parent directory for {}", destination.display()))?;
    let name = destination
        .file_name()
        .with_context(|| format!("derive directory name for {}", destination.display()))?
        .to_string_lossy();
    loop {
        let id = NEXT_TEMPORARY_DIRECTORY_ID.fetch_add(1, Ordering::Relaxed);
        let candidate = parent.join(format!(".{name}.{role}-{}-{id}", std::process::id()));
        if !candidate
            .try_exists()
            .with_context(|| format!("check temporary path {}", candidate.display()))?
        {
            return Ok(candidate);
        }
    }
}

fn generate_typescript_contract() -> Result<String> {
    let constants = [
        ("THREAD_QUERY_KEY", THREAD_QUERY_KEY),
        ("TOKEN_FRAGMENT_KEY", TOKEN_FRAGMENT_KEY),
        ("WEBSOCKET_PATH", WEBSOCKET_PATH),
        ("AUTHENTICATE_METHOD", AUTHENTICATE_METHOD),
    ];
    let mut output = String::from(GENERATED_HEADER);
    for (name, value) in constants {
        let value = serde_json::to_string(value).context("serialize browser contract constant")?;
        output.push_str(&format!("export const {name} = {value} as const;\n"));
    }
    output.push('\n');
    output.push_str(
        &GuiAuthenticateParams::export_to_string()
            .context("export GuiAuthenticateParams TypeScript")?,
    );
    output.push('\n');
    output.push_str(
        &GuiAuthenticateResult::export_to_string()
            .context("export GuiAuthenticateResult TypeScript")?,
    );
    if !output.ends_with('\n') {
        output.push('\n');
    }
    Ok(output)
}

fn generate_json_schema<T: JsonSchema>() -> Result<Vec<u8>> {
    let value =
        serde_json::to_value(schema_for!(T)).context("serialize browser contract schema")?;
    let canonical = canonicalize_json(&value);
    let mut bytes =
        serde_json::to_vec_pretty(&canonical).context("format browser contract schema")?;
    bytes.push(b'\n');
    Ok(bytes)
}

fn canonicalize_json(value: &Value) -> Value {
    match value {
        Value::Array(items) => Value::Array(items.iter().map(canonicalize_json).collect()),
        Value::Object(object) => {
            let mut entries = object.iter().collect::<Vec<_>>();
            entries.sort_by_key(|(key, _)| *key);
            let mut sorted = Map::with_capacity(object.len());
            for (key, value) in entries {
                sorted.insert(key.clone(), canonicalize_json(value));
            }
            Value::Object(sorted)
        }
        _ => value.clone(),
    }
}
