# organize_release.ps1
$Version = "V.1.0.2"
$ReleaseDir = "Releases\$Version"

# Create Directories
New-Item -ItemType Directory -Force -Path "$ReleaseDir\Offline Installer"
New-Item -ItemType Directory -Force -Path "$ReleaseDir\Online Installer"
New-Item -ItemType Directory -Force -Path "$ReleaseDir\Win unpacked"

# Move Offline Installer
if (Test-Path "dist\RMS-Setup-1.0.2.exe") {
    Move-Item -Path "dist\RMS-Setup-1.0.2.exe" -Destination "$ReleaseDir\Offline Installer" -Force
}
if (Test-Path "dist\latest.yml") {
    Copy-Item -Path "dist\latest.yml" -Destination "$ReleaseDir\Offline Installer" -Force
}

# Move Online Installer (and artifacts)
if (Test-Path "dist\nsis-web\RMS-Web-Setup-1.0.2.exe") {
    Move-Item -Path "dist\nsis-web\RMS-Web-Setup-1.0.2.exe" -Destination "$ReleaseDir\Online Installer" -Force
}
if (Test-Path "dist\nsis-web\*.7z") {
    Move-Item -Path "dist\nsis-web\*.7z" -Destination "$ReleaseDir\Online Installer" -Force
}

# Move Unpacked
$source = "dist\win-unpacked"
$dest = "$ReleaseDir\Win unpacked"

if (Test-Path $source) {
    if (Test-Path $dest) {
        Remove-Item -Recurse -Force $dest
    }
    Move-Item -Path $source -Destination $dest -Force
}

Write-Host "Release organized in $ReleaseDir"
