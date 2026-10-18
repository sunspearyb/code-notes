@echo off
cd /d "%~dp0"
py -3 demo\launch.py --open
if errorlevel 1 pause
