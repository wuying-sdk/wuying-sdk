#!/usr/bin/env python3
"""Compatibility launcher for the complete, compiler-based API generator."""
from pathlib import Path
import subprocess
import sys
project = Path(__file__).resolve().parents[1]
raise SystemExit(subprocess.call(['node', str(project / 'scripts/generate-full-api.cjs'), *sys.argv[1:]], cwd=project))
