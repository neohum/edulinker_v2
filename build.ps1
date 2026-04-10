# Build script for teacher-app and server-dashboard
# Usage:
#   $env:GITHUB_TOKEN = "ghp_xxxx"   # set your Classic PAT
#   .\build.ps1
#
# The token is injected at compile time via -ldflags and never written to source.

param(
    [string]$Token = $env:GITHUB_TOKEN,
    [string]$Target = "all"   # "all" | "teacher" | "server"
)

if (-not $Token) {
    Write-Error "GITHUB_TOKEN is not set. Run:  `$env:GITHUB_TOKEN = 'ghp_xxxx'  then retry."
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
