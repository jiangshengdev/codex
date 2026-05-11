use std::path::PathBuf;

use anyhow::Context;

const DEFAULT_VITE_ORIGIN: &str = "http://127.0.0.1:5173";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GuiHostConfig {
    pub mode: GuiHostMode,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GuiHostMode {
    Dev(DevAssetProxyConfig),
    Prod(ProdAssetConfig),
}

impl GuiHostMode {
    pub fn default_for_profile() -> anyhow::Result<Self> {
        match std::env::var("CODEX_GUI_HOST_MODE").as_deref() {
            Ok("dev") => Ok(Self::Dev(DevAssetProxyConfig::from_env())),
            Ok("prod") => Ok(Self::Prod(ProdAssetConfig::from_env()?)),
            Ok(mode) => anyhow::bail!(
                "invalid CODEX_GUI_HOST_MODE value {mode:?}; expected \"dev\" or \"prod\""
            ),
            Err(std::env::VarError::NotPresent) => {
                if cfg!(debug_assertions) {
                    Ok(Self::Dev(DevAssetProxyConfig::from_env()))
                } else {
                    Ok(Self::Prod(ProdAssetConfig::from_env()?))
                }
            }
            Err(std::env::VarError::NotUnicode(_)) => {
                anyhow::bail!("CODEX_GUI_HOST_MODE is not valid Unicode")
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DevAssetProxyConfig {
    pub vite_origin: String,
}

impl DevAssetProxyConfig {
    pub fn from_env() -> Self {
        Self::from_env_with(std::env::var("CODEX_GUI_VITE_URL").ok())
    }

    fn from_env_with(vite_origin: Option<String>) -> Self {
        Self {
            vite_origin: vite_origin.unwrap_or_else(|| DEFAULT_VITE_ORIGIN.to_string()),
        }
    }
}

impl Default for DevAssetProxyConfig {
    fn default() -> Self {
        Self::from_env()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProdAssetConfig {
    pub package_root: PathBuf,
}

impl ProdAssetConfig {
    pub fn from_env() -> anyhow::Result<Self> {
        let package_root = std::env::var_os("CODEX_GUI_PACKAGE_ROOT")
            .context("CODEX_GUI_PACKAGE_ROOT is not set")?;
        Ok(Self {
            package_root: PathBuf::from(package_root),
        })
    }

    pub fn dist_dir(&self) -> PathBuf {
        self.package_root.join("dist")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dev_config_uses_default_vite_origin() {
        let config = DevAssetProxyConfig::from_env_with(/*vite_origin*/ None);

        assert_eq!(
            config,
            DevAssetProxyConfig {
                vite_origin: "http://127.0.0.1:5173".to_string(),
            }
        );
    }

    #[test]
    fn explicit_config_stores_mode() {
        let mode = GuiHostMode::Dev(DevAssetProxyConfig {
            vite_origin: "http://localhost:5173".to_string(),
        });

        assert_eq!(GuiHostConfig { mode: mode.clone() }.mode, mode);
    }
}
