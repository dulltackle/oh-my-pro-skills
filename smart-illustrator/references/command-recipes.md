# 命令模板与输出约定

## 目录

- 执行前检查
- 最小命令模板
- Prompt Only 与剪贴板
- 输出命名约定
- 常见失败与重试
- 执行后验收

## 执行前检查

在技能根目录执行命令；首次使用先安装依赖：

```bash
cd scripts
npm install
```

## 最小命令模板

```bash
# 统一入口：文章配图
npx --yes tsx scripts/smart-illustrator.ts article.md

# 统一入口：slides prompt-only
npx --yes tsx scripts/smart-illustrator.ts script.md --mode slides --prompt-only

# 统一入口：topic 直出封面
npx --yes tsx scripts/smart-illustrator.ts --mode cover --topic "AI 工作流" --platform youtube
```

## 底层脚本命令模板

当你需要绕过高层 CLI、直接调底层单图脚本时，优先使用 `--prompt-file`，避免命令行转义错误：

```bash
cat > /tmp/image-prompt.txt <<'EOF'
{从 styles/style-*.md 提取的 System Prompt}

**内容**：{配图描述}
EOF

npx --yes tsx scripts/generate-image.ts \
  --prompt-file /tmp/image-prompt.txt \
  --output article-image-01.png \
  --aspect-ratio 16:9
```

封面图示例：

```bash
cat > /tmp/cover-prompt.txt <<'EOF'
{从 styles/style-cover.md 提取的 System Prompt}

**内容**：
- 核心概念：{主题}
- 视觉隐喻：{设计方向}
EOF

npx --yes tsx scripts/generate-image.ts \
  --prompt-file /tmp/cover-prompt.txt \
  --output article-cover.png \
  --aspect-ratio 16:9
```

## Prompt Only 与剪贴板

统一入口 `--prompt-only` 时不调用 API，而是把结果直接落盘：

```bash
article.md           -> article-article-prompts.json
script.md --slides   -> script-slides.json
--topic "AI 工作流"  -> AI-工作流-cover-prompt.json
```

默认不复制到剪贴板。只有用户明确要求复制时，先按结构选择内容：

- `*-cover-prompt.json`：复制顶层 `prompt` 字段。
- `*-article-prompts.json`：复制 `cover.prompt` 或某个 `illustrations[].prompt`。
- `*-slides.json`：通常复制整个 JSON，因为它是 `scripts/batch-generate.ts` 的输入。

复制整个 JSON 文件的通用命令：

```bash
if command -v pbcopy >/dev/null 2>&1; then
  cat article-article-prompts.json | pbcopy
elif command -v xclip >/dev/null 2>&1; then
  xclip -selection clipboard < article-article-prompts.json
elif command -v wl-copy >/dev/null 2>&1; then
  wl-copy < article-article-prompts.json
else
  echo "未检测到剪贴板命令，请手动复制输出目录中的 JSON 文件"
fi
```

## 输出命名约定

- 文章输出：`{article}-image.md`
- 封面图：`{article}-cover.png`
- 正文配图：`{article}-image-01.png`、`{article}-image-02.png`
- slides 输出：`{article}-slide-01.png`、`{article}-slide-02.png`
- prompt-only 输出：`{article}-article-prompts.json`、`{article}-slides.json`、`{article}-cover-prompt.json` 或 `{topic}-cover-prompt.json`
- 候选图输出：`-c 2` 时追加候选编号，例如 `{article}-cover-1.png`、`{article}-cover-2.png`

## 常见失败与重试

- `API key missing`：
  - 检查 `.env` 是否含 `TUZI_API_KEY`。
  - `tuzi-openai` 复用 `TUZI_API_KEY`，可用 `TUZI_OPENAI_API_BASE` 覆盖兼容端点 base。
- `article/slides 模式缺输入文件`：
  - 补充 Markdown 文件路径。
- `Failed to load reference image`：
  - 检查 `--ref` 路径是否相对当前工作目录可达。
- `--prompt-only` 没有复制到剪贴板：
  - 这是统一入口的默认行为；先确认 JSON 已落盘。用户明确要求复制时，再按输出结构提取并复制。
- provider 瞬时错误或网络抖动：
  - 统一入口、单图 CLI 和批量 CLI 都支持内建重试参数：
    - `--max-retries 0|1|2`：瞬时错误重试次数（默认 `1`）
    - `--timeout <ms>`：单图超时（默认 `300000`）
    - `--backoff-base <ms>`：指数退避基数（默认 `1200`）
- 批量生成失败需要可恢复重跑：
  - 每次执行会输出 `*.summary.json`，其中包含 `generated/skipped/failed/retried` 统计和每个条目的 `retryCount`。
  - 批量 CLI 支持 `--provider`、`--size`、`--aspect-ratio`、`--ref`，可与统一入口产出的 `*-slides.json` 搭配使用。
  - `*.summary.json` 会记录 provider、model、size、aspectRatio 和参考图数量，便于复现。
  - 末尾会自动打印带当前生成参数的 `--regenerate` 重试命令。

## 执行后验收

- 图片文件已落盘且非 0 字节。
- `article` 模式生成 `{article}-image.md`，且原文未被覆盖。
- `slides` 模式按编号输出 `slide-XX.png`，没有把多页合并成单张图。
