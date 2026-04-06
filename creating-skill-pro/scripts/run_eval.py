#!/usr/bin/env python3
"""运行 skill 触发评测。

本文件基于早期 skill-creator 方案改造，当前版本支持：

1. `recorded`：读取人工记录的触发结果
2. `runner`：调用外部 runner 命令并解析 `triggered` 结果
"""

from __future__ import annotations

import argparse
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

try:
    from scripts.utils import load_eval_set, parse_skill_md, parse_trigger_output, run_shell_command
except ModuleNotFoundError:  # 直接执行 `python3 scripts/run_eval.py` 时使用
    from utils import load_eval_set, parse_skill_md, parse_trigger_output, run_shell_command


def read_recorded_runs(item: dict[str, Any], runs_per_query: int) -> list[bool]:
    if "recorded_runs" in item:
        values = item["recorded_runs"]
        if not isinstance(values, list) or not values:
            raise ValueError("`recorded_runs` 必须是非空布尔数组")
        return [bool(value) for value in values]

    if "recorded_triggered" in item:
        return [bool(item["recorded_triggered"]) for _ in range(runs_per_query)]

    raise ValueError("recorded 模式下，每个 eval 条目必须提供 `recorded_runs` 或 `recorded_triggered`")


def run_single_query(
    *,
    item: dict[str, Any],
    skill_name: str,
    description: str,
    skill_path: Path,
    timeout: int,
    runner_command: str,
    runner_cwd: Path | None,
    run_index: int,
) -> bool:
    env = {
        "EVAL_QUERY": item["query"],
        "EVAL_PROMPT": item["prompt"],
        "SKILL_NAME": skill_name,
        "SKILL_DESCRIPTION": description,
        "SKILL_PATH": str(skill_path),
        "SHOULD_TRIGGER": str(bool(item["should_trigger"])).lower(),
        "RUN_INDEX": str(run_index),
    }
    result = run_shell_command(
        runner_command,
        env=env,
        timeout=timeout,
        cwd=runner_cwd,
    )
    if result.returncode != 0:
        raise RuntimeError(f"runner 执行失败：{result.stderr.strip() or result.stdout.strip()}")
    return parse_trigger_output(result.stdout)


def summarize(item: dict[str, Any], triggers: list[bool], trigger_threshold: float) -> dict[str, Any]:
    trigger_rate = sum(triggers) / len(triggers)
    should_trigger = bool(item["should_trigger"])
    did_pass = trigger_rate >= trigger_threshold if should_trigger else trigger_rate < trigger_threshold
    return {
        "id": item.get("id"),
        "eval_name": item.get("eval_name") or f"eval-{item.get('id')}",
        "query": item["query"],
        "prompt": item["prompt"],
        "should_trigger": should_trigger,
        "trigger_rate": trigger_rate,
        "triggers": sum(triggers),
        "runs": len(triggers),
        "pass": did_pass,
    }


def run_eval(
    *,
    eval_set: list[dict[str, Any]],
    skill_name: str,
    description: str,
    skill_path: Path,
    mode: str,
    runner_command: str | None,
    runner_cwd: Path | None,
    num_workers: int,
    timeout: int,
    runs_per_query: int,
    trigger_threshold: float,
) -> dict[str, Any]:
    results: list[dict[str, Any]] = []

    if mode == "recorded":
        for item in eval_set:
            runs = read_recorded_runs(item, runs_per_query)
            results.append(summarize(item, runs, trigger_threshold))
    else:
        if not runner_command:
            raise ValueError("runner 模式必须提供 `--runner-command`")

        with ThreadPoolExecutor(max_workers=num_workers) as executor:
            future_map = {}
            for item in eval_set:
                for run_index in range(runs_per_query):
                    future = executor.submit(
                        run_single_query,
                        item=item,
                        skill_name=skill_name,
                        description=description,
                        skill_path=skill_path,
                        timeout=timeout,
                        runner_command=runner_command,
                        runner_cwd=runner_cwd,
                        run_index=run_index,
                    )
                    future_map[future] = item

            grouped: dict[int, list[bool]] = {}
            items_by_id: dict[int, dict[str, Any]] = {}
            for future in as_completed(future_map):
                item = future_map[future]
                key = int(item.get("id", 0))
                grouped.setdefault(key, [])
                items_by_id[key] = item
                grouped[key].append(bool(future.result()))

        for key in sorted(grouped):
            results.append(summarize(items_by_id[key], grouped[key], trigger_threshold))

    passed = sum(1 for result in results if result["pass"])
    total = len(results)
    return {
        "skill_name": skill_name,
        "description": description,
        "mode": mode,
        "results": results,
        "summary": {
            "total": total,
            "passed": passed,
            "failed": total - passed,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="运行 skill 触发评测")
    parser.add_argument("--eval-set", required=True, type=Path, help="eval 集 JSON 文件")
    parser.add_argument("--skill-path", required=True, type=Path, help="skill 目录")
    parser.add_argument("--mode", choices=["recorded", "runner"], default=None, help="评测模式")
    parser.add_argument("--runner-command", default=None, help="runner 模式下执行的命令")
    parser.add_argument("--runner-cwd", type=Path, default=None, help="runner 命令的工作目录")
    parser.add_argument("--description-override", default=None, help="覆盖 skill 当前 description")
    parser.add_argument("--num-workers", type=int, default=4, help="并发 worker 数")
    parser.add_argument("--timeout", type=int, default=30, help="单次运行超时秒数")
    parser.add_argument("--runs-per-query", type=int, default=1, help="每个 query 运行次数")
    parser.add_argument("--trigger-threshold", type=float, default=0.5, help="判定通过的触发阈值")
    parser.add_argument("--output", type=Path, default=None, help="结果 JSON 输出路径")
    args = parser.parse_args()

    skill_path = args.skill_path.resolve()
    skill_name, description, _ = parse_skill_md(skill_path)
    if args.description_override:
        description = args.description_override

    mode = args.mode or ("runner" if args.runner_command else "recorded")
    eval_set = load_eval_set(args.eval_set.resolve())
    result = run_eval(
        eval_set=eval_set,
        skill_name=skill_name,
        description=description,
        skill_path=skill_path,
        mode=mode,
        runner_command=args.runner_command,
        runner_cwd=args.runner_cwd.resolve() if args.runner_cwd else None,
        num_workers=args.num_workers,
        timeout=args.timeout,
        runs_per_query=args.runs_per_query,
        trigger_threshold=args.trigger_threshold,
    )

    output_text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(output_text + "\n")
        print(f"结果已写入：{args.output}")
    else:
        print(output_text)


if __name__ == "__main__":
    main()
