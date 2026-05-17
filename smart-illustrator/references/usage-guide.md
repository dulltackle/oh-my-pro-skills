# 使用指南（速查版）

## 目录

- 快速入口
- 参数速查
- 三种模式的最小命令
- slides 模式 JSON 规范
- cover 平台尺寸
- 配置文件
- 常见故障

## 快速入口

- 需求是“文章自动配图”：看“文章模式最小命令”。
- 需求是“讲稿拆成多张信息图”：看“slides 模式最小命令”和“slides 模式 JSON 规范”。
- 需求是“按平台出封面”：看“cover 模式最小命令”和“cover 平台尺寸”。
- 需求是“命令模板与导出细节”：读 `references/command-recipes.md`。
- 需求是“封面点击率优化”：读 `references/cover-best-practices.md`。

## 参数速查

统一入口命令：

```bash
npx --yes tsx scripts/smart-illustrator.ts ...
```

当前高层 CLI 已落地的参数如下：

| 参数 | 默认值 | 说明 |
|---|---|---|
| `--mode` | `article` | 模式：`article` / `slides` / `cover` |
| `--platform` | `youtube` | 封面平台（主要用于 `cover`）：`youtube` / `wechat` / `twitter` / `xiaohongshu` / `landscape` |
| `--topic` | - | 封面主题（`cover` 且无文章输入时必填） |
| `--prompt-only` | `false` | 只输出 prompt，不调用图像 API |
| `--style` | `light` | 风格：从 `styles/index.json` 读取；当前为 `light` / `dark` / `minimal` / `bento` / `cover` |
| `--no-cover` | `false` | 不生成封面（仅 `article`） |
| `--ref` | - | 参考图路径，可重复传入（如 `--ref a.png --ref b.png`） |
| `-c, --candidates` | `1` | 候选图数量（最多 4） |
| `-a, --aspect-ratio` | - | 宽高比，如 `16:9` / `3:2` / `3:4` |
| `--provider` | 自动探测 | 底层 API provider：`tuzi` / `tuzi-openai` |
| `--model` | provider 默认值 | 覆盖底层模型 |
| `--output-dir` | 输入文件目录 | 指定输出目录 |
| `--timeout` | `300000` | 单张图片生成超时时间，单位毫秒 |
| `--max-retries` | `1` | 瞬时错误重试次数，范围 `0` 到 `2` |
| `--backoff-base` | `1200` | 指数退避基准延迟，单位毫秒 |

约束与规则：

- 统一入口 CLI 会自动读取共享配置文件，CLI 显式参数优先于配置文件。
- 统一入口 CLI 仍不承诺 `--save-config` / `--no-config` 这类配置管理参数；这部分仍由 `scripts/generate-image.ts` 负责。
- `cover` 模式的平台预设优先于 style 默认比例；如需强制比例，优先显式传 `-a`。
- `article` 和 `slides` 默认使用当前 style 在 `styles/index.json` 中声明的 `defaultAspectRatio`，未声明时兜底为 `16:9`。
- `-c` 会对每个输出物分别生成多个候选文件，默认引用第 1 张作为 sidecar 文档中的默认图。
- `--style` 的可选值和适用模式以 `styles/index.json` 为准；如果 style 不支持当前 `--mode`，统一入口会停止并提示可用 style。

## 三种模式的最小命令

### 文章模式（article）

```bash
# 最小命令：生成正文配图 + 封面
npx --yes tsx scripts/smart-illustrator.ts path/to/article.md

# 只输出 prompt
npx --yes tsx scripts/smart-illustrator.ts path/to/article.md --prompt-only

# 常见变体
npx --yes tsx scripts/smart-illustrator.ts path/to/article.md --style dark
npx --yes tsx scripts/smart-illustrator.ts path/to/article.md --no-cover
npx --yes tsx scripts/smart-illustrator.ts path/to/article.md --ref ./brand-ref.png -c 2
```

当前最小闭环：

- 读取原文，按二级标题拆正文配图。
- 默认同时生成封面图。
- 生成 sidecar 文档：`{article}-image.md`，不会覆盖原文。

### slides 模式

```bash
# 最小命令：按脚本拆成多张独立信息图
npx --yes tsx scripts/smart-illustrator.ts path/to/script.md --mode slides

# 只输出 JSON prompt
npx --yes tsx scripts/smart-illustrator.ts path/to/script.md --mode slides --prompt-only
```

行为约束：

- slides 模式按“一页一图”生成，不合并多页内容到一张图。
- 默认目标比例为 `16:9`，如需调整显式传 `-a`。
- `--prompt-only` 会直接输出兼容 `scripts/batch-generate.ts` 的统一 JSON 文件。

### cover 模式

```bash
# 基于文章生成封面
npx --yes tsx scripts/smart-illustrator.ts path/to/article.md --mode cover --platform youtube

# 无文章输入时，必须提供 --topic
npx --yes tsx scripts/smart-illustrator.ts --mode cover --platform wechat --topic "产品设计方法论"
```

## slides 模式 JSON 规范

当使用 `--mode slides --prompt-only`，输出文件为 `{input}-slides.json`，结构满足：

```json
{
  "instruction": "请逐条生成以下 N 张独立信息图。",
  "batch_rules": {
    "total": "N",
    "one_item_one_image": true,
    "aspect_ratio": "16:9",
    "do_not_merge": true
  },
  "style": "[从 styles/style-*.md 读取完整内容]",
  "pictures": [
    { "id": 1, "topic": "封面", "content": "..." },
    { "id": 2, "topic": "主题A", "content": "..." }
  ]
}
```

字段约束：

- `instruction` 强调“逐条生成、禁止合并”。
- `batch_rules.one_item_one_image` 与 `do_not_merge` 必须为 `true`。
- `pictures` 的 `id` 从 1 递增。
- 默认会补一张 `topic = "封面"` 的第一页，再按二级标题继续拆分。
- `scripts/batch-generate.ts` 仅支持这种 `pictures` 统一结构，不再兼容旧版 `illustrations` 格式。
- 批量执行时可显式传入 `--provider`、`--size`、`--aspect-ratio` 和 `--ref`；参考图失败默认中止，行为与统一入口和单图 CLI 保持一致。
- 批量执行完成后会写入 `*.summary.json`，其中记录 provider、model、size、aspectRatio、参考图数量和每个条目的生成状态。

完整样例：`references/slides-prompt-example.json`

## cover 平台尺寸

统一入口 CLI 的平台预设按 2K 基准生成，并映射到底层支持的宽高比：

| 平台 | 代码 | 宽高比 | 推荐尺寸 |
|---|---|---|---|
| YouTube | `youtube` | `16:9` | `2560x1440` |
| 公众号 | `wechat` | `21:9`（近似 `2.35:1`） | `2824x1200` |
| Twitter/X | `twitter` | `16:9`（建议必要时手动 `-a` 覆盖） | `2560x1342` |
| 小红书 | `xiaohongshu` | `3:4` | `1920x2560` |
| 通用横图 | `landscape` | `16:9` | `2560x1440` |

设计策略与点击率规范见：`references/cover-best-practices.md`

## 配置文件

共享配置文件路径：

- 项目级：`.smart-illustrator/config.json`
- 用户级：`~/.smart-illustrator/config.json`
- 优先级：命令行显式参数 > 项目级配置 > 用户级配置 > 脚本默认值

当前共享配置支持这些字段：

| 字段 | 说明 |
|---|---|
| `style` | 默认风格 |
| `platform` | 默认平台预设 |
| `provider` | 默认 provider |
| `model` | 默认模型 |
| `size` | 默认输出尺寸 |
| `aspectRatio` | 默认宽高比 |
| `references` | 默认参考图列表 |
| `candidates` | 默认候选图数量 |
| `outputDir` | 默认输出目录 |

脚本行为：

- `scripts/smart-illustrator.ts`
  - 会自动读取上述共享配置
  - 会先读取 `styles/index.json`，再按索引定位对应的 `styles/style-*.md`
  - 仍不提供 `--save-config` / `--no-config`
- `scripts/generate-image.ts`
  - 继续支持共享配置读取
  - 继续支持 `--save-config` / `--save-config-global` / `--no-config`

style 元数据：

- `styles/index.json` 是 style 的单一事实来源，负责声明文件名、适用模式和默认宽高比。
- 当前默认规则：正文默认 `light`，封面也默认 `light`。
- 新增 style 时，优先修改 `styles/index.json`，而不是在脚本和文档里重复补硬编码映射。
- 文档中的平台和 style 列表应随 CLI help、`scripts/lib/cli-metadata.ts` 和 `styles/index.json` 同步；发现不一致时，以代码和 index 为准，再更新文档。

项目级配置中的相对路径会相对于项目根目录解析；用户级配置中的相对路径会相对于 `~/.smart-illustrator/` 解析。

## 输出命名约定

### `article`

- 默认输出 `{article}-cover.png`、`{article}-image-01.png`、`{article}-image-02.png` ...，并生成 `{article}-image.md`。
- 传入 `--no-cover` 时不生成封面图。
- 传入 `--prompt-only` 时输出 `{article}-article-prompts.json`，不生成图片和 sidecar 文档。

### `slides`

- 默认输出 `{article}-slide-01.png`、`{article}-slide-02.png` ...
- 传入 `--prompt-only` 时输出 `{article}-slides.json`。

### `cover`

- 基于输入文件时输出 `{article}-cover.png`。
- 只传 `--topic` 时输出 `{topic}-cover.png`。
- 传入 `--prompt-only` 时输出 `{article}-cover-prompt.json` 或 `{topic}-cover-prompt.json`。

### 候选图

- `-c/--candidates` 大于 1 时，每个输出物追加候选编号，例如 `{article}-image-01-1.png`、`{article}-image-01-2.png`。
- `article` 的 sidecar 文档默认引用第 1 张候选图；其余候选图仍会保留在输出目录。

## 常见故障

- `cover` 模式报参数不全：
  - 原因：无输入文件且未提供 `--topic`。
  - 处理：补充 `--topic`。
- `--prompt-only` 没看到图片：
  - 原因：该模式只产出 prompt / slides JSON，不调用图像 API。
  - 处理：打开输出目录，读取 `*-article-prompts.json`、`*-cover-prompt.json` 或 `*-slides.json`。
- `--style cover --mode slides` 报错：
  - 原因：`cover` style 不支持 `slides` 模式。
  - 处理：改用 `light` / `dark` / `minimal` / `bento`，或先在 `styles/index.json` 中声明该 style 支持 `slides`。
- 输出数量少于预期：
  - 原因：接口调用失败、候选数设置不合理，或 prompt 过于复杂。
  - 处理：检查错误输出，适当降低 `-c`，或缩短 prompt 后重试。
- 批量链路偶发超时或网络抖动：
  - 原因：provider 瞬时错误、网络抖动、响应超时。
  - 处理：统一入口、单图 CLI 和批量 CLI 都支持 `--max-retries 1 --timeout 300000 --backoff-base 1200`。
  - 批量 CLI 执行后可查看 `*.summary.json` 中的 `retried` 和每项 `retryCount`。
- 错误提示前缀如 `[input]` / `[config]` / `[style]` / `[provider]` / `[network]` / `[export]`：
  - 含义：表示错误分类，便于快速判断是参数问题、配置问题还是网络/导出问题。
