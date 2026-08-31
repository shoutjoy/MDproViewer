$ErrorActionPreference = 'Stop'
$sourceExe = Join-Path $PSScriptRoot '..\mdpro-viewer.exe'
$installedExe = 'C:\Program Files\MDpro\mdpro-viewer.exe'
$backupExe = 'C:\Program Files\MDpro\mdpro-viewer.before-fileopen-20260831.exe'
if (Get-Process mdpro-viewer -ErrorAction SilentlyContinue) {
    throw 'Close MDpro Viewer before replacing its executable.'
}
if (-not (Test-Path -LiteralPath $backupExe)) {
    Copy-Item -LiteralPath $installedExe -Destination $backupExe
}
Copy-Item -LiteralPath $sourceExe -Destination $installedExe -Force
if ((Get-FileHash -LiteralPath $sourceExe).Hash -ne (Get-FileHash -LiteralPath $installedExe).Hash) {
    throw 'Installed executable hash mismatch.'
}
