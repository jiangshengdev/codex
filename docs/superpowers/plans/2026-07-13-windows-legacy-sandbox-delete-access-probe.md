# Windows Legacy Sandbox Delete Access Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `legacy_workspace_write_delete_is_limited_to_writable_roots` 增加一次性 child token、`DELETE` / `FILE_DELETE_CHILD` 和 volume 窄诊断，并从 fork Windows x64/arm64 CI 取得同构 artifact。

**Architecture:** 目标测试生成临时 PowerShell/PInvoke probe，由 restricted `cmd.exe` 在原删除命令前运行。父侧测试在断言前 best-effort 持久化完整 stdout；reusable workflow 用默认关闭的 input 只为 fork Windows x64/arm64 配置输出目录并上传 artifact。

**Tech Stack:** Rust Windows-only tests, Windows PowerShell 5.1, C# P/Invoke, Win32 token/file/volume APIs, GitHub Actions reusable workflows, cargo-nextest.

---

## 执行前边界

- 对应设计：`docs/superpowers/specs/2026-07-13-windows-legacy-sandbox-delete-access-probe-design.md`
- 必须在 `dev` 分支执行。
- 用户必须先明确确认本计划；未确认时不得修改代码、workflow、stage 或 commit。
- 不安装 PowerShell、Windows target 或其他工具。
- 不运行 `git fetch` / `pull` / `push` / `remote` 或任何远程操作。
- 不修改 token、ACL、spawn、`PermissionProfile`、elevated backend 或产品协议。
- research 目录默认被 Git 忽略；只更新，不 stage/commit。

## 文件结构

- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs`
  - 生成临时 PowerShell/PInvoke probe。
  - 将 probe 插入五个原删除命令之前。
  - 仅在 CI 显式配置时持久化完整 stdout。
- Modify: `.github/workflows/rust-ci-full-nextest-platform.yml`
  - 默认关闭的 reusable input、Windows 诊断目录环境变量、best-effort artifact upload。
- Modify: `.github/workflows/rust-ci-full.yml`
  - 只在 Windows x64 和 arm64 调用中启用 input。
- Update after CI evidence: `docs/superpowers/research/2026-07-13-windows-legacy-sandbox-ci-evidence/current-findings.md`
- Append after CI evidence: `docs/superpowers/research/2026-07-13-windows-legacy-sandbox-ci-evidence/execution-log.md`

### Task 1: Add the restricted-child PowerShell/PInvoke probe

**Files:**
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs:458`
- Test: `codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs:458`

- [ ] **Step 1: Reconfirm the existing failing control and exact insertion point**

Read the target test and confirm the invariant tuple remains:

```rust
(0, false, false, false, Some("outside".to_string()), true)
```

Do not change the five existing `del` / `rmdir` commands, their relative order, their errorlevel lines, or this tuple.

- [ ] **Step 2: Add a helper that returns the complete temporary PowerShell script**

Add `fn legacy_delete_access_probe_script() -> &'static str` near the other test helpers. The returned raw string must contain these exact native declarations and constants:

```powershell
$source = @'
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
}
'@
```

Complete the class with these concrete methods:

- `DumpRestrictedToken()`:
  - open the current process token with `TOKEN_QUERY`;
  - print `child_token is_restricted=<true|false>`;
  - query `TokenRestrictedSids` in two calls;
  - calculate the first `SidAndAttributes` offset with `Marshal.OffsetOf(typeof(TokenGroupsOne), "Groups")`;
  - advance by `Marshal.SizeOf(typeof(SidAndAttributes))`, so x64 and ARM64 pointer widths are both correct;
  - convert each SID with `ConvertSidToStringSidW` and always release it with `LocalFree`;
  - print every item as `child_token restricted_sid index=<index> sid=<sid> attributes=0x<eight-hex-digits>`;
  - if one SID conversion fails, print `probe_error stage=token api=ConvertSidToStringSidW index=<index> code=<code>` and continue;
  - always release the token-information buffer with `FreeHGlobal` and each converted SID string with `LocalFree`;
  - if `OpenProcessToken` or the second `GetTokenInformation` fails, end only the token sub-probe and continue access/volume probes;
  - print other API failures as `probe_error stage=token api=<api> code=<GetLastWin32Error()>`.
- `ProbeAccess(string key, string path, bool directory, uint desiredAccess, string accessName)`:
  - call `CreateFileW` with `OPEN_EXISTING` and all three share flags;
  - use `FILE_FLAG_BACKUP_SEMANTICS` only for directories;
  - print `access_probe key=<key> access=<name> success=<true|false> code=<code>`;
  - save `Marshal.GetLastWin32Error()` immediately after a failed `CreateFileW`, before any other native call; use `code=0` on success;
  - dispose the handle immediately;
  - never use delete-on-close or a disposition API.
- `DumpVolume(string path, HashSet<string> seenRoots)`:
  - obtain the root with `GetVolumePathNameW`;
  - deduplicate case-insensitively;
  - print drive type, filesystem name, and `flags=0x{fileSystemFlags:x8}`;
  - on failure print `probe_error stage=volume api=GetVolumePathNameW key=<key> code=<code>` or
    `probe_error stage=volume api=GetVolumeInformationW root=<root> code=<code>`, then continue other targets;
  - do not print the volume label or serial number.

The PowerShell body must use the fixed environment keys already provided by the test:

```powershell
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
        [LegacyDeleteAccessProbe]::DumpVolume($target.Path, $seenRoots)
    }
    Write-Output "probe_end status=ok"
    exit 0
} catch {
    $message = ($_.Exception.Message -replace "[\r\n]+", " ")
    Write-Output "probe_error stage=powershell message=$message"
    Write-Output "probe_end status=error"
    exit 1
}
```

- [ ] **Step 3: Write the probe file and invoke it before the first delete**

Create `delete-access-probe.ps1` under `workspace`, then add this command before the first `del`:

```cmd
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%DELETE_ACCESS_PROBE%" 2>&1
set "probe_errorlevel=%errorlevel%"
echo probe_errorlevel=%probe_errorlevel%
```

Add `DELETE_ACCESS_PROBE` to `env_map` with the absolute probe path.

- [ ] **Step 4: Expand only this diagnostic test's timeout budget**

Change the target call to:

```rust
/*timeout_ms*/ Some(30_000),
```

and collect with:

```rust
collect_stdout_and_exit(spawned, codex_home.path(), Duration::from_secs(/*secs*/ 45))
```

- [ ] **Step 5: Run the narrow local command**

Run from `/Users/jiangsheng/cnb/codex/codex-rs`:

```bash
just test -p codex-windows-sandbox legacy_workspace_write_delete_is_limited_to_writable_roots
```

Expected on the current macOS host: command succeeds but may report zero matching Windows-only tests. This verifies only command/filter integrity, not P/Invoke runtime behavior.

Also run the static presence check:

```bash
rg -n -e 'probe_begin schema=1' -e 'FILE_DELETE_CHILD' -e 'GetVolumeInformationW' -e 'Some\(30_000\)' -e 'Duration::from_secs\(/\*secs\*/ 45\)' windows-sandbox-rs/src/unified_exec/tests.rs
```

Expected: every required diagnostic marker and both expanded budgets are present.

- [ ] **Step 6: Format, inspect, and commit Task 1**

Run:

```bash
just fmt
git diff --check -- windows-sandbox-rs/src/unified_exec/tests.rs
git diff -- windows-sandbox-rs/src/unified_exec/tests.rs
git add windows-sandbox-rs/src/unified_exec/tests.rs
git diff --cached --check
git diff --cached -- windows-sandbox-rs/src/unified_exec/tests.rs
git commit -m "test(windows-sandbox): add temporary delete access probe"
```

Do not rerun tests after `just fmt`.

### Task 2: Persist complete child stdout before the tuple assertion

**Files:**
- Modify: `codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs:76`
- Test: `codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs`

- [ ] **Step 1: Add a failing helper test without mutating process environment**

Add a Windows-only test that passes explicit arguments:

```rust
#[test]
fn legacy_delete_diagnostics_stdout_is_persisted_with_unique_name() {
    let output_dir = TempDir::new().expect("create diagnostics output dir");
    let path = persist_legacy_delete_diagnostics(
        output_dir.path(),
        "x86_64-pc-windows-msvc",
        "4",
        4242,
        b"probe_begin schema=1\r\nprobe_end status=ok\r\n",
    )
    .expect("persist diagnostics");

    assert_eq!(
        path.file_name().and_then(|name| name.to_str()),
        Some("windows-legacy-delete-probe-x86_64-pc-windows-msvc-shard-4-pid-4242.log")
    );
    assert_eq!(
        fs::read(path).expect("read diagnostics"),
        b"probe_begin schema=1\r\nprobe_end status=ok\r\n"
    );
}
```

- [ ] **Step 2: Run the test to verify RED**

```bash
just test -p codex-windows-sandbox legacy_delete_diagnostics_stdout_is_persisted_with_unique_name
```

Expected on Windows: RED compile failure because `persist_legacy_delete_diagnostics` is not defined. On the current macOS host, the Windows-only module may be excluded and the command may succeed with zero matching tests; record that limitation and do not install a Windows target.

- [ ] **Step 3: Add the minimal persistence helper**

```rust
fn persist_legacy_delete_diagnostics(
    output_dir: &Path,
    target: &str,
    shard: &str,
    pid: u32,
    stdout: &[u8],
) -> std::io::Result<PathBuf> {
    fs::create_dir_all(output_dir)?;
    let path = output_dir.join(format!(
        "windows-legacy-delete-probe-{target}-shard-{shard}-pid-{pid}.log"
    ));
    fs::write(&path, stdout)?;
    Ok(path)
}
```

- [ ] **Step 4: Call the helper before lossy conversion and assertion**

Use these exact environment variable names:

```rust
const LEGACY_DELETE_DIAGNOSTICS_DIR_ENV: &str =
    "CODEX_WINDOWS_LEGACY_DELETE_DIAGNOSTICS_DIR";
const LEGACY_DELETE_DIAGNOSTICS_TARGET_ENV: &str =
    "CODEX_WINDOWS_LEGACY_DELETE_DIAGNOSTICS_TARGET";
const LEGACY_DELETE_DIAGNOSTICS_SHARD_ENV: &str =
    "CODEX_WINDOWS_LEGACY_DELETE_DIAGNOSTICS_SHARD";
```

Immediately after `collect_stdout_and_exit`, before `String::from_utf8_lossy` and `assert_eq!`, add best-effort persistence. Only enable it when all three variables are present. On error, use `eprintln!`; do not change `exit_code` or return early.

If any one of the three environment variables is absent, skip persistence silently. Only emit a warning when all three are present but directory creation or file writing fails.

- [ ] **Step 5: Run the helper test to verify GREEN**

```bash
just test -p codex-windows-sandbox legacy_delete_diagnostics_stdout_is_persisted_with_unique_name
```

Expected on Windows: PASS. On the current macOS host the Windows-only module may be filtered out; record that limitation.

- [ ] **Step 6: Format, inspect, and commit Task 2**

```bash
just fmt
git diff --check -- windows-sandbox-rs/src/unified_exec/tests.rs
git diff -- windows-sandbox-rs/src/unified_exec/tests.rs
git add windows-sandbox-rs/src/unified_exec/tests.rs
git diff --cached --check
git diff --cached -- windows-sandbox-rs/src/unified_exec/tests.rs
git commit -m "test(windows-sandbox): persist temporary probe output"
```

Do not rerun tests after `just fmt`.

### Task 3: Add the default-off reusable workflow diagnostics channel

**Files:**
- Modify: `.github/workflows/rust-ci-full-nextest-platform.yml:5`

- [ ] **Step 1: Add the reusable input**

```yaml
      windows_legacy_delete_diagnostics:
        required: false
        default: false
        type: boolean
```

- [ ] **Step 2: Configure the output directory only when enabled on Windows**

Add before the `tests` step:

```yaml
      - name: Configure Windows legacy delete diagnostics
        if: ${{ runner.os == 'Windows' && inputs.windows_legacy_delete_diagnostics }}
        continue-on-error: true
        shell: bash
        run: |
          set -euo pipefail
          diagnostics_dir="${RUNNER_TEMP}/windows-legacy-delete-diagnostics/${{ inputs.target }}/shard-${{ matrix.shard }}"
          mkdir -p "${diagnostics_dir}"
          diagnostics_dir_windows="$(cygpath -w "${diagnostics_dir}")"
          {
            echo "CODEX_WINDOWS_LEGACY_DELETE_DIAGNOSTICS_DIR=${diagnostics_dir_windows}"
            echo "CODEX_WINDOWS_LEGACY_DELETE_DIAGNOSTICS_TARGET=${{ inputs.target }}"
            echo "CODEX_WINDOWS_LEGACY_DELETE_DIAGNOSTICS_SHARD=${{ matrix.shard }}"
          } >> "${GITHUB_ENV}"
```

- [ ] **Step 3: Add the best-effort artifact upload after tests and before JUnit**

```yaml
      - name: Upload Windows legacy delete diagnostics
        if: ${{ always() && runner.os == 'Windows' && inputs.windows_legacy_delete_diagnostics }}
        continue-on-error: true
        uses: actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f # v7.0.0
        with:
          name: windows-legacy-delete-diagnostics-${{ inputs.target }}-shard-${{ matrix.shard }}
          path: ${{ runner.temp }}/windows-legacy-delete-diagnostics/${{ inputs.target }}/shard-${{ matrix.shard }}
          if-no-files-found: ignore
```

- [ ] **Step 4: Validate and commit Task 3**

From `/Users/jiangsheng/cnb/codex` run:

```bash
git diff --check -- .github/workflows/rust-ci-full-nextest-platform.yml
actionlint -ignore 'SC2086' -ignore 'SC2129' -ignore 'SC2317' .github/workflows/rust-ci-full-nextest-platform.yml
git diff -- .github/workflows/rust-ci-full-nextest-platform.yml
git add .github/workflows/rust-ci-full-nextest-platform.yml
git diff --cached --check
git diff --cached -- .github/workflows/rust-ci-full-nextest-platform.yml
git commit -m "ci: collect temporary Windows delete diagnostics"
```

Expected: `actionlint` has no output and exits 0. Do not install it if absent; on this workspace it is currently available at `/opt/homebrew/bin/actionlint`.

### Task 4: Enable the diagnostics channel for both Windows comparison lanes

**Files:**
- Modify: `.github/workflows/rust-ci-full.yml:469`

- [ ] **Step 1: Enable x64 and arm64 together**

Add the same input to both Windows calls:

```yaml
      windows_legacy_delete_diagnostics: true
```

Do not add it to macOS or Linux calls.

- [ ] **Step 2: Validate exact enablement count**

```bash
rg -n -C 8 'windows_legacy_delete_diagnostics' .github/workflows/rust-ci-full.yml .github/workflows/rust-ci-full-nextest-platform.yml
```

Expected:

- one input definition with `default: false`;
- exactly two `true` call sites, Windows x64 and Windows arm64;
- no enablement in macOS or Linux jobs.

- [ ] **Step 3: Run workflow validation, format last, and commit Task 4**

```bash
actionlint -ignore 'SC2086' -ignore 'SC2129' -ignore 'SC2317' .github/workflows/rust-ci-full.yml .github/workflows/rust-ci-full-nextest-platform.yml
just fmt
git diff --check -- .github/workflows/rust-ci-full.yml .github/workflows/rust-ci-full-nextest-platform.yml codex-rs/windows-sandbox-rs/src/unified_exec/tests.rs
git diff -- .github/workflows/rust-ci-full.yml .github/workflows/rust-ci-full-nextest-platform.yml
git add .github/workflows/rust-ci-full.yml
git diff --cached --check
git diff --cached -- .github/workflows/rust-ci-full.yml
git commit -m "ci: enable Windows delete probe comparison"
```

Do not rerun tests after `just fmt`.

### Task 5: Perform the final local verification and hand off the remote run

**Files:**
- Verify only; do not modify files unless a verification failure reveals an in-scope defect.

- [ ] **Step 1: Run the final narrow Rust command before the final formatting pass if Task 4 did not already run `just fmt`**

```bash
cd /Users/jiangsheng/cnb/codex/codex-rs
just test -p codex-windows-sandbox legacy_workspace_write_delete_is_limited_to_writable_roots
```

Expected on macOS: command/filter integrity only; Windows runtime remains unverified.

- [ ] **Step 2: Verify the final commit sequence and scope**

```bash
cd /Users/jiangsheng/cnb/codex
git status --short
git log -4 --oneline
git show --stat --oneline HEAD~3..HEAD
```

Expected implementation commits, in order:

1. `test(windows-sandbox): add temporary delete access probe`
2. `test(windows-sandbox): persist temporary probe output`
3. `ci: collect temporary Windows delete diagnostics`
4. `ci: enable Windows delete probe comparison`

The implementation commits must contain only `tests.rs` and the two workflow files. Design and plan documents remain outside these implementation commits unless the user separately asks to submit them.

- [ ] **Step 3: Stop for user-run CI**

The agent must not push. Give the user the current branch and local commit SHAs. The user must push and trigger the fork `rust-ci-full` workflow themselves. Because `.github/**/*.yml` changed, the user may need their workflow upload approval process before pushing.

### Task 6: Accept Windows CI evidence and update research

**Files:**
- Modify: `docs/superpowers/research/2026-07-13-windows-legacy-sandbox-ci-evidence/execution-log.md`
- Modify: `docs/superpowers/research/2026-07-13-windows-legacy-sandbox-ci-evidence/current-findings.md`

- [ ] **Step 1: Verify both artifacts before drawing a conclusion**

Require one x64 and one arm64 artifact with:

- `probe_begin schema=1` and `probe_end status=ok`;
- `child_token is_restricted=...` and the restricted SID list;
- five object `DELETE` results;
- five parent `FILE_DELETE_CHILD` results;
- at least one deduplicated volume record;
- `probe_errorlevel`;
- unchanged original behavior: x64 retains its known tuple failure and arm64 retains its known pass.

An artifact containing only PowerShell/Add-Type failure is not completion evidence.

- [ ] **Step 2: Append the execution log**

Record the fork run ID, target, shard, artifact name, diagnostic filename, schema, original tuple, all probe errors, and whether each required record class is complete.

- [ ] **Step 3: Update stable findings only after cross-architecture comparison**

Add the child token result, the 5-by-2 access matrix, volume differences, and the manual correspondence with `del` / `rmdir`. Preserve these limits:

- do not claim the drive letter is causal;
- do not generalize to all Windows `WRITE_RESTRICTED` tokens;
- do not claim the probe proves which authorization path Windows ultimately used.

Research files remain ignored and uncommitted unless the user explicitly requests submission or archival.

### Task 7: Revert the temporary diagnostics after evidence is accepted

**Files:**
- Git history only; do not hand-edit reverse patches.

- [ ] **Step 1: Stop for explicit evidence-acceptance confirmation**

Do not revert merely because CI finished. Ask the user to confirm that x64/arm64 evidence is sufficient and the research update is accepted.

- [ ] **Step 2: Revert each temporary diagnostic commit independently in reverse order**

Use one revert commit per original commit:

```bash
git revert <enable-comparison-sha>
git revert <collect-artifact-sha>
git revert <persist-output-sha>
git revert <add-probe-sha>
git revert fb1660e98
```

If the older temporary diagnostics consist of additional commits, identify them from local history and continue in reverse order. Never use `git revert --no-commit`, a hand-written reverse patch, squash, or a combined staged revert.

- [ ] **Step 3: Inspect every revert immediately after creation**

```bash
git show --stat --oneline HEAD
git show --check HEAD
```

After all reverts, run the narrow command and then format according to the repository rule; do not rerun tests after formatting.

## 计划完成判据

- x64 与 arm64 均有可下载、同 schema 的诊断 artifact。
- child restricted token、5 个 `DELETE`、5 个 `FILE_DELETE_CHILD` 和 volume 记录完整。
- x64 原失败和 arm64 原通过行为不变。
- research 先固化稳定证据，且不把 C:/D: 相关性写成因果。
- 一次性诊断按原提交逆序、一提交一 revert 回退。
- 本计划不实施安全修复；修复方案必须根据新证据另行设计和计划。
