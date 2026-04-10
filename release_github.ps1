$ErrorActionPreference = "Stop"

$githubToken = ""
if (Test-Path ".env") {
    $envContent = Get-Content ".env"
    foreach ($line in $envContent) {
        if ($line -match "^GITHUB_TOKEN=(.+)$") {
            $githubToken = $matches[1].Trim()
        }
    }
}

if ($githubToken -eq "") {
    Write-Error "GITHUB_TOKEN not found in .env file."
    exit 1
}

$owner = "neohum"
$repo = "edulinker_v2"
$headers = @{
    "Authorization" = "Bearer $githubToken"
    "Accept"        = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
}

function Create-Release {
    param($tagName, $name, $body)
    $uri = "https://api.github.com/repos/$owner/$repo/releases"
    $payload = @{
        tag_name = $tagName
        name     = $name
        body     = $body
        draft    = $false
        prerelease = $false
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $payload
        return $response
    } catch {
        # If release already exists, try to get it
        Write-Host "Release might already exist, fetching existing release..."
        $uriGet = "https://api.github.com/repos/$owner/$repo/releases/tags/$tagName"
        $response = Invoke-RestMethod -Uri $uriGet -Method Get -Headers $headers
        return $response
    }
}

function Upload-Asset {
    param($uploadUrl, $filePath, $fileName)
    # uploadUrl is like "https://uploads.github.com/repos/owner/repo/releases/assets{?name,label}"
    # Need to clean it up
    $cleanUrl = $uploadUrl.Split("{")[0]
    $uri = "$($cleanUrl)?name=$fileName"
    
    Write-Host "Uploading $fileName to $uri..."
    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    
    $assetHeaders = $headers.Clone()
    $assetHeaders.Add("Content-Type", "application/octet-stream")
    
    Invoke-RestMethod -Uri $uri -Method Post -Headers $assetHeaders -Body $bytes
}

# 1. Server Release
Write-Host "Processing Server Release..."
$serverRel = Create-Release "server-v1.0.4" "Server Dashboard v1.0.4" "Automatic background update enabled."
Upload-Asset $serverRel.upload_url "installer/edulinker-server-dashboard-setup-v1.0.4.exe" "edulinker-server-dashboard-setup-v1.0.4.exe"

# 2. Teacher Release
Write-Host "Processing Teacher Release..."
$teacherRel = Create-Release "teacher-v1.0.4" "Teacher App v1.0.4" "Server version sync notification enabled."
Upload-Asset $teacherRel.upload_url "installer/edulinker-teacher-setup-v1.0.4.exe" "edulinker-teacher-setup-v1.0.4.exe"

Write-Host "Releases completed successfully."
