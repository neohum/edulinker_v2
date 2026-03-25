$ErrorActionPreference = "Stop"

$isccPath = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if (-not (Test-Path $isccPath)) {
    $isccPath = "C:\Program Files\Inno Setup 6\ISCC.exe"
    if (-not (Test-Path $isccPath)) {
        # Check if it's implicitly in the path
        if (Get-Command iscc -ErrorAction SilentlyContinue) {
            $isccPath = "iscc"
        }
        else {
            Write-Error "Inno Setup 6 (ISCC.exe) not found. Please ensure it is installed."
            exit 1
        }
    }
}

Write-Host "Building teacher-app Wails binary..."
Set-Location "d:\works\edulinker_v2\teacher-app"
wails build -platform windows/amd64
if ($LASTEXITCODE -ne 0) { throw "wails build failed for teacher-app" }

Write-Host "Compiling setup script for teacher-app..."
& $isccPath "setup.iss"
if ($LASTEXITCODE -ne 0) { throw "iscc failed for teacher-app" }

Write-Host "Building server-dashboard Wails binary..."
Set-Location "d:\works\edulinker_v2\server-dashboard"
wails build -platform windows/amd64
if ($LASTEXITCODE -ne 0) { throw "wails build failed for server-dashboard" }

Write-Host "Compiling setup script for server-dashboard..."
& $isccPath "setup.iss"
if ($LASTEXITCODE -ne 0) { throw "iscc failed for server-dashboard" }

Set-Location "d:\works\edulinker_v2"
Write-Host "Done! Installers are in d:\works\edulinker_v2\installer."
