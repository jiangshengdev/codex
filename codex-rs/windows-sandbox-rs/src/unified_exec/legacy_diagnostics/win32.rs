use super::DiagnosticError;
use super::DiagnosticStage;
use super::SidRole;
use super::SidSnapshot;
use super::TokenSnapshot;
use crate::winutil::string_from_sid_bytes;
use std::collections::BTreeSet;
use std::ffi::c_void;
use std::mem::align_of;
use std::mem::size_of;
use std::path::PathBuf;
use windows_sys::Win32::Foundation::GetLastError;
use windows_sys::Win32::Foundation::HANDLE;
use windows_sys::Win32::Foundation::PSID;
use windows_sys::Win32::Security::CopySid;
use windows_sys::Win32::Security::GetLengthSid;
use windows_sys::Win32::Security::GetTokenInformation;
use windows_sys::Win32::Security::IsValidSid;
use windows_sys::Win32::Security::SID_AND_ATTRIBUTES;
use windows_sys::Win32::Security::TOKEN_INFORMATION_CLASS;
use windows_sys::Win32::Security::TOKEN_USER;
use windows_sys::Win32::Security::TokenGroups;
use windows_sys::Win32::Security::TokenRestrictedSids;
use windows_sys::Win32::Security::TokenUser;

const SE_GROUP_LOGON_ID: u32 = 0xc000_0000;
const EVERYONE_SID: &str = "S-1-1-0";
const SID_HEADER_BYTES: usize = 8;

/// Captures token data into owned snapshots without taking ownership of `token`.
///
/// # Safety
///
/// `token` must be a valid token handle with query access for the duration of this call.
pub(crate) unsafe fn snapshot_token(
    token: HANDLE,
    capability_roots: &[(PathBuf, String)],
) -> Result<TokenSnapshot, DiagnosticError> {
    let capability_sids = capability_roots
        .iter()
        .map(|(_, sid)| sid.clone())
        .collect::<BTreeSet<_>>();

    let user_buffer = unsafe {
        query_token_information(token, TokenUser, "GetTokenInformation(TokenUser)")
    }?;
    if user_buffer.len() < size_of::<TOKEN_USER>() {
        return Err(invalid_token_data(
            "GetTokenInformation(TokenUser)",
            "TokenUser buffer is smaller than TOKEN_USER",
        ));
    }
    let token_user = unsafe {
        std::ptr::read_unaligned(user_buffer.as_ptr().cast::<TOKEN_USER>())
    };
    let user_sid_bytes = unsafe {
        copy_sid_bytes(
            token_user.User.Sid,
            &user_buffer,
            "GetTokenInformation(TokenUser)",
        )
    }?;
    let user_sid = sid_string(&user_sid_bytes)?;

    let groups_buffer = unsafe {
        query_token_information(token, TokenGroups, "GetTokenInformation(TokenGroups)")
    }?;
    let groups = unsafe {
        parse_sid_and_attributes(
            &groups_buffer,
            &capability_sids,
            "GetTokenInformation(TokenGroups)",
        )
    }?;

    let restricted_sids_buffer = unsafe {
        query_token_information(
            token,
            TokenRestrictedSids,
            "GetTokenInformation(TokenRestrictedSids)",
        )
    }?;
    let restricted_sids = unsafe {
        parse_sid_and_attributes(
            &restricted_sids_buffer,
            &capability_sids,
            "GetTokenInformation(TokenRestrictedSids)",
        )
    }?;

    Ok(TokenSnapshot {
        user: SidSnapshot {
            sid: user_sid,
            attributes: token_user.User.Attributes,
            roles: vec![SidRole::User],
        },
        groups,
        restricted_sids,
    })
}

unsafe fn query_token_information(
    token: HANDLE,
    class: TOKEN_INFORMATION_CLASS,
    api: &'static str,
) -> Result<Vec<u8>, DiagnosticError> {
    let mut needed = 0;
    unsafe {
        GetTokenInformation(token, class, std::ptr::null_mut(), 0, &mut needed);
    }
    if needed == 0 {
        return Err(last_win32_error(api));
    }

    let mut buffer = vec![0_u8; needed as usize];
    let result = unsafe {
        GetTokenInformation(
            token,
            class,
            buffer.as_mut_ptr().cast::<c_void>(),
            needed,
            &mut needed,
        )
    };
    if result == 0 {
        return Err(last_win32_error(api));
    }
    let returned_len = needed as usize;
    if returned_len > buffer.len() {
        return Err(invalid_token_data(
            api,
            "GetTokenInformation returned a length larger than its buffer",
        ));
    }
    buffer.truncate(returned_len);
    Ok(buffer)
}

unsafe fn parse_sid_and_attributes(
    buffer: &[u8],
    capability_sids: &BTreeSet<String>,
    api: &'static str,
) -> Result<Vec<SidSnapshot>, DiagnosticError> {
    if buffer.len() < size_of::<u32>() {
        return Err(invalid_token_data(
            api,
            "TOKEN_GROUPS buffer is smaller than GroupCount",
        ));
    }

    let group_count = unsafe { std::ptr::read_unaligned(buffer.as_ptr().cast::<u32>()) } as usize;
    if group_count == 0 {
        return Ok(Vec::new());
    }
    let buffer_start = buffer.as_ptr() as usize;
    let after_count = buffer_start
        .checked_add(size_of::<u32>())
        .ok_or_else(|| invalid_token_data(api, "TOKEN_GROUPS address overflow"))?;
    let alignment = align_of::<SID_AND_ATTRIBUTES>();
    let groups_start = after_count
        .checked_add(alignment - 1)
        .map(|address| address & !(alignment - 1))
        .ok_or_else(|| invalid_token_data(api, "TOKEN_GROUPS alignment overflow"))?;
    let groups_offset = groups_start
        .checked_sub(buffer_start)
        .ok_or_else(|| invalid_token_data(api, "TOKEN_GROUPS offset underflow"))?;
    let groups_len = group_count
        .checked_mul(size_of::<SID_AND_ATTRIBUTES>())
        .ok_or_else(|| invalid_token_data(api, "TOKEN_GROUPS element count overflow"))?;
    let groups_end = groups_offset
        .checked_add(groups_len)
        .ok_or_else(|| invalid_token_data(api, "TOKEN_GROUPS buffer length overflow"))?;
    if groups_end > buffer.len() {
        return Err(invalid_token_data(
            api,
            "TOKEN_GROUPS entries extend beyond the query buffer",
        ));
    }

    let groups_ptr = unsafe { buffer.as_ptr().add(groups_offset) }.cast::<SID_AND_ATTRIBUTES>();
    let mut snapshots = Vec::with_capacity(group_count);
    for index in 0..group_count {
        let entry = unsafe { std::ptr::read_unaligned(groups_ptr.add(index)) };
        let sid_bytes = unsafe { copy_sid_bytes(entry.Sid, buffer, api) }?;
        let sid = sid_string(&sid_bytes)?;
        snapshots.push(SidSnapshot {
            roles: sid_roles(&sid, entry.Attributes, capability_sids),
            sid,
            attributes: entry.Attributes,
        });
    }
    Ok(snapshots)
}

unsafe fn copy_sid_bytes(
    sid: PSID,
    container: &[u8],
    container_api: &'static str,
) -> Result<Vec<u8>, DiagnosticError> {
    if sid.is_null() {
        return Err(invalid_token_data(container_api, "SID pointer is null"));
    }

    let container_start = container.as_ptr() as usize;
    let container_end = container_start
        .checked_add(container.len())
        .ok_or_else(|| invalid_token_data(container_api, "SID container address overflow"))?;
    let sid_start = sid as usize;
    if sid_start < container_start || sid_start >= container_end {
        return Err(invalid_token_data(
            container_api,
            "SID pointer is outside its token information buffer",
        ));
    }
    let remaining = container_end - sid_start;
    if remaining < SID_HEADER_BYTES {
        return Err(invalid_token_data(
            container_api,
            "token information does not contain a complete SID header",
        ));
    }
    let sub_authority_count = unsafe { sid.cast::<u8>().add(1).read() } as usize;
    let sub_authorities_len = sub_authority_count
        .checked_mul(size_of::<u32>())
        .ok_or_else(|| invalid_token_data(container_api, "SID sub-authority length overflow"))?;
    let encoded_sid_len = SID_HEADER_BYTES
        .checked_add(sub_authorities_len)
        .ok_or_else(|| invalid_token_data(container_api, "SID length overflow"))?;
    if encoded_sid_len > remaining {
        return Err(invalid_token_data(
            container_api,
            "SID extends beyond its token information buffer",
        ));
    }

    if unsafe { IsValidSid(sid) } == 0 {
        return Err(invalid_token_data("IsValidSid", "token information contains an invalid SID"));
    }
    let sid_len = unsafe { GetLengthSid(sid) };
    if sid_len == 0 {
        return Err(last_win32_error("GetLengthSid"));
    }
    if sid_len as usize != encoded_sid_len {
        return Err(invalid_token_data(
            "GetLengthSid",
            "SID length does not match its header",
        ));
    }

    let mut sid_bytes = vec![0_u8; sid_len as usize];
    if unsafe { CopySid(sid_len, sid_bytes.as_mut_ptr().cast::<c_void>(), sid) } == 0 {
        return Err(last_win32_error("CopySid"));
    }
    Ok(sid_bytes)
}

fn sid_string(sid_bytes: &[u8]) -> Result<String, DiagnosticError> {
    string_from_sid_bytes(sid_bytes).map_err(|message| DiagnosticError {
        stage: DiagnosticStage::Token,
        path: None,
        api: "ConvertSidToStringSidW",
        code: None,
        message,
    })
}

fn sid_roles(
    sid: &str,
    attributes: u32,
    capability_sids: &BTreeSet<String>,
) -> Vec<SidRole> {
    let mut roles = Vec::new();
    if attributes & SE_GROUP_LOGON_ID == SE_GROUP_LOGON_ID {
        roles.push(SidRole::Logon);
    }
    if sid == EVERYONE_SID {
        roles.push(SidRole::Everyone);
    }
    if capability_sids.contains(sid) {
        roles.push(SidRole::Capability);
    }
    roles
}

fn last_win32_error(api: &'static str) -> DiagnosticError {
    let code = unsafe { GetLastError() };
    DiagnosticError {
        stage: DiagnosticStage::Token,
        path: None,
        api,
        code: Some(code),
        message: std::io::Error::from_raw_os_error(code as i32).to_string(),
    }
}

fn invalid_token_data(api: &'static str, message: impl Into<String>) -> DiagnosticError {
    DiagnosticError {
        stage: DiagnosticStage::Token,
        path: None,
        api,
        code: None,
        message: message.into(),
    }
}
