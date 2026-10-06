param(
    [Parameter(Mandatory)]
    [ValidateSet('Before', 'After')]
    [string]$Phase,
    [switch]$ScanDirectories
)

$ErrorActionPreference = 'Stop'
$ReportDirectory = Join-Path $env:RUNNER_TEMP 'windows-disk-probe'
New-Item -ItemType Directory -Path $ReportDirectory -Force | Out-Null
$ProbeErrors = [System.Collections.Generic.List[string]]::new()

# Capture volumes before directory traversal or report writes affect free space.
$RecordedAtUtc = [DateTime]::UtcNow.ToString('o')
$Volumes = @(Get-Volume | Sort-Object DriveLetter |
    Select-Object DriveLetter, Path, UniqueId, FileSystem, FileSystemLabel, Size, SizeRemaining,
        HealthStatus, OperationalStatus)
$Disks = @(Get-Disk | Select-Object Number, FriendlyName, BusType, Size, PartitionStyle,
    NumberOfPartitions, AllocatedSize, LargestFreeExtent, IsOffline, OfflineReason,
    IsReadOnly, IsBoot, IsSystem, HealthStatus, OperationalStatus)
$PartitionErrors = @()
$Partitions = @(Get-Partition -ErrorAction SilentlyContinue -ErrorVariable +PartitionErrors |
    Select-Object DiskNumber, PartitionNumber, DriveLetter, AccessPaths, Offset, Size,
        Type, GptType, MbrType, IsHidden, IsOffline, IsReadOnly, IsBoot, IsSystem,
        NoDefaultDriveLetter)
foreach ($PartitionError in $PartitionErrors) {
    $ProbeErrors.Add("Partition inspection failed: $PartitionError")
}

# Preserve native diagnostics and exit codes without treating a negative query
# as a probe failure. Do not infer Dev Drive status solely from the exit code.
function Get-DevDriveQuery {
    param([string]$Target)
    $PSNativeCommandUseErrorActionPreference = $false
    $Output = @(& fsutil.exe devdrv query $Target 2>&1)
    $ExitCode = $LASTEXITCODE
    [pscustomobject]@{
        Target = $Target
        ExitCode = $ExitCode
        Output = @($Output | ForEach-Object { $_.ToString() })
    }
}
$DevDriveQueries = @(foreach ($Volume in $Volumes) {
    $Target = if ($Volume.DriveLetter) { "$($Volume.DriveLetter):" } else { $Volume.Path }
    if ($Target) { Get-DevDriveQuery -Target $Target }
})
# Query failures are expected for unsupported volumes and are recorded above.
$global:LASTEXITCODE = 0
$VhdPath = Join-Path $env:RUNNER_TEMP 'codex-dev-drive.vhdx'
$Vhd = $null
if (Test-Path -LiteralPath $VhdPath) {
    try {
        $Vhd = Get-VHD -Path $VhdPath |
            Select-Object Path, VhdType, FileSize, Size, MinimumSize, Attached, DiskNumber
    } catch {
        $ProbeErrors.Add("VHD inspection failed: $($_.Exception.Message)")
    }
}

$Directories = @()
if ($Phase -eq 'Before' -and $ScanDirectories) {
    # Inventory candidates only; this report does not authorize deleting them.
    $Candidates = @(
        $env:ANDROID_HOME
        $env:ANDROID_SDK_ROOT
        $(if ($env:RUNNER_TOOL_CACHE) { $env:RUNNER_TOOL_CACHE } else { 'C:\hostedtoolcache' })
        "${env:ProgramFiles}\dotnet"
        "${env:ProgramFiles}\Java"
        "${env:ProgramFiles}\LLVM"
        "${env:ProgramFiles}\Microsoft Visual Studio"
        "${env:ProgramFiles(x86)}\Microsoft Visual Studio"
        "${env:ProgramFiles(x86)}\Windows Kits"
        "${env:ProgramFiles(x86)}\Android"
        "${env:ProgramData}\chocolatey"
        'C:\ghcup'
    ) | Where-Object { $_ } | Sort-Object -Unique

    $Directories = @(foreach ($Path in $Candidates) {
        $ScanErrors = @()
        $Bytes = [long]0
        $Files = [long]0
        $SkippedLinks = [long]0
        $Status = 'complete'
        if (-not (Test-Path -LiteralPath $Path)) {
            $Status = 'absent'
        } else {
            # Walk explicitly so junctions cannot cross volumes or double-count trees.
            $Pending = [System.Collections.Generic.Stack[string]]::new()
            $Pending.Push($Path)
            while ($Pending.Count -gt 0) {
                $Current = $Pending.Pop()
                $Item = Get-Item -LiteralPath $Current -Force -ErrorAction SilentlyContinue -ErrorVariable +ScanErrors
                if ($null -eq $Item) { continue }
                if ($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                    $SkippedLinks++
                    continue
                }
                Get-ChildItem -LiteralPath $Current -Force -ErrorAction SilentlyContinue -ErrorVariable +ScanErrors |
                    ForEach-Object {
                        if ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                            $SkippedLinks++
                        } elseif ($_.PSIsContainer) {
                            $Pending.Push($_.FullName)
                        } else {
                            $Bytes += $_.Length
                            $Files++
                        }
                    }
            }
            if ($ScanErrors.Count -gt 0) { $Status = 'incomplete' }
        }
        [pscustomobject]@{
            Path = $Path
            Status = $Status
            LogicalBytes = $Bytes
            Files = $Files
            SkippedReparsePoints = $SkippedLinks
            Errors = @($ScanErrors | ForEach-Object { $_.ToString() })
        }
    })
}

$Report = [ordered]@{
    Phase = $Phase
    RecordedAtUtc = $RecordedAtUtc
    ImageOS = $env:ImageOS
    ImageVersion = $env:ImageVersion
    RunnerArch = $env:RUNNER_ARCH
    RunnerTemp = $env:RUNNER_TEMP
    BuildRoot = $env:CI_BUILD_ROOT
    Volumes = $Volumes
    Disks = $Disks
    Partitions = $Partitions
    DevDriveQueries = $DevDriveQueries
    Vhd = $Vhd
    Directories = $Directories
    DirectoryScanRequested = [bool]$ScanDirectories
    Errors = @($ProbeErrors.ToArray())
}
$Report | ConvertTo-Json -Depth 8 |
    Set-Content -LiteralPath (Join-Path $ReportDirectory "$Phase.json") -Encoding utf8

$Summary = @(
    "## Windows disk probe: $Phase ($env:RUNNER_ARCH)"
    ''
    'Volume values are bytes. Directory sizes are logical file lengths, not reclaimable disk space.'
    'Directory rows may overlap; do not add them together. Reparse points are excluded.'
    ''
    '| Volume | Filesystem | Total bytes | Free bytes |'
    '| --- | --- | ---: | ---: |'
)
foreach ($Volume in $Volumes) {
    $VolumeName = if ($Volume.DriveLetter) { "$($Volume.DriveLetter):" } else { $Volume.Path }
    $Summary += "| $VolumeName | $($Volume.FileSystem) | $($Volume.Size) | $($Volume.SizeRemaining) |"
}
$Summary += @('', '### Disks', '', '| Disk | Bus | Partition style | Total bytes | Largest free extent | Offline | Read-only |', '| --- | --- | --- | ---: | ---: | --- | --- |')
foreach ($Disk in $Disks) {
    $Summary += "| $($Disk.Number) | $($Disk.BusType) | $($Disk.PartitionStyle) | $($Disk.Size) | $($Disk.LargestFreeExtent) | $($Disk.IsOffline) | $($Disk.IsReadOnly) |"
}
$Summary += @('', '### Partitions', '', '| Disk / partition | Type | Bytes | Access paths |', '| --- | --- | ---: | --- |')
foreach ($Partition in $Partitions) {
    $Summary += "| $($Partition.DiskNumber) / $($Partition.PartitionNumber) | $($Partition.Type) | $($Partition.Size) | $($Partition.AccessPaths -join ', ') |"
}
foreach ($Query in $DevDriveQueries) {
    $Summary += @('', "### fsutil devdrv query $($Query.Target)", "Exit code: $($Query.ExitCode)", '', '```text')
    $Summary += $Query.Output
    $Summary += '```'
}
if ($Vhd) {
    $Summary += @('', "VHD maximum bytes: $($Vhd.Size); backing file bytes: $($Vhd.FileSize).")
}
if ($Directories.Count -gt 0) {
    $Summary += @('', '| Directory | Status | Logical bytes | Skipped links |', '| --- | --- | ---: | ---: |')
    foreach ($Directory in $Directories) {
        $Summary += "| $($Directory.Path) | $($Directory.Status) | $($Directory.LogicalBytes) | $($Directory.SkippedReparsePoints) |"
    }
}
foreach ($ProbeError in $ProbeErrors) {
    $Summary += "Inspection error: $ProbeError"
}
$Summary += @('', 'This probe does not run a build and cannot measure peak build usage.', '')
$Summary | Set-Content -LiteralPath (Join-Path $ReportDirectory "$Phase.md") -Encoding utf8
$Summary | Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY -Encoding utf8
$Summary | Write-Output
Get-Content -LiteralPath (Join-Path $ReportDirectory "$Phase.json") -Raw | Write-Output
if ($ProbeErrors.Count -gt 0) {
    throw 'Disk inspection was incomplete; see the uploaded report.'
}
