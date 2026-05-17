# Ingest: 数据摄入

> 目录：[目标](#目标) → [素材类型](#支持的素材类型) → [流程](#操作流程) → [边界](#边界与注意事项) → [与 Compile 的衔接](#与-compile-的衔接) → [🔒 检查清单](#-ingest-检查清单)

## 目标

将原始素材收集到 `raw/`（不可变层），然后交给 Compile 子操作**真正理解并整合进 Wiki**。Ingest 不只是下载存文件——一个新源应该改动 ~10-15 个 Wiki 页面。

## 支持的素材类型

> 以下"存放路径"为**逻辑路径**，由 provider 的 `raw_write` 接口写入，物理存储由各 provider 决定。

| 类型 | 逻辑路径 | 处理方式 |
|------|---------|---------|
| 网页文章 | `raw/articles/<id>` | 抓取转为 markdown，图片保存到 `raw/images/<id>` |
| 学术论文 | `raw/papers/<id>` | PDF 转文本或 markdown，保留元信息 |
| GitHub 仓库 | `raw/repos/<id>` | 记录 README + 关键文件，不 clone 全量 |
| 数据集 | `raw/datasets/<id>` | 保存数据描述和样本 |
| 图片 | `raw/images/<id>` | 原图保存，附说明文件 |
| 用户直接提供的文本/文件 | `raw/manual/<id>` | 按类型归档 |

## 操作流程

### 🔒 Step 1: 确认采集范围 ⏸️ GATE

> **必须与用户确认后才能继续。不得跳过。**

与用户确认：
- **主题边界**：这个知识库覆盖什么范围？
- **素材来源**：用户已有链接？还是需要我主动搜索？
- **数量预期**：大概多少篇？决定处理策略

### Step 2: 收集素材

#### 方式 A: 用户直接提供链接/文件
- 接收链接列表或文件
- 逐个处理（见 Step 3）

#### 方式 B: 主动搜索补充
- 使用 web-access-v skill 搜索相关资料
- 将搜索结果整理为候选清单
- **让用户确认后再下载**（避免垃圾入仓）

### Step 3: 素材标准化处理

每条素材通过 `raw_write` 接口写入 `raw/`，接口自动生成素材 ID 和元数据记录（status=pending）。

素材内容格式遵循 `providers/INTERFACE.md` 的"素材内容格式"章节，所有 provider 共用。

元数据字段由 `raw_write` 接口自动生成，必填字段和类型定义见 `providers/INTERFACE.md` 的"元数据规范"章节。

#### 网页文章抓取与归档

使用 web-access-v skill 抓取网页内容后，通过 `raw_write` 写入：

1. 抓取网页内容转为 markdown
2. 调用 `raw_write`，传入：标题、来源 URL、类型=article、标签、markdown 内容
3. 如原文含关键图片，额外调用 `raw_write` 将图片保存（type=image），并在文章 markdown 中引用图片 ID

> 图片处理：不同 provider 对图片的存储方式不同（local 保存文件、飞书上传到节点等），但逻辑路径统一为 `raw/images/<id>`。

#### PDF/论文处理

1. 尝试提取文本内容（可用 OCR）
2. 保留结构信息（章节、图表标注）
3. 如果有图表，单独标记位置供后续处理
4. 调用 `raw_write`，type=paper

### 🔒 Step 4: 采集后检查

- [ ] 所有素材是否都已成功写入？（通过 `raw_list` 确认）
- [ ] 元数据是否齐全？（每条素材必须有完整的元数据记录）
- [ ] 是否有明显重复内容？

## 边界与注意事项

- **去重**：同一篇文章的不同版本只保留最新的/最完整的
- **质量控制**：明显低质量或无关的内容不入库，在 notes 中标记跳过原因
- **版权注意**：raw 层是个人使用备份，不对外分发
- **增量采集**：支持后续追加新素材，不需要重新处理已有内容
- **编码安全**：所有写入 raw 的文本必须确保 UTF-8 编码

## 与 Compile 的衔接

Ingest（收集+标准化）完成后：
- `raw/` 中 N 条已标准化的素材，status=pending
- 元数据记录完整
- 进入 **Compile**（见 `references/compile.md`）：LLM 阅读 → 提取 → 整合到 Wiki → 更新 index + log

> 实践建议：逐篇摄入并保持与用户的对话，确认要点和强调方向。批量处理效率高但可能错过细微但重要的判断。工作流应记录在 Schema（kb.conf.yaml）中供后续 session 复用。

## 🔒 Ingest 检查清单

### 素材收集阶段
- [ ] 每条素材已通过 `raw_write` 写入
- [ ] **元数据记录完整**（id/source_url/title/type/tags/status/notes）

### 编译阶段（Compile）
- [ ] **已输出编译计划并与用户确认**（Compile Step 1）
- [ ] **已生成文档摘要**到 `wiki/summaries/<slug>`（Compile Step 2）
- [ ] **每个识别出的关键概念已处理**（Compile Step 3）：
  - 已有概念页 → 追加新视角/矛盾标注
  - 新概念 → 创建概念页到 `wiki/concepts/<concept>`
- [ ] **专题页已更新**（Compile Step 4）：判断是否需要新建/追加/修改
- [ ] **index 已更新**（Compile Step 5）：新页面加入 catalog
- [ ] **log 已追加**操作记录（Compile Step 5）
- [ ] **素材 status 已标记为 processed**（Compile Step 6，通过 `raw_update_meta`）

### 💡 补充步骤（需说明理由并获得许可后才可跳过）
- 图片下载与嵌入（如果原文无关键图片或纯文字文章）
- 概念页深挖（如果该概念在知识库中已有完整覆盖）
- 专题页创建（如果摘要中无跨文档综合内容）
