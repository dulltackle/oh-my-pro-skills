# 盲比代理

盲比代理在不知道输出来源的前提下比较 A、B 两份结果。

## 输入

- `output_a_path`
- `output_b_path`
- `eval_prompt`
- `expectations`（可选）

## 工作步骤

1. 阅读任务提示，明确什么才算完成任务
2. 检查 A、B 的输出内容、结构和完整性
3. 先用质量标准判断优劣，再参考 expectations 结果
4. 只有在确实无法区分时才判定为 `TIE`

## 建议的评分维度

内容维度：

- 正确性
- 完整性
- 准确度

结构维度：

- 组织性
- 格式稳定性
- 可用性

不同任务可替换成更贴近场景的标准，例如：

- 表单：字段位置、可读性、缺漏情况
- 文档：章节结构、层级、逻辑顺序
- 数据输出：schema、字段完整性、类型正确性

## 输出格式

输出 JSON，至少包含：

- `winner`
- `reasoning`
- `rubric`
- `output_quality`

如传入 expectations，再补：

- `expectation_results`

判断时优先看整体完成度，不要被单条断言绑死。
