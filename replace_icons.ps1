# Generate root icon.png
npx -y sharp-cli@latest -i e:\works\project\edulinker\icon.svg -o e:\works\project\edulinker\icon.png resize 1024 1024

# Generate root icon.ico
npx -y png-to-ico@latest e:\works\project\edulinker\icon.png > e:\works\project\edulinker\icon.ico

# Copy SVGs
Copy-Item e:\works\project\edulinker\icon.svg -Destination e:\works\project\edulinker\teacher-app\frontend\public\favicon.svg -Force
Copy-Item e:\works\project\edulinker\icon.svg -Destination e:\works\project\edulinker\server-dashboard\frontend\public\favicon.svg -Force
Copy-Item e:\works\project\edulinker\icon.svg -Destination e:\works\project\edulinker\teacher-app\frontend\dist\favicon.svg -Force
Copy-Item e:\works\project\edulinker\icon.svg -Destination e:\works\project\edulinker\server-dashboard\frontend\dist\favicon.svg -Force

# Copy PNGs
Copy-Item e:\works\project\edulinker\icon.png -Destination e:\works\project\edulinker\teacher-app\build\appicon.png -Force
Copy-Item e:\works\project\edulinker\icon.png -Destination e:\works\project\edulinker\server-dashboard\build\appicon.png -Force
Copy-Item e:\works\project\edulinker\icon.png -Destination "e:\works\project\edulinker\web-service\src\app\(student)\student\icon.png" -Force
Copy-Item e:\works\project\edulinker\icon.png -Destination e:\works\project\edulinker\teacher-app\frontend\src\assets\images\logo-universal.png -Force
Copy-Item e:\works\project\edulinker\icon.png -Destination e:\works\project\edulinker\server-dashboard\frontend\src\assets\images\logo-universal.png -Force

# Copy ICOs
Copy-Item e:\works\project\edulinker\icon.ico -Destination e:\works\project\edulinker\teacher-app\build\windows\icon.ico -Force
Copy-Item e:\works\project\edulinker\icon.ico -Destination e:\works\project\edulinker\server-dashboard\build\windows\icon.ico -Force
Copy-Item e:\works\project\edulinker\icon.ico -Destination e:\works\project\edulinker\web-service\src\app\favicon.ico -Force

echo "All icons replaced successfully"
