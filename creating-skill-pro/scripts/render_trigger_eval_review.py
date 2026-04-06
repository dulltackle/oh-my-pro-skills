#!/usr/bin/env python3
"""渲染触发样本审阅 HTML。"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

try:
    from scripts.utils import load_eval_set, parse_skill_md
except ModuleNotFoundError:  # 直接执行 `python3 scripts/render_trigger_eval_review.py` 时使用
    from utils import load_eval_set, parse_skill_md


def main() -> None:
    parser = argparse.ArgumentParser(description="渲染触发样本审阅 HTML")
    parser.add_argument("--eval-set", required=True, type=Path, help="eval 集 JSON")
    parser.add_argument("--skill-path", type=Path, default=None, help="skill 目录，用于读取名称和 description")
    parser.add_argument("--skill-name", default=None, help="显式指定 skill 名称")
    parser.add_argument("--skill-description", default=None, help="显式指定 skill description")
    parser.add_argument("--output", required=True, type=Path, help="输出 HTML 路径")
    args = parser.parse_args()

    skill_name = args.skill_name or ""
    skill_description = args.skill_description or ""
    if args.skill_path:
        parsed_name, parsed_description, _ = parse_skill_md(args.skill_path.resolve())
        if not skill_name:
            skill_name = parsed_name
        if not skill_description:
            skill_description = parsed_description

    eval_items = [
        {
            "id": item["id"],
            "eval_name": item.get("eval_name") or f"eval-{item['id']}",
            "query": item.get("query") or item.get("prompt") or "",
            "should_trigger": bool(item.get("should_trigger", True)),
        }
        for item in load_eval_set(args.eval_set.resolve())
    ]

    template_path = Path(__file__).resolve().parent.parent / "assets" / "trigger_eval_review.html"
    template = template_path.read_text(encoding="utf-8")
    html = (
        template
        .replace("__SKILL_NAME_PLACEHOLDER__", json.dumps(skill_name, ensure_ascii=False))
        .replace("__SKILL_DESCRIPTION_PLACEHOLDER__", json.dumps(skill_description, ensure_ascii=False))
        .replace("__EVAL_DATA_PLACEHOLDER__", json.dumps(eval_items, ensure_ascii=False))
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(html, encoding="utf-8")
    print(f"已生成：{args.output}")


if __name__ == "__main__":
    main()
