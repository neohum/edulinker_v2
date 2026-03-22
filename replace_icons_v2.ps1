Write-Host "Generating PNGs..."
npx -y sharp-cli@latest -i e:\works\project\edulinker\icon.svg -o e:\works\project\edulinker\icon.png resize 1024 1024
npx -y sharp-cli@latest -i e:\works\project\edulinker\icon.svg -o e:\works\project\edulinker\icon256.png resize 256 256

Write-Host "Generating ICO..."
npx -y png-to-ico@latest e:\works\project\edulinker\icon256.png > e:\works\project\edulinker\icon.ico

Write-Host "Copying SVGs..."
Copy-Item e:\works\project\edulinker\icon.svg -Destination e:\works\project\edulinker\teacher-app\frontend\public\favicon.svg -Force
Copy-Item e:\works\project\edulinker\icon.svg -Destination e:\works\project\edulinker\server-dashboard\frontend\public\favicon.svg -Force
Copy-Item e:\works\project\edulinker\icon.svg -Destination e:\works\project\edulinker\teacher-app\frontend\dist\favicon.svg -Force
Copy-Item e:\works\project\edulinker\icon.svg -Destination e:\works\project\edulinker\server-dashboard\frontend\dist\favicon.svg -Force

Write-Host "Copying PNGs"
Copy-Item e:\works\project\edulinker\icon.png -Destination e:\works\project\edulinker\teacher-app\build\appicon.png -Force
Copy-Item e:\works\project\edulinker\icon.png -Destination e:\works\project\edulinker\server-dashboard\build\appicon.png -Force
Copy-Item e:\works\project\edulinker\icon.png -Destination "e:\works\project\edulinker\web-service\src\app\(student)\student\icon.png" -Force
Copy-Item e:\works\project\edulinker\icon.png -Destination e:\works\project\edulinker\teacher-app\frontend\src\assets\images\logo-universal.png -Force
Copy-Item e:\works\project\edulinker\icon.png -Destination e:\works\project\edulinker\server-dashboard\frontend\src\assets\images\logo-universal.png -Force

Write-Host "Copying ICOs..."
# Note: we explicitly don't copy to build/windows/icon.ico for Wails apps so Wails can generate its multi-res correctly from appicon.png
Copy-Item e:\works\project\edulinker\icon.ico -Destination e:\works\project\edulinker\web-service\src\app\favicon.ico -Force

Write-Host "Cleaning up..."
Remove-Item e:\works\project\edulinker\icon256.png -Force

Write-Host "Replacement Complete!"
