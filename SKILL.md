---
name: creating-skill-pro
description: 设计、改造、融合和验证 Agent skills，在需要梳理策略框架、重构 SKILL.md 结构、规划 `references/` 与 `scripts/` 分层、建立评测、优化 description 或排查触发问题时使用。适用于“帮我做一个 skill”“重写或合并这个 skill”“给 skill 做评测”“为什么这个 skill 没触发”等请求。
---

# Creating Skill

本 skill 用于设计、改造和验证 Agent skill。默认先判断任务性质、产物和边界，再按需读取 `references/` 或调用 `scripts/`，不默认把所有请求推进到完整闭环。

## 定位与适用任务

- 从零设计新 skill，或把一套工作方式沉淀成 skill
- 重写、分层、融合或重构已有 skill
- 为 skill 设计评测、baseline、回归检查或结果展示
- 优化 description、触发边界或排查为什么没触发
- 如果只是普通文案修改、普通脚本分析或单次交付，不要误用为 skill 创建流程

## 设计哲学

激发模型能力上限 = 策略哲学 + 最小完备工具集 + 必要事实说明

### 策略哲学

- 写思考框架，不写唯一路径
- 先判断当前任务是开放式设计问题、确定性执行问题，还是验证问题
- 只有当 workflow 能显著降低风险时才引入它；不要把 workflow 当顶层默认范式
- 高自由度任务必须保留重规划空间，不能被固定流程吞掉

### 最小完备工具集

- 顶层 `SKILL.md` 只放定位、判断框架、边界和资源入口
- `references/` 提供按需细节，不默认全读
- `scripts/` 承接重复、确定性、易错的动作
- `agents/`、`assets/`、`eval-viewer/` 是可选能力层，不是每次都要启用

### 必要事实说明

- 事实说明提供推理原料，例如结构约束、环境前提、触发边界和兼容要求
- 不要把经验偏好伪装成硬规则；事实说明负责校准判断，不负责替模型决策
- 当事实边界不完整时，优先补信息，再决定是否进入 workflow 或校验流程

## 工作原则

### 先提取上下文，再补问题

- 如果当前对话里已经包含 workflow、工具链、用户纠偏、输入输出样例或约束，先从现有上下文提取
- 只有当关键信息仍缺失时，再补问题，不要让用户重复已经说过的话
- 提问题时优先补这几类空白：触发时机、输出格式、边界、依赖资源、是否需要评测

### token 是共享资源

- 顶层 `SKILL.md` 只保留路由、原则、关键决策和入口说明
- 长示例、schema、评测细节、大段领域知识放进 `references/`
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

- 高自由度：策略建议、结构设计、边界澄清、示例组织
- 中自由度：推荐模式明确，但允许按上下文调整
- 低自由度：容易出错、需要严格顺序、必须稳定复现的流程
- 高自由度任务禁止被固定流程吞掉；只有风险和收益都明确时才把它压成 workflow

### description 决定是否会被用到

`description` 必须同时说明：

- skill 做什么
- 什么时候必须使用
- 用户可能怎样表达这个需求

描述要优先写用户意图和使用时机，再补常见说法、相关文件类型和相邻边界。

## 模型惯性与边界

- 模型容易把开放式任务写成固定路径，即使当前信息不足
- 模型容易在旧 skill 上持续打补丁，而不是回到抽象层重构骨架
- 模型容易为了“做完整”增加无关文件、过多示例或过深目录
- 模型容易把实现词当成触发词，导致 description 过度技术化
- 这些是高频失误模式，用来提醒判断边界，不是必须执行的步骤

## 通用判断框架

优先沿着这四个维度判断，而不是直接启动完整流程：

1. 目标和成功标准是否明确
2. 当前是开放式设计问题、确定性执行问题，还是验证问题
3. 哪些能力需要 `references/`，哪些动作需要 `scripts/`
4. 是否真的需要评测、baseline 或触发回归

## 任务判断与分流

开始前先识别当前请求属于哪一类：

### 新建 skill

- 何时归类：用户要把某个工作方式、知识域或工具链沉淀成可复用 skill
- 核心产物：清晰的定位、顶层结构和 description 草案
- 优先读取：`references/authoring/patterns.md`、`references/authoring/output-patterns.md`、`references/authoring/example.md`
- 需要 workflow 细节时再读：`references/authoring/workflows.md`
- 需要快速生成骨架时才调用：`scripts/init_skill.py`

### 融合或改造 skill

- 何时归类：用户要合并两个 skill、重写现有 skill、引入另一份能力，或把旧骨架重新分层
- 核心产物：改造策略、迁移边界、统一术语和目录组织
- 优先读取：`references/merging/merge-playbook.md`
- 需要写作模式或示例时再读：`references/authoring/patterns.md`、`references/authoring/example.md`
- 只有在确定性迁移步骤已经明确时，才进入脚本或批量调整环节

### 评测与对比

- 何时归类：用户要验证 skill 是否真的提升结果，比较新旧版本，或为改造结果建立 benchmark
- 核心产物：区分 skill 价值的 eval 集、baseline 选择和可回看的结果
- 优先读取：`references/evaluation/workflow.md`、`references/evaluation/schemas.md`
- 需要执行或聚合时可调用：`scripts/run_eval.py`、`scripts/run_loop.py`、`scripts/aggregate_benchmark.py`、`scripts/generate_report.py`
- 需要人工判读时可配合：`agents/grader.md`、`agents/comparator.md`、`agents/analyzer.md`、`eval-viewer/generate_review.py`

### 触发优化

- 何时归类：用户要排查为什么没触发、提高触发率、降低误触发，或重写 description
- 核心产物：清晰的 description、成组的 should-trigger / should-not-trigger 样本，以及回归结论
- 优先读取：`references/triggering/description-optimization.md`、`references/evaluation/schemas.md`
- 需要批量生成或回归时可调用：`scripts/improve_description.py`、`scripts/render_trigger_eval_review.py`、`scripts/run_eval.py`

不要默认把四类流程全部跑完。只执行当前任务真正需要的部分。

## 资源边界与退化策略

### 渐进披露

skill 默认采用三层结构：

1. frontmatter：只有 `name` 和 `description` 等高频元数据，始终在上下文里
2. 顶层 `SKILL.md`：只保留哲学、判断框架、边界和资源入口
3. 按需资源：`references/`、`scripts/`、`assets/`、`evals/`

约定：

- 顶层 `SKILL.md` 实务上尽量控制在 500 行以内
- 单个 reference 很长时，优先在文件开头补目录或分节导航
- 只在当前任务需要时才继续读取对应 `references/`
- 只在步骤已经明确且适合确定性执行时才运行 `scripts/`

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

- `references/authoring/`：顶层哲学、workflow 取舍、结构模式、示例
- `references/merging/`：融合策略、迁移收尾
- `references/evaluation/`：eval、grading、benchmark、viewer
- `references/triggering/`：description 与触发优化

## 工具链前提

- 文档规划、结构设计、融合方案，可以只做文档层规划
- 自动评测、触发检测、description 优化通常需要本地命令行 runner 或模型命令
- 脚本默认采用中立接口，不预设特定供应商 CLI
- 如果环境暂时不支持自动检测，退化为半自动模式：保存输入、输出、日志和人工判定结果
- workflow 是可选分支，不是顶层默认步骤；只有当顺序执行能明显降低风险时才启用它

## 最小验收清单

- `name`、目录名、skill 定位一致
- `description` 同时覆盖“做什么 + 何时触发”
- 顶层 `SKILL.md` 保持精简，且只承担哲学、判断和路由职责
- 细节已下沉到正确的 `references/` / `scripts/`
- 路径、命名、术语、归属信息已经统一
- 高自由度任务没有被误写成固定流程
- 如果做了融合，结果不是简单拼接
- 如果做了评测，baseline 合理且结果可解释
