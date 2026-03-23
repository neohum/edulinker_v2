npx -y sharp-cli@latest -i $PSScriptRoot\icon.svg -o $PSScriptRoot\icon256.png resize 256 256
npx -y png-to-ico@latest $PSScriptRoot\icon256.png > $PSScriptRoot\valid_icon.ico

Copy-Item $PSScriptRoot\valid_icon.ico -Destination $PSScriptRoot\teacher-app\build\windows\icon.ico -Force
Copy-Item $PSScriptRoot\valid_icon.ico -Destination $PSScriptRoot\server-dashboard\build\windows\icon.ico -Force
Copy-Item $PSScriptRoot\valid_icon.ico -Destination $PSScriptRoot\web-service\src\app\favicon.ico -Force

echo "Valid ICO files replaced successfully"
