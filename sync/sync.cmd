@echo off
REM Pull the latest Strava activities into data\import.json
cd /d "%~dp0.."
python sync\strava_sync.py pull %*
echo.
pause
