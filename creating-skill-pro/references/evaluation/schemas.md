# 评测数据结构

本文件定义 `creating-skill-pro` 使用的评测文件族。

---

## `evals/evals.json`

位于 skill 目录内，用于定义 eval 集。

```json
{
  "skill_name": "creating-skill-pro",
  "evals": [
    {
      "id": 1,
      "eval_name": "merge-two-skills",
      "query": "请帮我融合两个 skill",
      "prompt": "请帮我融合两个 skill",
      "should_trigger": true,
      "expected_output": "给出融合方案并指出保留骨架",
      "files": [],
      "expectations": [
        "明确指出融合策略",
        "输出中包含 references 和 scripts 的迁移建议"
      ]
    }
  ]
}
```

说明：

- `eval_name`：可选但强烈建议提供；用于工作目录名、viewer 标题和 benchmark 展示
- `query`：用于触发检测或最小查询
- `prompt`：完整执行提示，可与 `query` 相同
- `should_trigger`：该用例预期是否应触发 skill
- `expected_output`：人类可读的成功描述
- `files`：可选输入文件
- `expectations`：可验证断言

---

## `eval_metadata.json`

位于单个 eval 工作目录。

```json
{
  "eval_id": 1,
  "eval_name": "skill-merge",
  "prompt": "请帮我融合两个 skill",
  "assertions": [
    "明确指出融合策略"
  ]
}
```

---

## `grading.json`

位于单次运行目录，用于保存 grader 结果。

```json
{
  "expectations": [
    {
      "text": "明确指出融合策略",
      "passed": true,
      "evidence": "输出中包含“骨架继承”并解释理由"
    }
  ],
  "summary": {
    "passed": 1,
    "failed": 0,
    "total": 1,
    "pass_rate": 1.0
  },
  "execution_metrics": {
    "total_tool_calls": 0,
    "errors_encountered": 0,
    "output_chars": 800
  },
  "timing": {
    "total_duration_seconds": 5.4
  },
  "claims": [],
  "user_notes_summary": {
    "uncertainties": [],
    "needs_review": [],
    "workarounds": []
  }
}
```

`expectations[].text/passed/evidence` 这三个字段名必须保持不变，viewer 依赖它们。

---

## `timing.json`

位于单次运行目录，用于保存总耗时与 token。

```json
{
  "total_tokens": 12000,
  "duration_ms": 4200,
  "total_duration_seconds": 4.2
}
```

---

## `benchmark.json`

由 `scripts/aggregate_benchmark.py` 生成。

```json
{
  "metadata": {
    "skill_name": "creating-skill-pro",
    "skill_path": "/path/to/creating-skill-pro",
    "timestamp": "2026-04-05T00:00:00Z",
    "evals_run": [1],
    "runs_per_configuration": 1
  },
  "runs": [
    {
      "eval_id": 1,
      "eval_name": "skill-merge",
      "configuration": "with_skill",
      "run_number": 1,
      "result": {
        "pass_rate": 1.0,
        "passed": 1,
        "failed": 0,
        "total": 1,
        "time_seconds": 4.2,
        "tokens": 12000,
        "tool_calls": 0,
        "errors": 0
      },
      "expectations": [
        {
          "text": "明确指出融合策略",
          "passed": true,
          "evidence": "输出中包含“骨架继承”并解释理由"
        }
      ],
      "notes": []
    }
  ]
}
```

---

## 半自动模式补充字段

当 runner 无法自动判断触发时，可在 eval 条目中写入：

- `recorded_triggered`: 单次人工观察结果
- `recorded_runs`: 多次人工观察结果数组

`scripts/run_eval.py` 会优先消费这些字段。
