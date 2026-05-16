# feishu-to-wechat Phase 2 实施报告

**完成日期**: 2026-04-05
**实施范围**: 内容质量提升（外链转脚注、智能元数据提取、图片上传完善）

---

## ✅ 任务 1: 外链转脚注（修改 render-md.js）

### 实施内容
在 `scripts/render-md.js` 中新增 `convertLinksToFootnotes()` 函数，实现外链自动转脚注功能。

### 功能特性
- ✅ 将 `<a href="https://...">` 转换为 `文字 <sup>[n]</sup>` 格式
- ✅ 文末自动追加「参考资料」脚注区域
- ✅ 图片链接 `![alt](url)` 不转换（由图片占位符流程处理）
- ✅ 锚点链接（href 以 `#` 开头）不转换
- ✅ 重复链接使用相同编号，避免重复
- ✅ 脚注区域使用内联样式，与主题保持一致
- ✅ 通过 `options.convertLinks` 参数控制（默认 `true`，传 `false` 关闭）

### 实现细节
```javascript
function convertLinksToFootnotes(html, options = {}) {
  // 匹配所有 <a> 标签，排除锚点链接
  const aTagRegex = /<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  // 收集外链，替换为带角标的形式
  // 在 </div> 前插入脚注列表
  // 脚注区域使用内联样式（color, font-size, border-top 等）
}
```

### 测试结果
**测试文件**: `/tmp/test-links.md`（包含 4 个外链 + 1 个锚点链接）

```bash
node scripts/render-md.js /tmp/test-links.md --theme default
```

**验证通过**:
- ✅ 4 个外链转换为脚注（其中 1 个重复链接使用相同编号 [1]）
- ✅ 锚点链接 `#top` 未转换
- ✅ 图片链接保持为占位符
- ✅ 文末「参考资料」区域包含 3 个链接（去重后）

---

## ✅ 任务 2: 智能元数据提取（创建 scripts/extract-meta.js）

### 实施内容
创建 `scripts/extract-meta.js`，从 Markdown/HTML 智能提取标题、摘要、推荐封面图。

### 功能特性
- ✅ 支持 YAML frontmatter（优先级最高）
- ✅ 自动从正文推断缺失的字段
- ✅ CLI 和 API 两种调用方式

### 提取规则

#### 标题（优先级从高到低）
1. frontmatter.title
2. 第一个 `#` 标题
3. 文件名（不含扩展名）

#### 摘要（优先级从高到低）
1. frontmatter.description / summary / digest
2. 正文第一段纯文本（去掉 Markdown 格式），截取 120 字
3. 如果第一段太短（<20 字），取前两段拼接

#### 封面图（优先级从高到低）
1. frontmatter.cover / image / thumb
2. 正文中第一个图片（local path 或 http URL）
3. 无则返回 null

### API 用法
```javascript
const { extractMetadata } = require('./extract-meta');

const meta = extractMetadata('/path/to/article.md');
// { title, digest, coverImage }
```

### CLI 用法
```bash
node extract-meta.js <input.md>
# 输出 JSON: { title, digest, coverImage }
```

### 测试结果

**测试 1**: 带 frontmatter 的文章
```markdown
---
title: 这是一个测试文章
description: 这是文章的描述字段...
cover: ./cover.jpg
---
```

**结果**: ✅ 正确提取 title、description（作为 digest）、cover

**测试 2**: 无 frontmatter 的文章
```markdown
# 无 Frontmatter 的文章

这是正文的第一段...
![正文中的第一张图片](./images/first-image.png)
```

**结果**: ✅ 正确从标题提取 title，从第一段提取 digest，从第一个图片提取 coverImage

---

## ✅ 任务 3: 图片 API 上传完善（修改 publish-api.js）

### 实施内容
重写 `scripts/publish-api.js` 中的 `processImages()` 函数，完善图片上传逻辑。

### 功能特性
- ✅ 支持下载远程图片（http/https URL）到本地临时文件
- ✅ 支持 data: URI 的 base64 图片解码后上传
- ✅ 远程图片下载使用 15 秒超时 + User-Agent
- ✅ 上传成功后自动清理临时文件
- ✅ 图片上传失败时不中断整个流程，保留原始 src 作为降级
- ✅ 记录每张图片的处理日志（上传成功/失败/跳过原因）
- ✅ 支持从元数据提取推荐封面图

### 新增函数

#### downloadRemoteImage(url)
```javascript
// 下载远程图片到 /tmp/openclaw/wx-img-cache/
// 返回本地临时文件路径
function downloadRemoteImage(url) {
  // 使用 http/https 模块下载
  // 15 秒超时
  // 返回 Promise<string>
}
```

#### decodeDataUri(dataUri)
```javascript
// 解码 data:image/png;base64,... 格式
// 保存为临时文件并返回路径
function decodeDataUri(dataUri) {
  // 提取 MIME type 和 base64 数据
  // 解码并保存到 /tmp/openclaw/wx-img-cache/
}
```

#### processImages(html, imagePlaceholders)
```javascript
// 返回值从 string 改为 { html, logs }
async function processImages(html, imagePlaceholders) {
  // 处理所有占位符图片
  // 支持本地路径、远程 URL、data URI
  // 返回替换后的 HTML 和处理日志
  // 自动清理临时文件
}
```

### 元数据集成
- ✅ 在 Markdown 模式中自动调用 `extractMetadata()`
- ✅ 标题优先级：CLI 参数 > 元数据提取 > 文件名
- ✅ 摘要优先级：CLI 参数 > 元数据提取
- ✅ 封面图优先级：CLI 参数 > 元数据提取

### 测试结果

**Dry-run 测试**:
```bash
node scripts/publish-api.js --file /tmp/test-full.md --dry-run
```

**结果**:
- ✅ 元数据提取成功（title、digest、coverImage）
- ✅ 自动提取摘要成功
- ✅ Token 获取和 API 连通性验证通过
- ✅ 图片占位符识别正确（1 个）

---

## 端到端测试

**测试文件**: `/tmp/test-full.md`（包含外链 + 图片 + 标题 + 正文）

**流程**:
1. ✅ 元数据提取 → title、digest、coverImage
2. ✅ Markdown 渲染 → HTML（含外链转脚注）
3. ✅ 图片占位符识别 → 1 个远程图片
4. ✅ HTML 输出验证 → 参考资料区域正确生成

**渲染结果验证**:
```bash
node scripts/render-md.js /tmp/test-full.md --output /tmp/test-rendered.html
```

**HTML 输出**:
- ✅ 外链转换为 `文字 <sup>[n]</sup>` 格式
- ✅ 文末「参考资料」区域包含所有外链
- ✅ 脚注区域样式与主题一致
- ✅ 图片占位符正确保留

---

## 代码变更摘要

### 新增文件
- `scripts/extract-meta.js` — 智能元数据提取（215 行）

### 修改文件

#### scripts/render-md.js
- 新增 `convertLinksToFootnotes()` 函数（~100 行）
- 修改 `renderMarkdown()` 调用链：`juice() → convertLinksToFootnotes()`
- 新增 `options.convertLinks` 参数支持

#### scripts/publish-api.js
- 新增 `downloadRemoteImage()` 函数（远程图片下载）
- 新增 `decodeDataUri()` 函数（base64 图片解码）
- 新增 `ensureTempDir()` 函数（临时目录管理）
- 重写 `processImages()` 函数（支持远程图片、data URI、错误降级）
- 修改主流程集成元数据提取
- 修改封面图处理逻辑（支持远程封面下载）

---

## 注意事项

### 兼容性
- ✅ 所有新功能通过 `options` 参数控制，默认开启但可关闭
- ✅ 不影响已有的核心渲染逻辑（加粗/代码块/列表等）
- ✅ 向后兼容旧的 API 调用方式

### 性能
- 远程图片下载使用 15 秒超时，避免长时间阻塞
- 临时文件自动清理，避免磁盘占用
- 图片上传失败不中断流程，保留降级显示

### 用户体验
- 元数据提取自动执行，减少手动输入
- 外链脚注自动生成，符合微信公众号阅读习惯
- 封面图支持从正文自动提取

---

## 后续建议

### Phase 3 可选功能
1. **图片压缩优化** — 上传前自动压缩大图
2. **多图封面选择** — 提取多个图片供用户选择
3. **摘要 AI 优化** — 使用 AI 生成更吸引人的摘要
4. **样式主题扩展** — 添加更多微信公众号主题

### 已知限制
1. data: URI 的 base64 图片需小于微信限制（目前未做大小检查）
2. 远程图片下载依赖网络，失败时只保留原始 URL（微信可能无法显示）
3. 脚注区域的样式在部分微信版本可能略有差异

---

**Phase 2 实施完成 ✅**
