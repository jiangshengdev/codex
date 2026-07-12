use anyhow::anyhow;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum FetchDaclError {
    CreateFileW { code: u32 },
    GetSecurityInfo { code: u32 },
}

impl FetchDaclError {
    pub(super) fn create_file(code: u32) -> Self {
        Self::CreateFileW { code }
    }

    pub(super) fn get_security_info(code: u32) -> Self {
        Self::GetSecurityInfo { code }
    }

    pub(super) fn into_legacy_error(self, path: &Path) -> anyhow::Error {
        match self {
            Self::CreateFileW { .. } => {
                anyhow!("CreateFileW failed for {}", path.display())
            }
            Self::GetSecurityInfo { code } => {
                anyhow!("GetSecurityInfo failed for {}: {}", path.display(), code)
            }
        }
    }

    pub(super) fn into_attempt(self) -> AclMutationAttempt {
        let (api, code) = match self {
            Self::CreateFileW { code } => ("CreateFileW", code),
            Self::GetSecurityInfo { code } => ("GetSecurityInfo", code),
        };
        AclMutationAttempt::Failed {
            api,
            code,
            disposition: AclFailureDisposition::ReturnError,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum AclFailureDisposition {
    ReturnError,
    ReturnUnchanged,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum AclMutationAttempt {
    Changed,
    Unchanged,
    Failed {
        api: &'static str,
        code: u32,
        disposition: AclFailureDisposition,
    },
}

impl AclMutationAttempt {
    pub(crate) fn into_ensure_legacy_result(self, path: &Path) -> anyhow::Result<bool> {
        match self {
            Self::Failed {
                api: "CreateFileW",
                disposition: AclFailureDisposition::ReturnError,
                ..
            } => Err(anyhow!("CreateFileW failed for {}", path.display())),
            Self::Failed {
                api: "GetSecurityInfo",
                code,
                disposition: AclFailureDisposition::ReturnError,
            } => Err(anyhow!(
                "GetSecurityInfo failed for {}: {}",
                path.display(),
                code
            )),
            attempt => attempt.into_legacy_result(),
        }
    }

    pub(crate) fn into_legacy_result(self) -> anyhow::Result<bool> {
        match self {
            Self::Changed => Ok(true),
            Self::Unchanged => Ok(false),
            Self::Failed {
                api,
                code,
                disposition: AclFailureDisposition::ReturnError,
            } => Err(anyhow!("{api} failed: {code}")),
            Self::Failed {
                disposition: AclFailureDisposition::ReturnUnchanged,
                ..
            } => Ok(false),
        }
    }
}
