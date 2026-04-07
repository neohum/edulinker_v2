$ErrorActionPreference = 'Stop'

Write-Host "Checking if Scoop is installed..."
$shims = "$env:USERPROFILE\scoop\shims"

if (!(Get-Command scoop -ErrorAction SilentlyContinue)) {
    if (!(Test-Path $shims)) {
        Write-Host "Scoop is not installed. Installing Scoop..."
        Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
        Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
    }
} else {
    Write-Host "Scoop is already installed."
}

# 1. 현재 세션에 PATH 임시 추가
if ($env:Path -notlike "*$shims*") {
    $env:Path = "$shims;" + $env:Path
}

# 2. 영구적으로 사용자 환경 변수에 PATH 등록 (설치 직후 터미널 재시작 없이도 영구 반영)
$userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($userPath -notlike "*$shims*") {
    [Environment]::SetEnvironmentVariable("PATH", "$shims;" + $userPath, "User")
    Write-Host "Scoop shims PATH permanently added to User registry."
}

Write-Host "Updating Scoop..."
scoop update

Write-Host "Ensuring git is installed (required for buckets)..."
if (!(Get-Command git -ErrorAction SilentlyContinue)) {
    scoop install git
}

Write-Host "Adding Scoop extras/versions/main buckets..."
foreach ($b in @("main", "versions", "extras")) {
    scoop bucket add $b 2>$null
}

$programs = @("go", "aria2", "redis", "minio", "nssm")

foreach ($prog in $programs) {
    Write-Host "Checking if $prog is installed..."
    $installed = scoop list | Select-String -Pattern "^\s*$prog\s+"
    if (-not $installed) {
        Write-Host "Installing $prog..."
        scoop install $prog
    } else {
        Write-Host "$prog is already installed."
    }
}

Write-Host "All required dependencies (including Go) have been installed successfully, and Go PATH is permanently registered."
