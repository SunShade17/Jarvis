param([ValidateSet("Speech", "Shortcut", "Both")][string]$Feature = "Both")
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$jarvisRoot = Split-Path -Parent $PSScriptRoot
$toolsDir = Join-Path $jarvisRoot ".jarvis/tools"
if (!(Test-Path -LiteralPath (Join-Path $jarvisRoot ".jarvis")) -and (Test-Path -LiteralPath (Join-Path $jarvisRoot ".dayfold"))) {
    $toolsDir = Join-Path $jarvisRoot ".dayfold/tools"
}
New-Item -Path $toolsDir -ItemType Directory -Force | Out-Null

function Get-VerifiedAsset([string]$url, [string]$name, [string]$digest) {
    $file = Join-Path $toolsDir $name
    if ((Test-Path -LiteralPath $file) -and (Get-FileHash -LiteralPath $file).Hash -eq $digest) { return $file }
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $file
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $digest) { throw "Checksum mismatch for $name." }
    return $file
}

if ($Feature -in "Speech", "Both") {
    $zip = Get-VerifiedAsset "https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.2/whisper-bin-x64.zip" "whisper-win64.zip" "b1514ebc099765e39fa37eb780b92a140a94c86bb0b3b3d98226b38825979732"
    Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $toolsDir "whisper") -Force
    $model = Get-VerifiedAsset "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en-q5_1.bin" "ggml-tiny.en-q5_1.bin" "c77c5766f1cef09b6b7d47f21b546cbddd4157886b3b5d6d4f709e91e66c7c2b"
    Write-Host "Local English transcription is ready. Refresh the Jarvis page."
}
if ($Feature -in "Shortcut", "Both") {
    $zip = Get-VerifiedAsset "https://github.com/AutoHotkey/AutoHotkey/releases/download/v2.0.31/AutoHotkey_2.0.31.zip" "autohotkey.zip" "ca1a595aca4528755d8d4cd7fed23d497a37bd9a0b6892072612d68dee1bd00a"
    Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $toolsDir "autohotkey") -Force
    Write-Host "Desktop capture is ready. Run desktop/start-shortcut.cmd to enable it."
}
