---
name: smart-illustrator
description: 为 Markdown 文章、讲稿或主题生成真实配图、信息图、封面图或可复用图像 prompt，优先走统一入口 `scripts/smart-illustrator.ts`。当用户明确要求“配图/插图/信息图/文章自动出图/批量出图/封面图/thumbnail/cover/按平台尺寸出封面/slides 逐页出图/bento 风格图像”时使用；纯写作、PPT 大纲、页面排版建议、普通 UI bento 布局或不需要生成图像文件/prompt 的请求不要触发。
---

# Smart Illustrator

## Instructions

### 1) 先执行硬规则

- 把用户提供的 Markdown 文件视为业务输入（文章或 slides 脚本），不要当作 Skill 配置。
- 先读取 `styles/index.json`，确认 style 是否支持当前模式，再读取对应风格文件；不要自写替代版 System Prompt。
- 默认生成真实图片；仅在用户显式要求 `--prompt-only` 时输出提示词或 slides JSON，而不调用图像 API。

风格文件、适用模式和默认比例以 `styles/index.json` 为单一事实源；新增或调整 style 时，先改 index，再同步必要文档。

### 2) 选模式并校验输入

- `article`：输入为文章 Markdown，输出正文配图，可附带封面图。
- `slides`：输入为讲稿或大纲，拆成多张独立信息图（默认 16:9）。
- `cover`：只生成封面图；可用 `--topic` 在无文章输入时直接生成。

输入校验：

- `cover` 模式无文件输入时，必须提供 `--topic`。
- `slides` 模式需拆分成“一页一图”语义，不允许把多页内容合并为一张。
- 用户显式传入 `--style` 时，必须与当前 `--mode` 兼容；不兼容时停止并说明可用 style。

### 3) 按固定流程执行

1. 读取输入内容，提炼主题、受众、关键视觉锚点。
2. 根据模式与内容结构确定图片表达方式和风格。
3. 拼接“风格文件 + 当前图内容”生成最终 prompt。
4. 调用脚本生成图片。
5. 在 `article` 模式生成 `{article}-image.md`，插入图片引用，不覆盖原文。
6. 汇总交付文件清单，报告生成数量与失败项（如有）。

### 4) 生成策略

- 默认使用统一入口 `scripts/smart-illustrator.ts`，由它调用底层生成能力。
- 通过 `--style`、`--aspect-ratio`、`--ref`、`-c/--candidates` 等参数控制风格、比例、参考图和候选图数量。
- `slides` 模式必须保持“一页一图”，不要把多页内容合并成一张。

### 5) 脚本调用规则

- 在技能根目录执行脚本，统一使用相对路径。
- 主要命令：
  - `npx --yes tsx scripts/smart-illustrator.ts ...`
- 底层脚本保留：
  - `scripts/generate-image.ts`：单图底层生成
  - `scripts/batch-generate.ts`：直接消费 batch JSON
- 若缺依赖，在 `scripts/` 执行 `npm install`。
- 透传用户显式参数（例如 `--ref`、`-c/--candidates`、`-a/--aspect-ratio`）。

### 6) 配置优先级

统一入口 CLI 会自动读取共享配置，但仍不提供配置写入能力。

- `scripts/smart-illustrator.ts`：读取项目级 / 用户级 `.smart-illustrator/config.json`，并通过 `styles/index.json` 定位风格文件；未配置时封面平台默认 `wechat`，生成尺寸默认 `4k`
- `scripts/generate-image.ts`：继续支持项目级 / 用户级配置文件，并支持配置写入

也就是说，`--no-config`、`--save-config` 这类配置管理参数，仍主要属于底层单图脚本能力；统一入口 CLI 当前只负责消费共享配置。

### 7) 失败处理

- API/导出失败时，明确失败原因、失败文件、可重试命令；不要静默失败。
- `--prompt-only` 默认只落盘 JSON/prompt 文件并告知路径；只有用户明确要求复制时，才按输出结构提取内容到剪贴板。
- 不擅自修改用户原始输入文件；仅新增输出文件。

## References（按需读取）

- `references/usage-guide.md`：
  - 需要完整参数、模式示例、slides JSON 规范、cover 平台尺寸、配置示例时读取。
- `references/command-recipes.md`：
  - 需要可直接执行的命令模板、`--prompt-only` 剪贴板流程、命名约定时读取。
- `references/cover-best-practices.md`：
  - 生成 YouTube/社媒封面时，需要提升点击率与视觉层级时读取。

## Output Contract

### `article`

- 原文：`{article}.md`（不修改）
- 结果文档：`{article}-image.md`
- 封面图：`{article}-cover.png`（除非传入 `--no-cover`）
- 正文配图：`{article}-image-01.png`、`{article}-image-02.png` ...
- `--prompt-only`：`{article}-article-prompts.json`

### `slides`

- 幻灯片图：`{article}-slide-01.png`、`{article}-slide-02.png` ...
- `--prompt-only`：`{article}-slides.json`，结构兼容 `scripts/batch-generate.ts`

### `cover`

- 封面图：`{article}-cover.png` 或 `{topic}-cover.png`
- `--prompt-only`：`{article}-cover-prompt.json` 或 `{topic}-cover-prompt.json`

### 候选图

- 当 `-c/--candidates` 大于 1 时，每个输出物追加候选编号，例如 `{article}-cover-1.png`、`{article}-cover-2.png`；sidecar 文档默认引用第 1 张。
