npx -y sharp-cli@latest -i e:\works\project\edulinker\icon.svg -o e:\works\project\edulinker\icon256.png resize 256 256
npx -y png-to-ico@latest e:\works\project\edulinker\icon256.png > e:\works\project\edulinker\valid_icon.ico

Copy-Item e:\works\project\edulinker\valid_icon.ico -Destination e:\works\project\edulinker\teacher-app\build\windows\icon.ico -Force
Copy-Item e:\works\project\edulinker\valid_icon.ico -Destination e:\works\project\edulinker\server-dashboard\build\windows\icon.ico -Force
Copy-Item e:\works\project\edulinker\valid_icon.ico -Destination e:\works\project\edulinker\web-service\src\app\favicon.ico -Force

echo "Valid ICO files replaced successfully"
