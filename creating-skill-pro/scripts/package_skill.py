#!/usr/bin/env python3
"""打包 skill 目录为 `.skill` 文件。"""

from __future__ import annotations

import sys
import zipfile
from pathlib import Path

from quick_validate import validate_skill


IGNORED_NAMES = {"__pycache__", ".DS_Store"}
IGNORED_SUFFIXES = {".pyc"}


def should_package(path: Path) -> bool:
    return (
        path.is_file()
        and path.name not in IGNORED_NAMES
        and path.suffix not in IGNORED_SUFFIXES
        and "__pycache__" not in path.parts
    )


def package_skill(skill_path: str, output_dir: str | None = None) -> Path | None:
    skill_path_obj = Path(skill_path).resolve()
    if not skill_path_obj.exists() or not skill_path_obj.is_dir():
        print(f"错误：skill 目录不存在：{skill_path_obj}")
        return None

    valid, message = validate_skill(skill_path_obj)
    if not valid:
        print(f"错误：打包前校验失败：{message}")
        return None

    target_dir = Path(output_dir).resolve() if output_dir else Path.cwd()
    target_dir.mkdir(parents=True, exist_ok=True)
    output_path = target_dir / f"{skill_path_obj.name}.skill"

    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for file_path in skill_path_obj.rglob("*"):
            if should_package(file_path):
                arcname = file_path.relative_to(skill_path_obj.parent)
                zipf.write(file_path, arcname)

    print(f"已生成：{output_path}")
    return output_path


def main() -> None:
    if len(sys.argv) < 2:
        print("用法：python3 scripts/package_skill.py <skill目录> [输出目录]")
        sys.exit(1)

    result = package_skill(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
    sys.exit(0 if result else 1)


if __name__ == "__main__":
    main()
