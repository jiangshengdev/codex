param(
  [string]$Target = "",
  [string]$ArtifactId = "",
  [string]$Shard = "",
  [string]$HelperDir = ""
)

$ErrorActionPreference = "Continue"

function Write-Section {
  param([string]$Title)
  Write-Host ""
  Write-Host "===== $Title ====="
}

function Run-Command {
  param(
    [string]$Title,
    [scriptblock]$Body
  )

  Write-Section $Title
  try {
    & $Body
    Write-Host "exitCode=$LASTEXITCODE"
  } catch {
    Write-Host "exception=$($_.Exception.GetType().FullName): $($_.Exception.Message)"
  }
}

function Invoke-ChildPwsh {
  param(
    [string]$Title,
    [hashtable]$Environment = @{}
  )

  Write-Section $Title
  $pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
  if (-not $pwsh) {
    Write-Host "pwsh command not found"
    return
  }

  $oldValues = @{}
  foreach ($entry in $Environment.GetEnumerator()) {
    $name = $entry.Key
    $oldValues[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
    [Environment]::SetEnvironmentVariable($name, [string]$entry.Value, "Process")
  }

  try {
    & $pwsh.Source -NoLogo -NoProfile -Command @'
$ErrorActionPreference = "Continue"
"child.PSVersion=$($PSVersionTable.PSVersion)"
"child.PSEdition=$($PSVersionTable.PSEdition)"
"child.OS=$($PSVersionTable.OS)"
"child.ProcessArch=$([System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture)"
"child.OSArch=$([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture)"
"child.PSHome=$PSHOME"
"child.PSModulePath=$env:PSModulePath"
"child.UtilityModulePaths=$((Get-Module -ListAvailable Microsoft.PowerShell.Utility | Select-Object -ExpandProperty Path) -join ';')"
try {
  Import-Module Microsoft.PowerShell.Utility -ErrorAction Stop
  "child.ImportUtility=ok"
} catch {
  "child.ImportUtility=error:$($_.Exception.Message)"
}
try {
  $cmd = Get-Command Write-Output -ErrorAction Stop
  "child.WriteOutputCommand=$($cmd.Source)"
  Write-Output "child.WriteOutput=ok"
} catch {
  "child.WriteOutput=error:$($_.Exception.Message)"
}
'@
    Write-Host "child.exitCode=$LASTEXITCODE"
  } finally {
    foreach ($entry in $Environment.GetEnumerator()) {
      [Environment]::SetEnvironmentVariable($entry.Key, $oldValues[$entry.Key], "Process")
    }
  }
}

Write-Section "probe context"
Write-Host "target=$Target"
Write-Host "artifactId=$ArtifactId"
Write-Host "shard=$Shard"
Write-Host "helperDir=$HelperDir"
Write-Host "runner.os=$env:RUNNER_OS"
Write-Host "runner.arch=$env:RUNNER_ARCH"
Write-Host "runner.name=$env:RUNNER_NAME"
Write-Host "image.os=$env:ImageOS"
Write-Host "image.version=$env:ImageVersion"
Write-Host "processor.architecture=$env:PROCESSOR_ARCHITECTURE"
Write-Host "processor.architew6432=$env:PROCESSOR_ARCHITEW6432"
Write-Host "programFiles=$env:ProgramFiles"
Write-Host "programW6432=$env:ProgramW6432"
Write-Host "process.arch=$([System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture)"
Write-Host "os.arch=$([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture)"

Write-Section "current PowerShell"
$PSVersionTable | Format-List * | Out-String | Write-Host
Write-Host "PSHOME=$PSHOME"
Write-Host "PSModulePath=$env:PSModulePath"

Write-Section "pwsh command"
$pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
if ($pwsh) {
  $pwsh | Format-List * | Out-String | Write-Host
  & $pwsh.Source -NoLogo -NoProfile -Command '$PSVersionTable | Format-List *; "PSHOME=$PSHOME"; "PSModulePath=$env:PSModulePath"'
  Write-Host "pwsh.selfTest.exitCode=$LASTEXITCODE"
} else {
  Write-Host "pwsh command not found"
}

Write-Section "module discovery"
Get-Module -ListAvailable Microsoft.PowerShell.Utility |
  Select-Object Name, Version, ModuleType, Path, ModuleBase |
  Format-List * |
  Out-String |
  Write-Host

$moduleCandidates = @(
  (Join-Path $PSHOME "Modules\Microsoft.PowerShell.Utility"),
  (Join-Path $env:ProgramFiles "PowerShell\7\Modules\Microsoft.PowerShell.Utility"),
  (Join-Path $env:ProgramFiles "WindowsPowerShell\Modules\Microsoft.PowerShell.Utility"),
  (Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\Modules\Microsoft.PowerShell.Utility")
)
foreach ($path in $moduleCandidates) {
  Write-Host "moduleCandidate=$path exists=$(Test-Path $path)"
  if (Test-Path $path) {
    Get-ChildItem -Force $path | Select-Object Mode, Length, Name | Format-Table -AutoSize | Out-String | Write-Host
  }
}

Run-Command "import and Write-Output in current process" {
  Import-Module Microsoft.PowerShell.Utility -Verbose
  $cmd = Get-Command Write-Output -ErrorAction Stop
  $cmd | Format-List Name, CommandType, Source, Version | Out-String | Write-Host
  Write-Output "current.WriteOutput=ok"
}

Invoke-ChildPwsh "child pwsh with inherited environment"
Invoke-ChildPwsh "child pwsh with empty PSModulePath" @{ PSModulePath = "" }
Invoke-ChildPwsh "child pwsh with PSModulePath set to PSHOME modules" @{ PSModulePath = (Join-Path $PSHOME "Modules") }

if ($HelperDir) {
  Write-Section "downloaded helper files"
  Write-Host "helperDir.exists=$(Test-Path $HelperDir)"
  if (Test-Path $HelperDir) {
    Get-ChildItem -Force $HelperDir | Select-Object Mode, Length, Name, FullName | Format-List * | Out-String | Write-Host
  }
}

exit 0
