@echo off
setlocal
set "NODE=node"
where node >nul 2>nul || set "NODE=C:\Users\大宝贝\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
set "RADAR_HOME=%~dp0data"
"%NODE%" "%~dp0radar.mjs" %*
