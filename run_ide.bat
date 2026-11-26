@echo off
cd /d "%~dp0frontend"
set ELECTRON_RUN_AS_NODE=

if not exist "node_modules\electron\dist\electron.exe" (
    echo [ERROR] Electron binary not found. Running npm install...
    call "%ProgramFiles%\nodejs\npm.cmd" install
)

if not exist "dist\index.html" (
    echo [INFO] Building frontend assets...
    call "%ProgramFiles%\nodejs\npm.cmd" run build
)

start "" "node_modules\electron\dist\electron.exe" .
exit
