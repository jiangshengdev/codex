use std::ffi::OsString;
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
        let mode = std::env::var("CODEX_GUI_HOST_MODE").ok();
        Self::for_profile_with_mode(mode)
    }

    pub(crate) fn for_profile_with_mode(mode: Option<String>) -> anyhow::Result<Self> {
        Self::for_profile_with_inputs(
            mode,
            std::env::var_os("CODEX_GUI_PACKAGE_ROOT"),
            std::env::var("CODEX_GUI_VITE_URL").ok(),
        )
    }

    #[cfg(test)]
    fn for_profile_with_env(
        mode: Result<String, std::env::VarError>,
        package_root: Option<OsString>,
        vite_origin: Option<String>,
    ) -> anyhow::Result<Self> {
        let mode = mode.ok();
        Self::for_profile_with_inputs(mode, package_root, vite_origin)
    }

    fn for_profile_with_inputs(
        mode: Option<String>,
        package_root: Option<OsString>,
        vite_origin: Option<String>,
    ) -> anyhow::Result<Self> {
        match mode.as_deref() {
            Some("dev") => Ok(Self::Dev(DevAssetProxyConfig::from_env_with(vite_origin))),
            Some("prod") => Ok(Self::Prod(ProdAssetConfig::from_env_with(package_root)?)),
            Some(mode) => anyhow::bail!(
                "invalid CODEX_GUI_HOST_MODE value {mode:?}; expected \"dev\" or \"prod\""
            ),
            None => {
                if cfg!(debug_assertions) {
                    Ok(Self::Dev(DevAssetProxyConfig::from_env_with(vite_origin)))
                } else {
                    Ok(Self::Prod(ProdAssetConfig::from_env_with(package_root)?))
                }
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
        Self {
            vite_origin: DEFAULT_VITE_ORIGIN.to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProdAssetConfig {
    pub package_root: PathBuf,
}

impl ProdAssetConfig {
    pub fn from_env() -> anyhow::Result<Self> {
        Self::from_env_with(std::env::var_os("CODEX_GUI_PACKAGE_ROOT"))
    }

    fn from_env_with(package_root: Option<OsString>) -> anyhow::Result<Self> {
        let package_root = package_root.context("CODEX_GUI_PACKAGE_ROOT is not set")?;
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
    use pretty_assertions::assert_eq;

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

    #[test]
    fn unset_mode_resolves_for_build_profile() {
        let mode = GuiHostMode::for_profile_with_inputs(
            /*mode*/ None,
            Some(OsString::from("package-root")),
            Some("http://localhost:5173".to_string()),
        )
        .expect("mode should resolve");

        let expected = if cfg!(debug_assertions) {
            GuiHostMode::Dev(DevAssetProxyConfig {
                vite_origin: "http://localhost:5173".to_string(),
            })
        } else {
            GuiHostMode::Prod(ProdAssetConfig {
                package_root: PathBuf::from("package-root"),
            })
        };
        assert_eq!(mode, expected);
    }

    #[test]
    fn dev_mode_selects_dev_without_package_root() {
        let mode = GuiHostMode::for_profile_with_inputs(
            Some("dev".to_string()),
            /*package_root*/ None,
            Some("http://localhost:5173".to_string()),
        )
        .expect("dev mode should resolve");

        assert_eq!(
            mode,
            GuiHostMode::Dev(DevAssetProxyConfig {
                vite_origin: "http://localhost:5173".to_string(),
            })
        );
    }

    #[test]
    fn prod_mode_requires_package_root() {
        let error = GuiHostMode::for_profile_with_inputs(
            Some("prod".to_string()),
            /*package_root*/ None,
            /*vite_origin*/ None,
        )
        .expect_err("prod mode should require package root");

        assert!(
            error.to_string().contains("CODEX_GUI_PACKAGE_ROOT"),
            "{error:#}"
        );
    }

    #[test]
    fn prod_mode_selects_prod_with_package_root() {
        let mode = GuiHostMode::for_profile_with_inputs(
            Some("prod".to_string()),
            Some(OsString::from("package-root")),
            /*vite_origin*/ None,
        )
        .expect("prod mode should resolve");

        assert_eq!(
            mode,
            GuiHostMode::Prod(ProdAssetConfig {
                package_root: PathBuf::from("package-root"),
            })
        );
    }

    #[test]
    fn invalid_mode_returns_error() {
        let error = GuiHostMode::for_profile_with_mode(Some("invalid".to_string()))
            .expect_err("invalid mode should fail");

        assert!(
            error
                .to_string()
                .contains("invalid CODEX_GUI_HOST_MODE value"),
            "{error:#}"
        );
    }

    #[test]
    fn non_unicode_mode_is_treated_like_unset() {
        let mode = GuiHostMode::for_profile_with_env(
            Err(std::env::VarError::NotUnicode(OsString::from(
                "not-unicode",
            ))),
            Some(OsString::from("package-root")),
            Some("http://localhost:5173".to_string()),
        )
        .expect("mode should resolve");

        let expected = if cfg!(debug_assertions) {
            GuiHostMode::Dev(DevAssetProxyConfig {
                vite_origin: "http://localhost:5173".to_string(),
            })
        } else {
            GuiHostMode::Prod(ProdAssetConfig {
                package_root: PathBuf::from("package-root"),
            })
        };
        assert_eq!(mode, expected);
    }
}
