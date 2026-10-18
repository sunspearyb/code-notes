#!/bin/zsh
app_directory="${0:A:h}"
if ! command -v python3 >/dev/null 2>&1; then
  print '请先安装 Python 3.9 或以上版本，然后重新打开。'
  read '?按回车关闭。'
  exit 1
fi
python3 "$app_directory/demo/launch.py" --open --codex cyber-law
