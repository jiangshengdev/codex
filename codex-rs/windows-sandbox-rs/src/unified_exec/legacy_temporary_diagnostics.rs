use crate::spawn_prep::RootCapabilitySid;
use crate::winutil::to_wide;
use std::collections::HashMap;
use std::ffi::c_void;
use std::mem::align_of;
use std::mem::size_of;
use std::path::Path;
use std::path::PathBuf;
use windows_sys::Win32::Foundation::ERROR_SUCCESS;
use windows_sys::Win32::Foundation::GetLastError;
use windows_sys::Win32::Foundation::HANDLE;
use windows_sys::Win32::Foundation::HLOCAL;
use windows_sys::Win32::Foundation::LocalFree;
use windows_sys::Win32::Foundation::PSID;
use windows_sys::Win32::Security::ACE_HEADER;
use windows_sys::Win32::Security::ACE_INHERITED_OBJECT_TYPE_PRESENT;
use windows_sys::Win32::Security::ACE_OBJECT_TYPE_PRESENT;
use windows_sys::Win32::Security::ACL;
use windows_sys::Win32::Security::ACL_SIZE_INFORMATION;
use windows_sys::Win32::Security::AclSizeInformation;
use windows_sys::Win32::Security::Authorization::ConvertSidToStringSidW;
use windows_sys::Win32::Security::Authorization::GetNamedSecurityInfoW;
use windows_sys::Win32::Security::Authorization::SE_FILE_OBJECT;
use windows_sys::Win32::Security::DACL_SECURITY_INFORMATION;
use windows_sys::Win32::Security::GetAce;
use windows_sys::Win32::Security::GetAclInformation;
use windows_sys::Win32::Security::GetLengthSid;
use windows_sys::Win32::Security::GetSecurityDescriptorControl;
use windows_sys::Win32::Security::GetSecurityDescriptorDacl;
use windows_sys::Win32::Security::GetSecurityDescriptorLength;
use windows_sys::Win32::Security::GetTokenInformation;
use windows_sys::Win32::Security::IsValidSid;
use windows_sys::Win32::Security::OWNER_SECURITY_INFORMATION;
use windows_sys::Win32::Security::PSECURITY_DESCRIPTOR;
use windows_sys::Win32::Security::SID_AND_ATTRIBUTES;
use windows_sys::Win32::Security::TOKEN_INFORMATION_CLASS;
use windows_sys::Win32::Security::TOKEN_USER;
use windows_sys::Win32::Security::TokenGroups;
use windows_sys::Win32::Security::TokenRestrictedSids;
use windows_sys::Win32::Security::TokenUser;
use windows_sys::Win32::System::SystemServices::ACCESS_ALLOWED_ACE_TYPE;
use windows_sys::Win32::System::SystemServices::ACCESS_ALLOWED_CALLBACK_ACE_TYPE;
use windows_sys::Win32::System::SystemServices::ACCESS_ALLOWED_CALLBACK_OBJECT_ACE_TYPE;
use windows_sys::Win32::System::SystemServices::ACCESS_ALLOWED_OBJECT_ACE_TYPE;
use windows_sys::Win32::System::SystemServices::ACCESS_DENIED_ACE_TYPE;
use windows_sys::Win32::System::SystemServices::ACCESS_DENIED_CALLBACK_ACE_TYPE;
use windows_sys::Win32::System::SystemServices::ACCESS_DENIED_CALLBACK_OBJECT_ACE_TYPE;
use windows_sys::Win32::System::SystemServices::ACCESS_DENIED_OBJECT_ACE_TYPE;

const SID_HEADER_BYTES: usize = 8;

struct SidFailure {
    api: &'static str,
    code: Option<u32>,
    message: &'static str,
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

pub(super) fn dump_path_acls(stage: &str, env_map: &HashMap<String, String>) {
    for key in [
        "DIAG_WORKSPACE",
        "WORKSPACE_DELETE",
        "PROTECTED_GIT_DIR",
        "DIAG_OUTSIDE_ROOT",
        "OUTSIDE_DELETE",
        "DIAG_TEMP_ROOT",
        "TEMP_DELETE",
        "DIAG_TMP_ROOT",
        "TMP_DELETE",
    ] {
        let Some(path) = env_map.get(key) else {
            eprintln!("acl stage={stage} key={key} missing_env");
            continue;
        };
        let include_ancestors = matches!(key, "DIAG_WORKSPACE" | "DIAG_OUTSIDE_ROOT");
        for path in paths_to_dump(Path::new(path), include_ancestors) {
            unsafe {
                dump_one_path_acl(stage, key, &path);
            }
        }
    }
}

fn paths_to_dump(path: &Path, include_ancestors: bool) -> Vec<PathBuf> {
    let mut paths = vec![path.to_path_buf()];
    let mut current = path;
    while let Some(parent) = current.parent() {
        if parent == current {
            break;
        }
        paths.push(parent.to_path_buf());
        if !include_ancestors {
            break;
        }
        current = parent;
    }
    paths
}

unsafe fn dump_one_path_acl(stage: &str, key: &str, path: &Path) {
    eprintln!(
        "acl stage={stage} key={key} path={} exists={}",
        path.display(),
        path.exists()
    );

    let mut requested_owner: PSID = std::ptr::null_mut();
    let mut requested_dacl: *mut ACL = std::ptr::null_mut();
    let mut security_descriptor: PSECURITY_DESCRIPTOR = std::ptr::null_mut();
    let code = unsafe {
        GetNamedSecurityInfoW(
            to_wide(path).as_ptr(),
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
        log_acl_error(
            stage,
            key,
            path,
            "GetNamedSecurityInfoW",
            Some(code),
            None,
            None,
        );
        return;
    }
    if security_descriptor.is_null() {
        log_acl_error(
            stage,
            key,
            path,
            "GetNamedSecurityInfoW",
            None,
            None,
            Some("null_security_descriptor"),
        );
        return;
    }

    let descriptor_len = unsafe { GetSecurityDescriptorLength(security_descriptor) } as usize;
    if descriptor_len == 0 {
        log_acl_error(
            stage,
            key,
            path,
            "GetSecurityDescriptorLength",
            Some(unsafe { GetLastError() }),
            None,
            Some("zero_security_descriptor_length"),
        );
        return;
    }
    let descriptor_start = security_descriptor as usize;
    let Some(descriptor_end) = descriptor_start.checked_add(descriptor_len) else {
        log_acl_error(
            stage,
            key,
            path,
            "GetSecurityDescriptorLength",
            None,
            None,
            Some("security_descriptor_range_overflow"),
        );
        return;
    };

    dump_acl_sid(
        stage,
        key,
        path,
        "owner",
        requested_owner,
        descriptor_start,
        descriptor_end,
        None,
    );

    let mut control = 0;
    let mut revision = 0;
    let control = if unsafe {
        GetSecurityDescriptorControl(security_descriptor, &mut control, &mut revision)
    } == 0
    {
        log_acl_error(
            stage,
            key,
            path,
            "GetSecurityDescriptorControl",
            Some(unsafe { GetLastError() }),
            None,
            None,
        );
        None
    } else {
        Some(control)
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
        log_acl_error(
            stage,
            key,
            path,
            "GetSecurityDescriptorDacl",
            Some(unsafe { GetLastError() }),
            None,
            None,
        );
        return;
    }
    let control = control.map_or_else(
        || "unavailable".to_string(),
        |control| format!("0x{control:04x}"),
    );
    eprintln!(
        "acl stage={stage} key={key} path={} dacl_present={} dacl_null={} dacl_defaulted={} control={control}",
        path.display(),
        dacl_present != 0,
        dacl.is_null(),
        dacl_defaulted != 0,
    );
    if dacl_present == 0 || dacl.is_null() {
        return;
    }
    let dacl_start = dacl as usize;
    if dacl_start < descriptor_start || dacl_start >= descriptor_end {
        log_acl_error(
            stage,
            key,
            path,
            "GetSecurityDescriptorDacl",
            None,
            None,
            Some("dacl_pointer_outside_security_descriptor"),
        );
        return;
    }
    unsafe {
        dump_aces(stage, key, path, dacl, descriptor_end - dacl_start);
    }
}

unsafe fn dump_aces(stage: &str, key: &str, path: &Path, dacl: *mut ACL, allocation_len: usize) {
    if allocation_len < size_of::<ACL>() {
        log_acl_error(
            stage,
            key,
            path,
            "GetAclInformation",
            None,
            None,
            Some("acl_header_outside_security_descriptor"),
        );
        return;
    }
    let acl = unsafe { std::ptr::read_unaligned(dacl) };
    let acl_size = acl.AclSize as usize;
    if acl_size < size_of::<ACL>() || acl_size > allocation_len {
        log_acl_error(
            stage,
            key,
            path,
            "GetAclInformation",
            None,
            None,
            Some("acl_size_outside_security_descriptor"),
        );
        return;
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
        log_acl_error(
            stage,
            key,
            path,
            "GetAclInformation",
            Some(unsafe { GetLastError() }),
            None,
            None,
        );
        return;
    }
    let acl_len = info.AclBytesInUse as usize;
    if acl_len < size_of::<ACL>() || acl_len > acl_size {
        log_acl_error(
            stage,
            key,
            path,
            "GetAclInformation",
            None,
            None,
            Some("acl_bytes_in_use_outside_acl_size"),
        );
        return;
    }
    let acl_start = dacl as usize;
    let Some(acl_end) = acl_start.checked_add(acl_len) else {
        log_acl_error(
            stage,
            key,
            path,
            "GetAclInformation",
            None,
            None,
            Some("acl_range_overflow"),
        );
        return;
    };

    for index in 0..info.AceCount {
        let mut ace_ptr: *mut c_void = std::ptr::null_mut();
        if unsafe { GetAce(dacl, index, &mut ace_ptr) } == 0 {
            log_acl_error(
                stage,
                key,
                path,
                "GetAce",
                Some(unsafe { GetLastError() }),
                Some(index),
                None,
            );
            continue;
        }
        unsafe {
            dump_ace(stage, key, path, index, ace_ptr, acl_start, acl_end);
        }
    }
}

unsafe fn dump_ace(
    stage: &str,
    key: &str,
    path: &Path,
    index: u32,
    ace_ptr: *mut c_void,
    acl_start: usize,
    acl_end: usize,
) {
    if ace_ptr.is_null() {
        log_acl_error(
            stage,
            key,
            path,
            "GetAce",
            None,
            Some(index),
            Some("null_ace_pointer"),
        );
        return;
    }
    let Some(first_ace_start) = acl_start.checked_add(size_of::<ACL>()) else {
        log_acl_error(
            stage,
            key,
            path,
            "GetAce",
            None,
            Some(index),
            Some("acl_header_range_overflow"),
        );
        return;
    };
    let ace_start = ace_ptr as usize;
    let Some(header_end) = ace_start.checked_add(size_of::<ACE_HEADER>()) else {
        log_acl_error(
            stage,
            key,
            path,
            "GetAce",
            None,
            Some(index),
            Some("ace_header_range_overflow"),
        );
        return;
    };
    if ace_start < first_ace_start || header_end > acl_end {
        log_acl_error(
            stage,
            key,
            path,
            "GetAce",
            None,
            Some(index),
            Some("ace_header_outside_acl"),
        );
        return;
    }
    let header = unsafe { std::ptr::read_unaligned(ace_ptr.cast::<ACE_HEADER>()) };
    let ace_len = header.AceSize as usize;
    let Some(ace_end) = ace_start.checked_add(ace_len) else {
        log_acl_error(
            stage,
            key,
            path,
            "GetAce",
            None,
            Some(index),
            Some("ace_range_overflow"),
        );
        return;
    };
    if ace_len < size_of::<ACE_HEADER>() || ace_end > acl_end {
        log_acl_error(
            stage,
            key,
            path,
            "GetAce",
            None,
            Some(index),
            Some("ace_size_outside_acl"),
        );
        return;
    }

    let ace_type = header.AceType;
    let (kind, object_ace) = ace_kind(ace_type);
    let mask = (ace_len >= size_of::<ACE_HEADER>() + size_of::<u32>()).then(|| unsafe {
        std::ptr::read_unaligned(
            ace_ptr
                .cast::<u8>()
                .add(size_of::<ACE_HEADER>())
                .cast::<u32>(),
        )
    });
    let mask_text = mask.map_or_else(|| "unavailable".to_string(), |mask| format!("0x{mask:08x}"));
    eprintln!(
        "acl stage={stage} key={key} path={} ace index={index} type={ace_type} kind={kind} mask={mask_text} flags=0x{:02x}",
        path.display(),
        header.AceFlags,
    );

    let Some(object_ace) = object_ace else {
        return;
    };
    let sid_offset = if object_ace {
        match object_sid_offset(ace_ptr.cast::<u8>(), ace_len) {
            Ok(offset) => offset,
            Err(message) => {
                log_acl_error(stage, key, path, "GetAce", None, Some(index), Some(message));
                return;
            }
        }
    } else {
        size_of::<ACE_HEADER>() + size_of::<u32>()
    };
    if sid_offset >= ace_len {
        log_acl_error(
            stage,
            key,
            path,
            "GetAce",
            None,
            Some(index),
            Some("sid_offset_outside_ace"),
        );
        return;
    }
    let sid = unsafe { ace_ptr.cast::<u8>().add(sid_offset) }.cast::<c_void>();
    dump_acl_sid(
        stage,
        key,
        path,
        "ace",
        sid,
        ace_start,
        ace_end,
        Some(index),
    );
}

fn ace_kind(ace_type: u8) -> (&'static str, Option<bool>) {
    match ace_type as u32 {
        ACCESS_ALLOWED_ACE_TYPE | ACCESS_ALLOWED_CALLBACK_ACE_TYPE => ("allow", Some(false)),
        ACCESS_DENIED_ACE_TYPE | ACCESS_DENIED_CALLBACK_ACE_TYPE => ("deny", Some(false)),
        ACCESS_ALLOWED_OBJECT_ACE_TYPE | ACCESS_ALLOWED_CALLBACK_OBJECT_ACE_TYPE => {
            ("allow", Some(true))
        }
        ACCESS_DENIED_OBJECT_ACE_TYPE | ACCESS_DENIED_CALLBACK_OBJECT_ACE_TYPE => {
            ("deny", Some(true))
        }
        _ => ("unknown", None),
    }
}

fn object_sid_offset(ace: *const u8, ace_len: usize) -> Result<usize, &'static str> {
    let flags_offset = size_of::<ACE_HEADER>() + size_of::<u32>();
    let base_sid_offset = flags_offset + size_of::<u32>();
    if ace_len < base_sid_offset {
        return Err("object_ace_missing_flags");
    }
    let flags = unsafe { std::ptr::read_unaligned(ace.add(flags_offset).cast::<u32>()) };
    let mut sid_offset = base_sid_offset;
    if flags & ACE_OBJECT_TYPE_PRESENT != 0 {
        sid_offset = sid_offset
            .checked_add(16)
            .ok_or("object_sid_offset_overflow")?;
    }
    if flags & ACE_INHERITED_OBJECT_TYPE_PRESENT != 0 {
        sid_offset = sid_offset
            .checked_add(16)
            .ok_or("object_sid_offset_overflow")?;
    }
    Ok(sid_offset)
}

fn dump_acl_sid(
    stage: &str,
    key: &str,
    path: &Path,
    role: &str,
    sid: PSID,
    region_start: usize,
    region_end: usize,
    index: Option<u32>,
) {
    let sid_bytes = match sid_bytes_in_region(sid, region_start, region_end) {
        Ok(bytes) => bytes,
        Err(error) => {
            log_acl_sid_error(stage, key, path, role, index, error);
            return;
        }
    };
    match sid_string(&sid_bytes) {
        Ok(sid) => match index {
            Some(index) => eprintln!(
                "acl stage={stage} key={key} path={} ace index={index} sid={sid}",
                path.display()
            ),
            None => eprintln!(
                "acl stage={stage} key={key} path={} owner_sid={sid}",
                path.display()
            ),
        },
        Err(error) => log_acl_sid_error(stage, key, path, role, index, error),
    }
}

fn sid_bytes_in_region(
    sid: PSID,
    region_start: usize,
    region_end: usize,
) -> Result<Vec<u8>, SidFailure> {
    if sid.is_null() {
        return Err(structure_failure("null_sid_pointer"));
    }
    let sid_start = sid as usize;
    if sid_start < region_start || sid_start >= region_end {
        return Err(structure_failure("sid_pointer_outside_region"));
    }
    let remaining = region_end - sid_start;
    if remaining < SID_HEADER_BYTES {
        return Err(structure_failure("incomplete_sid_header"));
    }
    let sub_authority_count = unsafe { sid.cast::<u8>().add(1).read() } as usize;
    let sid_len = SID_HEADER_BYTES
        .checked_add(
            sub_authority_count
                .checked_mul(size_of::<u32>())
                .ok_or_else(|| structure_failure("sid_sub_authority_length_overflow"))?,
        )
        .ok_or_else(|| structure_failure("sid_length_overflow"))?;
    if sid_len > remaining {
        return Err(structure_failure("sid_extends_beyond_region"));
    }
    if unsafe { IsValidSid(sid) } == 0 {
        return Err(SidFailure {
            api: "IsValidSid",
            code: Some(unsafe { GetLastError() }),
            message: "invalid_sid",
        });
    }
    let reported_sid_len = unsafe { GetLengthSid(sid) } as usize;
    let code = unsafe { GetLastError() };
    if reported_sid_len == 0 {
        return Err(SidFailure {
            api: "GetLengthSid",
            code: Some(code),
            message: "zero_sid_length",
        });
    }
    if reported_sid_len != sid_len {
        return Err(SidFailure {
            api: "GetLengthSid",
            code: Some(code),
            message: "sid_length_mismatch",
        });
    }
    Ok(unsafe { std::slice::from_raw_parts(sid.cast::<u8>(), sid_len) }.to_vec())
}

fn log_acl_sid_error(
    stage: &str,
    key: &str,
    path: &Path,
    role: &str,
    index: Option<u32>,
    error: SidFailure,
) {
    let SidFailure { api, code, message } = error;
    log_acl_error(stage, key, path, api, code, index, Some(message));
    if index.is_none() {
        eprintln!(
            "acl stage={stage} key={key} path={} owner_sid=unavailable role={role}",
            path.display()
        );
    }
}

fn log_acl_error(
    stage: &str,
    key: &str,
    path: &Path,
    api: &str,
    code: Option<u32>,
    index: Option<u32>,
    message: Option<&str>,
) {
    let code = code.map_or_else(|| "none".to_string(), |code| code.to_string());
    let index = index.map_or_else(String::new, |index| format!(" index={index}"));
    let message = message.map_or_else(String::new, |message| format!(" message={message}"));
    eprintln!(
        "legacy temporary diagnostics error api={api} stage={stage} key={key} path={} code={code}{index}{message}",
        path.display()
    );
}

/// Prints owned text derived from the exact token handle used for the legacy spawn.
///
/// # Safety
///
/// `token` must remain a valid token handle with query access for this call.
pub(super) unsafe fn dump_spawn_token(token: HANDLE, capability_roots: &[RootCapabilitySid]) {
    eprintln!("==== legacy temporary diagnostics: spawn token ====");
    unsafe {
        dump_token_class(token, TokenUser, "TokenUser");
        dump_token_class(token, TokenGroups, "TokenGroups");
        dump_token_class(token, TokenRestrictedSids, "TokenRestrictedSids");
    }
    for root in capability_roots {
        eprintln!(
            "capability_root path={} sid={}",
            root.root.display(),
            root.sid_str
        );
    }
}

unsafe fn dump_token_class(token: HANDLE, class: TOKEN_INFORMATION_CLASS, class_name: &str) {
    let Some(buffer) = (unsafe { query_token_information(token, class, class_name) }) else {
        return;
    };
    if class == TokenUser {
        dump_token_user(&buffer, class_name);
    } else {
        unsafe {
            dump_token_groups(&buffer, class_name);
        }
    }
}

unsafe fn query_token_information(
    token: HANDLE,
    class: TOKEN_INFORMATION_CLASS,
    class_name: &str,
) -> Option<Vec<u8>> {
    let mut needed = 0;
    unsafe {
        GetTokenInformation(token, class, std::ptr::null_mut(), 0, &mut needed);
    }
    if needed == 0 {
        let code = unsafe { GetLastError() };
        eprintln!(
            "legacy temporary diagnostics error api=GetTokenInformation class={class_name} code={code}"
        );
        return None;
    }

    let mut buffer = vec![0_u8; needed as usize];
    let ok = unsafe {
        GetTokenInformation(
            token,
            class,
            buffer.as_mut_ptr().cast::<c_void>(),
            needed,
            &mut needed,
        )
    };
    if ok == 0 {
        let code = unsafe { GetLastError() };
        eprintln!(
            "legacy temporary diagnostics error api=GetTokenInformation class={class_name} code={code}"
        );
        return None;
    }
    let returned_len = needed as usize;
    if returned_len > buffer.len() {
        eprintln!(
            "legacy temporary diagnostics error api=GetTokenInformation class={class_name} code=none message=returned_length_exceeds_buffer"
        );
        return None;
    }
    buffer.truncate(returned_len);
    Some(buffer)
}

fn dump_token_user(buffer: &[u8], class_name: &str) {
    if buffer.len() < size_of::<TOKEN_USER>() {
        log_structure_error(class_name, "buffer_smaller_than_TOKEN_USER");
        return;
    }
    let user = unsafe { std::ptr::read_unaligned(buffer.as_ptr().cast::<TOKEN_USER>()) };
    dump_sid(class_name, None, user.User.Sid, buffer);
}

unsafe fn dump_token_groups(buffer: &[u8], class_name: &str) {
    if buffer.len() < size_of::<u32>() {
        log_structure_error(class_name, "buffer_smaller_than_GroupCount");
        return;
    }
    let count = unsafe { std::ptr::read_unaligned(buffer.as_ptr().cast::<u32>()) } as usize;
    if count == 0 {
        return;
    }
    let buffer_start = buffer.as_ptr() as usize;
    let Some(after_count) = buffer_start.checked_add(size_of::<u32>()) else {
        log_structure_error(class_name, "group_address_overflow");
        return;
    };
    let alignment = align_of::<SID_AND_ATTRIBUTES>();
    let Some(groups_start) = after_count
        .checked_add(alignment - 1)
        .map(|address| address & !(alignment - 1))
    else {
        log_structure_error(class_name, "group_alignment_overflow");
        return;
    };
    let Some(groups_offset) = groups_start.checked_sub(buffer_start) else {
        log_structure_error(class_name, "group_offset_underflow");
        return;
    };
    let Some(groups_len) = count.checked_mul(size_of::<SID_AND_ATTRIBUTES>()) else {
        log_structure_error(class_name, "group_count_overflow");
        return;
    };
    let Some(groups_end) = groups_offset.checked_add(groups_len) else {
        log_structure_error(class_name, "group_length_overflow");
        return;
    };
    if groups_end > buffer.len() {
        log_structure_error(class_name, "groups_extend_beyond_buffer");
        return;
    }

    let groups = unsafe { buffer.as_ptr().add(groups_offset) }.cast::<SID_AND_ATTRIBUTES>();
    for index in 0..count {
        let entry = unsafe { std::ptr::read_unaligned(groups.add(index)) };
        dump_sid(
            class_name,
            Some((index, entry.Attributes)),
            entry.Sid,
            buffer,
        );
    }
}

fn dump_sid(class_name: &str, details: Option<(usize, u32)>, sid: PSID, buffer: &[u8]) {
    let sid_bytes = match sid_bytes_in_buffer(sid, buffer) {
        Ok(sid_bytes) => sid_bytes,
        Err(error) => {
            log_sid_error(class_name, details.map(|(index, _)| index), error);
            return;
        }
    };
    match sid_string(sid_bytes) {
        Ok(sid) => match details {
            Some((index, attributes)) => eprintln!(
                "token class={class_name} index={index} sid={sid} attributes=0x{attributes:08x}"
            ),
            None => eprintln!("token class={class_name} sid={sid}"),
        },
        Err(error) => log_sid_error(class_name, details.map(|(index, _)| index), error),
    }
}

fn sid_bytes_in_buffer(sid: PSID, buffer: &[u8]) -> Result<&[u8], SidFailure> {
    if sid.is_null() {
        return Err(structure_failure("null_sid_pointer"));
    }
    let buffer_start = buffer.as_ptr() as usize;
    let buffer_end = buffer_start
        .checked_add(buffer.len())
        .ok_or_else(|| structure_failure("buffer_address_overflow"))?;
    let sid_start = sid as usize;
    if sid_start < buffer_start || sid_start >= buffer_end {
        return Err(structure_failure("sid_pointer_outside_buffer"));
    }
    let remaining = buffer_end - sid_start;
    if remaining < SID_HEADER_BYTES {
        return Err(structure_failure("incomplete_sid_header"));
    }
    let sub_authority_count = unsafe { sid.cast::<u8>().add(1).read() } as usize;
    let sub_authorities_len = sub_authority_count
        .checked_mul(size_of::<u32>())
        .ok_or_else(|| structure_failure("sid_sub_authority_length_overflow"))?;
    let sid_len = SID_HEADER_BYTES
        .checked_add(sub_authorities_len)
        .ok_or_else(|| structure_failure("sid_length_overflow"))?;
    if sid_len > remaining {
        return Err(structure_failure("sid_extends_beyond_buffer"));
    }
    if unsafe { IsValidSid(sid) } == 0 {
        let code = unsafe { GetLastError() };
        return Err(SidFailure {
            api: "IsValidSid",
            code: Some(code),
            message: "invalid_sid",
        });
    }
    let reported_sid_len = unsafe { GetLengthSid(sid) } as usize;
    let get_length_sid_code = unsafe { GetLastError() };
    if reported_sid_len == 0 {
        return Err(SidFailure {
            api: "GetLengthSid",
            code: Some(get_length_sid_code),
            message: "zero_sid_length",
        });
    }
    if reported_sid_len != sid_len {
        return Err(SidFailure {
            api: "GetLengthSid",
            code: Some(get_length_sid_code),
            message: "sid_length_mismatch",
        });
    }
    let sid_offset = sid_start - buffer_start;
    let sid_end = sid_offset
        .checked_add(sid_len)
        .ok_or_else(|| structure_failure("sid_slice_end_overflow"))?;
    buffer
        .get(sid_offset..sid_end)
        .ok_or_else(|| structure_failure("sid_slice_outside_buffer"))
}

fn sid_string(sid_bytes: &[u8]) -> Result<String, SidFailure> {
    let mut string_sid: *mut u16 = std::ptr::null_mut();
    let ok = unsafe { ConvertSidToStringSidW(sid_bytes.as_ptr() as *mut c_void, &mut string_sid) };
    if ok == 0 || string_sid.is_null() {
        let code = unsafe { GetLastError() };
        if !string_sid.is_null() {
            unsafe {
                LocalFree(string_sid as HLOCAL);
            }
        }
        return Err(SidFailure {
            api: "ConvertSidToStringSidW",
            code: Some(code),
            message: "sid_conversion_failed",
        });
    }
    let mut len = 0;
    unsafe {
        while *string_sid.add(len) != 0 {
            len += 1;
        }
    }
    let sid = unsafe { String::from_utf16_lossy(std::slice::from_raw_parts(string_sid, len)) };
    unsafe {
        LocalFree(string_sid as HLOCAL);
    }
    Ok(sid)
}

fn structure_failure(message: &'static str) -> SidFailure {
    SidFailure {
        api: "SID",
        code: None,
        message,
    }
}

fn log_sid_error(class_name: &str, index: Option<usize>, error: SidFailure) {
    let SidFailure { api, code, message } = error;
    let code = code.map_or_else(|| "none".to_string(), |code| code.to_string());
    if let Some(index) = index {
        eprintln!(
            "legacy temporary diagnostics error api={api} class={class_name} index={index} code={code} message={message}"
        );
    } else {
        eprintln!(
            "legacy temporary diagnostics error api={api} class={class_name} code={code} message={message}"
        );
    }
}

fn log_structure_error(class_name: &str, message: &str) {
    eprintln!(
        "legacy temporary diagnostics error api=parse_token class={class_name} code=none message={message}"
    );
}
