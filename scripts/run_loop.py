#!/usr/bin/env python3
"""运行 eval + description 迭代循环。"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path
from typing import Any

try:
    from scripts.generate_report import generate_html
    from scripts.improve_description import improve_description
    from scripts.run_eval import run_eval
    from scripts.utils import load_eval_set, parse_skill_md
except ModuleNotFoundError:  # 直接执行 `python3 scripts/run_loop.py` 时使用
    from generate_report import generate_html
    from improve_description import improve_description
    from run_eval import run_eval
    from utils import load_eval_set, parse_skill_md


def split_eval_set(
    eval_set: list[dict[str, Any]],
    holdout: float,
    seed: int = 42,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if holdout <= 0:
        return eval_set, []

    random.seed(seed)
    positives = [item for item in eval_set if item["should_trigger"]]
    negatives = [item for item in eval_set if not item["should_trigger"]]
    random.shuffle(positives)
    random.shuffle(negatives)

    pos_test = max(1, int(len(positives) * holdout)) if positives else 0
    neg_test = max(1, int(len(negatives) * holdout)) if negatives else 0
    test_set = positives[:pos_test] + negatives[:neg_test]
    train_set = positives[pos_test:] + negatives[neg_test:]
    return train_set or eval_set, test_set


def select_results(
    all_results: dict[str, Any],
    queries: set[str],
) -> dict[str, Any]:
    selected = [result for result in all_results["results"] if result["query"] in queries]
    passed = sum(1 for result in selected if result["pass"])
    return {
        "results": selected,
        "summary": {
            "total": len(selected),
            "passed": passed,
            "failed": len(selected) - passed,
        },
    }


def run_loop(
    *,
    eval_set: list[dict[str, Any]],
    skill_path: Path,
    description_override: str | None,
    runner_mode: str,
    runner_command: str | None,
    runner_cwd: Path | None,
    optimizer_command: str | None,
    candidate_description: str | None,
    num_workers: int,
    timeout: int,
    max_iterations: int,
    runs_per_query: int,
    trigger_threshold: float,
    holdout: float,
    model: str | None,
    report_html: Path | None,
) -> dict[str, Any]:
    skill_name, original_description, skill_content = parse_skill_md(skill_path)
    current_description = description_override or original_description
    train_set, test_set = split_eval_set(eval_set, holdout)
    history: list[dict[str, Any]] = []
    exit_reason = "max_iterations"

    for iteration in range(1, max_iterations + 1):
        combined = train_set + test_set
        all_results = run_eval(
            eval_set=combined,
            skill_name=skill_name,
            description=current_description,
            skill_path=skill_path,
            mode=runner_mode,
            runner_command=runner_command,
            runner_cwd=runner_cwd,
            num_workers=num_workers,
            timeout=timeout,
            runs_per_query=runs_per_query,
            trigger_threshold=trigger_threshold,
        )

        train_results = select_results(all_results, {item["query"] for item in train_set})
        test_results = select_results(all_results, {item["query"] for item in test_set}) if test_set else None

        history.append(
            {
                "iteration": iteration,
                "description": current_description,
                "train_passed": train_results["summary"]["passed"],
                "train_failed": train_results["summary"]["failed"],
                "train_total": train_results["summary"]["total"],
                "train_results": train_results["results"],
                "test_passed": test_results["summary"]["passed"] if test_results else None,
                "test_failed": test_results["summary"]["failed"] if test_results else None,
                "test_total": test_results["summary"]["total"] if test_results else None,
                "test_results": test_results["results"] if test_results else None,
                "passed": train_results["summary"]["passed"],
                "failed": train_results["summary"]["failed"],
                "total": train_results["summary"]["total"],
                "results": train_results["results"],
            }
        )

        if report_html:
            report_html.write_text(
                generate_html(
                    {
                        "original_description": original_description,
                        "best_description": current_description,
                        "best_score": "进行中",
                        "iterations_run": len(history),
                        "train_size": len(train_set),
                        "test_size": len(test_set),
                        "history": history,
                    },
                    skill_name=skill_name,
                )
            )

        if train_results["summary"]["failed"] == 0:
            exit_reason = "all_passed"
            break

        if iteration == max_iterations:
            break

        if not optimizer_command and candidate_description is None:
            exit_reason = "missing_optimizer"
            break

        current_description, _ = improve_description(
            skill_name=skill_name,
            skill_content=skill_content,
            current_description=current_description,
            eval_results=train_results,
            history=history,
            optimizer_command=optimizer_command,
            model=model,
            timeout=timeout,
            candidate_description=candidate_description,
            test_results=test_results,
        )

    best = max(
        history,
        key=lambda item: (
            item["test_passed"] if test_set else item["train_passed"]
        )
        or 0,
    )
    return {
        "exit_reason": exit_reason,
        "original_description": original_description,
        "best_description": best["description"],
        "best_score": (
            f"{best['test_passed']}/{best['test_total']}"
            if test_set
            else f"{best['train_passed']}/{best['train_total']}"
        ),
        "best_train_score": f"{best['train_passed']}/{best['train_total']}",
        "best_test_score": (
            f"{best['test_passed']}/{best['test_total']}" if test_set else None
        ),
        "final_description": current_description,
        "iterations_run": len(history),
        "holdout": holdout,
        "train_size": len(train_set),
        "test_size": len(test_set),
        "history": history,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="运行 description 优化循环")
    parser.add_argument("--eval-set", required=True, type=Path, help="eval 集 JSON 文件")
    parser.add_argument("--skill-path", required=True, type=Path, help="skill 目录")
    parser.add_argument("--description", default=None, help="覆盖起始 description")
    parser.add_argument("--runner-mode", choices=["recorded", "runner"], default="recorded", help="触发评测模式")
    parser.add_argument("--runner-command", default=None, help="runner 模式的命令")
    parser.add_argument("--runner-cwd", type=Path, default=None, help="runner 命令工作目录")
    parser.add_argument("--optimizer-command", default=None, help="description 优化命令")
    parser.add_argument("--candidate-description", default=None, help="手工指定候选 description")
    parser.add_argument("--num-workers", type=int, default=4, help="并发 worker 数")
    parser.add_argument("--timeout", type=int, default=30, help="单次执行超时")
    parser.add_argument("--max-iterations", type=int, default=3, help="最大迭代轮数")
    parser.add_argument("--runs-per-query", type=int, default=1, help="每个 query 运行次数")
    parser.add_argument("--trigger-threshold", type=float, default=0.5, help="通过阈值")
    parser.add_argument("--holdout", type=float, default=0.0, help="测试集占比")
    parser.add_argument("--model", default=None, help="传递给优化器的模型名")
    parser.add_argument("--report-html", type=Path, default=None, help="HTML 报告输出路径")
    parser.add_argument("--output", type=Path, default=None, help="JSON 输出路径")
    args = parser.parse_args()

    result = run_loop(
        eval_set=load_eval_set(args.eval_set.resolve()),
        skill_path=args.skill_path.resolve(),
        description_override=args.description,
        runner_mode=args.runner_mode,
        runner_command=args.runner_command,
        runner_cwd=args.runner_cwd.resolve() if args.runner_cwd else None,
        optimizer_command=args.optimizer_command,
        candidate_description=args.candidate_description,
        num_workers=args.num_workers,
        timeout=args.timeout,
        max_iterations=args.max_iterations,
        runs_per_query=args.runs_per_query,
        trigger_threshold=args.trigger_threshold,
        holdout=args.holdout,
        model=args.model,
        report_html=args.report_html.resolve() if args.report_html else None,
    )

    output_text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(output_text + "\n")
        print(f"结果已写入：{args.output}")
    else:
        print(output_text)


if __name__ == "__main__":
    main()
