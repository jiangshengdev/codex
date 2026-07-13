use anyhow::Context;
use anyhow::Result;
use serde::Deserialize;
use serde::Serialize;
use std::ffi::c_void;
use std::fs;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;
use std::path::PathBuf;
use std::process::Command;
use windows_sys::Win32::Foundation::ERROR_INSUFFICIENT_BUFFER;
use windows_sys::Win32::Foundation::GetLastError;
use windows_sys::Win32::Foundation::HLOCAL;
use windows_sys::Win32::Foundation::LocalFree;
use windows_sys::Win32::Security::Authorization::ConvertSidToStringSidW;
use windows_sys::Win32::Security::Authorization::ConvertStringSidToSidW;
use windows_sys::Win32::Security::LookupAccountNameW;
use windows_sys::Win32::Security::SID_NAME_USE;

pub(super) const ACL_MATRIX_MANIFEST_ENV: &str = "CODEX_WINDOWS_LEGACY_ACL_MATRIX_MANIFEST";
pub(super) const ACL_MATRIX_SCRIPT_ENV: &str = "CODEX_WINDOWS_LEGACY_ACL_MATRIX_SCRIPT";

const DIAGNOSTICS_DIR_ENV: &str = "CODEX_WINDOWS_LEGACY_DELETE_DIAGNOSTICS_DIR";
const DIAGNOSTICS_TARGET_ENV: &str = "CODEX_WINDOWS_LEGACY_DELETE_DIAGNOSTICS_TARGET";
const WINDOWS_X64_TARGET: &str = "x86_64-pc-windows-msvc";
const MATRIX_VERSION: &str = "acl-matrix-v1";

const DELETE: u32 = 0x0001_0000;
const FILE_DELETE_CHILD: u32 = 0x0000_0040;
const READ_CONTROL: u32 = 0x0002_0000;
const SYNCHRONIZE: u32 = 0x0010_0000;
const FILE_READ_ATTRIBUTES: u32 = 0x0000_0080;
const OBJECT_INHERIT_ACE: u8 = 0x01;
const CONTAINER_INHERIT_ACE: u8 = 0x02;
const INHERIT_ONLY_ACE: u8 = 0x08;
const INHERITED_ACE: u8 = 0x10;
const MODIFY_MASK: u32 = 0x0013_01bf;
const BASE_OBJECT_MASK: u32 = READ_CONTROL | SYNCHRONIZE | FILE_READ_ATTRIBUTES;
const BASE_PARENT_MASK: u32 = BASE_OBJECT_MASK | 0x0000_0021;
const PARENT_SETUP_MASK: u32 = 0x0000_0022;

pub(super) struct PreparedAclMatrix {
    pub manifest_path: PathBuf,
    pub script_path: PathBuf,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct MatrixManifest {
    schema: u32,
    matrix_version: String,
    root: PathBuf,
    sids: ResolvedSids,
    cases: Vec<CaseManifest>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct ResolvedSids {
    runner_user: String,
    authenticated_users: String,
    everyone: String,
    system: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct CaseManifest {
    family: String,
    case_name: String,
    parent_path: PathBuf,
    object_path: PathBuf,
    expected_parent_descriptor: DescriptorSpec,
    expected_object_descriptor: DescriptorSpec,
    setup_status: SetupStatus,
    setup_error: Option<DiagnosticError>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum SetupStatus {
    Pending,
    Ok,
    SetupError,
    SetupMismatch,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
struct DescriptorSpec {
    owner_sid: String,
    dacl_protected: bool,
    dacl_auto_inherited: bool,
    aces: Vec<AceSpec>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
struct AceSpec {
    ace_type: String,
    mask: u32,
    flags: u8,
    trustee_sid: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct DiagnosticError {
    stage: String,
    api: String,
    code: Option<u32>,
    message: String,
}

pub(super) fn diagnostics_enabled() -> bool {
    std::env::var_os(DIAGNOSTICS_DIR_ENV).is_some()
        && std::env::var(DIAGNOSTICS_TARGET_ENV).as_deref() == Ok(WINDOWS_X64_TARGET)
        && cfg!(target_arch = "x86_64")
}

pub(super) fn prepare_acl_matrix(test_root: &Path, runner_user: &str) -> Result<PreparedAclMatrix> {
    let matrix_root = test_root.join("acl-matrix");
    let manifest_path = matrix_root.join("manifest.json");
    let script_path = matrix_root.join("acl-matrix.ps1");
    fs::create_dir_all(&matrix_root).context("create ACL matrix root")?;
    fs::write(&script_path, ACL_MATRIX_SCRIPT).context("write ACL matrix PowerShell script")?;

    let resolved_sids = resolve_required_sids(runner_user)?;
    let cases = build_case_manifests(&matrix_root, &resolved_sids);
    let manifest = MatrixManifest {
        schema: 1,
        matrix_version: MATRIX_VERSION.to_string(),
        root: matrix_root,
        sids: resolved_sids,
        cases,
    };
    fs::write(&manifest_path, serde_json::to_vec_pretty(&manifest)?)
        .context("write ACL matrix manifest")?;
    run_script_mode(&script_path, "Setup", &manifest_path)?;

    let updated: MatrixManifest = serde_json::from_slice(
        &fs::read(&manifest_path).context("read updated ACL matrix manifest")?,
    )
    .context("parse updated ACL matrix manifest")?;
    anyhow::ensure!(updated.schema == 1, "unexpected ACL matrix schema");
    anyhow::ensure!(
        updated.matrix_version == MATRIX_VERSION,
        "unexpected ACL matrix version"
    );
    anyhow::ensure!(
        updated.cases.len() == 12,
        "ACL matrix must contain 12 cases"
    );

    Ok(PreparedAclMatrix {
        manifest_path,
        script_path,
    })
}

pub(super) fn child_probe_command() -> String {
    format!(
        "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"%{ACL_MATRIX_SCRIPT_ENV}%\" -Mode Probe -Manifest \"%{ACL_MATRIX_MANIFEST_ENV}%\""
    )
}

fn build_case_manifests(root: &Path, sids: &ResolvedSids) -> Vec<CaseManifest> {
    vec![
        case(
            root,
            "inheritance",
            "inherited_user",
            inherited_parent(sids, &sids.runner_user),
            descriptor(
                &sids.runner_user,
                false,
                true,
                inherited_object_aces(sids, &sids.runner_user),
            ),
        ),
        case(
            root,
            "inheritance",
            "explicit_user_unprotected",
            base_parent(sids),
            descriptor(
                &sids.runner_user,
                false,
                false,
                object_aces(sids, Some((&sids.runner_user, MODIFY_MASK, 0))),
            ),
        ),
        case(
            root,
            "inheritance",
            "explicit_user_protected",
            base_parent(sids),
            descriptor(
                &sids.runner_user,
                true,
                false,
                object_aces(sids, Some((&sids.runner_user, MODIFY_MASK, 0))),
            ),
        ),
        case(
            root,
            "trustee",
            "inherited_runner_user",
            inherited_parent(sids, &sids.runner_user),
            inherited_modify_object(sids, &sids.runner_user),
        ),
        case(
            root,
            "trustee",
            "inherited_authenticated_users",
            inherited_parent(sids, &sids.authenticated_users),
            inherited_modify_object(sids, &sids.authenticated_users),
        ),
        case(
            root,
            "trustee",
            "inherited_everyone",
            inherited_parent(sids, &sids.everyone),
            inherited_modify_object(sids, &sids.everyone),
        ),
        case(
            root,
            "owner",
            "owner_runner_user",
            base_parent(sids),
            explicit_modify_object(sids, &sids.runner_user),
        ),
        case(
            root,
            "owner",
            "owner_system",
            base_parent(sids),
            explicit_modify_object(sids, &sids.system),
        ),
        delete_path_case(root, sids, "object_only", true, false),
        delete_path_case(root, sids, "parent_only", false, true),
        delete_path_case(root, sids, "neither", false, false),
        delete_path_case(root, sids, "both", true, true),
    ]
}

fn case(
    root: &Path,
    family: &str,
    case_name: &str,
    expected_parent_descriptor: DescriptorSpec,
    expected_object_descriptor: DescriptorSpec,
) -> CaseManifest {
    let parent_path = root.join(family).join(case_name);
    CaseManifest {
        family: family.to_string(),
        case_name: case_name.to_string(),
        object_path: parent_path.join("delete-me.txt"),
        parent_path,
        expected_parent_descriptor,
        expected_object_descriptor,
        setup_status: SetupStatus::Pending,
        setup_error: None,
    }
}

fn delete_path_case(
    root: &Path,
    sids: &ResolvedSids,
    case_name: &str,
    object_delete: bool,
    parent_delete_child: bool,
) -> CaseManifest {
    let parent_extra = parent_delete_child.then_some((&*sids.everyone, FILE_DELETE_CHILD, 0));
    let object_extra = object_delete.then_some((&*sids.everyone, DELETE, 0));
    case(
        root,
        "delete-path",
        case_name,
        descriptor(
            &sids.runner_user,
            true,
            false,
            parent_aces(sids, parent_extra),
        ),
        descriptor(
            &sids.runner_user,
            true,
            false,
            object_aces(sids, object_extra),
        ),
    )
}

fn base_parent(sids: &ResolvedSids) -> DescriptorSpec {
    descriptor(&sids.runner_user, true, false, parent_aces(sids, None))
}

fn inherited_modify_object(sids: &ResolvedSids, trustee: &str) -> DescriptorSpec {
    descriptor(
        &sids.runner_user,
        false,
        true,
        inherited_object_aces(sids, trustee),
    )
}

fn inherited_parent(sids: &ResolvedSids, trustee: &str) -> DescriptorSpec {
    let source_flags = OBJECT_INHERIT_ACE | INHERIT_ONLY_ACE;
    let mut aces = parent_aces(sids, None);
    aces.push(allow_ace(&sids.everyone, BASE_OBJECT_MASK, source_flags));
    aces.push(allow_ace(trustee, MODIFY_MASK, source_flags));
    descriptor(&sids.runner_user, true, false, aces)
}

fn inherited_object_aces(sids: &ResolvedSids, trustee: &str) -> Vec<AceSpec> {
    vec![
        allow_ace(&sids.everyone, BASE_OBJECT_MASK, INHERITED_ACE),
        allow_ace(trustee, MODIFY_MASK, INHERITED_ACE),
    ]
}

fn explicit_modify_object(sids: &ResolvedSids, owner: &str) -> DescriptorSpec {
    descriptor(
        owner,
        true,
        false,
        object_aces(sids, Some((&sids.runner_user, MODIFY_MASK, 0))),
    )
}

fn parent_aces(sids: &ResolvedSids, extra: Option<(&str, u32, u8)>) -> Vec<AceSpec> {
    let mut result = vec![
        allow_ace(&sids.everyone, BASE_PARENT_MASK, 0),
        allow_ace(&sids.runner_user, PARENT_SETUP_MASK, 0),
    ];
    if let Some((trustee, mask, flags)) = extra {
        result.push(allow_ace(trustee, mask, flags));
    }
    result
}

fn object_aces(sids: &ResolvedSids, extra: Option<(&str, u32, u8)>) -> Vec<AceSpec> {
    aces(&sids.everyone, BASE_OBJECT_MASK, extra)
}

fn aces(base_trustee: &str, base_mask: u32, extra: Option<(&str, u32, u8)>) -> Vec<AceSpec> {
    let mut result = vec![allow_ace(base_trustee, base_mask, 0)];
    if let Some((trustee, mask, flags)) = extra {
        result.push(allow_ace(trustee, mask, flags));
    }
    result
}

fn allow_ace(trustee_sid: &str, mask: u32, flags: u8) -> AceSpec {
    AceSpec {
        ace_type: "allow".to_string(),
        mask,
        flags,
        trustee_sid: trustee_sid.to_string(),
    }
}

fn descriptor(
    owner_sid: &str,
    dacl_protected: bool,
    dacl_auto_inherited: bool,
    aces: Vec<AceSpec>,
) -> DescriptorSpec {
    DescriptorSpec {
        owner_sid: owner_sid.to_string(),
        dacl_protected,
        dacl_auto_inherited,
        aces,
    }
}

fn resolve_required_sids(runner_user: &str) -> Result<ResolvedSids> {
    Ok(ResolvedSids {
        runner_user: resolve_account_sid(runner_user)?,
        authenticated_users: canonicalize_sid("S-1-5-11")?,
        everyone: canonicalize_sid("S-1-1-0")?,
        system: canonicalize_sid("S-1-5-18")?,
    })
}

fn resolve_account_sid(account: &str) -> Result<String> {
    let account_w = wide(account);
    let mut sid_len = 0;
    let mut domain_len = 0;
    let mut sid_use: SID_NAME_USE = 0;
    unsafe {
        LookupAccountNameW(
            std::ptr::null(),
            account_w.as_ptr(),
            std::ptr::null_mut(),
            &mut sid_len,
            std::ptr::null_mut(),
            &mut domain_len,
            &mut sid_use,
        );
    }
    anyhow::ensure!(
        unsafe { GetLastError() } == ERROR_INSUFFICIENT_BUFFER,
        "LookupAccountNameW size query failed for {account}: {}",
        std::io::Error::last_os_error()
    );

    let mut sid = vec![0_u8; sid_len as usize];
    let mut domain = vec![0_u16; domain_len as usize];
    let ok = unsafe {
        LookupAccountNameW(
            std::ptr::null(),
            account_w.as_ptr(),
            sid.as_mut_ptr().cast(),
            &mut sid_len,
            domain.as_mut_ptr(),
            &mut domain_len,
            &mut sid_use,
        )
    };
    anyhow::ensure!(
        ok != 0,
        "LookupAccountNameW failed for {account}: {}",
        std::io::Error::last_os_error()
    );
    sid_to_string(sid.as_mut_ptr().cast())
}

fn canonicalize_sid(sid: &str) -> Result<String> {
    let sid_w = wide(sid);
    let mut sid_ptr: *mut c_void = std::ptr::null_mut();
    let ok = unsafe { ConvertStringSidToSidW(sid_w.as_ptr(), &mut sid_ptr) };
    anyhow::ensure!(
        ok != 0,
        "ConvertStringSidToSidW failed for {sid}: {}",
        std::io::Error::last_os_error()
    );
    let result = sid_to_string(sid_ptr);
    unsafe {
        LocalFree(sid_ptr as HLOCAL);
    }
    result
}

fn sid_to_string(sid: *mut c_void) -> Result<String> {
    let mut string_sid = std::ptr::null_mut();
    let ok = unsafe { ConvertSidToStringSidW(sid, &mut string_sid) };
    anyhow::ensure!(
        ok != 0 && !string_sid.is_null(),
        "ConvertSidToStringSidW failed: {}",
        std::io::Error::last_os_error()
    );
    let mut len = 0;
    unsafe {
        while *string_sid.add(len) != 0 {
            len += 1;
        }
    }
    let value = unsafe { String::from_utf16_lossy(std::slice::from_raw_parts(string_sid, len)) };
    unsafe {
        LocalFree(string_sid as HLOCAL);
    }
    Ok(value)
}

fn wide(value: &str) -> Vec<u16> {
    std::ffi::OsStr::new(value)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

fn run_script_mode(script: &Path, mode: &str, manifest: &Path) -> Result<()> {
    let status = Command::new(r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe")
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
        ])
        .arg(script)
        .args(["-Mode", mode, "-Manifest"])
        .arg(manifest)
        .status()
        .context("start ACL matrix PowerShell script")?;
    anyhow::ensure!(status.success(), "ACL matrix {mode} exited with {status}");
    Ok(())
}

const ACL_MATRIX_SCRIPT: &str = r#"param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Setup', 'Probe')]
    [string]$Mode,
    [Parameter(Mandatory = $true)]
    [string]$Manifest
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;

public sealed class DescriptorSpec {
    public string owner_sid;
    public bool dacl_protected;
    public bool dacl_auto_inherited;
    public AceSpec[] aces;
}

public sealed class AceSpec {
    public string ace_type;
    public uint mask;
    public byte flags;
    public string trustee_sid;
}

public sealed class DescriptorRecord {
    public string owner_sid;
    public bool dacl_protected;
    public bool dacl_auto_inherited;
    public List<AceSpec> aces = new List<AceSpec>();
}

public sealed class ProbeRecord {
    public bool object_delete_probe_allowed;
    public uint object_delete_probe_error;
    public bool parent_delete_child_probe_allowed;
    public uint parent_delete_child_probe_error;
}

public sealed class DeleteRecord {
    public bool exists_before_delete;
    public bool delete_attempted;
    public bool delete_succeeded;
    public uint delete_win32_error;
    public bool exists_after_delete;
}

public sealed class MatrixMetadata {
    public string volume_root;
    public string file_system;
    public string runner_user_sid;
    public string[] restricted_sids;
}

public static class AclMatrixNative {
    private const uint OWNER_SECURITY_INFORMATION = 0x00000001;
    private const uint DACL_SECURITY_INFORMATION = 0x00000004;
    private const uint PROTECTED_DACL_SECURITY_INFORMATION = 0x80000000;
    private const uint UNPROTECTED_DACL_SECURITY_INFORMATION = 0x20000000;
    private const ushort SE_DACL_PROTECTED = 0x1000;
    private const ushort SE_DACL_AUTO_INHERITED = 0x0400;
    private const uint DELETE = 0x00010000;
    private const uint FILE_DELETE_CHILD = 0x00000040;
    private const uint OPEN_EXISTING = 3;
    private const uint FILE_ATTRIBUTE_NORMAL = 0x00000080;
    private const uint FILE_FLAG_BACKUP_SEMANTICS = 0x02000000;
    private const uint ACL_REVISION = 2;
    private const int ERROR_INVALID_DATA = 13;
    private const uint ERROR_INSUFFICIENT_BUFFER = 122;
    private const int ERROR_NOT_ALL_ASSIGNED = 1300;
    private const uint TOKEN_ADJUST_PRIVILEGES = 0x0020;
    private const uint TOKEN_QUERY = 0x0008;
    private const uint SE_PRIVILEGE_ENABLED = 0x00000002;
    private const uint TOKEN_RESTRICTED_SIDS = 11;

    [StructLayout(LayoutKind.Sequential)]
    private struct ACL_SIZE_INFORMATION {
        public uint AceCount;
        public uint AclBytesInUse;
        public uint AclBytesFree;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SID_AND_ATTRIBUTES {
        public IntPtr Sid;
        public uint Attributes;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct LUID {
        public uint LowPart;
        public int HighPart;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct LUID_AND_ATTRIBUTES {
        public LUID Luid;
        public uint Attributes;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct TOKEN_PRIVILEGES {
        public uint PrivilegeCount;
        public LUID_AND_ATTRIBUTES Privileges;
    }

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
    private static extern bool ConvertStringSidToSidW(string value, out IntPtr sid);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
    private static extern bool ConvertSidToStringSidW(IntPtr sid, out IntPtr value);
    [DllImport("kernel32.dll")]
    private static extern IntPtr LocalFree(IntPtr memory);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern uint GetNamedSecurityInfoW(string name, uint objectType, uint info,
        out IntPtr owner, out IntPtr group, out IntPtr dacl, out IntPtr sacl, out IntPtr descriptor);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern uint SetNamedSecurityInfoW(string name, uint objectType, uint info,
        IntPtr owner, IntPtr group, IntPtr dacl, IntPtr sacl);
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool GetSecurityDescriptorControl(IntPtr descriptor, out ushort control,
        out uint revision);
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool InitializeAcl(IntPtr acl, uint length, uint revision);
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool AddAccessAllowedAceEx(IntPtr acl, uint revision, uint flags,
        uint mask, IntPtr sid);
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern uint GetLengthSid(IntPtr sid);
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool GetAclInformation(IntPtr acl, out ACL_SIZE_INFORMATION info,
        uint length, uint infoClass);
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool GetAce(IntPtr acl, uint index, out IntPtr ace);
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool GetTokenInformation(IntPtr token, uint informationClass,
        IntPtr information, uint informationLength, out uint returnLength);
    [DllImport("kernel32.dll")]
    private static extern IntPtr GetCurrentProcess();
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool OpenProcessToken(IntPtr process, uint desiredAccess,
        out IntPtr token);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
    private static extern bool LookupPrivilegeValueW(string systemName, string name,
        out LUID luid);
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool AdjustTokenPrivileges(IntPtr token, bool disableAllPrivileges,
        ref TOKEN_PRIVILEGES newState, uint bufferLength, IntPtr previousState,
        IntPtr returnLength);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
    private static extern IntPtr CreateFileW(string name, uint access, uint share, IntPtr security,
        uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
    private static extern bool DeleteFileW(string name);

    public static DescriptorRecord ReadDescriptor(string path) {
        IntPtr owner, group, dacl, sacl, descriptor;
        uint result = GetNamedSecurityInfoW(path, 1, OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION,
            out owner, out group, out dacl, out sacl, out descriptor);
        if (result != 0) throw new Win32Exception((int)result, "GetNamedSecurityInfoW");
        try {
            ushort control;
            uint revision;
            if (!GetSecurityDescriptorControl(descriptor, out control, out revision)) ThrowLast("GetSecurityDescriptorControl");
            DescriptorRecord record = new DescriptorRecord();
            record.owner_sid = SidString(owner);
            record.dacl_protected = (control & SE_DACL_PROTECTED) != 0;
            record.dacl_auto_inherited = (control & SE_DACL_AUTO_INHERITED) != 0;
            ACL_SIZE_INFORMATION size;
            if (!GetAclInformation(dacl, out size, (uint)Marshal.SizeOf(typeof(ACL_SIZE_INFORMATION)), 2)) ThrowLast("GetAclInformation");
            for (uint i = 0; i < size.AceCount; i++) {
                IntPtr ace;
                if (!GetAce(dacl, i, out ace)) ThrowLast("GetAce");
                byte type = Marshal.ReadByte(ace, 0);
                if (type != 0) throw new InvalidOperationException("unexpected non-allow ACE type " + type);
                record.aces.Add(new AceSpec {
                    ace_type = "allow",
                    flags = Marshal.ReadByte(ace, 1),
                    mask = unchecked((uint)Marshal.ReadInt32(ace, 4)),
                    trustee_sid = SidString(IntPtr.Add(ace, 8))
                });
            }
            return record;
        } finally { LocalFree(descriptor); }
    }

    public static void ApplyDescriptor(string path, DescriptorSpec descriptor, bool isDirectory) {
        IntPtr owner = IntPtr.Zero;
        List<IntPtr> sids = new List<IntPtr>();
        IntPtr acl = IntPtr.Zero;
        try {
            if (!ConvertStringSidToSidW(descriptor.owner_sid, out owner)) ThrowLast("ConvertStringSidToSidW(owner)");
            uint aclLength = 8;
            foreach (AceSpec ace in descriptor.aces) {
                IntPtr sid;
                if (!ConvertStringSidToSidW(ace.trustee_sid, out sid)) ThrowLast("ConvertStringSidToSidW(trustee)");
                sids.Add(sid);
                aclLength += 12 + GetLengthSid(sid);
            }
            acl = Marshal.AllocHGlobal((int)aclLength);
            if (!InitializeAcl(acl, aclLength, ACL_REVISION)) ThrowLast("InitializeAcl");
            for (int i = 0; i < descriptor.aces.Length; i++) {
                AceSpec ace = descriptor.aces[i];
                if (ace.ace_type != "allow") throw new InvalidOperationException("only allow ACEs are supported");
                if (!AddAccessAllowedAceEx(acl, ACL_REVISION, ace.flags, ace.mask, sids[i])) ThrowLast("AddAccessAllowedAceEx");
            }
            uint info = OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION |
                (descriptor.dacl_protected ? PROTECTED_DACL_SECURITY_INFORMATION : UNPROTECTED_DACL_SECURITY_INFORMATION);
            uint result = SetNamedSecurityInfoW(path, 1, info, owner, IntPtr.Zero, acl, IntPtr.Zero);
            if (result != 0) throw new Win32Exception((int)result, "SetNamedSecurityInfoW");
        } finally {
            if (acl != IntPtr.Zero) Marshal.FreeHGlobal(acl);
            foreach (IntPtr sid in sids) LocalFree(sid);
            if (owner != IntPtr.Zero) LocalFree(owner);
        }
    }

    public static ProbeRecord ProbeDeleteAccess(string objectPath, string parentPath) {
        ProbeRecord record = new ProbeRecord();
        Probe(objectPath, DELETE, FILE_ATTRIBUTE_NORMAL,
            out record.object_delete_probe_allowed, out record.object_delete_probe_error);
        Probe(parentPath, FILE_DELETE_CHILD, FILE_FLAG_BACKUP_SEMANTICS,
            out record.parent_delete_child_probe_allowed, out record.parent_delete_child_probe_error);
        return record;
    }

    public static DeleteRecord DeleteFileAndReadPostState(string objectPath) {
        DeleteRecord record = new DeleteRecord();
        record.exists_before_delete = File.Exists(objectPath);
        record.delete_attempted = true;
        record.delete_succeeded = DeleteFileW(objectPath);
        record.delete_win32_error = record.delete_succeeded ? 0 : unchecked((uint)Marshal.GetLastWin32Error());
        record.exists_after_delete = File.Exists(objectPath);
        return record;
    }

    public static MatrixMetadata ReadMetadata(string testRoot) {
        string volume = Path.GetPathRoot(testRoot);
        using (WindowsIdentity identity = WindowsIdentity.GetCurrent()) {
            return new MatrixMetadata {
                volume_root = volume,
                file_system = new DriveInfo(volume).DriveFormat,
                runner_user_sid = identity.User.Value,
                restricted_sids = ReadRestrictedSids(identity.Token)
            };
        }
    }

    public static void EnableRestorePrivilege() {
        IntPtr token;
        if (!OpenProcessToken(
            GetCurrentProcess(), TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, out token))
            ThrowLast("OpenProcessToken(SeRestorePrivilege)");
        try {
            LUID luid;
            if (!LookupPrivilegeValueW(null, "SeRestorePrivilege", out luid))
                ThrowLast("LookupPrivilegeValueW(SeRestorePrivilege)");
            TOKEN_PRIVILEGES privileges = new TOKEN_PRIVILEGES {
                PrivilegeCount = 1,
                Privileges = new LUID_AND_ATTRIBUTES {
                    Luid = luid,
                    Attributes = SE_PRIVILEGE_ENABLED
                }
            };
            if (!AdjustTokenPrivileges(
                token, false, ref privileges, 0, IntPtr.Zero, IntPtr.Zero))
                ThrowLast("AdjustTokenPrivileges(SeRestorePrivilege)");
            int error = Marshal.GetLastWin32Error();
            if (error == ERROR_NOT_ALL_ASSIGNED)
                throw new Win32Exception(
                    error, "AdjustTokenPrivileges(SeRestorePrivilege) not assigned");
            if (error != 0)
                throw new Win32Exception(error, "AdjustTokenPrivileges(SeRestorePrivilege)");
        } finally {
            CloseHandle(token);
        }
    }

    private static string[] ReadRestrictedSids(IntPtr token) {
        uint required;
        bool queried = GetTokenInformation(
            token, TOKEN_RESTRICTED_SIDS, IntPtr.Zero, 0, out required);
        int error = Marshal.GetLastWin32Error();
        if (queried || error != ERROR_INSUFFICIENT_BUFFER || required == 0)
            throw new Win32Exception(error, "GetTokenInformation(TokenRestrictedSids size)");

        IntPtr buffer = Marshal.AllocHGlobal((int)required);
        try {
            uint bufferLength = required;
            if (!GetTokenInformation(
                token, TOKEN_RESTRICTED_SIDS, buffer, bufferLength, out required))
                ThrowLast("GetTokenInformation(TokenRestrictedSids)");
            int count = Marshal.ReadInt32(buffer);
            int firstGroupOffset = IntPtr.Size == 8 ? 8 : 4;
            int groupSize = Marshal.SizeOf(typeof(SID_AND_ATTRIBUTES));
            long groupsEnd = firstGroupOffset + (long)count * groupSize;
            if (count < 0 || groupsEnd > bufferLength)
                throw new Win32Exception(
                    ERROR_INVALID_DATA, "GetTokenInformation(TokenRestrictedSids layout)");
            string[] sids = new string[count];
            for (int index = 0; index < count; index++) {
                IntPtr groupPointer = IntPtr.Add(buffer, firstGroupOffset + index * groupSize);
                SID_AND_ATTRIBUTES group = (SID_AND_ATTRIBUTES)Marshal.PtrToStructure(
                    groupPointer, typeof(SID_AND_ATTRIBUTES));
                sids[index] = SidString(group.Sid);
            }
            return sids;
        } finally {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static void Probe(string path, uint access, uint flags, out bool allowed, out uint error) {
        IntPtr handle = CreateFileW(path, access, 7, IntPtr.Zero, OPEN_EXISTING, flags, IntPtr.Zero);
        allowed = handle != new IntPtr(-1);
        error = allowed ? 0 : unchecked((uint)Marshal.GetLastWin32Error());
        if (allowed) CloseHandle(handle);
    }

    private static string SidString(IntPtr sid) {
        IntPtr value;
        if (!ConvertSidToStringSidW(sid, out value)) ThrowLast("ConvertSidToStringSidW");
        try { return Marshal.PtrToStringUni(value); }
        finally { LocalFree(value); }
    }

    private static void ThrowLast(string api) {
        throw new Win32Exception(Marshal.GetLastWin32Error(), api);
    }
}
'@

function Convert-Descriptor($value) {
    $descriptor = New-Object DescriptorSpec
    $descriptor.owner_sid = [string]$value.owner_sid
    $descriptor.dacl_protected = [bool]$value.dacl_protected
    $descriptor.dacl_auto_inherited = [bool]$value.dacl_auto_inherited
    $aces = @()
    foreach ($valueAce in $value.aces) {
        $ace = New-Object AceSpec
        $ace.ace_type = [string]$valueAce.ace_type
        $ace.mask = [uint32]$valueAce.mask
        $ace.flags = [byte]$valueAce.flags
        $ace.trustee_sid = [string]$valueAce.trustee_sid
        $aces += $ace
    }
    $descriptor.aces = [AceSpec[]]$aces
    return $descriptor
}

function New-AllowAce($sid, $mask, $flags) {
    $ace = New-Object AceSpec
    $ace.ace_type = 'allow'
    $ace.trustee_sid = [string]$sid
    $ace.mask = [uint32]$mask
    $ace.flags = [byte]$flags
    return $ace
}

function Test-DescriptorEqual($expected, $actual) {
    return (($expected | ConvertTo-Json -Compress -Depth 12) -eq
        ($actual | ConvertTo-Json -Compress -Depth 12))
}

function New-DiagnosticError($stage, $api, $exception) {
    $code = $null
    if ($exception -is [System.ComponentModel.Win32Exception]) {
        $code = [uint32]$exception.NativeErrorCode
    }
    return [ordered]@{ stage = $stage; api = $api; code = $code; message = $exception.Message }
}

$manifestObject = Get-Content -LiteralPath $Manifest -Raw | ConvertFrom-Json

if ($Mode -eq 'Setup') {
    $rootDescriptor = New-Object DescriptorSpec
    $rootDescriptor.owner_sid = [string]$manifestObject.sids.runner_user
    $rootDescriptor.dacl_protected = $true
    $rootDescriptor.dacl_auto_inherited = $false
    $rootAces = @(
        (New-AllowAce $manifestObject.sids.everyone 0x001200a9 3),
        (New-AllowAce $manifestObject.sids.runner_user 0x001e01bf 3)
    )
    $rootDescriptor.aces = [AceSpec[]]$rootAces
    [AclMatrixNative]::ApplyDescriptor([string]$manifestObject.root, $rootDescriptor, $true)

    $supportDescriptor = New-Object DescriptorSpec
    $supportDescriptor.owner_sid = [string]$manifestObject.sids.runner_user
    $supportDescriptor.dacl_protected = $true
    $supportDescriptor.dacl_auto_inherited = $false
    $supportAces = @(
        (New-AllowAce $manifestObject.sids.everyone 0x00120089 0),
        (New-AllowAce $manifestObject.sids.runner_user 0x0012019f 0)
    )
    $supportDescriptor.aces = [AceSpec[]]$supportAces
    [AclMatrixNative]::ApplyDescriptor($MyInvocation.MyCommand.Path, $supportDescriptor, $false)
    [AclMatrixNative]::ApplyDescriptor($Manifest, $supportDescriptor, $false)
    [AclMatrixNative]::EnableRestorePrivilege()

    foreach ($case in $manifestObject.cases) {
        try {
            New-Item -ItemType Directory -Path ([string]$case.parent_path) -Force | Out-Null
            [AclMatrixNative]::ApplyDescriptor(
                [string]$case.parent_path, (Convert-Descriptor $case.expected_parent_descriptor), $true)
            Set-Content -LiteralPath ([string]$case.object_path) -Value 'acl matrix delete fixture' -NoNewline
            $usesSystemInheritance = ([string]$case.family -eq 'trustee') -or
                (([string]$case.family -eq 'inheritance') -and
                    ([string]$case.case_name -eq 'inherited_user'))
            if (-not $usesSystemInheritance) {
                [AclMatrixNative]::ApplyDescriptor(
                    [string]$case.object_path,
                    (Convert-Descriptor $case.expected_object_descriptor), $false)
            }
            $actualParent = [AclMatrixNative]::ReadDescriptor([string]$case.parent_path)
            $actualObject = [AclMatrixNative]::ReadDescriptor([string]$case.object_path)
            if ((Test-DescriptorEqual $case.expected_parent_descriptor $actualParent) -and
                (Test-DescriptorEqual $case.expected_object_descriptor $actualObject)) {
                $case.setup_status = 'ok'; $case.setup_error = $null
            } else {
                $case.setup_status = 'setup_mismatch'
                $case.setup_error = [ordered]@{
                    stage = 'setup'; api = 'descriptor_compare'; code = $null
                    message = 'actual descriptor does not match expected descriptor'
                }
            }
        } catch {
            $case.setup_status = 'setup_error'
            $case.setup_error = New-DiagnosticError 'setup' 'case_setup' $_.Exception
        }
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
    [IO.File]::WriteAllText(
        $Manifest, ($manifestObject | ConvertTo-Json -Depth 20), $utf8NoBom)
    exit 0
}

$metadataNative = [AclMatrixNative]::ReadMetadata([string]$manifestObject.root)
$metadata = [ordered]@{
    record_type = 'acl_matrix_metadata'; schema = 1; matrix_version = [string]$manifestObject.matrix_version
    target = 'x86_64-pc-windows-msvc'; process_arch = 'x86_64'
    runner_os = [string]$env:RUNNER_OS; runner_image = [string]$env:ImageOS
    test_root = [string]$manifestObject.root; volume_root = $metadataNative.volume_root
    file_system = $metadataNative.file_system; runner_user_sid = $metadataNative.runner_user_sid
    restricted_sids = $metadataNative.restricted_sids; diagnostics_dir_present = $true
    case_count = [int]$manifestObject.cases.Count
}
Write-Output ($metadata | ConvertTo-Json -Compress -Depth 12)

foreach ($case in $manifestObject.cases) {
    try {
        $actualParent = [AclMatrixNative]::ReadDescriptor([string]$case.parent_path)
        $actualObject = [AclMatrixNative]::ReadDescriptor([string]$case.object_path)
        $probe = [AclMatrixNative]::ProbeDeleteAccess(
            [string]$case.object_path, [string]$case.parent_path)
        $delete = [AclMatrixNative]::DeleteFileAndReadPostState([string]$case.object_path)
        $valid = ([string]$case.setup_status -eq 'ok') -and
            (Test-DescriptorEqual $case.expected_parent_descriptor $actualParent) -and
            (Test-DescriptorEqual $case.expected_object_descriptor $actualObject)
        $record = [ordered]@{
            record_type = 'acl_matrix_case'; schema = 1
            matrix_version = [string]$manifestObject.matrix_version
            family = [string]$case.family; case = [string]$case.case_name
            setup_status = [string]$case.setup_status; setup_error = $case.setup_error
            expected_parent_descriptor = $case.expected_parent_descriptor
            actual_parent_descriptor = $actualParent
            expected_object_descriptor = $case.expected_object_descriptor
            actual_object_descriptor = $actualObject
            object_delete_probe_allowed = $probe.object_delete_probe_allowed
            object_delete_probe_error = $probe.object_delete_probe_error
            parent_delete_child_probe_allowed = $probe.parent_delete_child_probe_allowed
            parent_delete_child_probe_error = $probe.parent_delete_child_probe_error
            exists_before_delete = $delete.exists_before_delete
            delete_attempted = $delete.delete_attempted
            delete_win32_error = $delete.delete_win32_error
            delete_succeeded = $delete.delete_succeeded
            exists_after_delete = $delete.exists_after_delete
            result_valid = $valid
        }
    } catch {
        $record = [ordered]@{
            record_type = 'acl_matrix_case'; schema = 1
            matrix_version = [string]$manifestObject.matrix_version
            family = [string]$case.family; case = [string]$case.case_name
            setup_status = [string]$case.setup_status; setup_error = $case.setup_error
            expected_parent_descriptor = $case.expected_parent_descriptor
            actual_parent_descriptor = $null
            expected_object_descriptor = $case.expected_object_descriptor
            actual_object_descriptor = $null
            object_delete_probe_allowed = $false; object_delete_probe_error = $null
            parent_delete_child_probe_allowed = $false; parent_delete_child_probe_error = $null
            exists_before_delete = [IO.File]::Exists([string]$case.object_path)
            delete_attempted = $false; delete_win32_error = $null
            delete_succeeded = $false
            exists_after_delete = [IO.File]::Exists([string]$case.object_path)
            result_valid = $false
            probe_error = New-DiagnosticError 'probe' 'case_probe' $_.Exception
        }
    }
    Write-Output ($record | ConvertTo-Json -Compress -Depth 20)
}

Write-Output ([ordered]@{
    record_type = 'acl_matrix_end'; schema = 1
    case_count = [int]$manifestObject.cases.Count; completed = $true
} | ConvertTo-Json -Compress)
"#;
