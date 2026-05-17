# Provider: local（本地文件系统）

> 本文件实现 `providers/INTERFACE.md` 定义的接口。所有数据以 markdown 文件存储在本地目录中，无外部依赖。

## 配置

项目配置注册在 `~/.kb/<slug>.conf.yaml`，其中 `provider_config` 格式如下：

```yaml
name: <知识库名称>
description: ""
created_at: <YYYY-MM-DD>
provider: local
provider_config:
  root: <本地数据目录路径>    # 必填，如 ~/kb/ai-landing
```

`root` 指向本地数据存储目录，所有文件存放在该目录下。配置文件本身存放在 `~/.kb/`（见 INTERFACE.md 的项目注册目录约定）。

## 逻辑路径映射表

`$ROOT` 为 `provider_config.root` 的值。

| 逻辑路径 | 本地文件路径 |
|---------|------------|
| `raw/articles/<id>` | `$ROOT/raw/articles/<id>.md` |
| `raw/papers/<id>` | `$ROOT/raw/papers/<id>.md` |
| `raw/repos/<id>` | `$ROOT/raw/repos/<id>.md` |
| `raw/datasets/<id>` | `$ROOT/raw/datasets/<id>.md` |
| `raw/images/<id>` | `$ROOT/raw/images/<id>.md` |
| `raw/manual/<id>` | `$ROOT/raw/manual/<id>.md` |
| `raw/meta/<id>` | `$ROOT/raw/meta/<id>.md` |
| `wiki/index` | `$ROOT/wiki/index.md` |
| `wiki/log` | `$ROOT/wiki/log.md` |
| `wiki/glossary` | `$ROOT/wiki/glossary.md` |
| `wiki/summaries/<slug>` | `$ROOT/wiki/summaries/<slug>.md` |
| `wiki/concepts/<concept>` | `$ROOT/wiki/concepts/<concept>.md` |
| `wiki/topics/<topic>` | `$ROOT/wiki/topics/<topic>.md` |
| `wiki/comparisons/<name>` | `$ROOT/wiki/comparisons/<name>.md` |
| `wiki/links/relations` | `$ROOT/wiki/links/relations.md` |
| `output/reports/<name>` | `$ROOT/output/reports/<name>.md` |
| `output/slides/<name>` | `$ROOT/output/slides/<name>.md` |
| `output/visualizations/<name>` | `$ROOT/output/visualizations/<name>.md` |

## 接口实现

### init

使用初始化脚本（推荐）：

```bash
python3 providers/local/kb-init.py <数据目录> <名称>
```

脚本自动完成：创建目录结构、生成配置、注册到 `~/.kb/<slug>.conf.yaml`。详见 `providers/local/kb-init.py` 源码。

### raw_write

1. 生成 ID：`<YYYYMMDD_HHMMSS>_<slug>`，slug 取标题或 URL basename，小写，非字母数字替换为连字符
2. 素材内容写入 `$ROOT/raw/<type>/<id>.md`，格式遵循 INTERFACE.md 的素材内容格式
3. 元数据写入 `$ROOT/raw/meta/<id>.md`，格式遵循 INTERFACE.md 的元数据规范

```bash
# 写入素材
cat > "$KB_ROOT/raw/<type>/<id>.md" << 'EOF'
# <标题>

> 来源: <url 或 "用户输入">
> 采集时间: <YYYY-MM-DD HH:MM>
> ID: <id>

---

<内容>
EOF

# 元数据字段遵循 INTERFACE.md 元数据规范，local 后端额外增加 local_path 字段
cat > "$KB_ROOT/raw/meta/<id>.md" << 'EOF'
- id: <id>
- source_url: <url>
- title: <标题>
- type: <type>
- ingested_at: <ISO 8601>
- local_path: <type>/<id>.md
- tags: [<tag>]
- status: pending
- notes:
EOF
```

对于 URL 类型素材，使用 web-access-v skill 抓取后按上述格式写入。
对于用户直接提供的文本，type 为 `manual`。

### raw_read

```bash
cat "$KB_ROOT/raw/<type>/<id>.md"
```

需根据元数据中的 `type` 字段确定子目录。如已知元数据：

```bash
TYPE=$(grep '^- type:' "$KB_ROOT/raw/meta/<id>.md" | sed 's/^- type: *//')
cat "$KB_ROOT/raw/$TYPE/<id>.md"
```

### raw_list

```bash
# 列出所有素材元数据
find "$KB_ROOT/raw/meta" -name '*.md' -exec cat {} \;

# 按 status 筛选
grep -rl 'status: pending' "$KB_ROOT/raw/meta/"
```

### raw_update_meta

```bash
# 更新指定字段（示例：标记为已处理）
sed -i 's/status: pending/status: processed/' "$KB_ROOT/raw/meta/<id>.md"
```

### wiki_write

```bash
cat > "$KB_ROOT/wiki/<逻辑路径>.md" << 'EOF'
<content>
EOF
```

逻辑路径示例：`summaries/my-article` → 写入 `$ROOT/wiki/summaries/my-article.md`

### wiki_read

```bash
cat "$KB_ROOT/wiki/<逻辑路径>.md"
```

### wiki_list

```bash
# 列出全部（不含 links/ 和 comparisons/）
find "$KB_ROOT/wiki" -name '*.md' -not -path '*/links/*' -not -path '*/comparisons/*'

# 按目录前缀列出
ls "$KB_ROOT/wiki/summaries/"
```

### wiki_delete

```bash
rm "$KB_ROOT/wiki/<逻辑路径>.md"
```

### output_write / output_read / output_list

与 wiki 层操作相同，路径前缀从 `wiki/` 换为 `output/`。

### search

**不支持原生搜索接口**。上层回退到 `wiki_list` + 逐页 `wiki_read`，或直接使用 grep/ripgrep：

```bash
grep -rl "<query>" "$KB_ROOT/wiki/"
grep -rl "<query>" "$KB_ROOT/raw/"
```

### healthcheck

辅助脚本（推荐）：

```bash
python3 providers/local/healthcheck.py <数据目录>
```

手动检查：

```bash
# 检查注册配置存在
[ -f ~/.kb/<slug>.conf.yaml ] || echo "MISSING: ~/.kb/<slug>.conf.yaml"

# 检查数据目录结构
for dir in raw raw/meta raw/articles wiki wiki/summaries wiki/concepts wiki/topics wiki/links output logs; do
  [ -d "$KB_ROOT/$dir" ] || echo "MISSING: $dir"
done
[ -f "$KB_ROOT/wiki/index.md" ] || echo "MISSING: wiki/index.md"
```

## 优势

- 零外部依赖（仅需 python3），离线可用
- 与 git 天然兼容，可版本控制
- LLM 可直接用 Read/Write/Edit 工具操作
- 辅助脚本（`providers/local/`）可直接使用

## 限制

- 依赖 python3（PyYAML 可选）
- 不支持跨设备访问
- 搜索性能随文件数增长而下降（数百篇以上时明显）
- 无协作功能（多人同时编辑需额外方案）
