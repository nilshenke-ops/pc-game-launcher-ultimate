# Builds the Windows companion EXE on Windows (PowerShell). Requires Node.js 20+ and the .NET 8 SDK.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\publish-companion.ps1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Out = Join-Path $Root "artifacts"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js fehlt (https://nodejs.org)" }
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) { throw ".NET 8 SDK fehlt (https://dotnet.microsoft.com/download)" }
[xml]$props = Get-Content (Join-Path $Root "companion\Directory.Build.props")
$Version = $props.Project.PropertyGroup.Version

Write-Host "==> Web-App bauen"
Push-Location (Join-Path $Root "web")
if (-not (Test-Path node_modules)) { npm ci; if ($LASTEXITCODE) { throw "npm ci fehlgeschlagen" } }
npm run build; if ($LASTEXITCODE) { throw "Web-Build fehlgeschlagen" }
Pop-Location

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
