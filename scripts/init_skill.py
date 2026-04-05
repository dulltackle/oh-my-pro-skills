#!/usr/bin/env python3
"""初始化一个新的 skill 目录骨架。"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


MINIMAL_SKILL_TEMPLATE = """---
name: {skill_name}
description: "TODO: 用一句话说明这个 skill 做什么，以及什么时候应该触发。"
---

# {skill_title}

## 定位

[TODO: 用 1-2 句说明这个 skill 解决什么问题。]

## 触发时机

- [TODO: 用户通常会怎么描述这个需求]
- [TODO: 哪些场景应该触发]
- [TODO: 哪些近似需求不应该触发]

## 执行原则

1. 先理解目标、输入和约束
2. 优先复用已有资源，而不是临时发明流程
3. 产出前校验关键结果是否满足用户要求

## 资源扩展

- 需要长文档时，再新增 `references/`
- 需要稳定脚本时，再新增 `scripts/`
- 需要模板或素材时，再新增 `assets/`
- 需要评测样本时，再新增 `evals/`
"""

WORKFLOW_SKILL_TEMPLATE = """---
name: {skill_name}
description: "TODO: 用一句话说明这个 skill 做什么，以及什么时候应该触发。"
---

# {skill_title}

## 定位

[TODO: 用 1-2 句说明这个 skill 的目标、边界和主要交付物。]

## 任务入口

- [TODO: 用户会怎么描述这个需求]
- [TODO: 哪些情况应该触发]
- [TODO: 哪些相邻情况不应该触发]

## 执行流程

1. 理解目标、输入、风险和完成标准
2. 选择需要读取的 `references/`、运行的 `scripts/`，以及要产出的文件
3. 执行核心步骤
4. 校验结果并输出交付物

## 资源索引

{resource_index}
"""

REFERENCE_TEMPLATE = """# 说明笔记

把需要按需读取的长内容放在这里，例如：

- 领域术语
- 决策表
- 详细流程
- schema 或样例
"""

SCRIPT_TEMPLATE = '''#!/usr/bin/env python3
"""示例脚本。

如果这个 skill 不需要脚本，可直接删除本文件。
"""


def main() -> None:
    print("TODO: 替换为真实逻辑")


if __name__ == "__main__":
    main()
'''

EVALS_TEMPLATE = {
    "skill_name": "__SKILL_NAME__",
    "evals": [
        {
            "id": 1,
            "eval_name": "happy-path",
            "query": "TODO: 写一条真实的用户请求",
            "prompt": "TODO: 写一条真实的用户请求",
            "should_trigger": True,
            "expected_output": "TODO: 描述成功结果",
            "files": [],
            "expectations": [
                "TODO: 补一条可验证断言"
            ],
        }
    ],
}

GITIGNORE_TEMPLATE = """__pycache__/
*.py[cod]
.DS_Store
"""

RESOURCE_INDEX_LINES = {
    "references": "- `references/notes.md`：补充长说明、领域知识、schema 或样例",
    "scripts": "- `scripts/example.py`：放稳定、可重复执行的脚本逻辑",
    "assets": "- `assets/`：放模板、静态素材或输出依赖文件",
    "evals": "- `evals/evals.json`：放触发样本或效果评测样本",
}

DEFAULT_INCLUDES = {
    "minimal": set(),
    "workflow": {"references", "scripts"},
}


def title_case_skill_name(skill_name: str) -> str:
    return " ".join(word.capitalize() for word in skill_name.split("-"))


def parse_include_list(raw: str | None) -> set[str]:
    if not raw:
        return set()
    items = {item.strip() for item in raw.split(",") if item.strip()}
    invalid = items - {"references", "scripts", "assets", "evals"}
    if invalid:
        invalid_text = ", ".join(sorted(invalid))
        raise ValueError(f"--include 包含未知目录：{invalid_text}")
    return items


def build_skill_md(skill_name: str, template: str, includes: set[str]) -> str:
    skill_title = title_case_skill_name(skill_name)
    if template == "minimal":
        return MINIMAL_SKILL_TEMPLATE.format(skill_name=skill_name, skill_title=skill_title)

    lines = [
        RESOURCE_INDEX_LINES[name]
        for name in ("references", "scripts", "assets", "evals")
        if name in includes
    ]
    if not lines:
        lines = ["- [TODO: 如无额外资源，可删除本节]"]
    return WORKFLOW_SKILL_TEMPLATE.format(
        skill_name=skill_name,
        skill_title=skill_title,
        resource_index="\n".join(lines),
    )


def write_optional_resources(skill_dir: Path, skill_name: str, includes: set[str]) -> None:
    if "references" in includes:
        references_dir = skill_dir / "references"
        references_dir.mkdir()
        (references_dir / "notes.md").write_text(REFERENCE_TEMPLATE, encoding="utf-8")

    if "scripts" in includes:
        scripts_dir = skill_dir / "scripts"
        scripts_dir.mkdir()
        script_path = scripts_dir / "example.py"
        script_path.write_text(SCRIPT_TEMPLATE, encoding="utf-8")
        script_path.chmod(0o755)

    if "assets" in includes:
        (skill_dir / "assets").mkdir()

    if "evals" in includes:
        evals_dir = skill_dir / "evals"
        evals_dir.mkdir()
        evals_payload = dict(EVALS_TEMPLATE)
        evals_payload["skill_name"] = skill_name
        (evals_dir / "evals.json").write_text(
            json.dumps(evals_payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )


def init_skill(skill_name: str, path: str, template: str, extra_includes: set[str]) -> Path | None:
    skill_dir = Path(path).resolve() / skill_name
    if skill_dir.exists():
        print(f"错误：目录已存在：{skill_dir}")
        return None

    includes = set(DEFAULT_INCLUDES[template]) | extra_includes

    skill_dir.mkdir(parents=True, exist_ok=False)
    (skill_dir / "SKILL.md").write_text(
        build_skill_md(skill_name, template, includes),
        encoding="utf-8",
    )
    (skill_dir / ".gitignore").write_text(GITIGNORE_TEMPLATE, encoding="utf-8")
    write_optional_resources(skill_dir, skill_name, includes)

    print(f"已创建：{skill_dir}")
    print(f"模板：{template}")
    if includes:
        print(f"已包含：{', '.join(sorted(includes))}")
    else:
        print("已包含：仅最小文件集")
    print("下一步：")
    print("1. 补全 `SKILL.md` 的定位、触发条件和流程")
    if "evals" in includes:
        print("2. 把 `evals/evals.json` 改成真实样本")
        print("3. 完成后运行 `python3 scripts/quick_validate.py <skill目录>`")
    else:
        print("2. 按需补充 `references/`、`scripts/`、`assets/`、`evals/`")
        print("3. 完成后运行 `python3 scripts/quick_validate.py <skill目录>`")
    return skill_dir


def main() -> None:
    parser = argparse.ArgumentParser(description="初始化一个新的 skill 目录骨架")
    parser.add_argument("skill_name", help="skill 名称，需与目录名一致")
    parser.add_argument("--path", required=True, help="skill 目录父路径")
    parser.add_argument(
        "--template",
        choices=["minimal", "workflow"],
        default="minimal",
        help="脚手架模板，默认 minimal",
    )
    parser.add_argument(
        "--include",
        default=None,
        help="额外创建的目录，逗号分隔：references,scripts,assets,evals",
    )
    args = parser.parse_args()

    try:
        includes = parse_include_list(args.include)
    except ValueError as exc:
        print(f"错误：{exc}")
        sys.exit(1)

    result = init_skill(args.skill_name, args.path, args.template, includes)
    sys.exit(0 if result else 1)


if __name__ == "__main__":
    main()
