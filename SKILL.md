---
name: creating-skill-pro
description: 创建、改造、融合和优化 Agent skills，并提供结构设计、评测、基线对比、description 优化、打包与校验流程。用于用户想从零创建 skill、修改已有 skill、融合两个 skill、为 skill 设计 eval、比较新旧版本效果、提升 skill 触发率，或排查 skill 为什么没有按预期触发时。
---

# Creating Skill

本 skill 负责把“写一个 skill”做成闭环，而不只是产出一份 `SKILL.md`。

适用任务：

1. 从零创建新 skill
2. 修改、重构或融合已有 skill
3. 为 skill 建立 eval、baseline 对比与 benchmark
4. 优化 description 与触发效果

## 先提取上下文，再补问题

- 如果当前对话里已经包含 workflow、工具链、用户纠偏、输入输出样例或约束，先从现有上下文提取
- 只有当关键信息仍缺失时，再补问题，不要让用户重复已经说过的话
- 提问题时优先补这几类空白：触发时机、输出格式、边界、依赖资源、是否需要评测

## 渐进披露

skill 默认采用三层结构：

1. frontmatter：只有 `name` 和 `description` 等高频元数据，始终在上下文里
2. 顶层 `SKILL.md`：只保留路由、原则、流程和资源入口
3. 按需资源：`references/`、`scripts/`、`assets/`、`evals/`

约定：

- 顶层 `SKILL.md` 实务上尽量控制在 500 行以内
- 长示例、schema、评测细节、大段领域知识放进 `references/`
- 单个 reference 很长时，优先在文件开头补目录或分节导航
- 可确定、可复用、容易出错的操作优先沉到 `scripts/`

## 先判断任务类型

开始前先识别当前请求属于哪一类：

- 新建 skill：用户要把某个工作流、知识域或工具链沉淀成可复用 skill
- 融合/改造：用户要合并两个 skill、重写现有 skill、引入另一份能力
- 评测/对比：用户要验证 skill 是否真的提升结果，或比较新旧版本
- 触发优化：用户要排查为什么没触发，或想提高触发率、降低误触发

不要默认把四类流程全部跑完。只执行当前任务真正需要的部分。

## 核心原则

### token 是共享资源

- 顶层 `SKILL.md` 只保留路由、原则、关键决策和入口说明
- 长示例、schema、评测细节、viewer 说明放进 `references/`
- 重复、脆弱或需要确定性的逻辑优先做成 `scripts/`

### 沟通风格随用户熟悉度调整

- 默认优先用用户意图、任务目标和产物来描述，不要上来就堆术语
- 只有当上下文已经表明用户熟悉时，才直接使用 `eval`、`benchmark`、`assertion` 等词
- 如果术语不可避免，先用一句中文短解释再继续，例如“评测样本（eval）”或“可验证断言（assertion）”
- 对熟悉工程流程的用户可以更直接；对非工程背景用户要优先讲目的、步骤和交付物

### 先复用，后新增

- 先盘点现有 skill、脚本、参考资料、模板和历史流程
- 能改造就不要重写，能下沉就不要堆在顶层
- 不要为 skill 新增无关文件，如 `README.md`、`CHANGELOG.md`、安装说明

### 自由度和风险匹配

- 高自由度：策略建议、结构设计、示例组织
- 中自由度：推荐模式明确，但允许按上下文调整
- 低自由度：容易出错、需要严格顺序、必须稳定复现的流程

### description 决定是否会被用到

`description` 必须同时说明：

- skill 做什么
- 什么时候必须使用
- 用户可能怎样表达这个需求

描述要具体，可覆盖任务类型、常见说法、相关文件类型和相邻边界。

## 通用闭环

默认执行顺序：

1. 明确目标、边界和输出
2. 盘点现有 skill / scripts / references / assets
3. 设计目标结构和迁移策略
4. 起草或重构内容
5. 运行最小必要校验
6. 如有需要，补充 eval、baseline、benchmark 与 description 优化
7. 收尾：统一术语、路径、命名、归属和许可证

## 各类任务的执行重点

### 新建 skill

- 先从当前对话提取已有信息，再补缺口
- 明确 `name`、`description`、输出形式、依赖资源
- 先写顶层 `SKILL.md`，再决定是否需要 `scripts/`、`references/`、`assets/`、`evals/`
- 需要骨架时使用 `scripts/init_skill.py`

需要详细写作模式时，读取：

- `references/authoring/workflows.md`
- `references/authoring/patterns.md`
- `references/authoring/output-patterns.md`
- `references/authoring/example.md`

### 融合或改造 skill

- 比较双方 skill 的定位、强项、冗余、冲突和可迁移资产
- 优先选择明确策略：骨架继承、能力注入或双层拆分
- 顶层只保留统一定位和路由，细节全部下沉
- 统一术语、目录组织、触发语气和脚本接口

需要融合方法时，读取：

- `references/merging/merge-playbook.md`

### 评测与对比

- 只在需要验证 skill 价值时进入
- 优先设计能区分 skill 价值的 eval prompt
- 对比 `with_skill` 与 `baseline`，必要时加 `old_skill`
- workspace 默认建议用 `iteration-N/<eval-name>/{with_skill,without_skill,old_skill}`
- 先把结果放进 viewer 给人看，再汇总 benchmark 和结论

需要评测细节时，读取：

- `references/evaluation/workflow.md`
- `references/evaluation/schemas.md`

评测阶段可使用：

- `scripts/run_eval.py`
- `scripts/run_loop.py`
- `scripts/aggregate_benchmark.py`
- `scripts/generate_report.py`
- `agents/grader.md`
- `agents/comparator.md`
- `agents/analyzer.md`
- `eval-viewer/generate_review.py`

### 触发优化

- 先检查 `description` 是否缺少任务、时机、触发短语或边界
- 再检查是否过于抽象、过于技术化、或与邻近 skill 混淆
- 先产出可人工审查的 should-trigger / should-not-trigger 查询，再跑优化回路
- 需要时用 eval 样本回归验证

需要触发优化细节时，读取：

- `references/triggering/description-optimization.md`
- `references/evaluation/schemas.md`

可使用：

- `scripts/improve_description.py`
- `scripts/run_eval.py`

## 目录约定

典型结构：

```text
skill-name/
├── SKILL.md
├── references/
├── scripts/
├── assets/
└── evals/
```

在本 skill 中：

- `references/authoring/`：写作原则、结构模式、示例
- `references/merging/`：融合策略、迁移收尾
- `references/evaluation/`：eval、grading、benchmark、viewer
- `references/triggering/`：description 与触发优化

## 工具链前提

- 文档规划、结构设计、融合方案，可以只做文档层规划
- 自动评测、触发检测、description 优化通常需要本地命令行 runner 或模型命令
- 脚本默认采用中立接口，不预设特定供应商 CLI
- 如果环境暂时不支持自动检测，退化为半自动模式：保存输入、输出、日志和人工判定结果

## 结束前检查

- `name`、目录名、skill 定位一致
- `description` 同时覆盖“做什么 + 何时触发”
- 顶层 `SKILL.md` 保持精简且职责清晰
- 细节已下沉到正确的 `references/` / `scripts/`
- 路径、命名、术语、归属信息已经统一
- 如果做了融合，结果不是简单拼接
- 如果做了评测，baseline 合理且结果可解释
