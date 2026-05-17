#!/usr/bin/env python3

import os
import sys


SKILL_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if SKILL_ROOT not in sys.path:
    sys.path.insert(0, SKILL_ROOT)

from scripts.wxsender.cli import main


if __name__ == "__main__":
    main()
