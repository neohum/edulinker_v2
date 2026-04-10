# Build script for teacher-app and server-dashboard
# Usage:
#   .\build.ps1              # reads GITHUB_TOKEN from .env automatically
#   .\build.ps1 -Target teacher   # build only teacher-app
#
# The token is injected at compile time via -ldflags and never written to source.

param(
    [string]$Token = "",
    [string]$Target = "all"   # "all" | "teacher" | "server"
)

# Load .env file if token not provided
if (-not $Token) {
    $envFile = Join-Path $PSScriptRoot ".env"
    if (Test-Path $envFile) {
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^\s*GITHUB_TOKEN\s*=\s*(.+)$') {
                $Token = $Matches[1].Trim()
            }
        }
    }
}

# Fall back to environment variable
if (-not $Token) {
    $Token = $env:GITHUB_TOKEN
}

if (-not $Token) {
    Write-Error "GITHUB_TOKEN not found. Add it to .env file or set `$env:GITHUB_TOKEN."
    exit 1
}

$ldflags = "-X main.githubToken=$Token"

function Build-App {
    param([string]$Dir, [string]$Label)
    Write-Host "`n=== Building $Label ===" -ForegroundColor Cyan
    Push-Location $Dir
    wails build -ldflags $ldflags
    if ($LASTEXITCODE -ne 0) {
        Write-Error "$Label build failed."
        Pop-Location
        exit $LASTEXITCODE
    }
    Pop-Location
    Write-Host "$Label build OK" -ForegroundColor Green
}

$root = $PSScriptRoot

if ($Target -eq "all" -or $Target -eq "teacher") {
    Build-App "$root\teacher-app" "teacher-app"
}

if ($Target -eq "all" -or $Target -eq "server") {
    Build-App "$root\server-dashboard" "server-dashboard"
}

Write-Host "`nAll builds complete." -ForegroundColor Green
Write-Host "Next: compile Inno Setup installers, then create GitHub releases."
