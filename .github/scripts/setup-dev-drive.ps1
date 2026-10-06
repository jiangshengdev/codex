# Configure a fast drive for Windows CI jobs.
#
# Preserve an existing D: volume, including NTFS. Otherwise use an empty hosted
# runner temporary disk, or create a Dev Drive VHD when none is available.
param([switch]$GitHubHostedRunner)

function Test-DevDrive {
    param([string]$Drive)

    # The English hosted images return exit code 0 even for ordinary volumes.
    $PSNativeCommandUseErrorActionPreference = $false
    $Output = & fsutil.exe devdrv query $Drive 2>&1
    $QueryExitCode = $LASTEXITCODE
    $global:LASTEXITCODE = 0
    if ($QueryExitCode -ne 0) {
        throw "Dev Drive query failed for ${Drive}: $Output"
    }
    if ($Output -match '^This is not a developer volume\.') {
        return $false
    }
    if ($Output -match '^This is (?:a|an)(?: trusted| untrusted)? developer volume\.') {
        return $true
    }
    throw "Unrecognized Dev Drive query response for ${Drive}: $Output"
}

function Test-EmptyRunnerDisk {
    param($Disk)

    # Restrict provisioning to the temporary NVMe model observed on hosted
    # runners. RAW alone does not identify a disposable disk.
    return (
        $Disk.FriendlyName -eq 'Microsoft NVMe Direct Disk v2' -and
        $Disk.BusType -eq 'NVMe' -and
        $Disk.PartitionStyle -eq 'RAW' -and
        $Disk.NumberOfPartitions -eq 0 -and
        $Disk.AllocatedSize -eq 0 -and
        $Disk.Size -gt 0 -and
        -not [string]::IsNullOrWhiteSpace($Disk.UniqueId) -and
        $Disk.IsBoot -eq $false -and
        $Disk.IsSystem -eq $false -and
        $Disk.IsOffline -eq $false -and
        $Disk.IsReadOnly -eq $false -and
        $Disk.HealthStatus -eq 'Healthy'
    )
}

function Invoke-BestEffort {
    param([scriptblock]$Script, [string]$Description)

    try {
        & $Script
    } catch {
        Write-Warning "${Description} failed: $($_.Exception.Message)"
    }
}

if (Test-Path "D:\") {
    if (Test-DevDrive "D:") {
        Write-Output "Using existing Dev Drive at D:"
    } else {
        Write-Output "Using existing ordinary build volume at D: (not a Dev Drive)"
    }
    $Drive = "D:"
} else {
    try {
        $Candidates = @()
        if ($GitHubHostedRunner -and $env:GITHUB_ACTIONS -eq 'true' -and $env:RUNNER_OS -eq 'Windows') {
            $Candidates = @(Get-Disk -ErrorAction Stop | Where-Object { Test-EmptyRunnerDisk $_ })
        }
        if ($Candidates.Count -gt 1) {
            throw 'Multiple empty runner disks found; refusing to choose a disk to initialize.'
        }

        if ($Candidates.Count -eq 1) {
            # Refresh the selected disk immediately before changing its state.
            $Disk = Get-Disk -Number $Candidates[0].Number -ErrorAction Stop
            if (-not (Test-EmptyRunnerDisk $Disk) -or $Disk.UniqueId -ne $Candidates[0].UniqueId) {
                throw 'The selected runner disk changed before initialization.'
            }
            if (@(Get-Partition -ErrorAction Stop | Where-Object { $_.DiskNumber -eq $Disk.Number }).Count -ne 0) {
                throw 'The selected runner disk has partitions; refusing to initialize it.'
            }
            Write-Output "Provisioning empty hosted runner disk $($Disk.Number) ($($Disk.Size) bytes)."
        } else {
            $VhdPath = Join-Path $env:RUNNER_TEMP "codex-dev-drive.vhdx"
            $SizeBytes = 64GB
            if (Test-Path $VhdPath) {
                throw "Refusing to replace existing VHD at $VhdPath."
            }
            Write-Output 'No eligible temporary disk found; creating a 64 GiB Dev Drive VHD.'
            New-VHD -Path $VhdPath -SizeBytes $SizeBytes -Dynamic -ErrorAction Stop | Out-Null
            $Mounted = Mount-VHD -Path $VhdPath -Passthru -ErrorAction Stop
            $Disk = $Mounted | Get-Disk -ErrorAction Stop
        }

        $Disk | Initialize-Disk -PartitionStyle GPT -ErrorAction Stop
        $Partition = $Disk | New-Partition -AssignDriveLetter -UseMaximumSize -ErrorAction Stop
        $Volume = $Partition | Format-Volume -FileSystem ReFS -NewFileSystemLabel "CodexDevDrive" -DevDrive -Confirm:$false -Force -ErrorAction Stop

        $Drive = "$($Volume.DriveLetter):"

        if (-not (Test-DevDrive $Drive)) {
            throw "Provisioned volume at $Drive did not pass Dev Drive verification."
        }

        Invoke-BestEffort {
            fsutil.exe devdrv trust $Drive
            if ($LASTEXITCODE -ne 0) { throw "fsutil exited with $LASTEXITCODE" }
        } "Trusting Dev Drive $Drive"
        Invoke-BestEffort {
            fsutil.exe devdrv enable /disallowAv
            if ($LASTEXITCODE -ne 0) { throw "fsutil exited with $LASTEXITCODE" }
        } "Disabling AV filter attachment for Dev Drives"
        $global:LASTEXITCODE = 0

        Write-Output "Using Dev Drive at $Drive"
    } catch {
        throw "Failed to create Dev Drive: $($_.Exception.Message)"
    }
}

$BuildVolume = Get-Volume -DriveLetter $Drive.TrimEnd(':') -ErrorAction Stop
Write-Output "CI build volume ${Drive}: $($BuildVolume.FileSystem), size=$($BuildVolume.Size), free=$($BuildVolume.SizeRemaining) bytes."
"CI_BUILD_ROOT=$Drive" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
