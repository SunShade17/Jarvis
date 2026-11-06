@echo off
setlocal
set "jarvisAhk=%~dp0..\.jarvis\tools\autohotkey\AutoHotkey64.exe"
if not exist "%jarvisAhk%" set "jarvisAhk=%~dp0..\.dayfold\tools\autohotkey\AutoHotkey64.exe"
if not exist "%jarvisAhk%" (
  echo Run scripts\setup-windows.ps1 -Feature Shortcut first.
  pause
  exit /b 1
)
start "" "%jarvisAhk%" "%~dp0jarvis.ahk"
