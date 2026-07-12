#![cfg(target_os = "windows")]

use super::spawn_windows_sandbox_session_legacy;
use crate::WindowsSandboxCancellationToken;
use crate::ipc_framed::Message;
use crate::ipc_framed::decode_bytes;
use crate::ipc_framed::read_frame;
use crate::run_windows_sandbox_capture;
use codex_protocol::models::PermissionProfile;
use codex_utils_absolute_path::AbsolutePathBuf;
use codex_utils_pty::ProcessDriver;
use pretty_assertions::assert_eq;
use std::collections::HashMap;
use std::fs;
use std::fs::OpenOptions;
use std::io::Seek;
use std::io::SeekFrom;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::MutexGuard;
use std::sync::atomic::AtomicBool;
use std::sync::atomic::AtomicU64;
use std::sync::atomic::Ordering;
use std::time::Duration;
use std::time::Instant;
use tempfile::TempDir;
use tokio::runtime::Builder;
use tokio::sync::broadcast;
use tokio::sync::mpsc;
use tokio::sync::oneshot;
use tokio::time::timeout;

static TEST_HOME_COUNTER: AtomicU64 = AtomicU64::new(0);
static LEGACY_PROCESS_TEST_LOCK: Mutex<()> = Mutex::new(());

fn legacy_process_test_guard() -> MutexGuard<'static, ()> {
    LEGACY_PROCESS_TEST_LOCK
        .lock()
        .expect("legacy Windows sandbox process test lock poisoned")
}

fn current_thread_runtime() -> tokio::runtime::Runtime {
    Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("build tokio runtime")
}

fn pwsh_path() -> Option<PathBuf> {
    let program_files = std::env::var_os("ProgramFiles")?;
    let path = PathBuf::from(program_files).join("PowerShell\\7\\pwsh.exe");
    path.is_file().then_some(path)
}

fn sandbox_cwd() -> PathBuf {
    if let Ok(workspace_root) = std::env::var("INSTA_WORKSPACE_ROOT") {
        return PathBuf::from(workspace_root);
    }

    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("repo root")
        .to_path_buf()
}

fn sandbox_home(name: &str) -> TempDir {
    let id = TEST_HOME_COUNTER.fetch_add(1, Ordering::Relaxed);
    let path = std::env::temp_dir().join(format!("codex-windows-sandbox-{name}-{id}"));
    let _ = fs::remove_dir_all(&path);
    fs::create_dir_all(&path).expect("create sandbox home");
    tempfile::TempDir::new_in(&path).expect("create sandbox home tempdir")
}

fn sandbox_log(codex_home: &Path) -> String {
    let log_path = crate::current_log_file_path(&codex_home.join(".sandbox"));
    fs::read_to_string(&log_path)
        .unwrap_or_else(|err| format!("failed to read {}: {err}", log_path.display()))
}

fn workspace_roots_for(root: &Path) -> Vec<AbsolutePathBuf> {
    vec![AbsolutePathBuf::from_absolute_path(root).expect("absolute workspace root")]
}

fn wait_for_frame_count(frames_path: &Path, expected_frames: usize) -> Vec<Message> {
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        let mut reader = OpenOptions::new()
            .read(true)
            .open(frames_path)
            .expect("open frame file for read");
        reader
            .seek(SeekFrom::Start(0))
            .expect("seek to start of frame file");

        let mut frames = Vec::new();
        loop {
            match read_frame(&mut reader) {
                Ok(Some(frame)) => frames.push(frame.message),
                Ok(None) => break,
                Err(_) => break,
            }
        }

        if frames.len() >= expected_frames {
            return frames;
        }
        assert!(
            Instant::now() < deadline,
            "timed out waiting for {expected_frames} frames, saw {}",
            frames.len()
        );
        std::thread::sleep(Duration::from_millis(10));
    }
}

async fn collect_stdout_and_exit(
    spawned: codex_utils_pty::SpawnedProcess,
    codex_home: &Path,
    timeout_duration: Duration,
) -> (Vec<u8>, i32) {
    let codex_utils_pty::SpawnedProcess {
        session: _session,
        mut stdout_rx,
        stderr_rx: _stderr_rx,
        exit_rx,
    } = spawned;
    let stdout_task = tokio::spawn(async move {
        let mut stdout = Vec::new();
        while let Some(chunk) = stdout_rx.recv().await {
            stdout.extend(chunk);
        }
        stdout
    });
    let exit_code = timeout(timeout_duration, exit_rx)
        .await
        .unwrap_or_else(|_| panic!("timed out waiting for exit\n{}", sandbox_log(codex_home)))
        .unwrap_or(-1);
    let stdout = timeout(timeout_duration, stdout_task)
        .await
        .unwrap_or_else(|_| {
            panic!(
                "timed out waiting for stdout task\n{}",
                sandbox_log(codex_home)
            )
        })
        .expect("stdout task join");
    (stdout, exit_code)
}

fn legacy_delete_access_probe_script() -> &'static str {
    r#"$source = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public static class LegacyDeleteAccessProbe {
    private const uint TOKEN_QUERY = 0x0008;
    private const int TokenRestrictedSids = 11;
    private const uint DELETE = 0x00010000;
    private const uint FILE_DELETE_CHILD = 0x00000040;
    private const uint FILE_SHARE_READ = 0x00000001;
    private const uint FILE_SHARE_WRITE = 0x00000002;
    private const uint FILE_SHARE_DELETE = 0x00000004;
    private const uint OPEN_EXISTING = 3;
    private const uint FILE_FLAG_BACKUP_SEMANTICS = 0x02000000;

    [StructLayout(LayoutKind.Sequential)]
    private struct SidAndAttributes {
        public IntPtr Sid;
        public uint Attributes;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct TokenGroupsOne {
        public uint GroupCount;
        public SidAndAttributes Groups;
    }

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetCurrentProcess();

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool OpenProcessToken(IntPtr process, uint access, out SafeFileHandle token);

    [DllImport("advapi32.dll")]
    private static extern bool IsTokenRestricted(SafeFileHandle token);

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool GetTokenInformation(
        SafeFileHandle token,
        int tokenInformationClass,
        IntPtr tokenInformation,
        uint tokenInformationLength,
        out uint returnLength);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool ConvertSidToStringSidW(IntPtr sid, out IntPtr stringSid);

    [DllImport("kernel32.dll")]
    private static extern IntPtr LocalFree(IntPtr memory);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFileW(
        string fileName,
        uint desiredAccess,
        uint shareMode,
        IntPtr securityAttributes,
        uint creationDisposition,
        uint flagsAndAttributes,
        IntPtr templateFile);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool GetVolumePathNameW(string fileName, System.Text.StringBuilder volumePathName, uint bufferLength);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool GetVolumeInformationW(
        string rootPathName,
        System.Text.StringBuilder volumeNameBuffer,
        uint volumeNameSize,
        out uint volumeSerialNumber,
        out uint maximumComponentLength,
        out uint fileSystemFlags,
        System.Text.StringBuilder fileSystemNameBuffer,
        uint fileSystemNameSize);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern uint GetDriveTypeW(string rootPathName);

    public static void DumpRestrictedToken() {
        SafeFileHandle token;
        if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, out token)) {
            Console.WriteLine("probe_error stage=token api=OpenProcessToken code={0}", Marshal.GetLastWin32Error());
            return;
        }

        using (token) {
            Console.WriteLine(
                "child_token is_restricted={0}",
                IsTokenRestricted(token).ToString().ToLowerInvariant());

            uint returnLength;
            GetTokenInformation(token, TokenRestrictedSids, IntPtr.Zero, 0, out returnLength);
            if (returnLength == 0) {
                Console.WriteLine("probe_error stage=token api=GetTokenInformation code={0}", Marshal.GetLastWin32Error());
                return;
            }

            IntPtr tokenInformation = Marshal.AllocHGlobal((int)returnLength);
            try {
                if (!GetTokenInformation(
                    token,
                    TokenRestrictedSids,
                    tokenInformation,
                    returnLength,
                    out returnLength)) {
                    Console.WriteLine("probe_error stage=token api=GetTokenInformation code={0}", Marshal.GetLastWin32Error());
                    return;
                }

                uint groupCount = (uint)Marshal.ReadInt32(tokenInformation);
                int groupsOffset = Marshal.OffsetOf(typeof(TokenGroupsOne), "Groups").ToInt32();
                int groupSize = Marshal.SizeOf(typeof(SidAndAttributes));
                for (uint index = 0; index < groupCount; index++) {
                    IntPtr groupPointer = IntPtr.Add(tokenInformation, groupsOffset + ((int)index * groupSize));
                    SidAndAttributes group = (SidAndAttributes)Marshal.PtrToStructure(
                        groupPointer,
                        typeof(SidAndAttributes));
                    IntPtr stringSid = IntPtr.Zero;
                    if (!ConvertSidToStringSidW(group.Sid, out stringSid)) {
                        Console.WriteLine(
                            "probe_error stage=token api=ConvertSidToStringSidW index={0} code={1}",
                            index,
                            Marshal.GetLastWin32Error());
                        continue;
                    }

                    try {
                        Console.WriteLine(
                            "child_token restricted_sid index={0} sid={1} attributes=0x{2:x8}",
                            index,
                            Marshal.PtrToStringUni(stringSid),
                            group.Attributes);
                    } finally {
                        LocalFree(stringSid);
                    }
                }
            } finally {
                Marshal.FreeHGlobal(tokenInformation);
            }
        }
    }

    public static void ProbeAccess(
        string key,
        string path,
        bool directory,
        uint desiredAccess,
        string accessName) {
        uint flagsAndAttributes = directory ? FILE_FLAG_BACKUP_SEMANTICS : 0;
        SafeFileHandle handle = CreateFileW(
            path,
            desiredAccess,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            IntPtr.Zero,
            OPEN_EXISTING,
            flagsAndAttributes,
            IntPtr.Zero);
        bool success = !handle.IsInvalid;
        int code = success ? 0 : Marshal.GetLastWin32Error();
        handle.Dispose();
        Console.WriteLine(
            "access_probe key={0} access={1} success={2} code={3}",
            key,
            accessName,
            success.ToString().ToLowerInvariant(),
            code);
    }

    public static void DumpVolume(string key, string path, HashSet<string> seenRoots) {
        System.Text.StringBuilder rootBuffer = new System.Text.StringBuilder(261);
        if (!GetVolumePathNameW(path, rootBuffer, (uint)rootBuffer.Capacity)) {
            Console.WriteLine(
                "probe_error stage=volume api=GetVolumePathNameW key={0} code={1}",
                key,
                Marshal.GetLastWin32Error());
            return;
        }

        string root = rootBuffer.ToString();
        if (!seenRoots.Add(root)) {
            return;
        }

        System.Text.StringBuilder volumeName = new System.Text.StringBuilder(261);
        System.Text.StringBuilder fileSystemName = new System.Text.StringBuilder(261);
        uint volumeSerialNumber;
        uint maximumComponentLength;
        uint fileSystemFlags;
        if (!GetVolumeInformationW(
            root,
            volumeName,
            (uint)volumeName.Capacity,
            out volumeSerialNumber,
            out maximumComponentLength,
            out fileSystemFlags,
            fileSystemName,
            (uint)fileSystemName.Capacity)) {
            Console.WriteLine(
                "probe_error stage=volume api=GetVolumeInformationW root={0} code={1}",
                root,
                Marshal.GetLastWin32Error());
            return;
        }

        Console.WriteLine(
            "volume root={0} drive_type={1} filesystem={2} flags=0x{3:x8}",
            root,
            GetDriveTypeW(root),
            fileSystemName,
            fileSystemFlags);
    }
}
'@

Write-Output "probe_begin schema=1"
try {
    Add-Type -TypeDefinition $source -Language CSharp -ErrorAction Stop
    [LegacyDeleteAccessProbe]::DumpRestrictedToken()
    $targets = @(
        @{ Key = "workspace_file"; Path = $env:WORKSPACE_DELETE; Directory = $false },
        @{ Key = "temp_file"; Path = $env:TEMP_DELETE; Directory = $false },
        @{ Key = "tmp_file"; Path = $env:TMP_DELETE; Directory = $false },
        @{ Key = "outside_file"; Path = $env:OUTSIDE_DELETE; Directory = $false },
        @{ Key = "protected_git_dir"; Path = $env:PROTECTED_GIT_DIR; Directory = $true }
    )
    $seenRoots = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($target in $targets) {
        [LegacyDeleteAccessProbe]::ProbeAccess($target.Key, $target.Path, $target.Directory, 0x00010000, "DELETE")
        $parent = [System.IO.Path]::GetDirectoryName($target.Path)
        [LegacyDeleteAccessProbe]::ProbeAccess("$($target.Key)_parent", $parent, $true, 0x00000040, "FILE_DELETE_CHILD")
        [LegacyDeleteAccessProbe]::DumpVolume($target.Key, $target.Path, $seenRoots)
    }
    Write-Output "probe_end status=ok"
    exit 0
} catch {
    $message = ($_.Exception.Message -replace "[\r\n]+", " ")
    Write-Output "probe_error stage=powershell message=$message"
    Write-Output "probe_end status=error"
    exit 1
}
"#
}

#[test]
fn legacy_non_tty_cmd_emits_output() {
    let _guard = legacy_process_test_guard();
    let runtime = current_thread_runtime();
    runtime.block_on(async move {
        let cwd = sandbox_cwd();
        let codex_home = sandbox_home("legacy-non-tty-cmd");
        println!("cmd codex_home={}", codex_home.path().display());
        let permission_profile = PermissionProfile::workspace_write();
        let spawned = spawn_windows_sandbox_session_legacy(
            &permission_profile,
            workspace_roots_for(cwd.as_path()).as_slice(),
            codex_home.path(),
            vec![
                "C:\\Windows\\System32\\cmd.exe".to_string(),
                "/c".to_string(),
                "echo LEGACY-NONTTY-CMD".to_string(),
            ],
            cwd.as_path(),
            HashMap::new(),
            Some(5_000),
            &[],
            &[],
            /*tty*/ false,
            /*stdin_open*/ false,
            /*use_private_desktop*/ true,
        )
        .await
        .expect("spawn legacy non-tty cmd session");
        println!("cmd spawn returned");
        let (stdout, exit_code) =
            collect_stdout_and_exit(spawned, codex_home.path(), Duration::from_secs(10)).await;
        println!("cmd collect returned exit_code={exit_code}");
        let stdout = String::from_utf8_lossy(&stdout);
        assert_eq!(exit_code, 0, "stdout={stdout:?}");
        assert!(stdout.contains("LEGACY-NONTTY-CMD"), "stdout={stdout:?}");
    });
}

#[test]
fn legacy_non_tty_cmd_rejects_deny_read_overrides() {
    let _guard = legacy_process_test_guard();
    let runtime = current_thread_runtime();
    runtime.block_on(async move {
        let cwd = sandbox_cwd();
        let codex_home = sandbox_home("legacy-non-tty-deny-read");
        let secret_path =
            AbsolutePathBuf::from_absolute_path(cwd.join("legacy-non-tty-deny-read-secret.env"))
                .expect("absolute deny-read fixture path");
        let permission_profile = PermissionProfile::workspace_write();
        let err = spawn_windows_sandbox_session_legacy(
            &permission_profile,
            workspace_roots_for(cwd.as_path()).as_slice(),
            codex_home.path(),
            vec![
                "C:\\Windows\\System32\\cmd.exe".to_string(),
                "/c".to_string(),
                "echo deny-read".to_string(),
            ],
            cwd.as_path(),
            HashMap::new(),
            Some(5_000),
            std::slice::from_ref(&secret_path),
            &[],
            /*tty*/ false,
            /*stdin_open*/ false,
            /*use_private_desktop*/ true,
        )
        .await
        .expect_err("legacy deny-read should require the elevated backend");
        assert!(
            err.to_string()
                .contains("deny-read overrides require the elevated Windows sandbox backend"),
            "unexpected error: {err:#}"
        );
    });
}

#[test]
fn legacy_non_tty_powershell_emits_output() {
    let Some(pwsh) = pwsh_path() else {
        return;
    };
    let _guard = legacy_process_test_guard();
    let runtime = current_thread_runtime();
    runtime.block_on(async move {
        let cwd = sandbox_cwd();
        let codex_home = sandbox_home("legacy-non-tty-pwsh");
        println!("pwsh codex_home={}", codex_home.path().display());
        let permission_profile = PermissionProfile::workspace_write();
        let spawned = spawn_windows_sandbox_session_legacy(
            &permission_profile,
            workspace_roots_for(cwd.as_path()).as_slice(),
            codex_home.path(),
            vec![
                pwsh.display().to_string(),
                "-NoProfile".to_string(),
                "-Command".to_string(),
                "Write-Output LEGACY-NONTTY-DIRECT".to_string(),
            ],
            cwd.as_path(),
            HashMap::new(),
            Some(5_000),
            &[],
            &[],
            /*tty*/ false,
            /*stdin_open*/ false,
            /*use_private_desktop*/ true,
        )
        .await
        .expect("spawn legacy non-tty powershell session");
        println!("pwsh spawn returned");
        let (stdout, exit_code) =
            collect_stdout_and_exit(spawned, codex_home.path(), Duration::from_secs(10)).await;
        println!("pwsh collect returned exit_code={exit_code}");
        let stdout = String::from_utf8_lossy(&stdout);
        assert_eq!(exit_code, 0, "stdout={stdout:?}");
        assert!(stdout.contains("LEGACY-NONTTY-DIRECT"), "stdout={stdout:?}");
    });
}

#[test]
fn finish_driver_spawn_keeps_stdin_open_when_requested() {
    let runtime = current_thread_runtime();
    runtime.block_on(async move {
        let (writer_tx, mut writer_rx) = mpsc::channel::<Vec<u8>>(1);
        let (_stdout_tx, stdout_rx) = broadcast::channel::<Vec<u8>>(1);
        let (exit_tx, exit_rx) = oneshot::channel::<i32>();
        drop(exit_tx);

        let spawned = super::finish_driver_spawn(
            ProcessDriver {
                writer_tx,
                stdout_rx,
                stderr_rx: None,
                exit_rx,
                terminator: None,
                writer_handle: None,
                resizer: None,
            },
            /*stdin_open*/ true,
        );

        spawned
            .session
            .writer_sender()
            .send(b"open".to_vec())
            .await
            .expect("stdin should stay open");
        assert_eq!(writer_rx.recv().await, Some(b"open".to_vec()));
    });
}

#[test]
fn finish_driver_spawn_closes_stdin_when_not_requested() {
    let runtime = current_thread_runtime();
    runtime.block_on(async move {
        let (writer_tx, _writer_rx) = mpsc::channel::<Vec<u8>>(1);
        let (_stdout_tx, stdout_rx) = broadcast::channel::<Vec<u8>>(1);
        let (exit_tx, exit_rx) = oneshot::channel::<i32>();
        drop(exit_tx);

        let spawned = super::finish_driver_spawn(
            ProcessDriver {
                writer_tx,
                stdout_rx,
                stderr_rx: None,
                exit_rx,
                terminator: None,
                writer_handle: None,
                resizer: None,
            },
            /*stdin_open*/ false,
        );

        assert!(
            spawned
                .session
                .writer_sender()
                .send(b"closed".to_vec())
                .await
                .is_err(),
            "stdin should be closed when streaming input is disabled"
        );
    });
}

#[test]
fn runner_stdin_writer_sends_close_stdin_after_input_eof() {
    let runtime = current_thread_runtime();
    runtime.block_on(async move {
        let tempdir = TempDir::new().expect("create tempdir");
        let frames_path = tempdir.path().join("runner-stdin-frames.bin");
        let file = OpenOptions::new()
            .create(true)
            .truncate(true)
            .read(true)
            .write(true)
            .open(&frames_path)
            .expect("create frame file");
        let outbound_tx = super::start_runner_pipe_writer(file);
        let (writer_tx, writer_rx) = mpsc::channel::<Vec<u8>>(1);
        let writer_handle = super::start_runner_stdin_writer(
            writer_rx,
            outbound_tx,
            /*normalize_newlines*/ false,
            /*stdin_open*/ true,
        );

        writer_tx
            .send(b"hello".to_vec())
            .await
            .expect("send stdin bytes");
        drop(writer_tx);
        writer_handle.await.expect("join stdin writer");

        let frames = wait_for_frame_count(&frames_path, 2);

        match &frames[0] {
            Message::Stdin { payload } => {
                let bytes = decode_bytes(&payload.data_b64).expect("decode stdin payload");
                assert_eq!(bytes, b"hello".to_vec());
            }
            other => panic!("expected stdin frame, got {other:?}"),
        }

        match &frames[1] {
            Message::CloseStdin { .. } => {}
            other => panic!("expected close-stdin frame, got {other:?}"),
        }
    });
}

#[test]
fn runner_resizer_sends_resize_frame() {
    let runtime = current_thread_runtime();
    runtime.block_on(async move {
        let tempdir = TempDir::new().expect("create tempdir");
        let frames_path = tempdir.path().join("runner-resize-frames.bin");
        let file = OpenOptions::new()
            .create(true)
            .truncate(true)
            .read(true)
            .write(true)
            .open(&frames_path)
            .expect("create frame file");
        let outbound_tx = super::start_runner_pipe_writer(file);
        let mut resizer = super::make_runner_resizer(outbound_tx);

        resizer(codex_utils_pty::TerminalSize {
            rows: 45,
            cols: 132,
        })
        .expect("send resize frame");

        let frames = wait_for_frame_count(&frames_path, 1);
        match &frames[0] {
            Message::Resize { payload } => {
                assert_eq!(payload.rows, 45);
                assert_eq!(payload.cols, 132);
            }
            other => panic!("expected resize frame, got {other:?}"),
        }
    });
}

#[test]
fn legacy_capture_powershell_emits_output() {
    let Some(pwsh) = pwsh_path() else {
        return;
    };
    let _guard = legacy_process_test_guard();
    let cwd = sandbox_cwd();
    let codex_home = sandbox_home("legacy-capture-pwsh");
    println!("capture pwsh codex_home={}", codex_home.path().display());
    let permission_profile = PermissionProfile::workspace_write();
    let result = run_windows_sandbox_capture(
        &permission_profile,
        workspace_roots_for(cwd.as_path()).as_slice(),
        codex_home.path(),
        vec![
            pwsh.display().to_string(),
            "-NoProfile".to_string(),
            "-Command".to_string(),
            "Write-Output LEGACY-CAPTURE-DIRECT".to_string(),
        ],
        cwd.as_path(),
        HashMap::new(),
        Some(10_000),
        /*cancellation*/ None,
        /*use_private_desktop*/ true,
    )
    .expect("run legacy capture powershell");
    println!("capture pwsh exit_code={}", result.exit_code);
    println!("capture pwsh timed_out={}", result.timed_out);
    let stdout = String::from_utf8_lossy(&result.stdout);
    let stderr = String::from_utf8_lossy(&result.stderr);
    println!("capture pwsh stderr={stderr:?}");
    assert_eq!(result.exit_code, 0, "stdout={stdout:?} stderr={stderr:?}");
    assert!(
        stdout.contains("LEGACY-CAPTURE-DIRECT"),
        "stdout={stdout:?}"
    );
}

#[test]
fn legacy_workspace_write_delete_is_limited_to_writable_roots() {
    let _guard = legacy_process_test_guard();
    let runtime = current_thread_runtime();
    runtime.block_on(async move {
        // Keep writable roots out of USERPROFILE exclusions such as AppData.
        let test_root = TempDir::new_in(sandbox_cwd()).expect("create legacy delete test root");
        let codex_home = sandbox_home("legacy-delete-writable-roots");
        let workspace = test_root.path().join("workspace");
        let temp_root = test_root.path().join("temp");
        let tmp_root = test_root.path().join("tmp");
        let outside_root = test_root.path().join("outside");
        for directory in [&workspace, &temp_root, &tmp_root, &outside_root] {
            fs::create_dir_all(directory).expect("create legacy delete test directory");
        }
        let protected_git_dir = workspace.join(".git");
        fs::create_dir(&protected_git_dir).expect("create protected .git directory");

        let workspace_file = workspace.join("workspace-delete.txt");
        let temp_file = temp_root.join("temp-delete.txt");
        let tmp_file = tmp_root.join("tmp-delete.txt");
        let outside_file = outside_root.join("outside-delete.txt");
        fs::write(&workspace_file, "workspace").expect("seed workspace file");
        fs::write(&temp_file, "temp").expect("seed TEMP file");
        fs::write(&tmp_file, "tmp").expect("seed TMP file");
        fs::write(&outside_file, "outside").expect("seed outside file");

        let probe = workspace.join("delete-access-probe.ps1");
        fs::write(&probe, legacy_delete_access_probe_script()).expect("write delete access probe");

        let script = workspace.join("delete-fixtures.cmd");
        fs::write(
            &script,
            concat!(
                "@echo off\r\n",
                "echo ==== legacy temporary diagnostics: whoami ====\r\n",
                "C:\\Windows\\System32\\whoami.exe /all 2>&1\r\n",
                "echo whoami_errorlevel=%errorlevel%\r\n",
                "echo ==== legacy temporary diagnostics: icacls ====\r\n",
                "C:\\Windows\\System32\\icacls.exe \"%DIAG_WORKSPACE%\" 2>&1\r\n",
                "C:\\Windows\\System32\\icacls.exe \"%WORKSPACE_DELETE%\" 2>&1\r\n",
                "C:\\Windows\\System32\\icacls.exe \"%PROTECTED_GIT_DIR%\" 2>&1\r\n",
                "C:\\Windows\\System32\\icacls.exe \"%DIAG_OUTSIDE_ROOT%\" 2>&1\r\n",
                "C:\\Windows\\System32\\icacls.exe \"%OUTSIDE_DELETE%\" 2>&1\r\n",
                "C:\\Windows\\System32\\icacls.exe \"%DIAG_TEMP_ROOT%\" 2>&1\r\n",
                "C:\\Windows\\System32\\icacls.exe \"%TEMP_DELETE%\" 2>&1\r\n",
                "C:\\Windows\\System32\\icacls.exe \"%DIAG_TMP_ROOT%\" 2>&1\r\n",
                "C:\\Windows\\System32\\icacls.exe \"%TMP_DELETE%\" 2>&1\r\n",
                "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"%DELETE_ACCESS_PROBE%\" 2>&1\r\n",
                "set \"probe_errorlevel=%errorlevel%\"\r\n",
                "echo probe_errorlevel=%probe_errorlevel%\r\n",
                "del /f /q \"%WORKSPACE_DELETE%\" 2>&1\r\n",
                "echo delete_workspace_errorlevel=%errorlevel%\r\n",
                "del /f /q \"%TEMP_DELETE%\" 2>&1\r\n",
                "echo delete_temp_errorlevel=%errorlevel%\r\n",
                "del /f /q \"%TMP_DELETE%\" 2>&1\r\n",
                "echo delete_tmp_errorlevel=%errorlevel%\r\n",
                "del /f /q \"%OUTSIDE_DELETE%\" 2>&1\r\n",
                "echo delete_outside_errorlevel=%errorlevel%\r\n",
                "rmdir \"%PROTECTED_GIT_DIR%\" 2>&1\r\n",
                "echo remove_git_errorlevel=%errorlevel%\r\n",
                "exit /b 0\r\n",
            ),
        )
        .expect("write delete script");

        let env_map = HashMap::from([
            ("TEMP".to_string(), temp_root.to_string_lossy().into_owned()),
            ("TMP".to_string(), tmp_root.to_string_lossy().into_owned()),
            (
                "DELETE_ACCESS_PROBE".to_string(),
                probe.to_string_lossy().into_owned(),
            ),
            (
                "CODEX_WINDOWS_LEGACY_TEMP_DIAGNOSTICS".to_string(),
                "1".to_string(),
            ),
            (
                "DIAG_WORKSPACE".to_string(),
                workspace.to_string_lossy().into_owned(),
            ),
            (
                "DIAG_TEMP_ROOT".to_string(),
                temp_root.to_string_lossy().into_owned(),
            ),
            (
                "DIAG_TMP_ROOT".to_string(),
                tmp_root.to_string_lossy().into_owned(),
            ),
            (
                "DIAG_OUTSIDE_ROOT".to_string(),
                outside_root.to_string_lossy().into_owned(),
            ),
            (
                "WORKSPACE_DELETE".to_string(),
                workspace_file.to_string_lossy().into_owned(),
            ),
            (
                "TEMP_DELETE".to_string(),
                temp_file.to_string_lossy().into_owned(),
            ),
            (
                "TMP_DELETE".to_string(),
                tmp_file.to_string_lossy().into_owned(),
            ),
            (
                "OUTSIDE_DELETE".to_string(),
                outside_file.to_string_lossy().into_owned(),
            ),
            (
                "PROTECTED_GIT_DIR".to_string(),
                protected_git_dir.to_string_lossy().into_owned(),
            ),
        ]);

        let permission_profile = PermissionProfile::workspace_write();
        let spawned = spawn_windows_sandbox_session_legacy(
            &permission_profile,
            workspace_roots_for(workspace.as_path()).as_slice(),
            codex_home.path(),
            vec![
                "C:\\Windows\\System32\\cmd.exe".to_string(),
                "/d".to_string(),
                "/c".to_string(),
                script.display().to_string(),
            ],
            workspace.as_path(),
            env_map,
            /*timeout_ms*/ Some(30_000),
            &[],
            &[],
            /*tty*/ false,
            /*stdin_open*/ false,
            /*use_private_desktop*/ true,
        )
        .await
        .expect("spawn legacy delete session");
        let (stdout, exit_code) =
            collect_stdout_and_exit(spawned, codex_home.path(), Duration::from_secs(/*secs*/ 45))
                .await;
        let stdout = String::from_utf8_lossy(&stdout);

        assert_eq!(
            (
                exit_code,
                workspace_file.exists(),
                temp_file.exists(),
                tmp_file.exists(),
                fs::read_to_string(&outside_file).ok(),
                protected_git_dir.is_dir(),
            ),
            (0, false, false, false, Some("outside".to_string()), true),
            "stdout={stdout:?}\n{}",
            sandbox_log(codex_home.path())
        );
    });
}

#[test]
fn legacy_capture_cancellation_is_not_reported_as_timeout() {
    let Some(pwsh) = pwsh_path() else {
        eprintln!("skipping cancellation regression test: PowerShell 7 is not installed");
        return;
    };
    let _guard = legacy_process_test_guard();
    let cwd = sandbox_cwd();
    let codex_home = sandbox_home("legacy-capture-cancel");
    let permission_profile = PermissionProfile::workspace_write();
    let cancelled = Arc::new(AtomicBool::new(false));
    let cancelled_for_token = Arc::clone(&cancelled);
    let cancellation =
        WindowsSandboxCancellationToken::new(move || cancelled_for_token.load(Ordering::SeqCst));
    let cancelled_for_thread = Arc::clone(&cancelled);
    let cancel_thread = std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(200));
        cancelled_for_thread.store(true, Ordering::SeqCst);
    });

    let started_at = Instant::now();
    let result = run_windows_sandbox_capture(
        &permission_profile,
        workspace_roots_for(cwd.as_path()).as_slice(),
        codex_home.path(),
        vec![
            pwsh.display().to_string(),
            "-NoProfile".to_string(),
            "-Command".to_string(),
            "Start-Sleep -Seconds 30".to_string(),
        ],
        cwd.as_path(),
        HashMap::new(),
        Some(30_000),
        /*cancellation*/ Some(cancellation),
        /*use_private_desktop*/ true,
    )
    .expect("run legacy capture powershell with cancellation");
    cancel_thread.join().expect("cancel thread should finish");

    assert!(
        started_at.elapsed() < Duration::from_secs(10),
        "cancellation should end capture before the timeout"
    );
    assert!(
        !result.timed_out,
        "cancellation should not be reported as a timeout"
    );
    assert_ne!(result.exit_code, 0);
}

#[test]
fn legacy_tty_powershell_emits_output_and_accepts_input() {
    let Some(pwsh) = pwsh_path() else {
        return;
    };
    let _guard = legacy_process_test_guard();
    let runtime = current_thread_runtime();
    runtime.block_on(async move {
        let cwd = sandbox_cwd();
        let codex_home = sandbox_home("legacy-tty-pwsh");
        println!("tty pwsh codex_home={}", codex_home.path().display());
        let permission_profile = PermissionProfile::workspace_write();
        let spawned = spawn_windows_sandbox_session_legacy(
            &permission_profile,
            workspace_roots_for(cwd.as_path()).as_slice(),
            codex_home.path(),
            vec![
                pwsh.display().to_string(),
                "-NoLogo".to_string(),
                "-NoProfile".to_string(),
                "-NoExit".to_string(),
                "-Command".to_string(),
                "$PID; Write-Output ready".to_string(),
            ],
            cwd.as_path(),
            HashMap::new(),
            Some(10_000),
            &[],
            &[],
            /*tty*/ true,
            /*stdin_open*/ true,
            /*use_private_desktop*/ true,
        )
        .await
        .expect("spawn legacy tty powershell session");
        println!("tty pwsh spawn returned");

        let writer = spawned.session.writer_sender();
        writer
            .send(b"Write-Output second\n".to_vec())
            .await
            .expect("send second command");
        writer
            .send(b"exit\n".to_vec())
            .await
            .expect("send exit command");
        spawned.session.close_stdin();

        let (stdout, exit_code) =
            collect_stdout_and_exit(spawned, codex_home.path(), Duration::from_secs(15)).await;
        let stdout = String::from_utf8_lossy(&stdout);
        assert_eq!(exit_code, 0, "stdout={stdout:?}");
        assert!(stdout.contains("ready"), "stdout={stdout:?}");
        assert!(stdout.contains("second"), "stdout={stdout:?}");
    });
}

#[test]
#[ignore = "TODO: legacy ConPTY cmd.exe exits with STATUS_DLL_INIT_FAILED in CI"]
fn legacy_tty_cmd_emits_output_and_accepts_input() {
    let runtime = current_thread_runtime();
    runtime.block_on(async move {
        let cwd = sandbox_cwd();
        let codex_home = sandbox_home("legacy-tty-cmd");
        println!("tty cmd codex_home={}", codex_home.path().display());
        let permission_profile = PermissionProfile::workspace_write();
        let spawned = spawn_windows_sandbox_session_legacy(
            &permission_profile,
            workspace_roots_for(cwd.as_path()).as_slice(),
            codex_home.path(),
            vec![
                "C:\\Windows\\System32\\cmd.exe".to_string(),
                "/K".to_string(),
                "echo ready".to_string(),
            ],
            cwd.as_path(),
            HashMap::new(),
            Some(10_000),
            &[],
            &[],
            /*tty*/ true,
            /*stdin_open*/ true,
            /*use_private_desktop*/ true,
        )
        .await
        .expect("spawn legacy tty cmd session");
        println!("tty cmd spawn returned");

        let writer = spawned.session.writer_sender();
        writer
            .send(b"echo second\n".to_vec())
            .await
            .expect("send second command");
        writer
            .send(b"exit\n".to_vec())
            .await
            .expect("send exit command");
        spawned.session.close_stdin();

        let (stdout, exit_code) =
            collect_stdout_and_exit(spawned, codex_home.path(), Duration::from_secs(15)).await;
        let stdout = String::from_utf8_lossy(&stdout);
        assert_eq!(exit_code, 0, "stdout={stdout:?}");
        assert!(stdout.contains("ready"), "stdout={stdout:?}");
        assert!(stdout.contains("second"), "stdout={stdout:?}");
    });
}

#[test]
#[ignore = "TODO: legacy ConPTY cmd.exe exits with STATUS_DLL_INIT_FAILED in CI"]
fn legacy_tty_cmd_default_desktop_emits_output_and_accepts_input() {
    let runtime = current_thread_runtime();
    runtime.block_on(async move {
        let cwd = sandbox_cwd();
        let codex_home = sandbox_home("legacy-tty-cmd-default-desktop");
        println!(
            "tty cmd default desktop codex_home={}",
            codex_home.path().display()
        );
        let permission_profile = PermissionProfile::workspace_write();
        let spawned = spawn_windows_sandbox_session_legacy(
            &permission_profile,
            workspace_roots_for(cwd.as_path()).as_slice(),
            codex_home.path(),
            vec![
                "C:\\Windows\\System32\\cmd.exe".to_string(),
                "/K".to_string(),
                "echo ready".to_string(),
            ],
            cwd.as_path(),
            HashMap::new(),
            Some(10_000),
            &[],
            &[],
            /*tty*/ true,
            /*stdin_open*/ true,
            /*use_private_desktop*/ false,
        )
        .await
        .expect("spawn legacy tty cmd session");
        println!("tty cmd default desktop spawn returned");

        let writer = spawned.session.writer_sender();
        writer
            .send(b"echo second\n".to_vec())
            .await
            .expect("send second command");
        writer
            .send(b"exit\n".to_vec())
            .await
            .expect("send exit command");
        spawned.session.close_stdin();

        let (stdout, exit_code) =
            collect_stdout_and_exit(spawned, codex_home.path(), Duration::from_secs(15)).await;
        let stdout = String::from_utf8_lossy(&stdout);
        assert_eq!(exit_code, 0, "stdout={stdout:?}");
        assert!(stdout.contains("ready"), "stdout={stdout:?}");
        assert!(stdout.contains("second"), "stdout={stdout:?}");
    });
}
