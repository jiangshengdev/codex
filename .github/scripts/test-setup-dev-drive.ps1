# Run without Pester or storage mutations. Load only function definitions from
# the real script so the checks cannot initialize, format, or mount a disk.
$ErrorActionPreference = 'Stop'
$SourcePath = Join-Path $PSScriptRoot 'setup-dev-drive.ps1'
$Tokens = $null
$ParseErrors = $null
$Ast = [System.Management.Automation.Language.Parser]::ParseFile($SourcePath, [ref]$Tokens, [ref]$ParseErrors)
if ($ParseErrors.Count -ne 0) {
    throw ($ParseErrors | Out-String)
}
foreach ($Name in @('Test-DevDrive', 'Test-EmptyRunnerDisk')) {
    $Definition = $Ast.Find({
        param($Node)
        $Node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $Node.Name -eq $Name
    }, $true)
    if ($null -eq $Definition) { throw "Missing function $Name" }
    . ([scriptblock]::Create($Definition.Extent.Text))
}

function Assert-Equal($Actual, $Expected, [string]$Label) {
    if ($Actual -ne $Expected) { throw "${Label}: expected $Expected, got $Actual" }
}

# Both responses were observed with exit code 0 on the hosted Windows images.
function fsutil.exe {
    $global:LASTEXITCODE = $script:QueryExitCode
    $script:QueryOutput
}
$script:QueryExitCode = 0
$script:QueryOutput = 'This is not a developer volume.'
Assert-Equal (Test-DevDrive 'D:') $false 'Ordinary NTFS volume'
$script:QueryOutput = @('This is a trusted developer volume.', 'No filters are currently attached to this developer volume.')
Assert-Equal (Test-DevDrive 'D:') $true 'Trusted Dev Drive'
$script:QueryOutput = 'This is an untrusted developer volume.'
Assert-Equal (Test-DevDrive 'D:') $true 'Untrusted Dev Drive'
foreach ($Response in @(
    @{ ExitCode = 1; Output = 'Access is denied.' },
    @{ ExitCode = 0; Output = 'Unknown response' },
    @{ ExitCode = 1; Output = 'This is a trusted developer volume.' }
)) {
    $script:QueryExitCode = $Response.ExitCode
    $script:QueryOutput = $Response.Output
    $Threw = $false
    try { Test-DevDrive 'D:' | Out-Null } catch { $Threw = $true }
    Assert-Equal $Threw $true 'Query errors must not become ordinary-volume results'
    Assert-Equal $global:LASTEXITCODE 0 'Native exit code is handled by the query'
}

$EmptyDisk = @{
    FriendlyName = 'Microsoft NVMe Direct Disk v2'
    BusType = 'NVMe'
    PartitionStyle = 'RAW'
    NumberOfPartitions = 0
    AllocatedSize = 0
    Size = 220GB
    UniqueId = 'test-temporary-disk'
    IsBoot = $false
    IsSystem = $false
    IsOffline = $false
    IsReadOnly = $false
    HealthStatus = 'Healthy'
}
Assert-Equal (Test-EmptyRunnerDisk ([pscustomobject]$EmptyDisk)) $true 'Empty temporary NVMe'
foreach ($Change in @(
    @{ FriendlyName = 'Unrelated NVMe disk' },
    @{ BusType = 'SAS' },
    @{ PartitionStyle = 'GPT' },
    @{ NumberOfPartitions = 1 },
    @{ AllocatedSize = 1MB },
    @{ Size = 0 },
    @{ UniqueId = '' },
    @{ IsBoot = $true },
    @{ IsSystem = $true },
    @{ IsOffline = $true },
    @{ IsReadOnly = $true },
    @{ HealthStatus = 'Unhealthy' }
)) {
    $Disk = $EmptyDisk.Clone()
    foreach ($Key in $Change.Keys) { $Disk[$Key] = $Change[$Key] }
    Assert-Equal (Test-EmptyRunnerDisk ([pscustomobject]$Disk)) $false "Protected disk: $($Change.Keys)"
}
Assert-Equal (Test-EmptyRunnerDisk ([pscustomobject]@{})) $false 'Missing disk metadata'
Write-Output 'Build volume detection and disk guard checks passed.'
