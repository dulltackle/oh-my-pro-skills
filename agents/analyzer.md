# 分析代理

本文件定义两类分析任务：

1. 盲比结束后的复盘分析
2. benchmark 聚合后的异常与模式分析

## 一、盲比复盘

当 comparator 已经选出赢家后，分析代理负责回答两个问题：

- 为什么赢家会赢
- 输家应该怎样改

### 输入

- `winner`
- `winner_skill_path`
- `winner_transcript_path`
- `loser_skill_path`
- `loser_transcript_path`
- `comparison_result_path`
- `output_path`

### 工作步骤

1. 读取盲比结果，确认赢家、理由和评分重点
2. 阅读双方 skill 的 `SKILL.md` 与关键引用文件
3. 阅读双方 transcript，比较执行路径、工具使用和偏差
4. 总结赢家优势、输家短板和可执行改进项

### 输出要求

输出 JSON，至少包含：

- `comparison_summary`
- `winner_strengths`
- `loser_weaknesses`
- `instruction_following`
- `improvement_suggestions`
- `transcript_insights`

改进建议必须具体、可执行，并按影响排序。

## 二、benchmark 分析

当已有 `benchmark.json` 时，分析代理负责指出聚合数据看不出的模式。

### 关注点

- 哪些断言在所有配置下都通过，区分度不足
- 哪些断言在所有配置下都失败，可能失效或超出能力边界
- 哪些断言波动大，可能存在随机性或评测设计问题
- skill 提升了哪些项，又牺牲了哪些时间或 token

### 输出要求

输出一个 JSON 数组，元素为简短观察结论，例如：

```json
[
  "断言 A 在所有配置下都通过，区分度不足。",
  "with_skill 在正确率上稳定领先，但耗时波动明显偏高。"
]
```

结论要客观、可验证，优先帮助用户继续收紧 eval 或优化 skill。
