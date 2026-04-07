$ErrorActionPreference = 'Stop'

Write-Host "Checking if Scoop is installed..."
if (!(Get-Command scoop -ErrorAction SilentlyContinue)) {
    Write-Host "Scoop is not installed. Installing Scoop..."
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
    Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
    
    # Explicitly append scoop shims to current PATH to avoid immediately needing a new terminal
    $env:Path = "$env:USERPROFILE\scoop\shims;" + $env:Path
} else {
    Write-Host "Scoop is already installed."
}

# Ensure scoop command works
if (!(Get-Command scoop -ErrorAction SilentlyContinue)) {
    $env:Path = "$env:USERPROFILE\scoop\shims;" + $env:Path
}

Write-Host "Updating Scoop..."
scoop update

Write-Host "Ensuring git is installed (required for buckets)..."
if (!(Get-Command git -ErrorAction SilentlyContinue)) {
    scoop install git
}

Write-Host "Adding Scoop extras bucket..."
scoop bucket add extras

$programs = @("postgresql", "redis", "minio")

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

Write-Host "All required dependencies have been installed successfully."
