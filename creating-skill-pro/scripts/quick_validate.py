#!/usr/bin/env python3
"""通用的 skill 校验器。"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

import yaml


ALLOWED_PROPERTIES = {"name", "description", "license", "allowed-tools", "metadata"}
TEXT_EXTENSIONS = {".md", ".py", ".json", ".html", ".txt", ".yaml", ".yml"}
REFERENCE_SCAN_EXTENSIONS = {".md", ".json", ".html", ".txt", ".yaml", ".yml"}
REFERENCE_FILE_EXTENSIONS = {".md", ".json", ".html", ".txt", ".yaml", ".yml"}
PYTHON_SCRIPT_EXTENSIONS = {".py"}
SHELL_SCRIPT_EXTENSIONS = {".sh", ".bash"}
IGNORE_VENDOR_SCAN = {
    "LICENSE.txt",
    "scripts/quick_validate.py",
}
COMMON_PYTHON_IGNORE_PATTERNS = {"__pycache__/", "*.py[cod]", "*.pyc"}


@dataclass(slots=True)
class ValidationItem:
    level: str
    code: str
    message: str
    location: str | None = None

    def render(self) -> str:
        if self.location:
            return f"[{self.code}] {self.location}：{self.message}"
        return f"[{self.code}] {self.message}"


@dataclass(slots=True)
class ValidationReport:
    skill_path: Path
    items: list[ValidationItem] = field(default_factory=list)

    def add(self, level: str, code: str, message: str, location: str | None = None) -> None:
        self.items.append(ValidationItem(level=level, code=code, message=message, location=location))

    def error(self, code: str, message: str, location: str | None = None) -> None:
        self.add("ERROR", code, message, location)

    def warning(self, code: str, message: str, location: str | None = None) -> None:
        self.add("WARNING", code, message, location)

    def info(self, code: str, message: str, location: str | None = None) -> None:
        self.add("INFO", code, message, location)

    @property
    def error_count(self) -> int:
        return sum(1 for item in self.items if item.level == "ERROR")

    @property
    def warning_count(self) -> int:
        return sum(1 for item in self.items if item.level == "WARNING")

    @property
    def info_count(self) -> int:
        return sum(1 for item in self.items if item.level == "INFO")

    def exit_code(self) -> int:
        if self.error_count:
            return 1
        if self.warning_count:
            return 2
        return 0

    def status_text(self) -> str:
        if self.error_count:
            return "存在错误"
        if self.warning_count:
            return "仅存在警告"
        return "通过"

    def summary_text(self) -> str:
        return (
            f"{self.status_text()}（错误 {self.error_count}，"
            f"警告 {self.warning_count}，信息 {self.info_count}）"
        )

    def render(self) -> str:
        lines = [
            f"Skill 校验报告：{self.skill_path}",
            f"状态：{self.summary_text()}",
        ]
        for level, title in (("ERROR", "错误"), ("WARNING", "警告"), ("INFO", "信息")):
            items = [item for item in self.items if item.level == level]
            if not items:
                continue
            lines.append("")
            lines.append(f"{title}（{len(items)}）")
            for item in items:
                lines.append(f"- {item.render()}")
        return "\n".join(lines)


def read_utf8_text(path: Path, report: ValidationReport, *, code: str, location: str) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        report.error(code, f"文件不是有效的 UTF-8 文本：{exc}", location)
    except OSError as exc:
        report.error(code, f"读取文件失败：{exc}", location)
    return None


def parse_frontmatter(skill_md: Path, report: ValidationReport) -> tuple[dict[str, object] | None, str]:
    content = read_utf8_text(skill_md, report, code="skill-md-read", location="SKILL.md")
    if content is None:
        return None, ""
    if not content.strip():
        report.error("skill-md-empty", "SKILL.md 存在但为空", "SKILL.md")
        return None, ""

    lines = content.splitlines()
    if not lines or lines[0].strip() != "---":
        report.error("frontmatter-missing", "未找到 YAML frontmatter 起始标记", "SKILL.md")
        return None, content

    end_index = None
    for index, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            end_index = index
            break
    if end_index is None:
        report.error("frontmatter-invalid", "未找到 YAML frontmatter 结束标记", "SKILL.md")
        return None, content

    frontmatter_text = "\n".join(lines[1:end_index])
    body = "\n".join(lines[end_index + 1 :])

    try:
        loaded = yaml.safe_load(frontmatter_text) or {}
    except yaml.YAMLError as exc:
        report.error("frontmatter-parse", f"解析 frontmatter 失败：{exc}", "SKILL.md")
        return None, body

    if not isinstance(loaded, dict):
        report.error("frontmatter-type", "frontmatter 必须是 YAML 字典", "SKILL.md")
        return None, body

    normalized = {str(key): value for key, value in loaded.items()}
    return normalized, body


def validate_name(name: object, skill_path: Path) -> str | None:
    if not isinstance(name, str) or not name.strip():
        return "缺少 `name`"
    name = name.strip()
    if not re.match(r"^[a-z0-9-]+$", name):
        return "name 必须使用 kebab-case，仅包含小写字母、数字和连字符"
    if name.startswith("-") or name.endswith("-") or "--" in name:
        return "name 不能以连字符开头或结尾，也不能包含连续连字符"
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


def validate_description(description: object) -> str | None:
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


def validate_references_in_text(skill_path: Path, text: str, rel_source: str) -> list[str]:
    errors: list[str] = []
    for rel_path in sorted(collect_path_references(text)):
        if not (skill_path / rel_path).exists():
            errors.append(f"{rel_source} 引用了不存在的路径：{rel_path}")
    return errors


def validate_skill_md(
    skill_path: Path,
    report: ValidationReport,
) -> tuple[dict[str, object] | None, str]:
    skill_md = skill_path / "SKILL.md"
    if not skill_md.exists():
        report.error("skill-md-missing", "未找到 SKILL.md", "SKILL.md")
        return None, ""
    if not skill_md.is_file():
        report.error("skill-md-type", "SKILL.md 不是普通文件", "SKILL.md")
        return None, ""
    if skill_md.stat().st_size == 0:
        report.error("skill-md-empty", "SKILL.md 存在但为空", "SKILL.md")
        return None, ""

    frontmatter, body = parse_frontmatter(skill_md, report)
    if frontmatter is None:
        return None, body

    unexpected = set(frontmatter) - ALLOWED_PROPERTIES
    if unexpected:
        report.error(
            "frontmatter-unexpected",
            f"frontmatter 含未允许字段：{', '.join(sorted(unexpected))}",
            "SKILL.md",
        )

    name_error = validate_name(frontmatter.get("name"), skill_path)
    if name_error:
        report.error("name-invalid", name_error, "SKILL.md")

    description_error = validate_description(frontmatter.get("description"))
    if description_error:
        report.error("description-invalid", description_error, "SKILL.md")

    if not body.strip():
        report.warning("skill-body-empty", "SKILL.md 正文为空，建议补充路由与使用说明", "SKILL.md")

    if len(skill_md.read_text(encoding="utf-8").splitlines()) > 500:
        report.warning("skill-md-long", "SKILL.md 超过 500 行，建议继续下沉到 references/", "SKILL.md")

    report.info("skill-md-ok", "SKILL.md 存在且可解析", "SKILL.md")
    return frontmatter, body


def validate_cross_references(skill_path: Path, report: ValidationReport) -> None:
    checked_files = 0
    for path in skill_path.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in REFERENCE_SCAN_EXTENSIONS:
            continue
        rel_path = path.relative_to(skill_path).as_posix()
        text = read_utf8_text(path, report, code="text-read", location=rel_path)
        if text is None:
            continue
        checked_files += 1
        for message in validate_references_in_text(skill_path, text, rel_path):
            report.error("broken-reference", message, rel_path)
    report.info("reference-scan", f"已完成文本引用扫描，共检查 {checked_files} 个文件")


def validate_reference_file(path: Path, skill_path: Path, report: ValidationReport) -> None:
    rel_path = path.relative_to(skill_path).as_posix()
    if path.stat().st_size == 0:
        report.error("reference-empty", "参考文件为空", rel_path)
        return

    suffix = path.suffix.lower()
    if suffix not in REFERENCE_FILE_EXTENSIONS:
        report.warning("reference-extension", "参考文件扩展名不在常见列表中", rel_path)

    text = read_utf8_text(path, report, code="reference-read", location=rel_path)
    if text is None:
        return
    if not text.strip():
        report.error("reference-empty", "参考文件只包含空白内容", rel_path)
        return

    if suffix == ".md":
        first_nonempty = next((line.strip() for line in text.splitlines() if line.strip()), "")
        if first_nonempty and not (first_nonempty.startswith("#") or first_nonempty == "---"):
            report.warning("reference-format", "Markdown 参考文件建议以标题或 frontmatter 开头", rel_path)
    elif suffix == ".json":
        try:
            json.loads(text)
        except json.JSONDecodeError as exc:
            report.error("reference-json", f"JSON 格式非法：{exc}", rel_path)
    elif suffix in {".yaml", ".yml"}:
        try:
            yaml.safe_load(text)
        except yaml.YAMLError as exc:
            report.error("reference-yaml", f"YAML 格式非法：{exc}", rel_path)
    elif suffix == ".html":
        lowered = text.lower()
        if "<html" not in lowered and "<!doctype html" not in lowered and "<body" not in lowered:
            report.warning("reference-html", "HTML 参考文件缺少明显的 HTML 结构标记", rel_path)


def validate_references_directory(skill_path: Path, report: ValidationReport) -> None:
    references_dir = skill_path / "references"
    if not references_dir.exists():
        report.info("references-missing", "未发现 references/ 目录，跳过参考文件校验")
        return
    if not references_dir.is_dir():
        report.error("references-type", "references 不是目录", "references")
        return

    files = sorted(path for path in references_dir.rglob("*") if path.is_file())
    if not files:
        report.warning("references-empty", "references/ 目录存在但没有文件", "references")
        return

    for path in files:
        validate_reference_file(path, skill_path, report)
    report.info("references-ok", f"references/ 校验完成，共检查 {len(files)} 个文件", "references")


def validate_script_file(path: Path, skill_path: Path, report: ValidationReport) -> None:
    rel_path = path.relative_to(skill_path).as_posix()
    suffix = path.suffix.lower()

    text = read_utf8_text(path, report, code="script-read", location=rel_path)
    if text is None:
        return
    if not text.strip():
        if path.name != "__init__.py":
            report.warning("script-empty", "脚本文件为空", rel_path)
        return

    if suffix in PYTHON_SCRIPT_EXTENSIONS:
        try:
            compile(text, str(path), "exec")
        except SyntaxError as exc:
            report.error(
                "script-syntax",
                f"Python 语法错误：第 {exc.lineno} 行 {exc.msg}",
                rel_path,
            )
    elif suffix in SHELL_SCRIPT_EXTENSIONS:
        result = subprocess.run(
            ["bash", "-n", str(path)],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            detail = result.stderr.strip() or result.stdout.strip() or "bash -n 校验失败"
            report.error("script-syntax", f"Shell 语法错误：{detail}", rel_path)
    else:
        report.info("script-skip", "跳过未知脚本类型的语法校验", rel_path)


def validate_scripts_directory(skill_path: Path, report: ValidationReport) -> None:
    scripts_dir = skill_path / "scripts"
    if not scripts_dir.exists():
        report.info("scripts-missing", "未发现 scripts/ 目录，跳过脚本校验")
        return
    if not scripts_dir.is_dir():
        report.error("scripts-type", "scripts 不是目录", "scripts")
        return

    files = sorted(
        path
        for path in scripts_dir.rglob("*")
        if path.is_file() and "__pycache__" not in path.parts
    )
    if not files:
        report.warning("scripts-empty", "scripts/ 目录存在但没有文件", "scripts")
        return

    for path in files:
        validate_script_file(path, skill_path, report)
    report.info("scripts-ok", f"scripts/ 校验完成，共检查 {len(files)} 个文件", "scripts")


def validate_gitignore(skill_path: Path, report: ValidationReport) -> None:
    gitignore = skill_path / ".gitignore"
    if not gitignore.exists():
        report.warning("gitignore-missing", "未找到 .gitignore，建议忽略本地生成文件", ".gitignore")
        return
    if not gitignore.is_file():
        report.error("gitignore-type", ".gitignore 不是普通文件", ".gitignore")
        return

    text = read_utf8_text(gitignore, report, code="gitignore-read", location=".gitignore")
    if text is None:
        return
    stripped = text.strip()
    if not stripped:
        report.warning("gitignore-empty", ".gitignore 为空，建议补充忽略规则", ".gitignore")
        return

    lines = [
        line.strip()
        for line in text.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    duplicates = sorted({line for line in lines if lines.count(line) > 1})
    if duplicates:
        report.warning(
            "gitignore-duplicate",
            f"存在重复规则：{', '.join(duplicates)}",
            ".gitignore",
        )

    too_broad = {"*", "/*", "**"}
    if any(line in too_broad for line in lines):
        report.warning("gitignore-broad", "存在过宽的忽略规则，可能掩盖误提交", ".gitignore")

    scripts_dir = skill_path / "scripts"
    has_python_scripts = scripts_dir.exists() and any(scripts_dir.rglob("*.py"))
    if has_python_scripts and not any(pattern in lines for pattern in COMMON_PYTHON_IGNORE_PATTERNS):
        report.warning(
            "gitignore-python-cache",
            "检测到 Python 脚本，但 .gitignore 未显式忽略常见 Python 缓存文件",
            ".gitignore",
        )

    report.info("gitignore-ok", f".gitignore 校验完成，共发现 {len(lines)} 条规则", ".gitignore")


def validate_special_layout(skill_path: Path, skill_name: str, report: ValidationReport) -> None:
    if skill_name != "creating-skill-pro":
        return

    required_paths = [
        "references/authoring/workflows.md",
        "references/authoring/patterns.md",
        "references/authoring/output-patterns.md",
        "references/authoring/example.md",
        "references/merging/merge-playbook.md",
        "references/evaluation/workflow.md",
        "references/evaluation/schemas.md",
        "references/triggering/description-optimization.md",
        "agents/grader.md",
        "agents/comparator.md",
        "agents/analyzer.md",
        "eval-viewer/generate_review.py",
        "eval-viewer/viewer.html",
        "assets/trigger_eval_review.html",
        "scripts/run_eval.py",
        "scripts/improve_description.py",
        "scripts/run_loop.py",
        "scripts/aggregate_benchmark.py",
        "scripts/render_trigger_eval_review.py",
        "LICENSE.txt",
    ]

    missing = [rel_path for rel_path in required_paths if not (skill_path / rel_path).exists()]
    for rel_path in missing:
        report.error("special-layout", "缺少 creating-skill-pro 的必需文件", rel_path)
    if not missing:
        report.info("special-layout", "creating-skill-pro 定制目录结构完整")


def validate_neutral_tooling(skill_path: Path, report: ValidationReport) -> None:
    files_to_check = [
        skill_path / "scripts" / "run_eval.py",
        skill_path / "scripts" / "improve_description.py",
        skill_path / "scripts" / "run_loop.py",
    ]
    forbidden = [".claude/commands", "claude -p", "CLAUDECODE"]
    checked = 0
    for path in files_to_check:
        if not path.exists():
            continue
        rel_path = path.relative_to(skill_path).as_posix()
        text = read_utf8_text(path, report, code="neutral-tool-read", location=rel_path)
        if text is None:
            continue
        checked += 1
        for needle in forbidden:
            if needle in text:
                report.error("neutral-tooling", f"仍包含供应商绑定字符串：{needle}", rel_path)
    if checked:
        report.info("neutral-tooling", f"已检查 {checked} 个中立工具脚本")


def validate_legacy_paths(skill_path: Path, report: ValidationReport) -> None:
    checked = 0
    for path in skill_path.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in TEXT_EXTENSIONS:
            continue
        rel_path = path.relative_to(skill_path).as_posix()
        if rel_path in IGNORE_VENDOR_SCAN:
            continue
        text = read_utf8_text(path, report, code="legacy-read", location=rel_path)
        if text is None:
            continue
        checked += 1
        if "_tmp_skill-creator" in text:
            report.error("legacy-path", "仍包含旧 vendor 路径 `_tmp_skill-creator`", rel_path)
    report.info("legacy-path-scan", f"已完成旧路径扫描，共检查 {checked} 个文本文件")


def validate_skill_report(skill_path: str | Path) -> ValidationReport:
    resolved_path = Path(skill_path).resolve()
    report = ValidationReport(skill_path=resolved_path)

    if not resolved_path.exists():
        report.error("path-missing", f"目录不存在：{resolved_path}")
        return report
    if not resolved_path.is_dir():
        report.error("path-type", f"路径不是目录：{resolved_path}")
        return report

    report.info("target", "开始校验 skill 目录")
    frontmatter, _body = validate_skill_md(resolved_path, report)

    validate_references_directory(resolved_path, report)
    validate_scripts_directory(resolved_path, report)
    validate_gitignore(resolved_path, report)
    validate_cross_references(resolved_path, report)
    validate_legacy_paths(resolved_path, report)

    if frontmatter:
        skill_name = str(frontmatter.get("name", ""))
        validate_special_layout(resolved_path, skill_name, report)
        validate_neutral_tooling(resolved_path, report)

    return report


def validate_skill(skill_path: str | Path) -> tuple[bool, str]:
    """兼容旧接口：返回是否存在错误，以及汇总信息。"""

    report = validate_skill_report(skill_path)
    return report.error_count == 0, report.summary_text()


def main() -> None:
    parser = argparse.ArgumentParser(description="通用的 skill 校验器")
    parser.add_argument("skill_dir", nargs="?", default=".", help="要校验的 skill 目录，默认为当前目录")
    args = parser.parse_args()

    report = validate_skill_report(args.skill_dir)
    print(report.render())
    sys.exit(report.exit_code())


if __name__ == "__main__":
    main()
