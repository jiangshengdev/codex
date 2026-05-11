#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GuiHostMode {
    Dev(DevAssetProxyConfig),
    Prod(ProdAssetConfig),
}

impl GuiHostMode {
    pub fn default_for_profile() -> anyhow::Result<Self> {
        if cfg!(debug_assertions) {
            Ok(Self::Dev(DevAssetProxyConfig::default()))
        } else {
            Ok(Self::Prod(ProdAssetConfig::from_env()?))
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DevAssetProxyConfig {
    pub vite_origin: String,
}

impl Default for DevAssetProxyConfig {
    fn default() -> Self {
        Self {
            vite_origin: "http://127.0.0.1:5173".to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProdAssetConfig {
    pub package_root: std::path::PathBuf,
}

impl ProdAssetConfig {
    pub fn from_env() -> anyhow::Result<Self> {
        let Some(package_root) = std::env::var_os("CODEX_GUI_PACKAGE_ROOT") else {
            anyhow::bail!("CODEX_GUI_PACKAGE_ROOT is not set");
        };
        Ok(Self {
            package_root: std::path::PathBuf::from(package_root),
        })
    }
}

#[cfg(test)]
mod tests {
    use crate::GuiHostMode;

    #[test]
    fn crate_exports_gui_host_mode() {
        let mode = GuiHostMode::default_for_profile().expect("mode should resolve");
        assert!(matches!(mode, GuiHostMode::Dev(_) | GuiHostMode::Prod(_)));
    }
}
