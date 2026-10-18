#!/usr/bin/env python3
"""Start the local service. Prefer the installed document runtime; retain a standard-Python fallback.

`--codex <名称>` opens another data pack in demo/codes (its own port and data folder, see edition.py).
"""
import os
from pathlib import Path
import sys

script = Path(__file__).resolve().parent / 'serve.py'
bundled = Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3'
python = str(bundled) if bundled.is_file() and os.access(bundled, os.X_OK) else sys.executable
os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
args = sys.argv[1:]
if '--codex' in args:  # the data pack is chosen before edition.py is imported, so pass it in the environment
    i = args.index('--codex')
    os.environ['FADIAN_CODEX'] = args[i + 1]
    del args[i:i + 2]
os.execv(python, [python, str(script), *args])
