param([switch]$Restart, [switch]$OpenBrowser)
$ErrorActionPreference = "Stop"
$jarvisRoot = Split-Path -Parent $PSScriptRoot
$entry = Join-Path $jarvisRoot "server.mjs"
$port = if ($env:PORT) { [int]$env:PORT } else { 4317 }
$envFile = Join-Path $jarvisRoot ".env"
if (!$env:PORT -and (Test-Path -LiteralPath $envFile)) {
    $setting = Select-String -Path $envFile -Pattern '^\s*PORT\s*=\s*(\d+)\s*$' | Select-Object -Last 1
    if ($setting) { $port = [int]$setting.Matches[0].Groups[1].Value }
}
$listener = Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($listener) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    if ($proc.Name -ne "node.exe" -or !$proc.CommandLine.Contains($entry)) {
        throw "Port $port is in use. If Jarvis is running in a terminal, use that terminal to restart it."
    }
    if ($Restart) { Stop-Process -Id $proc.ProcessId -ErrorAction Stop }
}
if (!$listener -or $Restart) {
    $serverProcess = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList ('"' + $entry + '"') -WorkingDirectory $jarvisRoot -WindowStyle Hidden -PassThru
    Start-Sleep -Milliseconds 750
    if ($serverProcess.HasExited) { throw "Jarvis could not start. Run node server.mjs in the project folder for details." }
}
Write-Host "Jarvis is running at http://127.0.0.1:$port/"
if ($OpenBrowser) { Start-Process "http://127.0.0.1:$port/" }
