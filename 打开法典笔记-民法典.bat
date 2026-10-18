@echo off
cd /d "%~dp0"
py -3 demo\launch.py --open --codex civil-code
if errorlevel 1 pause
