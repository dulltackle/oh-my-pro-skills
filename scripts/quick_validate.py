#!/usr/bin/env python3
"""快速校验 skill 结构与关键引用。"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml


ALLOWED_PROPERTIES = {"name", "description", "license", "allowed-tools", "metadata"}
TEXT_EXTENSIONS = {".md", ".py", ".json", ".html", ".txt", ".yaml", ".yml"}
IGNORE_VENDOR_SCAN = {
    "references/merging/source-mapping.md",
    "LICENSE.txt",
    "scripts/quick_validate.py",
}


def parse_frontmatter(skill_md: Path) -> tuple[dict, str]:
    content = skill_md.read_text()
    if not content.startswith("---"):
        raise ValueError("未找到 YAML frontmatter")
    match = re.match(r"^---\n(.*?)\n---\n?(.*)$", content, re.DOTALL)
    if not match:
        raise ValueError("frontmatter 格式非法")
    frontmatter = yaml.safe_load(match.group(1))
    if not isinstance(frontmatter, dict):
        raise ValueError("frontmatter 必须是 YAML 字典")
    return frontmatter, match.group(2)


def validate_name(name: str, skill_path: Path) -> str | None:
    if not isinstance(name, str) or not name.strip():
        return "缺少 `name`"
    name = name.strip()
    if not re.match(r"^[a-z0-9-]+$", name):
        return "name 必须使用 kebab-case，仅包含小写字母、数字和连字符"
    if name.startswith("-") or name.endswith("-") or "--" in name:
        return "name 不能以连字符开头/结尾，也不能包含连续连字符"
    if len(name) > 64:
        return "name 长度不能超过 64"
    segments = [segment for segment in name.split("-") if segment]
    if not segments or not segments[0].endswith("ing"):
        return "name 第一段应使用动名词形式（以 ing 结尾）"
    if any(segment in {"anthropic", "claude"} for segment in segments):
        return "name 不能包含保留词 anthropic 或 claude"
    if skill_path.name != name:
        return f"name `{name}` 必须与目录名 `{skill_path.name}` 完全一致"
    return None


def validate_description(description: str) -> str | None:
    if not isinstance(description, str) or not description.strip():
        return "缺少 `description`"
    description = description.strip()
    if "<" in description or ">" in description:
        return "description 不能包含尖括号"
    if len(description) > 1024:
        return "description 长度不能超过 1024 字符"
    return None


def collect_path_references(text: str) -> set[str]:
    patterns = [
        r"(references/[A-Za-z0-9._/\-]+)",
        r"(scripts/[A-Za-z0-9._/\-]+)",
        r"(agents/[A-Za-z0-9._/\-]+)",
        r"(eval-viewer/[A-Za-z0-9._/\-]+)",
        r"(LICENSE\.txt)",
    ]
    refs: set[str] = set()
    for pattern in patterns:
        refs.update(re.findall(pattern, text))
    return refs


def validate_references(skill_path: Path, text: str) -> list[str]:
    errors: list[str] = []
    for rel_path in sorted(collect_path_references(text)):
        if not (skill_path / rel_path).exists():
            errors.append(f"引用路径不存在：{rel_path}")
    return errors


def validate_special_layout(skill_path: Path, skill_name: str) -> list[str]:
    if skill_name != "creating-skill-pro":
        return []

    required_paths = [
        "references/authoring/workflows.md",
        "references/authoring/patterns.md",
        "references/authoring/output-patterns.md",
        "references/authoring/example.md",
        "references/merging/merge-playbook.md",
        "references/merging/source-mapping.md",
        "references/evaluation/workflow.md",
        "references/evaluation/schemas.md",
        "references/triggering/description-optimization.md",
        "agents/grader.md",
        "agents/comparator.md",
        "agents/analyzer.md",
        "eval-viewer/generate_review.py",
        "eval-viewer/viewer.html",
        "scripts/run_eval.py",
        "scripts/improve_description.py",
        "scripts/run_loop.py",
        "scripts/aggregate_benchmark.py",
        "LICENSE.txt",
    ]
    return [
        f"缺少必需文件：{rel_path}"
        for rel_path in required_paths
        if not (skill_path / rel_path).exists()
    ]


def validate_neutral_tooling(skill_path: Path) -> list[str]:
    errors: list[str] = []
    files_to_check = [
        skill_path / "scripts" / "run_eval.py",
        skill_path / "scripts" / "improve_description.py",
        skill_path / "scripts" / "run_loop.py",
    ]
    forbidden = [".claude/commands", "claude -p", "CLAUDECODE"]
    for path in files_to_check:
        if not path.exists():
            continue
        text = path.read_text()
        for needle in forbidden:
            if needle in text:
                errors.append(f"{path.name} 仍包含供应商绑定字符串：{needle}")
    return errors


def validate_legacy_paths(skill_path: Path) -> list[str]:
    errors: list[str] = []
    for path in skill_path.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in TEXT_EXTENSIONS:
            continue
        rel_path = path.relative_to(skill_path).as_posix()
        if rel_path in IGNORE_VENDOR_SCAN:
            continue
        text = path.read_text(errors="replace")
        if "_tmp_skill-creator" in text:
            errors.append(f"{rel_path} 仍包含旧 vendor 路径 `_tmp_skill-creator`")
    return errors


def validate_skill(skill_path: str | Path) -> tuple[bool, str]:
    skill_path = Path(skill_path).resolve()
    if not skill_path.exists():
        return False, f"目录不存在：{skill_path}"
    if not skill_path.is_dir():
        return False, f"路径不是目录：{skill_path}"

    skill_md = skill_path / "SKILL.md"
    if not skill_md.exists():
        return False, f"未找到 SKILL.md：{skill_path}"

    try:
        frontmatter, body = parse_frontmatter(skill_md)
    except Exception as exc:  # noqa: BLE001
        return False, f"解析 frontmatter 失败：{exc}"

    unexpected = set(frontmatter.keys()) - ALLOWED_PROPERTIES
    if unexpected:
        return False, f"frontmatter 含未允许字段：{', '.join(sorted(unexpected))}"

    errors: list[str] = []
    name_error = validate_name(frontmatter.get("name", ""), skill_path)
    if name_error:
        errors.append(name_error)

    description_error = validate_description(frontmatter.get("description", ""))
    if description_error:
        errors.append(description_error)

    errors.extend(validate_references(skill_path, skill_md.read_text()))
    errors.extend(validate_special_layout(skill_path, frontmatter.get("name", "")))
    errors.extend(validate_neutral_tooling(skill_path))
    errors.extend(validate_legacy_paths(skill_path))

    if len(skill_md.read_text().splitlines()) > 500:
        errors.append("SKILL.md 超过 500 行，建议继续下沉到 references/")

    if errors:
        return False, "；".join(errors)
    return True, "校验通过"


def main() -> None:
    if len(sys.argv) != 2:
        print("用法：python3 scripts/quick_validate.py <skill目录>")
        sys.exit(1)

    valid, message = validate_skill(sys.argv[1])
    if valid:
        print(f"✅ {message}")
        sys.exit(0)

    print(f"❌ {message}")
    sys.exit(1)


if __name__ == "__main__":
    main()
