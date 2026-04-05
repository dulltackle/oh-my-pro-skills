#!/usr/bin/env python3
"""初始化一个新的 skill 目录骨架。"""

from __future__ import annotations

import sys
from pathlib import Path


SKILL_TEMPLATE = """---
name: {skill_name}
description: "TODO: 用一句话说明这个 skill 做什么，以及什么时候必须使用。"
---

# {skill_title}

## 定位

[TODO: 用 1-2 句说明这个 skill 解决什么问题。]

## 任务入口

- [TODO: 用户会怎么描述这个需求]
- [TODO: 哪些情况应该触发]
- [TODO: 哪些情况不应该触发]

## 执行流程

1. 理解目标、输入和约束
2. 选择合适的 references / scripts
3. 执行核心步骤
4. 校验结果并输出交付物

## 资源索引

- `references/notes.md`: [TODO: 补充长说明或领域知识]
- `scripts/example.py`: [TODO: 如无脚本需要，可删除]
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


def title_case_skill_name(skill_name: str) -> str:
    return " ".join(word.capitalize() for word in skill_name.split("-"))


def init_skill(skill_name: str, path: str) -> Path | None:
    skill_dir = Path(path).resolve() / skill_name
    if skill_dir.exists():
        print(f"错误：目录已存在：{skill_dir}")
        return None

    skill_dir.mkdir(parents=True, exist_ok=False)
    (skill_dir / "references").mkdir()
    (skill_dir / "scripts").mkdir()

    skill_title = title_case_skill_name(skill_name)
    (skill_dir / "SKILL.md").write_text(
        SKILL_TEMPLATE.format(skill_name=skill_name, skill_title=skill_title)
    )
    (skill_dir / "references" / "notes.md").write_text(REFERENCE_TEMPLATE)
    script_path = skill_dir / "scripts" / "example.py"
    script_path.write_text(SCRIPT_TEMPLATE)
    script_path.chmod(0o755)

    print(f"已创建：{skill_dir}")
    print("下一步：")
    print("1. 补全 `SKILL.md` 的定位、触发条件和流程")
    print("2. 按需扩展 `references/` 和 `scripts/`")
    print("3. 完成后运行 `python3 scripts/quick_validate.py <skill目录>`")
    return skill_dir


def main() -> None:
    if len(sys.argv) < 4 or sys.argv[2] != "--path":
        print("用法：python3 scripts/init_skill.py <skill-name> --path <skill目录父路径>")
        print("示例：python3 scripts/init_skill.py creating-release-notes --path .claude/skills")
        sys.exit(1)

    result = init_skill(sys.argv[1], sys.argv[3])
    sys.exit(0 if result else 1)


if __name__ == "__main__":
    main()
