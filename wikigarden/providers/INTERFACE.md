# Provider 接口契约

> 本文件定义所有存储后端必须实现的接口、逻辑路径约定、元数据规范和项目注册规范。
> 每个 provider（如 `local.md`、`feishu.md`）必须在其文档开头声明遵循本契约。

---

## 项目注册目录

> 所有知识库项目统一在 `~/.kb/` 目录下注册配置，作为本地入口。配置位置与数据存储位置分离。

### 注册目录

- **路径**：`~/.kb/`
- **首次使用时自动创建**

### 配置文件

- **命名**：`<slug>.conf.yaml`，slug 取知识库名称的小写形式，空格替换为连字符，去除特殊字符
- **示例**：知识库名称 "AI落地关键技术" → `~/.kb/ai-landing-guan-jian-ji-shu.conf.yaml`

### 配置文件格式

```yaml
name: <知识库名称>              # 必填
description: <简短描述>          # 选填，默认为空
created_at: <YYYY-MM-DD>        # 必填，自动生成
provider: <provider名称>        # 必填，对应 providers/ 下的文件名（不含 .md）
provider_config:                # 必填，格式由各 provider 文档定义
  ...
```

### 项目发现

当用户提及某个知识库但未指定具体配置时，LLM 按以下步骤发现目标项目：

1. 扫描 `~/.kb/*.conf.yaml` 中的所有配置文件
2. 按 `name` 字段匹配用户意图
3. 读取匹配的配置，按 `provider` 字段选择对应 provider 文档
4. 用 `provider_config` 中的参数执行操作

---

## 接口列表

### init

| 项目 | 说明 |
|------|------|
| 语义 | 初始化知识库的存储结构，创建所需的逻辑目录和初始文件，并注册项目配置 |
| 输入 | 项目配置（名称、description、provider_config 等） |
| 输出 | - |
| 约束 | **幂等**：重复调用不破坏已有数据。必须确保 `index`、`log`、`glossary` 存在。**必须生成配置并注册到 `~/.kb/<slug>.conf.yaml`** |

### raw_write

| 项目 | 说明 |
|------|------|
| 语义 | 写入一条新的原始素材 |
| 输入 | 素材内容（markdown）+ 元信息（标题、类型、来源 URL、标签等） |
| 输出 | 素材 ID |
| 约束 | 同 ID 不覆盖。ID 生成规则由 provider 决定，但必须是全局唯一且稳定的字符串。写入后必须生成对应的元数据记录（status 默认为 `pending`） |

### raw_read

| 项目 | 说明 |
|------|------|
| 语义 | 读取一条素材的内容 |
| 输入 | 素材 ID |
| 输出 | 素材内容（markdown） |
| 约束 | ID 不存在时返回明确错误 |

### raw_list

| 项目 | 说明 |
|------|------|
| 语义 | 列出素材元信息 |
| 输入 | 可选过滤条件：status（pending/processed）、type（article/paper/repo/dataset/image/manual） |
| 输出 | 元信息列表（每条包含 id、title、type、status、tags、ingested_at 等） |
| 约束 | 无过滤条件时返回全部 |

### raw_update_meta

| 项目 | 说明 |
|------|------|
| 语义 | 更新指定素材的元数据字段 |
| 输入 | 素材 ID + 要更新的字段及值（如 status: processed） |
| 输出 | - |
| 约束 | 只更新指定字段，不覆盖其他字段。ID 不存在时返回明确错误 |

### wiki_write

| 项目 | 说明 |
|------|------|
| 语义 | 写入或覆盖一个知识页 |
| 输入 | 逻辑路径 + 页面内容（markdown） |
| 输出 | - |
| 约束 | 逻辑路径必须是约定路径（见[逻辑路径约定](#逻辑路径约定)）。已存在时覆盖，不存在时创建 |

### wiki_read

| 项目 | 说明 |
|------|------|
| 语义 | 读取一个知识页的内容 |
| 输入 | 逻辑路径 |
| 输出 | 页面内容（markdown） |
| 约束 | 路径不存在时返回明确错误 |

### wiki_list

| 项目 | 说明 |
|------|------|
| 语义 | 列出知识页 |
| 输入 | 可选过滤条件：目录前缀（如 `summaries`、`concepts`） |
| 输出 | 逻辑路径列表 |
| 约束 | 无过滤条件时返回全部。不包含 `links/` 下的关系文件 |

### wiki_delete

| 项目 | 说明 |
|------|------|
| 语义 | 删除一个知识页 |
| 输入 | 逻辑路径 |
| 输出 | - |
| 约束 | 路径不存在时返回明确错误。不应删除 `index`、`log`、`glossary` |

### output_write / output_read / output_list

语义与 wiki 层对应接口完全一致，区别仅在于操作范围限定在 `output/` 逻辑路径下。

逻辑路径示例：`reports/2026-04-13-ai-trends`、`slides/xxx`、`visualizations/xxx`。

### search

| 项目 | 说明 |
|------|------|
| 语义 | 在知识库中全文搜索 |
| 输入 | 查询文本 + 可选范围（wiki / raw / output） |
| 输出 | 匹配结果列表（每条包含逻辑路径/素材 ID + 匹配片段） |
| 约束 | **可选接口**。不支持时返回"不支持"，上层回退到 `wiki_list` + 逐页 `wiki_read` |

### healthcheck

| 项目 | 说明 |
|------|------|
| 语义 | 检查知识库存储结构的完整性和健康度 |
| 输入 | - |
| 输出 | 结构化健康报告，至少包含：目录/节点是否存在、空内容检测、悬空引用检测 |
| 约束 | 报告格式应与 `references/maintenance.md` 的报告格式对齐。**必须检查 `~/.kb/<slug>.conf.yaml` 存在且可读取** |

---

## 逻辑路径约定

> **所有 provider 必须支持以下逻辑路径体系。** 上层 references 通过逻辑路径访问知识库，provider 负责将逻辑路径映射到实际的物理存储结构。

### 素材层（raw/）

| 逻辑路径 | 含义 | 说明 |
|---------|------|------|
| `raw/articles/<id>` | 文章素材 | 抓取的网页文章 |
| `raw/papers/<id>` | 论文素材 | 学术论文 |
| `raw/repos/<id>` | 代码仓库 | GitHub 仓库的 README + 关键文件 |
| `raw/datasets/<id>` | 数据集 | 数据描述和样本 |
| `raw/images/<id>` | 图片 | 原图 + 说明 |
| `raw/manual/<id>` | 用户输入 | 用户直接提供的文本/文件 |
| `raw/meta/<id>` | 元数据 | 与素材 ID 对应的元信息记录 |

`<id>` 由 provider 的 `raw_write` 接口生成，全局唯一且稳定。

### 知识层（wiki/）

| 逻辑路径 | 含义 | 说明 |
|---------|------|------|
| `wiki/index` | 知识总索引 | 每页一条目（链接 + 摘要 + 元数据），Query 的入口 |
| `wiki/log` | 操作日志 | 追加-only 的时间线，格式 `## [YYYY-MM-DD] <操作类型> \| <标题>` |
| `wiki/glossary` | 术语表 | 领域术语统一定义 |
| `wiki/summaries/<slug>` | 文档摘要 | 每篇素材的结构化摘要 |
| `wiki/concepts/<concept>` | 概念页 | 核心定义、多视角并列、出处标注 |
| `wiki/topics/<topic>` | 专题页 | 跨文档主题综合 |
| `wiki/comparisons/<name>` | 对比页 | 结构化对比分析 |
| `wiki/links/relations` | 关系图 | 概念/文档间关联 |

### 输出层（output/）

| 逻辑路径 | 含义 | 说明 |
|---------|------|------|
| `output/reports/<name>` | 报告 | 持久化报告 |
| `output/slides/<name>` | 幻灯片 | 演示文稿 |
| `output/visualizations/<name>` | 可视化 | 图表、关系图、表格 |

---

## 元数据规范

> 每条素材写入 `raw/` 时，必须同时生成元数据记录。以下为**必填字段**，各 provider 可以扩展但不得删减。

### 必填字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 素材 ID，由 `raw_write` 生成 |
| `source_url` | string | 来源 URL 或 `"用户输入"` |
| `title` | string | 素材标题 |
| `type` | enum | `article` / `paper` / `repo` / `image` / `dataset` / `manual` |
| `ingested_at` | string | ISO 8601 时间戳 |
| `status` | enum | `pending`（默认）/ `processed` |
| `tags` | list | 标签列表 |
| `notes` | string | 备注，默认为空 |

---

## 素材内容格式

> 素材的 markdown 内容格式在所有 provider 间保持一致。这是**内容格式**，与存储无关。

```markdown
# <标题>

> 来源: <url 或 "用户输入">
> 采集时间: <YYYY-MM-DD HH:MM>
> ID: <id>

---

<内容>
```

---

## Provider 文档编写指南

> 新增 provider 时，在 `providers/` 下创建 `<name>.md`，必须包含以下章节：

1. **声明**：明确声明"本文件实现 `providers/INTERFACE.md` 定义的接口"
2. **配置**：本项目在 `~/.kb/<slug>.conf.yaml` 中 `provider_config` 的格式和必填/选填字段
3. **逻辑路径映射表**：列出逻辑路径到物理存储的映射关系
4. **接口实现**：逐个接口描述具体操作步骤
5. **搜索能力**：说明是否支持 `search` 接口，不支持时的回退策略
6. **优势与限制**：该后端的适用场景和已知限制

---

## 与上游的关系

| 上游文件 | 依赖本契约的方式 |
|---------|----------------|
| `SKILL.md` | 引用本文件说明 provider 体系和项目注册目录 |
| `project-setup.md` | 通过本契约的 `init` 接口、配置格式规范和注册目录约定完成项目初始化 |
| `references/ingest.md` | 通过 `raw_write` / `raw_list` 接口完成素材收集和状态查询 |
| `references/compile.md` | 通过逻辑路径约定写入知识页，通过 `wiki_write` / `wiki_read` 操作 Wiki |
| `references/query.md` | 通过 `wiki_read` 读取 `wiki/index`，通过 `wiki_list` + `search` 定位知识 |
| `references/maintenance.md` | 通过 `healthcheck` 接口执行健康检查 |
| `references/output.md` | 通过 `output_write` 等接口存储产出物 |
