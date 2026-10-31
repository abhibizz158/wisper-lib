@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or 24 LTS with npm is required. Install it from https://nodejs.org/ and run this command again.
  exit /b 1
)
node "%~dp0scripts\dev.mjs" %*
exit /b %errorlevel%
