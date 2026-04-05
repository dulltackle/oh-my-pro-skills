# description 优化

本文件用于提高 skill 的触发率并降低误触发。

## 先检查四类问题

### 1. 只写能力，不写时机

错误示例：

- “帮助处理技能相关任务”
- “支持复杂工作流”

问题：

- 太抽象，几乎不给触发器信号

### 2. 只写实现，不写用户意图

错误示例：

- “实现 benchmark 聚合与 schema 校验”

问题：

- 用户通常不会这样描述需求

### 3. 缺少常见说法

要覆盖用户真实会说的话，例如：

- “帮我做一个 skill”
- “把这个 skill 改好”
- “合并这两个 skill”
- “给这个 skill 做评测”
- “为什么这个 skill 没触发”

### 4. 缺少边界

如果相邻 skill 很多，description 要说明何时应该用、何时不应该用。

## 推荐写法

结构：

1. 先说做什么
2. 再说什么时候用
3. 再补常见任务和触发短语
4. 必要时补文件类型或边界

示例：

> 创建、改造、融合和优化 Agent skills，并提供结构设计、评测、基线对比、description 优化、打包与校验流程。用于用户想从零创建 skill、修改已有 skill、融合两个 skill、为 skill 设计 eval、比较新旧版本效果、提升 skill 触发率，或排查 skill 为什么没有按预期触发时。

## 查询样本怎么写

优先写真实、具体、有上下文的用户表达，而不是抽象标签。

应触发 / 不应触发样本都要尽量满足：

- 像真实用户会发出来的话，最好带任务背景、文件名、约束或上下文
- 尽量是多步骤或需要额外方法论支持的请求，不要用过于简单的一句话
- 正样本要覆盖不同说法，包括口语、缩写、模糊表述和边缘场景
- 负样本要优先写 near-miss，也就是共享关键词但本质不该触发的请求

不推荐：

- “做一个 skill”
- “优化 description”
- “合并文件”

更推荐：

- “我有两个内部 skill，一个偏前端设计，一个偏截图验收，想合成一个统一的交付技能，帮我先定骨架和迁移策略”
- “这个 skill 明明应该在‘帮我评估新旧版本哪个更好’时触发，但最近经常没被用到，帮我做一轮触发样本和 description 回归”
- “我只是想改一段普通文案，不是要做 skill，本次不要走 skill 创建流程”

## 略微主动触发，但边界明确

- description 可以适度把高频任务、相邻说法和模糊表达写进去，降低 undertrigger
- 但不要把相邻领域全部吞掉，必须写清楚何时不该触发
- 如果 skill 和别的 skill 容易混淆，优先补边界而不是继续堆关键词

## 优化流程

1. 先起草 8-10 条应触发样本和 8-10 条不应触发样本
2. 用 `scripts/render_trigger_eval_review.py` 和 `assets/trigger_eval_review.html` 生成 HTML 审阅页，先让人检查样本质量
3. 再用 `scripts/run_eval.py` 评估当前描述
4. 用 `scripts/improve_description.py` 生成新候选
5. 回归验证是否出现 undertrigger 或 overtrigger
6. 只保留长度可控、语义清晰、边界明确的版本

## HTML 审阅资产

建议不要直接手改 JSON。

推荐流程：

1. 准备一个初版 eval 集 JSON
2. 运行 `scripts/render_trigger_eval_review.py --eval-set <json> --skill-path <skill目录> --output <html>`
3. 在浏览器中编辑查询、切换 should-trigger、增删条目
4. 点击导出，得到可直接供 `scripts/run_eval.py` / `scripts/run_loop.py` 使用的 eval 集

## 长度约束

- 必须小于 1024 字符
- 实务上建议控制在 100-250 字以内
- 宁可覆盖高频场景，也不要堆砌长清单
