use super::AceKind;
use super::AceSnapshot;
use super::AclSnapshotStage;
use super::DEFAULT_MAX_ACES_PER_PATH;
use super::DiagnosticError;
use super::DiagnosticStage;
use super::PathAclSnapshot;
use crate::path_normalization::canonicalize_path;
use crate::winutil::string_from_sid_bytes;
use crate::winutil::to_wide;
use std::ffi::c_void;
use std::mem::size_of;
use std::path::Path;
use windows_sys::Win32::Foundation::{
    CloseHandle, ERROR_SUCCESS, GetLastError, HANDLE, HLOCAL, INVALID_HANDLE_VALUE, LocalFree,
    PSID,
};
use windows_sys::Win32::Security::{
    ACE_HEADER, ACE_INHERITED_OBJECT_TYPE_PRESENT, ACE_OBJECT_TYPE_PRESENT, ACL,
    ACL_SIZE_INFORMATION, AclSizeInformation, Authorization::GetSecurityInfo,
    Authorization::SE_FILE_OBJECT, CopySid, DACL_SECURITY_INFORMATION, GetAce,
    GetAclInformation, GetLengthSid, GetSecurityDescriptorControl, GetSecurityDescriptorDacl,
    GetSecurityDescriptorLength, GetSecurityDescriptorOwner, IsValidSecurityDescriptor,
    IsValidSid, OWNER_SECURITY_INFORMATION, PSECURITY_DESCRIPTOR,
};
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, FILE_FLAG_BACKUP_SEMANTICS, FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE,
    OPEN_EXISTING, READ_CONTROL,
};
use windows_sys::Win32::System::SystemServices::{
    ACCESS_ALLOWED_ACE_TYPE, ACCESS_ALLOWED_CALLBACK_ACE_TYPE,
    ACCESS_ALLOWED_CALLBACK_OBJECT_ACE_TYPE, ACCESS_ALLOWED_OBJECT_ACE_TYPE,
    ACCESS_DENIED_ACE_TYPE, ACCESS_DENIED_CALLBACK_ACE_TYPE,
    ACCESS_DENIED_CALLBACK_OBJECT_ACE_TYPE, ACCESS_DENIED_OBJECT_ACE_TYPE,
};

const MIN_SID_BYTES: usize = 8;
struct FileHandle(HANDLE);

impl Drop for FileHandle {
    fn drop(&mut self) {
        if self.0 != 0 && self.0 != INVALID_HANDLE_VALUE {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
}

struct SecurityDescriptor(PSECURITY_DESCRIPTOR);

impl Drop for SecurityDescriptor {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                LocalFree(self.0 as HLOCAL);
            }
        }
    }
}

pub(crate) fn snapshot_path_security(
    path: &Path,
    stage: AclSnapshotStage,
) -> Result<PathAclSnapshot, DiagnosticError> {
    let canonical_path = canonicalize_path(path);
    let diagnostic_stage = diagnostic_stage(stage);
    let wide_path = to_wide(&canonical_path);
    let handle = unsafe {
        CreateFileW(
            wide_path.as_ptr(),
            READ_CONTROL,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            std::ptr::null_mut(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS,
            0,
        )
    };
    if handle == INVALID_HANDLE_VALUE {
        return Err(last_path_error(
            diagnostic_stage,
            &canonical_path,
            "CreateFileW",
        ));
    }
    let _handle = FileHandle(handle);

    let mut requested_owner: PSID = std::ptr::null_mut();
    let mut requested_dacl: *mut ACL = std::ptr::null_mut();
    let mut security_descriptor: PSECURITY_DESCRIPTOR = std::ptr::null_mut();
    let code = unsafe {
        GetSecurityInfo(
            handle,
            SE_FILE_OBJECT,
            OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION,
            &mut requested_owner,
            std::ptr::null_mut(),
            &mut requested_dacl,
            std::ptr::null_mut(),
            &mut security_descriptor,
        )
    };
    let _security_descriptor = SecurityDescriptor(security_descriptor);
    if code != ERROR_SUCCESS {
        return Err(path_error(
            diagnostic_stage,
            &canonical_path,
            "GetSecurityInfo",
            Some(code),
            win32_message(code),
        ));
    }
    if security_descriptor.is_null() {
        return Err(path_error(
            diagnostic_stage,
            &canonical_path,
            "GetSecurityInfo",
            None,
            "GetSecurityInfo returned a null security descriptor",
        ));
    }
    if unsafe { IsValidSecurityDescriptor(security_descriptor) } == 0 {
        return Err(path_error(
            diagnostic_stage,
            &canonical_path,
            "IsValidSecurityDescriptor",
            None,
            "GetSecurityInfo returned an invalid security descriptor",
        ));
    }
    let descriptor_len = unsafe { GetSecurityDescriptorLength(security_descriptor) } as usize;
    if descriptor_len == 0 {
        return Err(path_error(
            diagnostic_stage,
            &canonical_path,
            "GetSecurityDescriptorLength",
            None,
            "security descriptor length is zero",
        ));
    }
    let descriptor_start = security_descriptor as usize;
    let descriptor_end = descriptor_start.checked_add(descriptor_len).ok_or_else(|| {
        path_error(
            diagnostic_stage,
            &canonical_path,
            "GetSecurityDescriptorLength",
            None,
            "security descriptor address range overflow",
        )
    })?;

    let mut control = 0;
    let mut revision = 0;
    if unsafe { GetSecurityDescriptorControl(security_descriptor, &mut control, &mut revision) }
        == 0
    {
        return Err(last_path_error(
            diagnostic_stage,
            &canonical_path,
            "GetSecurityDescriptorControl",
        ));
    }

    let mut owner: PSID = std::ptr::null_mut();
    let mut owner_defaulted = 0;
    if unsafe { GetSecurityDescriptorOwner(security_descriptor, &mut owner, &mut owner_defaulted) }
        == 0
    {
        return Err(last_path_error(
            diagnostic_stage,
            &canonical_path,
            "GetSecurityDescriptorOwner",
        ));
    }
    let owner_sid = if owner.is_null() {
        None
    } else {
        Some(
            unsafe { snapshot_sid(owner, descriptor_start, descriptor_end) }
                .map_err(|error| with_path_context(error, diagnostic_stage, &canonical_path))?,
        )
    };

    let mut dacl_present = 0;
    let mut dacl: *mut ACL = std::ptr::null_mut();
    let mut dacl_defaulted = 0;
    if unsafe {
        GetSecurityDescriptorDacl(
            security_descriptor,
            &mut dacl_present,
            &mut dacl,
            &mut dacl_defaulted,
        )
    } == 0
    {
        return Err(last_path_error(
            diagnostic_stage,
            &canonical_path,
            "GetSecurityDescriptorDacl",
        ));
    }

    let (aces, total_aces) = match (dacl_present != 0, dacl.is_null()) {
        (false, _) => (Vec::new(), 0),
        (true, true) => (Vec::new(), 0),
        (true, false) => {
            let dacl_start = dacl as usize;
            if dacl_start < descriptor_start || dacl_start >= descriptor_end {
                return Err(path_error(
                    diagnostic_stage,
                    &canonical_path,
                    "GetSecurityDescriptorDacl",
                    None,
                    "DACL pointer is outside its security descriptor",
                ));
            }
            let dacl_allocation_len = descriptor_end - dacl_start;
            if dacl_allocation_len < size_of::<ACL>() {
                return Err(path_error(
                    diagnostic_stage,
                    &canonical_path,
                    "GetSecurityDescriptorDacl",
                    None,
                    "security descriptor does not contain a complete ACL header",
                ));
            }
            unsafe {
                snapshot_aces(dacl, dacl_allocation_len, DEFAULT_MAX_ACES_PER_PATH)
            }
            .map_err(|error| with_path_context(error, diagnostic_stage, &canonical_path))?
        }
    };
    let dacl_is_null = (dacl_present != 0).then_some(dacl.is_null());

    Ok(PathAclSnapshot {
        stage,
        path: canonical_path,
        owner_sid,
        control: Some(control),
        dacl_present: Some(dacl_present != 0),
        dacl_is_null,
        dacl_defaulted: (dacl_present != 0).then_some(dacl_defaulted != 0),
        aces,
        total_aces,
    })
}

unsafe fn snapshot_aces(
    dacl: *mut ACL,
    allocation_len: usize,
    max_aces: usize,
) -> Result<(Vec<AceSnapshot>, usize), DiagnosticError> {
    if dacl.is_null() {
        return Err(acl_error("GetAclInformation", None, "DACL pointer is null"));
    }

    if allocation_len < size_of::<ACL>() {
        return Err(acl_error("GetAclInformation", None, "ACL allocation is smaller than ACL"));
    }
    let acl = unsafe { std::ptr::read_unaligned(dacl) };
    let acl_size = acl.AclSize as usize;
    if acl_size < size_of::<ACL>() || acl_size > allocation_len {
        return Err(acl_error(
            "GetAclInformation",
            None,
            "ACL size is outside its security descriptor allocation",
        ));
    }

    let mut info: ACL_SIZE_INFORMATION = unsafe { std::mem::zeroed() };
    if unsafe {
        GetAclInformation(
            dacl,
            (&mut info as *mut ACL_SIZE_INFORMATION).cast::<c_void>(),
            size_of::<ACL_SIZE_INFORMATION>() as u32,
            AclSizeInformation,
        )
    } == 0
    {
        return Err(last_acl_error("GetAclInformation"));
    }

    let acl_start = dacl as usize;
    let acl_len = info.AclBytesInUse as usize;
    if acl_len < size_of::<ACL>() || acl_len > acl_size {
        return Err(acl_error(
            "GetAclInformation",
            None,
            "ACL bytes in use is outside ACL size",
        ));
    }
    let acl_end = acl_start.checked_add(acl_len).ok_or_else(|| {
        acl_error(
            "GetAclInformation",
            None,
            "ACL address range overflow",
        )
    })?;
    let first_ace_start = acl_start
        .checked_add(size_of::<ACL>())
        .ok_or_else(|| acl_error("GetAclInformation", None, "ACL header address overflow"))?;

    let total_aces = info.AceCount as usize;
    let mut snapshots = Vec::with_capacity(total_aces.min(max_aces));
    for index in 0..total_aces.min(max_aces) {
        let mut ace_ptr: *mut c_void = std::ptr::null_mut();
        if unsafe { GetAce(dacl, index as u32, &mut ace_ptr) } == 0 {
            return Err(last_acl_error("GetAce"));
        }
        if ace_ptr.is_null() {
            return Err(acl_error("GetAce", None, "GetAce returned a null ACE pointer"));
        }

        let ace_start = ace_ptr as usize;
        let header_end = ace_start
            .checked_add(size_of::<ACE_HEADER>())
            .ok_or_else(|| acl_error("GetAce", None, "ACE header address overflow"))?;
        if ace_start < first_ace_start || header_end > acl_end {
            return Err(acl_error(
                "GetAce",
                None,
                "ACE header extends beyond ACL bytes in use",
            ));
        }
        let header = unsafe { std::ptr::read_unaligned(ace_ptr.cast::<ACE_HEADER>()) };
        let ace_len = header.AceSize as usize;
        if ace_len < size_of::<ACE_HEADER>() {
            return Err(acl_error("GetAce", None, "ACE size is smaller than ACE_HEADER"));
        }
        let ace_end = ace_start
            .checked_add(ace_len)
            .ok_or_else(|| acl_error("GetAce", None, "ACE address range overflow"))?;
        if ace_end > acl_end {
            return Err(acl_error(
                "GetAce",
                None,
                "ACE extends beyond ACL bytes in use",
            ));
        }

        let ace_type = header.AceType;
        let Some((kind, object_ace)) = ace_kind(ace_type) else {
            snapshots.push(AceSnapshot {
                index: index as u32,
                kind: AceKind::Unknown(ace_type),
                sid: None,
                mask: None,
                flags: header.AceFlags,
                parse_error: Some(format!("unsupported ACE type {ace_type}")),
            });
            continue;
        };

        if ace_len < size_of::<ACE_HEADER>() + size_of::<u32>() {
            return Err(acl_error("GetAce", None, "ACE is too small to contain an access mask"));
        }
        let mask = unsafe {
            std::ptr::read_unaligned(
                (ace_ptr.cast::<u8>())
                    .add(size_of::<ACE_HEADER>())
                    .cast::<u32>(),
            )
        };
        let sid_offset = if object_ace {
            object_sid_offset(ace_ptr.cast::<u8>(), ace_len)?
        } else {
            size_of::<ACE_HEADER>() + size_of::<u32>()
        };
        if sid_offset >= ace_len {
            return Err(acl_error("GetAce", None, "ACE does not contain a SID"));
        }
        let sid = unsafe { ace_ptr.cast::<u8>().add(sid_offset) }.cast::<c_void>();
        let sid_string = unsafe { snapshot_ace_sid(sid, ace_len - sid_offset) }?;
        snapshots.push(AceSnapshot {
            index: index as u32,
            kind,
            sid: Some(sid_string),
            mask: Some(mask),
            flags: header.AceFlags,
            parse_error: None,
        });
    }
    Ok((snapshots, total_aces))
}

fn ace_kind(ace_type: u8) -> Option<(AceKind, bool)> {
    match ace_type as u32 {
        ACCESS_ALLOWED_ACE_TYPE | ACCESS_ALLOWED_CALLBACK_ACE_TYPE => {
            Some((AceKind::Allow, false))
        }
        ACCESS_DENIED_ACE_TYPE | ACCESS_DENIED_CALLBACK_ACE_TYPE => {
            Some((AceKind::Deny, false))
        }
        ACCESS_ALLOWED_OBJECT_ACE_TYPE | ACCESS_ALLOWED_CALLBACK_OBJECT_ACE_TYPE => {
            Some((AceKind::Allow, true))
        }
        ACCESS_DENIED_OBJECT_ACE_TYPE | ACCESS_DENIED_CALLBACK_OBJECT_ACE_TYPE => {
            Some((AceKind::Deny, true))
        }
        _ => None,
    }
}

fn object_sid_offset(ace: *const u8, ace_len: usize) -> Result<usize, DiagnosticError> {
    let flags_offset = size_of::<ACE_HEADER>() + size_of::<u32>();
    let base_sid_offset = flags_offset + size_of::<u32>();
    if ace_len < base_sid_offset {
        return Err(acl_error("GetAce", None, "object ACE is too small to contain flags"));
    }
    let flags = unsafe { std::ptr::read_unaligned(ace.add(flags_offset).cast::<u32>()) };
    let mut sid_offset = base_sid_offset;
    if flags & ACE_OBJECT_TYPE_PRESENT != 0 {
        sid_offset = sid_offset
            .checked_add(size_of::<windows_sys::core::GUID>())
            .ok_or_else(|| acl_error("GetAce", None, "object ACE SID offset overflow"))?;
    }
    if flags & ACE_INHERITED_OBJECT_TYPE_PRESENT != 0 {
        sid_offset = sid_offset
            .checked_add(size_of::<windows_sys::core::GUID>())
            .ok_or_else(|| acl_error("GetAce", None, "object ACE SID offset overflow"))?;
    }
    Ok(sid_offset)
}

unsafe fn snapshot_ace_sid(sid: PSID, remaining: usize) -> Result<String, DiagnosticError> {
    if sid.is_null() || remaining < MIN_SID_BYTES {
        return Err(acl_error("IsValidSid", None, "ACE does not contain a complete SID header"));
    }
    let sub_authority_count = unsafe { sid.cast::<u8>().add(1).read() } as usize;
    let sub_authorities_len = sub_authority_count
        .checked_mul(size_of::<u32>())
        .ok_or_else(|| acl_error("IsValidSid", None, "SID sub-authority length overflow"))?;
    let encoded_sid_len = MIN_SID_BYTES
        .checked_add(sub_authorities_len)
        .ok_or_else(|| acl_error("IsValidSid", None, "SID length overflow"))?;
    if encoded_sid_len > remaining {
        return Err(acl_error("IsValidSid", None, "SID extends beyond ACE size"));
    }
    if unsafe { IsValidSid(sid) } == 0 {
        return Err(acl_error("IsValidSid", None, "ACE contains an invalid SID"));
    }
    let sid_len = unsafe { GetLengthSid(sid) };
    if sid_len == 0 {
        return Err(acl_error("GetLengthSid", None, "validated ACE SID has zero length"));
    }
    if sid_len as usize != encoded_sid_len {
        return Err(acl_error("GetLengthSid", None, "SID length does not match its header"));
    }
    let sid_bytes = unsafe { copy_sid(sid, sid_len) }?;
    sid_string(&sid_bytes)
}

unsafe fn snapshot_sid(
    sid: PSID,
    descriptor_start: usize,
    descriptor_end: usize,
) -> Result<String, DiagnosticError> {
    if sid.is_null() {
        return Err(acl_error("GetSecurityDescriptorOwner", None, "owner SID is null"));
    }
    let sid_start = sid as usize;
    if sid_start < descriptor_start || sid_start >= descriptor_end {
        return Err(acl_error(
            "GetSecurityDescriptorOwner",
            None,
            "owner SID pointer is outside its security descriptor",
        ));
    }
    let remaining = descriptor_end - sid_start;
    if remaining < MIN_SID_BYTES {
        return Err(acl_error(
            "GetSecurityDescriptorOwner",
            None,
            "security descriptor does not contain a complete owner SID header",
        ));
    }
    let sub_authority_count = unsafe { sid.cast::<u8>().add(1).read() } as usize;
    let sub_authorities_len = sub_authority_count
        .checked_mul(size_of::<u32>())
        .ok_or_else(|| acl_error("GetSecurityDescriptorOwner", None, "owner SID length overflow"))?;
    let encoded_sid_len = MIN_SID_BYTES
        .checked_add(sub_authorities_len)
        .ok_or_else(|| acl_error("GetSecurityDescriptorOwner", None, "owner SID length overflow"))?;
    if encoded_sid_len > remaining {
        return Err(acl_error(
            "GetSecurityDescriptorOwner",
            None,
            "owner SID extends beyond its security descriptor",
        ));
    }
    if unsafe { IsValidSid(sid) } == 0 {
        return Err(acl_error("IsValidSid", None, "security descriptor contains an invalid SID"));
    }
    let sid_len = unsafe { GetLengthSid(sid) };
    if sid_len == 0 {
        return Err(acl_error("GetLengthSid", None, "validated owner SID has zero length"));
    }
    if sid_len as usize != encoded_sid_len {
        return Err(acl_error("GetLengthSid", None, "owner SID length does not match its header"));
    }
    let sid_bytes = unsafe { copy_sid(sid, sid_len) }?;
    sid_string(&sid_bytes)
}

unsafe fn copy_sid(sid: PSID, sid_len: u32) -> Result<Vec<u8>, DiagnosticError> {
    let mut sid_bytes = vec![0_u8; sid_len as usize];
    if unsafe { CopySid(sid_len, sid_bytes.as_mut_ptr().cast::<c_void>(), sid) } == 0 {
        return Err(last_acl_error("CopySid"));
    }
    Ok(sid_bytes)
}

fn sid_string(sid_bytes: &[u8]) -> Result<String, DiagnosticError> {
    string_from_sid_bytes(sid_bytes).map_err(|message| {
        let code = unsafe { GetLastError() };
        acl_error("ConvertSidToStringSidW", Some(code), message)
    })
}

fn diagnostic_stage(stage: AclSnapshotStage) -> DiagnosticStage {
    match stage {
        AclSnapshotStage::BeforeAcl => DiagnosticStage::BeforeAcl,
        AclSnapshotStage::AfterAcl => DiagnosticStage::AfterAcl,
    }
}

fn last_path_error(
    stage: DiagnosticStage,
    path: &Path,
    api: &'static str,
) -> DiagnosticError {
    let code = unsafe { GetLastError() };
    path_error(stage, path, api, Some(code), win32_message(code))
}

fn last_acl_error(api: &'static str) -> DiagnosticError {
    let code = unsafe { GetLastError() };
    acl_error(api, Some(code), win32_message(code))
}

fn path_error(
    stage: DiagnosticStage,
    path: &Path,
    api: &'static str,
    code: Option<u32>,
    message: impl Into<String>,
) -> DiagnosticError {
    DiagnosticError {
        stage,
        path: Some(path.to_path_buf()),
        api,
        code,
        message: message.into(),
    }
}

fn acl_error(
    api: &'static str,
    code: Option<u32>,
    message: impl Into<String>,
) -> DiagnosticError {
    DiagnosticError {
        stage: DiagnosticStage::BeforeAcl,
        path: None,
        api,
        code,
        message: message.into(),
    }
}

fn with_path_context(
    mut error: DiagnosticError,
    stage: DiagnosticStage,
    path: &Path,
) -> DiagnosticError {
    error.stage = stage;
    error.path = Some(path.to_path_buf());
    error
}

fn win32_message(code: u32) -> String {
    std::io::Error::from_raw_os_error(code as i32).to_string()
}
