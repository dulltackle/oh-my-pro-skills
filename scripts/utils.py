"""共享工具函数。

本文件基于早期 skill-creator 工具链思路改造，当前版本去除了供应商专属依赖。
"""

from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any


def parse_skill_md(skill_path: Path) -> tuple[str, str, str]:
    content = (skill_path / "SKILL.md").read_text()
    lines = content.splitlines()
    if not lines or lines[0].strip() != "---":
        raise ValueError("SKILL.md 缺少 frontmatter 起始标记")

    end_idx = None
    for index, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            end_idx = index
            break
    if end_idx is None:
        raise ValueError("SKILL.md 缺少 frontmatter 结束标记")

    frontmatter_lines = lines[1:end_idx]
    name = ""
    description = ""
    index = 0
    while index < len(frontmatter_lines):
        line = frontmatter_lines[index]
        if line.startswith("name:"):
            name = line.split(":", 1)[1].strip().strip('"').strip("'")
        elif line.startswith("description:"):
            value = line.split(":", 1)[1].strip()
            if value in {">", "|", ">-", "|-"}:
                chunks: list[str] = []
                index += 1
                while index < len(frontmatter_lines):
                    next_line = frontmatter_lines[index]
                    if next_line.startswith("  ") or next_line.startswith("\t"):
                        chunks.append(next_line.strip())
                        index += 1
                        continue
                    index -= 1
                    break
                description = " ".join(chunks).strip()
            else:
                description = value.strip('"').strip("'")
        index += 1

    return name, description, content


def load_eval_set(eval_set_path: Path) -> list[dict[str, Any]]:
    data = json.loads(eval_set_path.read_text())
    if isinstance(data, dict) and "evals" in data:
        raw_items = data["evals"]
    elif isinstance(data, list):
        raw_items = data
    else:
        raise ValueError("eval 集必须是数组，或包含 `evals` 字段的对象")

    items: list[dict[str, Any]] = []
    for index, item in enumerate(raw_items):
        if not isinstance(item, dict):
            raise ValueError(f"第 {index} 个 eval 条目不是对象")
        query = item.get("query") or item.get("prompt")
        if not query:
            raise ValueError(f"第 {index} 个 eval 条目缺少 `query` 或 `prompt`")
        normalized = dict(item)
        normalized.setdefault("id", index)
        normalized.setdefault("prompt", query)
        normalized.setdefault("query", query)
        normalized.setdefault("should_trigger", True)
        items.append(normalized)
    return items


def run_shell_command(
    command: str,
    *,
    stdin: str | None = None,
    env: dict[str, str] | None = None,
    timeout: int = 300,
    cwd: Path | None = None,
) -> subprocess.CompletedProcess[str]:
    merged_env = os.environ.copy()
    if env:
        merged_env.update({key: str(value) for key, value in env.items()})
    return subprocess.run(
        ["/bin/bash", "-lc", command],
        input=stdin,
        capture_output=True,
        text=True,
        timeout=timeout,
        cwd=str(cwd) if cwd else None,
        env=merged_env,
        check=False,
    )


def parse_json_from_output(text: str) -> dict[str, Any] | None:
    stripped = text.strip()
    if not stripped:
        return None

    try:
        data = json.loads(stripped)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass

    for line in reversed(stripped.splitlines()):
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            continue
    return None


def parse_trigger_output(text: str) -> bool:
    payload = parse_json_from_output(text)
    if payload and "triggered" in payload:
        return bool(payload["triggered"])

    stripped = text.strip().lower()
    if stripped in {"true", "false"}:
        return stripped == "true"

    match = re.search(r"triggered\s*[:=]\s*(true|false)", stripped)
    if match:
        return match.group(1) == "true"

    raise ValueError("无法从 runner 输出中解析 `triggered` 结果")
