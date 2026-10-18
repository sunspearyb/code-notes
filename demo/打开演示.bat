@echo off
cd /d "%~dp0"
py -3 launch.py --open
if errorlevel 1 pause
