if ([string]::IsNullOrEmpty($PSScriptRoot)) { $PSScriptRoot = (Get-Location).Path }
Write-Host "Generating PNGs..."
npx.cmd -y sharp-cli@latest -i "$PSScriptRoot/icon.svg" -o "$PSScriptRoot/icon.png" resize 1024 1024
npx.cmd -y sharp-cli@latest -i "$PSScriptRoot/icon.svg" -o "$PSScriptRoot/icon256.png" resize 256 256

Write-Host "Generating ICO..."
cmd.exe /c "npx.cmd -y png2icons@latest ""$PSScriptRoot/icon256.png"" ""$PSScriptRoot/icon"" -ico -i"

Write-Host "Copying SVGs..."
Copy-Item $PSScriptRoot\icon.svg -Destination $PSScriptRoot\teacher-app\frontend\public\favicon.svg -Force
Copy-Item $PSScriptRoot\icon.svg -Destination $PSScriptRoot\server-dashboard\frontend\public\favicon.svg -Force
Copy-Item $PSScriptRoot\icon.svg -Destination $PSScriptRoot\teacher-app\frontend\dist\favicon.svg -Force
Copy-Item $PSScriptRoot\icon.svg -Destination $PSScriptRoot\server-dashboard\frontend\dist\favicon.svg -Force

Write-Host "Copying PNGs"
Copy-Item $PSScriptRoot\icon.png -Destination $PSScriptRoot\teacher-app\build\appicon.png -Force
Copy-Item $PSScriptRoot\icon.png -Destination $PSScriptRoot\server-dashboard\build\appicon.png -Force
Copy-Item $PSScriptRoot\icon.png -Destination "$PSScriptRoot\web-service\src\app\(student)\student\icon.png" -Force
Copy-Item $PSScriptRoot\icon.png -Destination $PSScriptRoot\teacher-app\frontend\src\assets\images\logo-universal.png -Force
Copy-Item $PSScriptRoot\icon.png -Destination $PSScriptRoot\server-dashboard\frontend\src\assets\images\logo-universal.png -Force

Write-Host "Copying ICOs..."
Copy-Item $PSScriptRoot\icon.ico -Destination $PSScriptRoot\teacher-app\build\windows\icon.ico -Force
Copy-Item $PSScriptRoot\icon.ico -Destination $PSScriptRoot\server-dashboard\build\windows\icon.ico -Force
Copy-Item $PSScriptRoot\icon.ico -Destination $PSScriptRoot\web-service\src\app\favicon.ico -Force

Write-Host "Cleaning up..."
Remove-Item $PSScriptRoot\icon256.png -Force

Write-Host "Replacement Complete!"
