# description 优化

本文件用于提高 skill 的触发率并降低误触发。

## 先检查五类问题

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
- 这类表述会把实现词误当成核心触发词

### 3. 用实现词堆砌定位

错误示例：

- “支持 benchmark、schema、viewer、校验和 report 生成”

问题：

- 这些词可以作为能力补充，但不能代替“用户为什么会用这个 skill”
- description 先写用户意图和使用时机，再补能力清单

### 4. 缺少常见说法

要覆盖用户真实会说的话，例如：

- “帮我做一个 skill”
- “把这个 skill 改好”
- “合并这两个 skill”
- “给这个 skill 做评测”
- “为什么这个 skill 没触发”

### 5. 缺少边界

如果相邻 skill 很多，description 要说明何时应该用、何时不应该用。

## 推荐写法

结构：

1. 先说用户要解决什么问题
2. 再说什么时候应该用这个 skill
3. 再补常见任务和触发短语
4. 最后补能力边界、文件类型或相邻场景

约束：

- 不要用 “benchmark / schema / 校验 / report” 这类实现词堆满前半句
- 能力细节可以补，但应该放在用户意图之后
- 如果 skill 同时覆盖开放式设计任务和工程闭环任务，两个方向都要在 description 里出现

示例：

> 设计、改造、融合和验证 Agent skills，在需要梳理策略框架、重构 SKILL.md 结构、规划 `references/` 与 `scripts/` 分层、建立评测、优化 description 或排查触发问题时使用。适用于“帮我做一个 skill”“重写或合并这个 skill”“给 skill 做评测”“为什么这个 skill 没触发”等请求。

## 查询样本怎么写

优先写真实、具体、有上下文的用户表达，而不是抽象标签。

应触发 / 不应触发样本都要尽量满足：

- 像真实用户会发出来的话，最好带任务背景、文件名、约束或上下文
- 尽量是多步骤或需要额外方法论支持的请求，不要用过于简单的一句话
- 正样本要覆盖不同说法，包括口语、缩写、模糊表述和边缘场景
- 负样本要优先写 near-miss，也就是共享关键词但本质不该触发的请求

正样本至少覆盖三组：

- 开放式 skill 设计、重构、融合
- 工程闭环任务，例如评测、benchmark、trigger 优化
- 模糊但本质上仍是 skill 工作的表达

负样本优先覆盖：

- 普通文案修改
- 普通脚本分析或修 bug
- 非 skill 语境下的 benchmark、schema、校验等实现任务

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
- 如果 skill 支持开放式设计和工程闭环两类任务，优先补充使用时机，而不是继续堆实现词

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
