# Provider: feishu（飞书知识空间）

> 本文件实现 `providers/INTERFACE.md` 定义的接口。所有数据以飞书文档形式存储在飞书知识空间（Wiki Space）中，通过飞书 API 读写。

## 配置

项目配置注册在 `~/.kb/<slug>.conf.yaml`，其中 `provider_config` 格式如下：

```yaml
name: <知识库名称>
description: ""
created_at: <YYYY-MM-DD>
provider: feishu
provider_config:
  space_id: <飞书知识空间 ID>          # 必填，可通过飞书知识库 URL 获取
  root_node_token: <根节点 token>       # 选填，不填则使用知识空间根节点
```

**前提条件：**
- 飞书应用已开通知识库权限（wiki:wiki）
- 用户已授权，具备目标知识空间的编辑权限
- 建议为知识库创建一个专用的知识空间，避免与日常工作文档混用

## 逻辑路径映射表

飞书知识空间是树形结构，逻辑路径映射为知识空间内的层级节点。`$ROOT` 表示 `root_node_token`（若未配置则为知识空间根节点）。

| 逻辑路径 | 飞书节点路径 | 文档标题 |
|---------|------------|---------|
| `raw/articles/<id>` | `$ROOT/素材/文章/<id>` | `<id>` |
| `raw/papers/<id>` | `$ROOT/素材/论文/<id>` | `<id>` |
| `raw/repos/<id>` | `$ROOT/素材/仓库/<id>` | `<id>` |
| `raw/datasets/<id>` | `$ROOT/素材/数据集/<id>` | `<id>` |
| `raw/images/<id>` | `$ROOT/素材/图片/<id>` | `<id>` |
| `raw/manual/<id>` | `$ROOT/素材/手动输入/<id>` | `<id>` |
| `raw/meta/<id>` | `$ROOT/素材/元数据/<id>` | `<id>` |
| `wiki/index` | `$ROOT/知识/索引` | `索引` |
| `wiki/log` | `$ROOT/知识/日志` | `日志` |
| `wiki/glossary` | `$ROOT/知识/术语表` | `术语表` |
| `wiki/summaries/<slug>` | `$ROOT/知识/摘要/<slug>` | `<slug>` |
| `wiki/concepts/<concept>` | `$ROOT/知识/概念/<concept>` | `<concept>` |
| `wiki/topics/<topic>` | `$ROOT/知识/专题/<topic>` | `<topic>` |
| `wiki/comparisons/<name>` | `$ROOT/知识/对比/<name>` | `<name>` |
| `wiki/links/relations` | `$ROOT/知识/关联/关系图` | `关系图` |
| `output/reports/<name>` | `$ROOT/输出/报告/<name>` | `<name>` |
| `output/slides/<name>` | `$ROOT/输出/幻灯片/<name>` | `<name>` |
| `output/visualizations/<name>` | `$ROOT/输出/可视化/<name>` | `<name>` |

**内部缓存：** LLM 在首次 `init` 或 `wiki_list` 时遍历知识空间，构建逻辑路径 → node_token 的映射缓存，存放在本地文件 `~/.kb/<slug>.cache.json` 中，避免重复 API 调用。后续写入操作同步更新缓存。

## 接口实现

> 以下使用飞书工具名指代具体调用，实际由 LLM 通过飞书工具完成。

### init

1. **验证知识空间**：调用 `feishu_wiki_space`（action=get, space_id=...）确认空间存在且可访问
2. **获取根节点**：如有 `root_node_token` 则验证该节点存在；否则使用空间根节点
3. **创建目录结构**：按以下顺序创建子节点（类型均为 docx），如果已存在则跳过：

```
素材/
素材/文章/
素材/论文/
素材/仓库/
素材/数据集/
素材/图片/
素材/手动输入/
素材/元数据/
素材/回收站/          ← delete 操作的目标目录，首次 delete 时自动创建
知识/
知识/摘要/
知识/概念/
知识/专题/
知识/对比/
知识/关联/
输出/
输出/报告/
输出/幻灯片/
输出/可视化/
```

4. **创建初始文件**：
   - `wiki/index` → 在「知识」下创建文档「索引」，内容为 `# <知识库名称> 索引\n\n（暂无条目）`
   - `wiki/log` → 在「知识」下创建文档「日志」，内容为 `# 操作日志\n\n`
   - `wiki/glossary` → 在「知识」下创建文档「术语表」，内容为 `# 术语表\n\n`

5. **构建缓存**：遍历所有节点，写入 `~/.kb/<slug>.cache.json`：

```json
{
  "updated_at": "2026-04-14T22:00:00+08:00",
  "nodes": {
    "素材": { "node_token": "xxx", "obj_token": "xxx" },
    "素材/文章": { "node_token": "xxx", "obj_token": "xxx" },
    "素材/文章/20260415_xxx": { "node_token": "xxx", "obj_token": "xxx" },
    "知识/索引": { "node_token": "xxx", "obj_token": "xxx" },
    ...
  },
  "by_id": {
    "20260415_xxx": { "type": "article", "feishu_path": "素材/文章/20260415_xxx", "node_token": "xxx", "obj_token": "xxx" }
  }
}
```

> **by_id 索引**：以素材 ID 为 key 的扁平索引，用于 raw_read 等只需 ID 就能定位素材的场景。key 为素材 ID，value 包含 `type`（英文类型）、`feishu_path`（完整飞书路径）、`node_token`、`obj_token`。仅 raw 层素材进入 by_id，wiki/output 层不需要。init 遍历 raw 各类型目录时同步构建，type 通过父目录推断（如"文章"→"article"）。

6. **注册配置**：将项目配置写入 `~/.kb/<slug>.conf.yaml`

**幂等处理**：使用 `feishu_wiki_space_node`（action=list）检查子节点是否已存在，已存在则跳过创建，直接记录到缓存。

### raw_write

1. **生成 ID**：`<YYYYMMDD_HHMMSS>_<slug>`，slug 取标题或 URL basename，小写，非字母数字替换为连字符
2. **格式化内容**：按 INTERFACE.md 素材内容格式组装 markdown
3. **写入素材文档**：
   - 定位父节点：`素材/<类型中文名>/`，从缓存获取 node_token
   - 调用 `feishu_create_doc`（title=`<id>`, markdown=素材内容, **wiki_node=父节点node_token**）— 此调用**同时完成创建+挂载**
   - ⚠️ **不要**再额外调 `feishu_wiki_space_node(action=create)` 重复挂载，会报 field validation failed
4. **写入元数据文档**：
   - 在 `素材/元数据/` 下创建文档（title=`<id>`, **wiki_node=元数据目录node_token**）— 同上，一步到位
5. **更新缓存**：同时在 `nodes` 和 `by_id` 中追加条目到 `~/.kb/<slug>.cache.json`
   - `nodes["素材/<类型中文名>/<id>"]` = `{ node_token, obj_token }`
   - `by_id[<id>]` = `{ type: <英文类型>, feishu_path: "素材/<类型中文名>/<id>", node_token, obj_token }`

> **批量写入注意**：飞书 Wiki API 对同一知识空间有并发锁（lock contention），短时间密集创建（如一次建 5+ 个文档）可能触发。遇到时单独 retry 即可；大批量操作建议分批（每 3-5 个稍作停顿）。

**工具调用示例：**

```
# 创建素材文档
feishu_create_doc(title="<id>", markdown="<素材内容>")

# 挂载到知识空间
feishu_wiki_space_node(action="create", space_id=<space_id>, parent_node_token=<父节点token>, obj_type="docx", title="<id>")

# 创建元数据文档（同理）
feishu_create_doc(title="<id>", markdown="<YAML元数据>")
feishu_wiki_space_node(action="create", ...)
```

### raw_read

1. 从缓存 `by_id[<id>]` 获取 obj_token（无需知道类型）
2. 调用 `feishu_fetch_doc`（doc_id=obj_token）读取内容
3. 返回 markdown 内容

**回退**：缓存未命中时，先从 `素材/元数据/<id>` 的缓存条目中读取 type 字段，再拼出完整飞书路径查找。如果元数据也未缓存，则 `feishu_wiki_space_node`（action=list）遍历 `素材/元数据/` 下所有子节点按标题匹配，解析 type 后补全 `by_id` 缓存。

### raw_list

1. 调用 `feishu_wiki_space_node`（action=list, parent_node_token=`素材/元数据` 的 node_token）
2. 逐个调用 `feishu_fetch_doc` 读取元数据内容
3. 解析 YAML 返回元信息列表

**过滤**：
- 按 status 过滤：解析每条元数据的 status 字段
- 按 type 过滤：解析 type 字段

### raw_update_meta

1. 定位元数据文档：从缓存 `by_id[<id>]` 获取 obj_token，或从 `素材/元数据/<id>` 的缓存条目获取
2. 调用 `feishu_fetch_doc` 读取当前内容
3. **只替换目标字段对应的行**：用字符串替换更新指定字段（如 `status: pending` → `status: processed`），保持其他字段不变
4. 调用 `feishu_update_doc`（mode=overwrite）写回替换后的完整内容
5. ⚠️ **格式保护**：元数据文档仅包含简单的 `- key: value` 行，不使用复杂 markdown 语法，因此 overwrite 风险较低。应避免在元数据文档中使用表格、嵌套列表等飞书可能转换的语法

### wiki_write

1. **已存在**（缓存命中）：
   - 获取 obj_token
   - ⚠️ **覆写前校验**：飞书 markdown 支持有限，覆写可能导致格式丢失。执行以下策略：
     - 如果是对已有页面的**全量重写**（如 compile 阶段更新概念页），直接使用 `feishu_update_doc`（mode=overwrite）
     - 如果是**增量追加**（如往 log 追加记录、往 index 追加条目），应先 `feishu_fetch_doc` 读取现有内容，在本地拼接后再 overwrite
   - 调用 `feishu_update_doc`（mode=overwrite, doc_id=obj_token, markdown=内容）
2. **不存在**：
   - 解析逻辑路径，确定父节点（如 `wiki/summaries/foo` → 父节点为 `知识/摘要`）
   - 调用 `feishu_create_doc`（title=..., markdown=..., **wiki_node=父节点node_token**）— **一步完成创建+挂载**
   - ⚠️ 不要再额外调 `feishu_wiki_space_node(action=create)`
   - 更新缓存

> **同上，批量写入注意并发锁**。

**逻辑路径 → 飞书路径的映射函数：**

```
逻辑路径: wiki/summaries/my-article
→ 飞书路径: 知识/摘要/my-article
→ 父节点: 知识/摘要
→ 文档标题: my-article

逻辑路径: wiki/index
→ 飞书路径: 知识/索引
→ 父节点: 知识
→ 文档标题: 索引
```

### wiki_read

1. 从缓存获取逻辑路径对应的 obj_token
2. 调用 `feishu_fetch_doc`（doc_id=obj_token）
3. 返回 markdown 内容

### wiki_list

1. 调用 `feishu_wiki_space_node`（action=list）遍历知识空间各目录节点
2. 将返回的节点列表映射回逻辑路径
3. **排除规则**（与 INTERFACE.md 对齐）：
   - 不返回 `links/` 下的页面（飞书路径 `知识/关联/`）
   - 不返回 `comparisons/` 下的页面（飞书路径 `知识/对比/`）
4. **可选过滤**：按目录前缀（如 `summaries`）只列出对应子节点
5. 同步更新缓存

### wiki_delete

> ⚠️ 飞书工具链（openclaw-lark）未实现知识空间节点删除 API。采用**回收站策略**替代真实删除。

1. 确保回收站目录节点存在：`素材/回收站`（首次 delete 时自动创建，见下方说明）
2. 从缓存获取目标页面的 node_token
3. 调用 `feishu_wiki_space_node`（action=move）将目标节点移动到回收站目录下
4. 从缓存移除对应条目（或标记为 `deleted`）
5. **禁止移动** `wiki/index`、`wiki/log`、`wiki/glossary` 三个关键页面到回收站

**回收站目录初始化（首次 delete 时执行）：**

```
feishu_create_doc(title="回收站", markdown="# 回回收站\n\n已删除的页面暂存于此。", wiki_space=<space_id>)
feishu_wiki_space_node(action="move", node_token=<新节点>, target_parent_token=<素材节点token>)
```

将回收站 node_token 记入缓存（路径 `素材/回收站`）和 provider_config。

**回收站清理：** 由用户在飞书客户端中手动清空回收站目录，或等插件补齐 delete API 后自动处理。

### output_write / output_read / output_list

与 wiki 层操作相同，路径映射将 `wiki/` 前缀替换为 `output/`，飞书路径前缀从 `知识/` 替换为 `输出/`。

### search

**支持**。调用 `feishu_search_doc_wiki`（action=search, query=查询文本）实现全文搜索。

流程：
1. 调用 `feishu_search_doc_wiki` 获取匹配的文档列表
2. 将返回的文档 token 与缓存中的映射匹配，还原为逻辑路径
3. 如果有范围限制（wiki/raw/output），根据路径前缀过滤结果
4. 对每条匹配结果，调用 `feishu_fetch_doc` 获取匹配片段上下文
5. 返回 `[逻辑路径 + 匹配片段]` 列表

**缓存未命中时的回退**：对新发现的文档，通过标题和父节点关系推断逻辑路径，并补充到缓存。

### healthcheck

1. **检查本地配置**：`~/.kb/<slug>.conf.yaml` 存在且格式正确
2. **检查知识空间可达性**：调用 `feishu_wiki_space`（action=get）
3. **检查目录结构完整性**：遍历 init 中创建的所有目录节点，确认存在
4. **检查关键页面**：确认 `wiki/index`、`wiki/log`、`wiki/glossary` 对应文档存在且非空
5. **检查缓存一致性**：对比缓存记录与实际节点，标记差异
6. **输出结构化健康报告**

## 优势

- **原生协作**：知识库内容在飞书内可直接浏览、搜索、评论，团队成员无需额外工具
- **移动端友好**：飞书 App 随时查看和编辑知识库
- **搜索能力强**：依托飞书全文搜索，支持大规模知识库
- **权限管理**：继承飞书知识空间的权限体系，支持细粒度分享
- **富内容**：支持图片、表格、嵌入式内容等富媒体

## 限制

- **API 限流**：飞书 API 有调用频率限制，大批量操作需注意分批和间隔
- **无离线访问**：依赖网络和飞书服务可用性
- **文档格式差异**：飞书文档的 Markdown 支持有限（不支持部分语法），复杂格式可能需要调整
- **覆写格式风险**：wiki 页面内容较复杂，`feishu_update_doc(mode=overwrite)` 可能因飞书 markdown 转换丢失部分格式（如嵌套列表、特殊链接语法）。建议 wiki 页面避免使用飞书不支持的 markdown 特性，核心内容使用标题、段落、简单列表和 `[[wikilink]]` 即可
- **wiki_delete 为回收站策略**：飞书工具链未实现知识空间节点删除 API，delete 操作实际是移动到回收站目录，由用户手动清空
- **缓存一致性**：如果用户在飞书客户端直接操作文档，LLM 侧缓存可能过时，需要定期同步或在检测到不一致时刷新
- **大文档分页**：`feishu_fetch_doc` 返回有长度限制，超长文档需分页读取

## 类型中文名映射

| 英文 type | 中文目录名 |
|-----------|-----------|
| `article` | `文章` |
| `paper` | `论文` |
| `repo` | `仓库` |
| `dataset` | `数据集` |
| `image` | `图片` |
| `manual` | `手动输入` |

## 路径映射工具函数

LLM 在执行操作时，使用以下规则进行路径转换：

**逻辑路径 → 飞书路径：**
```
wiki/<section>/<name>  → 知识/<section_cn>/<name>
raw/<type>/<id>        → 素材/<type_cn>/<id>
output/<section>/<name>→ 输出/<section_cn>/<name>
wiki/index             → 知识/索引
wiki/log               → 知识/日志
wiki/glossary          → 知识/术语表
wiki/links/relations   → 知识/关联/关系图
```

**section 中文名：**
| 英文 | 中文 |
|------|------|
| summaries | 摘要 |
| concepts | 概念 |
| topics | 专题 |
| comparisons | 对比 |
| links | 关联 |
| reports | 报告 |
| slides | 幻灯片 |
| visualizations | 可视化 |

**飞书路径 → 父节点 + 文档标题：**
```
知识/摘要/my-article → 父: 知识/摘要, 标题: my-article
知识/索引            → 父: 知识, 标题: 索引
```
