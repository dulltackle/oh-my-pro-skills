# 评测工作流

本文件定义 skill 评测闭环。只有在需要验证 skill 价值、比较新旧版本，或优化 description 时才进入本流程。

## 1. 设计 eval

优先写 2-3 个真实、具体、能区分 skill 价值的测试用例。

建议每个 eval 至少包含：

- `eval_name`
- `prompt`
- `expected_output`
- 可选输入文件
- 一组可验证的 expectations

其中：

- `eval_name` 用于 workspace 目录名、viewer 标题和 benchmark 展示
- 没有 `eval_name` 时，可以回退到 `id`，但不建议长期依赖

## 2. 选择 baseline

- 新建 skill：通常用 `without_skill`
- 改造 skill：通常用 `old_skill`
- 有多个实现版本时：可追加更多配置，但要保持命名稳定

## 3. 运行执行

推荐 workspace 结构：

```text
iteration-1/
├── plan-skill-merge/
│   ├── eval_metadata.json
│   ├── with_skill/
│   ├── without_skill/
│   └── old_skill/
└── compare-trigger-description/
    ├── eval_metadata.json
    ├── with_skill/
    └── without_skill/
```

其中 `<eval-name>/` 建议使用稳定、可读的 kebab-case 名称。

支持两种模式：

- 自动模式：通过 runner 命令自动执行并返回是否触发或执行结果
- 半自动模式：把观察结果、输出、日志写入约定文件，再统一聚合

`scripts/run_eval.py` 负责读取 eval 集并汇总结果。

## 4. 评分与聚合

- `agents/grader.md`：按 expectations、输出和 transcript 判定通过情况
- `agents/comparator.md`：盲比两个输出
- `agents/analyzer.md`：分析 benchmark 模式下的波动、无区分断言和收益点
- `scripts/aggregate_benchmark.py`：聚合 `grading.json`、`timing.json` 到 `benchmark.json`

## 5. 展示与回看

- `eval-viewer/generate_review.py` 可生成静态 HTML 或本地服务
- viewer 不是硬依赖，但在有人类 review 的流程里应作为默认建议步骤
- 反馈、旧版本输出和 benchmark 应尽量放在统一 workspace
- 如果需要对比新旧结果，优先先开 viewer，再整理 benchmark 结论

## 6. 迭代

根据结果决定是否调整：

- 顶层 `SKILL.md`
- `references/`
- `scripts/`
- `description`
- eval 自身的 expectations
