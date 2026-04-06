#!/usr/bin/env python3
"""根据评测结果优化 skill description。

本文件基于早期 skill-creator 思路改造，当前版本把提示词生成与模型调用解耦：

- 提示词由本文件生成
- 模型执行通过 `--optimizer-command` 注入
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

try:
    from scripts.utils import parse_skill_md, run_shell_command
except ModuleNotFoundError:  # 直接执行 `python3 scripts/improve_description.py` 时使用
    from utils import parse_skill_md, run_shell_command


def build_improvement_prompt(
    *,
    skill_name: str,
    skill_content: str,
    current_description: str,
    eval_results: dict[str, Any],
    history: list[dict[str, Any]],
    test_results: dict[str, Any] | None = None,
) -> str:
    failed_triggers = [result for result in eval_results["results"] if result["should_trigger"] and not result["pass"]]
    false_triggers = [result for result in eval_results["results"] if not result["should_trigger"] and not result["pass"]]

    score_text = f"训练集：{eval_results['summary']['passed']}/{eval_results['summary']['total']}"
    if test_results:
        score_text += f"，测试集：{test_results['summary']['passed']}/{test_results['summary']['total']}"

    prompt = [
        f"你在为一个名为 `{skill_name}` 的 skill 优化 description。",
        "",
        "目标：让 description 更准确地在相关请求中触发，并减少误触发。",
        "要求：",
        "- 用用户意图来表述，不要只写实现细节",
        "- 同时说明做什么、什么时候用、常见说法或场景",
        "- 不要过度堆叠长清单，控制在 100-250 字，必须小于 1024 字符",
        "- 返回时只输出 `<new_description>...</new_description>`",
        "",
        f"当前 description：{current_description}",
        f"当前得分：{score_text}",
        "",
    ]

    if failed_triggers:
        prompt.append("应触发但未通过：")
        for result in failed_triggers:
            prompt.append(f"- {result['query']}（触发 {result['triggers']}/{result['runs']} 次）")
        prompt.append("")

    if false_triggers:
        prompt.append("不应触发但误触发：")
        for result in false_triggers:
            prompt.append(f"- {result['query']}（触发 {result['triggers']}/{result['runs']} 次）")
        prompt.append("")

    if history:
        prompt.append("历史尝试：")
        for item in history:
            prompt.append(
                f"- 第 {item.get('iteration', '?')} 轮：{item.get('description', '')} "
                f"(训练集 {item.get('train_passed', item.get('passed', 0))}/{item.get('train_total', item.get('total', 0))})"
            )
        prompt.append("")

    prompt.extend(
        [
            "下面是 skill 正文，用于理解 skill 的真实职责：",
            "",
            skill_content,
            "",
            "请给出一个新的 description。只返回 `<new_description>...</new_description>`。",
        ]
    )
    return "\n".join(prompt)


def extract_description(text: str) -> str:
    match = re.search(r"<new_description>(.*?)</new_description>", text, re.DOTALL)
    description = match.group(1).strip() if match else text.strip().strip('"')
    return description


def call_optimizer(
    *,
    prompt: str,
    optimizer_command: str,
    model: str | None,
    timeout: int,
) -> str:
    env = {"OPTIMIZER_MODEL": model or ""}
    result = run_shell_command(
        optimizer_command,
        stdin=prompt,
        env=env,
        timeout=timeout,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "optimizer 执行失败")
    return result.stdout


def improve_description(
    *,
    skill_name: str,
    skill_content: str,
    current_description: str,
    eval_results: dict[str, Any],
    history: list[dict[str, Any]],
    optimizer_command: str | None,
    model: str | None,
    timeout: int,
    candidate_description: str | None = None,
    test_results: dict[str, Any] | None = None,
) -> tuple[str, str]:
    prompt = build_improvement_prompt(
        skill_name=skill_name,
        skill_content=skill_content,
        current_description=current_description,
        eval_results=eval_results,
        history=history,
        test_results=test_results,
    )

    if candidate_description is not None:
        return candidate_description.strip(), prompt
    if not optimizer_command:
        raise ValueError("未提供 `--optimizer-command`，且没有 `--candidate-description`")

    raw_response = call_optimizer(
        prompt=prompt,
        optimizer_command=optimizer_command,
        model=model,
        timeout=timeout,
    )
    return extract_description(raw_response), prompt


def main() -> None:
    parser = argparse.ArgumentParser(description="根据评测结果优化 skill description")
    parser.add_argument("--eval-results", required=True, type=Path, help="run_eval 产出的 JSON")
    parser.add_argument("--skill-path", required=True, type=Path, help="skill 目录")
    parser.add_argument("--history", type=Path, default=None, help="历史尝试 JSON")
    parser.add_argument("--optimizer-command", default=None, help="接收 prompt 并返回新描述的命令")
    parser.add_argument("--candidate-description", default=None, help="手工指定的新描述")
    parser.add_argument("--model", default=None, help="传递给优化器的模型名称")
    parser.add_argument("--timeout", type=int, default=300, help="优化器超时秒数")
    parser.add_argument("--output", type=Path, default=None, help="输出 JSON 路径")
    parser.add_argument("--verbose", action="store_true", help="打印调试信息")
    args = parser.parse_args()

    eval_results = json.loads(args.eval_results.read_text())
    history = json.loads(args.history.read_text()) if args.history else []

    skill_name, _, skill_content = parse_skill_md(args.skill_path.resolve())
    current_description = eval_results["description"]

    new_description, prompt = improve_description(
        skill_name=skill_name,
        skill_content=skill_content,
        current_description=current_description,
        eval_results=eval_results,
        history=history,
        optimizer_command=args.optimizer_command,
        model=args.model,
        timeout=args.timeout,
        candidate_description=args.candidate_description,
    )

    output = {
        "description": new_description,
        "history": history
        + [
            {
                "description": current_description,
                "passed": eval_results["summary"]["passed"],
                "failed": eval_results["summary"]["failed"],
                "total": eval_results["summary"]["total"],
                "results": eval_results["results"],
            }
        ],
    }

    if args.verbose:
        print("=== Prompt ===", file=sys.stderr)
        print(prompt, file=sys.stderr)
        print("=== New Description ===", file=sys.stderr)
        print(new_description, file=sys.stderr)

    text = json.dumps(output, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(text + "\n")
        print(f"结果已写入：{args.output}")
    else:
        print(text)


if __name__ == "__main__":
    main()
