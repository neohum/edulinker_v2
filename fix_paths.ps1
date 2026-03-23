$content = Get-Content replace_icons_v2.ps1
$content = $content.Replace("e:\works\project\edulinker", "`$PSScriptRoot")
Set-Content replace_icons_v2.ps1 $content

$content = Get-Content fix_ico.ps1
$content = $content.Replace("e:\works\project\edulinker", "`$PSScriptRoot")
Set-Content fix_ico.ps1 $content
