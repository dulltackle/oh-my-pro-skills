---
name: feishu-to-wechat
description: >
  将飞书云文档发布到微信公众号草稿箱。支持两种发布模式：
  （1）API 模式⭐推荐：通过微信官方 API 直接发布，快速稳定，无需浏览器。
  （2）CDP 浏览器模式：通过 CDP 浏览器操作公众号后台发布，功能丰富但依赖 Chrome。
  触发场景：(1) 用户要求将飞书文档发布到微信公众号 (2) 提到"发公众号""公众号草稿"
  "推送到公众号" (3) 需要在微信后台创建图文消息并填入飞书文档内容。
---

# Feishu → WeChat 公众号草稿发布

将飞书云文档的内容（标题、正文、图片）发布到微信公众号草稿箱。

## ⭐ 推荐方案：API 发布模式

**优势**：快速稳定、无浏览器依赖、可自动化、支持批量发布

**适用场景**：日常发布、自动化流程、批量操作

---

## 一、前置条件

### 1. SOCKS5 代理服务（必须）

微信 API 要求调用 IP 在白名单内。当前使用固定出口 IP `121.40.243.4`。

**启动代理**：
```bash
# 方法 1：使用提供的脚本
cd ~/.openclaw/workspace/skills/feishu-to-wechat
bash scripts/wechat-proxy.sh start

# 方法 2：手动启动（如有 SSH 隧道）
ssh -D 12345 -N user@proxy-server
```

**验证代理**：
```bash
curl -x socks5://127.0.0.1:12345 -s ifconfig.me
# 应返回 121.40.243.4
```

**代理管理脚本**：
```bash
bash scripts/wechat-proxy.sh status   # 查看状态
bash scripts/wechat-proxy.sh start    # 启动
bash scripts/wechat-proxy.sh stop     # 停止
bash scripts/wechat-proxy.sh restart  # 重启
```

### 2. 微信公众号凭证（必须）

**配置文件位置**：`/home/forclaw/.ssh/weixin.json`

**文件格式**：
```json
{
  "AppID": "wx19b707135bfd903c",
  "AppSecret": "your_app_secret_here"
}
```

**获取方式**：
1. 登录[微信公众平台](https://mp.weixin.qq.com)
2. 进入「开发 - 基本配置」
3. 复制 AppID 和 AppSecret

### 3. IP 白名单配置（必须）

1. 登录微信公众平台 → 开发 - 基本配置
2. 在「IP白名单」中添加：`121.40.243.4`
3. 保存后等待 5 分钟生效

### 4. Node.js 依赖（首次使用）

```bash
cd ~/.openclaw/workspace/skills/feishu-to-wechat
npm install
```

依赖包：
- `marked` v17.0.6 — Markdown 解析
- `highlight.js` — 代码高亮
- `juice` — CSS 内联
- `socks-proxy-agent` — SOCKS5 代理

---

## 二、使用方法

### 方式 1：从飞书文档发布（推荐）

**完整流程**：飞书文档 → Markdown → 渲染 HTML → 上传图片 → 创建草稿

```bash
# 步骤 1：获取飞书文档 Markdown
# 在 AI 对话中执行：
# "帮我获取飞书文档 XXX 的内容"
# 或直接用 feishu_fetch_doc 工具

# 步骤 2：保存为 Markdown 文件
# 假设保存为 /tmp/article.md

# 步骤 3：发布到公众号
cd ~/.openclaw/workspace/skills/feishu-to-wechat
node scripts/publish-api.js \
  --file /tmp/article.md \
  --theme default \
  --cover /path/to/cover.png \
  --author "作者名"
```

### 方式 2：从 Markdown 文件发布

**适用场景**：已有 Markdown 文件（非飞书来源）

```bash
node scripts/publish-api.js \
  --file article.md \
  --theme default \
  --cover cover.png \
  --author "张铃" \
  --digest "文章摘要"
```

### 方式 3：直接用 HTML 发布

**适用场景**：已自行处理图片上传和 HTML 渲染

```bash
node scripts/publish-api.js \
  --doc "文章标题" \
  --content "<p>HTML内容</p>" \
  --cover cover.png
```

### 方式 4：测试连通性（Dry-run）

**不创建草稿，仅验证 Token 和代理**

```bash
node scripts/publish-api.js \
  --doc "测试" \
  --content "<p>测试</p>" \
  --dry-run
```

---

## 三、主题系统

### 可用主题

| 主题 | 参数值 | 风格 | 适用场景 |
|------|--------|------|----------|
| baoyu 默认 | `default` | 简洁清爽、经典蓝白 | 通用、技术文档 |
| baoyu grace | `grace` | 优雅简约 | 生活、文化类 |
| 杂志精致风 | `elegant` | 暖棕色调、有温度 | 品牌宣传、故事类 |
| 简洁技术风 | `tech` | 蓝灰调、IDE 风 | 开发者、技术教程 |

### 主题文件位置

```
themes/
├── baoyu/
│   ├── default.css    # ⭐ 默认主题
│   └── grace.css      # Grace 主题
├── elegant.css        # 杂志精致风
└── tech.css           # 简洁技术风
```

### 自定义主题

1. 在 `themes/` 目录下创建 `my-theme.css`
2. 使用时指定：`--theme my-theme`

**CSS 规范**（微信兼容）：
- ❌ 不支持：CSS 变量、`<style>` 标签、Flexbox、Grid、伪元素
- ✅ 支持：基础选择器、内联样式、常用属性（color、font-size、margin 等）
- 所有样式会通过 `juice` 自动内联到 HTML 标签

---

## 四、完整参数说明

### publish-api.js 参数

| 参数 | 必填 | 说明 | 示例 |
|------|------|------|------|
| `--file <path>` | 二选一 | Markdown 文件路径 | `--file article.md` |
| `--doc <title>` | 二选一 | 文章标题（配合 --content） | `--doc "标题"` |
| `--content <html>` | 配合 | HTML 正文内容 | `--content "<p>...</p>"` |
| `--cover <path>` | ✅ | 封面图片路径 | `--cover cover.png` |
| `--theme <name>` | ❌ | 主题名（默认 default） | `--theme grace` |
| `--author <name>` | ❌ | 作者名 | `--author "张铃"` |
| `--digest <text>` | ❌ | 摘要（不填自动截取） | `--digest "文章摘要"` |
| `--output <path>` | ❌ | 保存渲染后的 HTML | `--output /tmp/out.html` |
| `--dry-run` | ❌ | 仅测试，不创建草稿 | `--dry-run` |

### render-md.js 参数

```bash
node scripts/render-md.js <input.md> [--theme name] [--output path]
```

| 参数 | 说明 |
|------|------|
| `<input.md>` | 输入 Markdown 文件 |
| `--theme <name>` | 主题名（默认 default） |
| `--output <path>` | 输出 HTML 文件路径 |

---

## 五、渲染引擎说明

### Markdown → HTML 转换

**核心依赖**：marked v17.0.6 + highlight.js + juice

**特性**：
- 自动提取标题（第一个 `#` 标题）
- 代码块语法高亮（支持所有主流语言）
- 图片占位符处理（`WECHATIMGPH_N`）
- 微信兼容后处理（去掉 `<li><p>` 嵌套、紧凑列表）

**图片处理流程**：
1. Markdown 中图片 → 占位符 `WECHATIMGPH_N`
2. 上传图片到微信 → 获得 CDN URL
3. 替换占位符为 CDN URL

### 微信兼容性修复

**自动处理的常见问题**：
- ❌ `<li><p>内容</p></li>` → ✅ `<li>内容</li>`
- ❌ 列表标签间多余空白 → ✅ 紧凑化
- ❌ `http://` 图片链接 → ✅ `https://`

---

## 六、故障排查

### 常见问题

#### 1. Token 获取失败

**错误示例**：
```
Token 获取失败: [40001] AppSecret 错误或不属于该公众账号
```

**解决方法**：
1. 检查 `/home/forclaw/.ssh/weixin.json` 文件
2. 确认 AppID 和 AppSecret 正确
3. 确认公众号未过期

#### 2. 代理连接失败

**错误示例**：
```
代理连接失败: 无法连接到 socks5://127.0.0.1:12345
```

**解决方法**：
```bash
# 检查代理服务
bash scripts/wechat-proxy.sh status

# 重启代理
bash scripts/wechat-proxy.sh restart

# 验证代理出口 IP
curl -x socks5://127.0.0.1:12345 ifconfig.me
# 应返回 121.40.243.4
```

#### 3. IP 白名单错误

**错误示例**：
```
[40090] IP 不在白名单内
```

**解决方法**：
1. 登录微信公众平台 → 开发 - 基本配置
2. 在「IP白名单」中添加：`121.40.243.4`
3. 保存后等待 5 分钟生效
4. 验证出口 IP：`curl -x socks5://127.0.0.1:12345 ifconfig.me`

#### 4. 封面图缺失

**错误示例**：
```
缺少封面图。微信 news 类型草稿需要 thumb_media_id。
```

**解决方法**：
```bash
# 必须指定 --cover 参数
node scripts/publish-api.js --file article.md --cover cover.png
```

#### 5. 图片上传失败

**可能原因**：
- 图片文件不存在
- 图片过大（>10MB）
- 代理连接超时

**解决方法**：
```bash
# 检查文件
ls -lh /path/to/image.png

# 压缩图片（如需要）
convert big.png -quality 85% small.png
```

### 错误码速查

| 错误码 | 含义 | 解决方法 |
|--------|------|----------|
| -1 | 系统繁忙 | 稍后重试 |
| 40001 | AppSecret 错误 | 检查凭证文件 |
| 40013 | AppID 无效 | 检查凭证文件 |
| 40014 | access_token 无效 | 重新获取（会自动刷新） |
| 42001 | access_token 超时 | 自动刷新（提前 5 分钟） |
| 44001 | 多媒体文件为空 | 检查文件路径 |
| 45001 | 文件大小超限 | 压缩图片（<10MB） |
| 45002 | 消息内容超限 | 精简文章内容 |
| 45009 | API 调用超限 | 降低调用频率 |
| 45011 | API 调用太频繁 | 稍后重试 |
| 40090 | IP 不在白名单 | 添加 IP 到白名单 |
| 47001 | JSON 解析错误 | 检查参数格式 |

### 调试技巧

#### 1. 保存渲染后的 HTML

```bash
node scripts/publish-api.js \
  --file article.md \
  --theme default \
  --output /tmp/rendered.html \
  --dry-run

# 查看渲染结果
cat /tmp/rendered.html
```

#### 2. 单独测试 Token

```bash
node scripts/wechat-api.js --test-token
```

#### 3. 单独测试图片上传

```bash
node scripts/wechat-api.js --test-upload /tmp/test.png
```

#### 4. 查看详细日志

所有脚本都会在 stderr 输出详细日志：

```bash
node scripts/publish-api.js --file article.md --cover cover.png 2>&1 | tee publish.log
```

---

## 七、工作流程对比

### API 模式 vs CDP 浏览器模式

| 维度 | API 模式 ⭐ | CDP 浏览器模式 |
|------|-----------|----------------|
| **速度** | 快（~10秒） | 慢（~1-2分钟） |
| **依赖** | SOCKS5 代理 + Node.js | Chrome + CDP Proxy |
| **稳定性** | 高（官方 API） | 中（DOM 操作可能因微信改版失效） |
| **图片处理** | 自动上传到 CDN | base64 内联或工具栏上传 |
| **适用场景** | 日常发布、批量操作、自动化 | 需要预览效果、复杂排版调试 |
| **封面图** | 必须指定 `--cover` | 可在编辑器中选择 |
| **可编辑性** | 只能新建草稿 | 可编辑已有草稿 |

### 何时使用 CDP 模式？

- 需要在已有草稿基础上编辑（API 不支持修改草稿）
- 需要实时预览效果
- API 返回错误且无法快速解决
- 需要使用微信编辑器的特殊功能（如投票、小程序等）

**CDP 模式文档**：详见旧版 SKILL.md（备份在 `references/` 目录）

---

## 八、高级用法

### 批量发布

```bash
for md in articles/*.md; do
  node scripts/publish-api.js \
    --file "$md" \
    --theme default \
    --cover "covers/$(basename "$md" .md).png"
  sleep 5  # 避免频率限制
done
```

### 从飞书知识库批量发布

```bash
# 1. 获取知识库文档列表（通过 feishu_wiki_space_node）
# 2. 逐个获取文档内容（通过 feishu_fetch_doc）
# 3. 保存为 Markdown 并发布
```

### 自定义封面图选择

如果正文包含图片，可以自动使用第一张作为封面：

```bash
# 修改 publish-api.js 中的逻辑，或在脚本外预处理
```

---

## 九、文件结构

```
feishu-to-wechat/
├── SKILL.md                          # 本文档（API 模式为主）
├── scripts/
│   ├── wechat-api.js                # ⭐ 微信 API 封装（Token/上传/草稿）
│   ├── render-md.js                 # ⭐ Markdown→HTML 渲染引擎
│   ├── publish-api.js               # ⭐ 完整发布流程编排（入口脚本）
│   └── wechat-proxy.sh              # SOCKS5 代理管理脚本
├── themes/
│   ├── baoyu/                       # baoyu 主题
│   │   ├── default.css              # ⭐ 默认主题（简洁清爽）
│   │   └── grace.css                # Grace 主题（优雅简约）
│   ├── elegant.css                  # 杂志精致风（暖棕色调）
│   └── tech.css                     # 简洁技术风（蓝灰调）
└── references/
    ├── proxy-config.md              # 代理配置文档
    ├── wechat-editor-patterns.md    # 微信编辑器 DOM 操作经验（CDP 模式用）
    └── SKILL.old.md                 # 旧版文档（CDP 模式详细说明）
```

---

## 十、快速开始

### 完整示例：从飞书文档到公众号草稿

```bash
# 1. 确认代理运行
curl -x socks5://127.0.0.1:12345 ifconfig.me
# → 121.40.243.4

# 2. 测试 Token
cd ~/.openclaw/workspace/skills/feishu-to-wechat
node scripts/publish-api.js --doc "测试" --content "<p>测试</p>" --dry-run
# → ✅ Token 获取成功
# → ✅ API 连通

# 3. 准备封面图
ls -lh /tmp/cover.png
# → -rw-r--r-- 1 user user 123K ... /tmp/cover.png

# 4. 发布文章
node scripts/publish-api.js \
  --file /tmp/article.md \
  --theme default \
  --cover /tmp/cover.png \
  --author "作者"
# → ✅ 草稿创建成功! media_id: xxx

# 5. 登录微信公众号后台查看草稿
```

---

## 十一、注意事项

1. **封面图必需**：微信 news 类型草稿必须有封面图，使用 `--cover` 参数指定
2. **Token 自动刷新**：Token 会提前 5 分钟自动刷新，无需手动处理
3. **图片大小限制**：单张图片 <10MB，建议压缩后上传
4. **API 调用频率**：避免短时间内大量调用（建议间隔 3-5 秒）
5. **代理稳定性**：确保代理服务稳定运行，出口 IP 必须为 `121.40.243.4`
6. **内容规范**：遵守微信公众平台内容规范，避免违规内容

---

## 十二、更新日志

### v1.5 (2026-04-05)
- ✅ 完善错误处理（代理失败、API 错误码中文说明）
- ✅ Token 自动刷新（提前 5 分钟）
- ✅ 重写 SKILL.md（API 模式为主）
- ✅ 端到端测试验证通过

### v1.0 (2026-04-04)
- ✅ 实现 API 发布模式
- ✅ Markdown 渲染引擎（marked v17）
- ✅ 主题系统（4 个可用主题）
- ✅ 完整发布流程编排
