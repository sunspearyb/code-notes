@echo off
cd /d "%~dp0"
py -3 demo\launch.py --open --codex cyber-law
if errorlevel 1 pause
