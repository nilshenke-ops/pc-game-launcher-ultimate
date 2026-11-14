# Builds the Windows companion EXE on Windows (PowerShell). Requires Node.js 20+ and the .NET 8 SDK.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\publish-companion.ps1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Out = Join-Path $Root "artifacts"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js fehlt (https://nodejs.org)" }
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) { throw ".NET 8 SDK fehlt (https://dotnet.microsoft.com/download)" }
$Version = (Get-Content (Join-Path $Root "VERSION") -Raw).Trim()   # single version source

Write-Host "==> Web-App bauen"
Push-Location (Join-Path $Root "web")
if (-not (Test-Path node_modules)) { npm ci; if ($LASTEXITCODE) { throw "npm ci fehlgeschlagen" } }
npm run build; if ($LASTEXITCODE) { throw "Web-Build fehlgeschlagen" }
Pop-Location

Write-Host "==> Intel PresentMon für die FPS-Messung einbetten"
# Fixed version from Intel's GitHub releases; the file is only used when its Authenticode signature is valid and from Intel.
# Without it the companion still builds – it then says honestly that this build contains no FPS measurement.
$PmTag = if ($env:PRESENTMON_TAG) { $env:PRESENTMON_TAG } else { "v2.3.0" }
$pmDir = Join-Path $Root "companion\src\Companion.Windows\tools"
$pmExe = Join-Path $pmDir "PresentMon.exe"
New-Item -ItemType Directory -Force $pmDir | Out-Null
if (-not (Test-Path $pmExe)) {
  try {
    $headers = @{ "User-Agent" = "pgl-build" }
    if ($env:GH_TOKEN) { $headers["Authorization"] = "Bearer $($env:GH_TOKEN)" }
    try { $rel = Invoke-RestMethod -Headers $headers "https://api.github.com/repos/GameTechDev/PresentMon/releases/tags/$PmTag" }
    catch {
      Write-Warning "PresentMon $PmTag nicht gefunden – nehme die neueste 2.x-Version."
      $rel = (Invoke-RestMethod -Headers $headers "https://api.github.com/repos/GameTechDev/PresentMon/releases?per_page=20") | Where-Object { $_.tag_name -like "v2.*" -and -not $_.prerelease } | Select-Object -First 1
    }
    $asset = $rel.assets | Where-Object { $_.name -match '^PresentMon-[\d.]+-x64\.exe$' } | Select-Object -First 1
    if (-not $asset) { throw "Keine Konsolen-EXE in $($rel.tag_name) gefunden: $($rel.assets.name -join ', ')" }
    Invoke-WebRequest -Headers $headers $asset.browser_download_url -OutFile $pmExe
    $sig = Get-AuthenticodeSignature $pmExe
    if ($sig.Status -ne "Valid" -or $sig.SignerCertificate.Subject -notmatch "Intel Corporation") {
      Remove-Item $pmExe -Force
      throw "Signatur von $($asset.name) ungültig oder nicht von Intel ($($sig.Status), $($sig.SignerCertificate.Subject))"
    }
    Write-Host "PresentMon $($rel.tag_name) ($($asset.name)), signiert von: $($sig.SignerCertificate.Subject)"
  } catch {
    Write-Warning "PresentMon nicht eingebettet: $($_.Exception.Message). Die FPS-Messung fehlt in diesem Build."
  }
}

Write-Host "==> Companion veröffentlichen"
$pub = Join-Path $Out "companion"
if (Test-Path $pub) { Remove-Item -Recurse -Force $pub }
dotnet publish (Join-Path $Root "companion\src\Companion.Windows\Companion.Windows.csproj") -c Release -r win-x64 --self-contained true `
  -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true -p:DebugType=none -o $pub --nologo
if ($LASTEXITCODE) { throw "dotnet publish fehlgeschlagen" }
Get-ChildItem $pub -Include *.xml,*.pdb -Recurse | Remove-Item -Force

$exe = Join-Path $pub "PCGameLauncherCompanion.exe"
$sha = (Get-FileHash $exe -Algorithm SHA256).Hash.ToLower()
$size = (Get-Item $exe).Length
Copy-Item (Join-Path $Root "docs\LIESMICH-Companion.txt") (Join-Path $pub "LIESMICH.txt")
"$sha  PCGameLauncherCompanion.exe" | Set-Content -Encoding ascii (Join-Path $pub "SHA256SUMS.txt")
$zip = Join-Path $Out "PCGameLauncherCompanion-$Version-win-x64.zip"
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path $exe, (Join-Path $pub "LIESMICH.txt"), (Join-Path $pub "SHA256SUMS.txt") -DestinationPath $zip

$dl = Join-Path $Root "relay\downloads"
New-Item -ItemType Directory -Force $dl | Out-Null
Copy-Item $exe $dl -Force
"{`"fileName`":`"PCGameLauncherCompanion.exe`",`"size`":$size,`"sha256`":`"$sha`",`"version`":`"$Version`"}" | Set-Content -Encoding ascii (Join-Path $dl "manifest.json")
Write-Host "Fertig: $exe ($size Bytes), SHA256 $sha"
Write-Host "ZIP: $zip"
