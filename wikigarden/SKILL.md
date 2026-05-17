---
name: wikigarden
description: |
  用 LLM 构建和维护个人知识库（Knowledge Base）——从原始素材到结构化知识体系的完整工作流。
  当用户要求：搭建知识库、系统化整理一批资料、把文章/论文/链接归档为可查询的知识体系、
  对知识库做质量检查（lint/health check）、基于已有知识生成报告或写文章、搜索知识库内容时使用。
  也适用于"帮我整理这批资料"、"建个XX专题的知识库"、"知识库健康检查"、"帮我消化这批论文"等场景。
  不适用于单条笔记记录（走笔记 skill）、全网搜索（走 web-access）、
  纯文件管理/下载、或已有工具（Notion/Obsidian）的日常操作。
---

# WikiGarden — 知识花园

用 LLM 围绕研究主题构建和维护**自增长知识系统**——不是每次从零检索的 RAG，而是一个**越用越富**的持久化 Wiki。

> 核心差异：传统 RAG 每次查询都重新发现知识。这里 LLM **增量编译**原始素材为结构化 Wiki，新知识累积在 Wiki 里，交叉引用已建好、矛盾已标记、综合已完成。Wiki 本身就是复利产物。

LLM 扮演**知识工程师**——负责阅读、提炼、交叉引用、簿记的全链路工作。人负责策展源、主导方向、提问和决策。

## 强制执行协议

> 本 Skill 触发后，**必须先完整读取 `references/compliance-checklist.md` 并完成全部检查项**，之后才能开始执行。
> 阶段门控（⏸️ GATE）、禁止行为、执行后自检等全部规则见该文件。

## 架构：三层 + Provider 抽象

```
┌─────────────────────────────────────────────┐
│          ~/.kb/（项目注册目录）                  │
│  <slug>.conf.yaml — 指向各知识库的本地入口       │
├─────────────────────────────────────────────┤
│              Wiki（知识层）                    │
│  结构化 Markdown — 摘要/概念/专题/索引/日志      │
│  逻辑路径统一，物理存储由 Provider 决定          │
│  LLM 通过 Provider 接口读写                    │
├─────────────────────────────────────────────┤
│            Raw Sources（原料层）               │
│  原始文档 — 不可变，LLM 只读                   │
│  人负责策展                                    │
├─────────────────────────────────────────────┤
│           Provider（存储抽象层）                │
│  定义统一的 CRUD 接口 + 逻辑路径映射            │
│  local / feishu / notion / ...                │
└─────────────────────────────────────────────┘
```

三大操作贯穿三层，通过 Provider 接口与存储交互：

| 操作 | 做什么 | 详细流程 |
|------|-------|---------|
| **Ingest（摄入）** | 新源 → 阅读 → 提取 → 整合进 Wiki | `references/ingest.md` |
| **Compile（编译）** | Ingest 子操作：理解素材 → 增量更新 Wiki | `references/compile.md` |
| **Query（查询）** | 基于 Wiki 回答问题，优质答案写回 Wiki | `references/query.md` |
| **Lint（检查）** | 健康检查：矛盾/孤儿页/过期/缺口 | `references/maintenance.md` |

> **Output（输出）**是 Query 的自然延伸——报告、文章、幻灯片等产出物，详见 `references/output.md`。
> 各操作的强制等级和 🔒 检查项见 `references/compliance-checklist.md` 及各操作文件末尾。
>
> 脚本（providers/local/）是 local 后端的专属辅助工具，用于统计状态和生成计划模板。其他 Provider 按各自文档执行操作。scripts/ 目录保留给整个 skill 通用的脚本。

## 关键页面

- **`wiki/index`** — 知识目录，LLM 每次 Ingest 后更新（格式见 `references/compile.md`）
- **`wiki/log`** — 追加-only 操作日志（格式见 `references/compile.md`）

> 实践经验：中等规模（~100 源、~数百页）下，先读 index 定位再深入，效果出奇地好，不需要向量 RAG。规模增长后再引入 provider 的 search 接口。

## 核心原则

1. **原料与知识分离**：`raw/` 不可变，`wiki/` 是 LLM 加工后的结构化知识，永不混用
2. **Wiki 是复利产物**：交叉引用已建好、矛盾已标记、综合已完成；Query 的优质结果必须写回 Wiki，消费即生产
3. **LLM 包办簿记**：交叉引用更新、一致性维护、索引同步——这正是 LLM 擅长且不厌倦的
4. **Schema 共同演化**：配置文件随使用调整，有价值的输出写成文件而非留在聊天记录里
5. **Provider 无关**：所有上层流程通过 Provider 接口操作存储，不依赖具体后端的实现细节

## 项目初始化

每个知识库项目需先初始化：生成项目配置注册到 `~/.kb/<slug>.conf.yaml`，选择 Provider，初始化存储结构。详见 `references/project-setup.md`。

## 存储后端（Provider）

所有 Provider 遵循统一的接口契约（`providers/INTERFACE.md`），通过逻辑路径访问知识库。

| 后端 | 状态 | 说明 |
|------|------|------|
| local | ✅ 可用 | 本地文件系统，零依赖，git 友好 |
| 其他 | 📋 可扩展 | 按 `providers/INTERFACE.md` 的编写指南创建 |

> 接口契约定义了 `init` / `raw_*` / `wiki_*` / `output_*` / `search` / `healthcheck` 等接口族，以及所有 Provider 必须支持的逻辑路径体系，详见 `providers/INTERFACE.md`。

## 触发判断

### 必须触发
- 用户新建/搭建知识库项目
- 用户给了一批素材要求系统化整理
- 用户要求对知识库做质量检查/优化
- 用户要求基于知识库生成报告或输出物

### 需确认边界
- "帮我记一下"/"存一下" → 判断是单条笔记（不走本 skill）还是系统性知识入库
- "搜一下XX" → 判断是全网搜索（不走本 skill）还是知识库内搜索

## 与其他 Skill 的关系

| 协作 Skill | 协作方式 |
|-----------|---------|
| web-access-v | Ingest 阶段抓取网页转 markdown |
