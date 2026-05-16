# 微信公众号编辑器 DOM 结构参考

## 页面结构

```
公众号后台首页
├── 左侧菜单 .weui-desktop-menu_global
│   ├── 首页
│   ├── 内容管理
│   │   └── 草稿箱 (.weui-desktop-menu__name === "草稿箱")
│   └── ...
├── 中间内容区
│   ├── 首页创作面板 .new-creation__menu
│   │   ├── 文章 .new-creation__menu-item (text="文章")
│   │   ├── 选择已有内容
│   │   └── 贴图/视频/音频/转载
│   └── 草稿箱列表
│       └── 草稿卡片 .weui-desktop-publish
│           ├── .weui-desktop-card_fakeinner (外层)
│           ├── .weui-desktop-card__mask (遮罩)
│           └── #appmsg_publish_record (内层, href="javascript:void(0)")
│               └── .weui-desktop-card__bd
│                   └── .weui-desktop-publish__cover-item (封面缩略图)
└── 编辑器页面 /cgi-bin/appmsg?t=media/appmsg_edit&...
    ├── 顶部媒体菜单栏 (y≈18)
    │   ├── 视频 .jsInsertIcon.video (x≈155 左侧)
    │   ├── 图片 .jsInsertIcon.img (x≈146) ← 关键入口
    │   ├── 音频 .jsInsertIcon.audio
    │   └── ...
    │   下拉菜单:
    │   └── 本地上传 .tpl_dropdown_menu_item (x≈182, y≈71)
    ├── 封面图区域 .media_header_placeholder (遮挡顶部菜单!)
    ├── 标题输入 .js_title (textarea)
    ├── 工具栏 #edui1_toolbarboxouter (UEditor)
    │   └── 字体/大小/颜色/对齐/列表等按钮
    ├── 正文编辑区 .ProseMirror (contenteditable)
    │   └── 占位提示 .editor_content_placeholder.ProseMirror
    ├── 右侧设置区
    │   ├── 作者 #author (input)
    │   ├── 摘要
    │   ├── 原文链接
    │   └── 评论/互动设置
    └── 底部操作栏
        ├── 保存为草稿 (button, text="保存为草稿")
        ├── 返回原草稿 (button)
        └── 发表预览
```

## 关键选择器速查

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 标题输入 | `textarea.js_title` | textarea，需用 native setter |
| 正文编辑器 | `div.ProseMirror:not(.editor_content_placeholder)` | ProseMirror 实例 |
| 图片菜单 | `li.jsInsertIcon.img` | 顶部「图片」 |
| 本地上传 | `li.tpl_dropdown_menu_item` | 下拉菜单第一项 |
| 文件上传 input | `input[type=file][accept*=image]` | 隐藏的 file input |
| 保存按钮 | `button` (text==="保存为草稿") | 底部操作栏 |
| 草稿卡片 | `.weui-desktop-card.weui-desktop-publish` | 草稿箱中的草稿项 |
| 草稿卡片内部 | `#appmsg_publish_record` | 卡片可点击区域（但 clickAt/click/dblclick 均无法打开编辑器）|
| 封面图遮罩 | `.media_header_placeholder` | **需隐藏否则阻挡点击** |
| 新创作卡片 | `.weui-desktop-card_new` | 「新的创作」入口 |
| 写新文章链接 | `.create_article_item > a` | **用 JS click 这个 <a> 标签才能打开编辑器** |
| 历史版本区 | `.appmsg_editor_history` | 保存后出现 |

## CDP 操作要点

### clickAt vs click（JS）
- **click** (`/click?target=xxx`): JS `el.click()` — 对微信下拉菜单**无效**
- **clickAt** (`/clickAt?target=xxx`): CDP `Input.dispatchMouseEvent` — **真实鼠标事件，必须用于图片上传流程**

### setFiles 流程
1. 点击「本地上传」→ 触发浏览器原生文件对话框
2. `/setFiles` → CDP `DOM.setFileInputFiles` 注入文件到 hidden input
3. 手动触发 `change` 事件 → 微信 JS 监听并开始上传
4. 等待 5-8 秒 → 微信异步处理 + 插入编辑器

### 登录态保护（⭐ 重要更新）
- ✅ **`window.location.href = "完整URL"` 在已登录 tab 内跳转** — 最可靠
- ✅ **`window.location.assign("完整URL")`** — 同上，同样可靠
- ✅ 页面内点击跳转（左菜单、卡片、按钮）
- ❌ CDP Proxy `/new?url=编辑器URL` — 新 tab 无登录态
- ❌ CDP Proxy `/navigate?url=编辑器URL` — 即使同一 tab 也丢失登录
- ❌ 构造带 token 的 URL 做页面间导航

> **经验总结**：mp.weixin.qq.com 的登录态与浏览器 session 绑定，
> CDP Proxy 的 navigate/new 会创建新的网络上下文导致 cookie/session 不延续。
> 只有在已有登录态的 tab 中通过 JS 修改 location 才能保持。

### innerHTML 注入 vs insertHTML（⭐ 推荐 innerHTML）

| 方式 | 文本 | 图片 | 可靠性 |
|------|------|------|--------|
| `editor.innerHTML = html` | ✅ 完美 | ✅ base64 内联图自动转 CDN | ⭐⭐⭐ **推荐** |
| `execCommand('insertHTML', ...)` | ✅ 可用 | ⚠️ 光标位置不稳定 | ⭐⭐ |
| 工具栏上传（clickAt→setFiles） | N/A | ⚠️ 全部堆在光标位置 | ⭐ 仅备选 |

**innerHTML 注入要点：**
1. HTML 中图片用 `<img src="data:image/png;base64,...">` 内联
2. 微信编辑器会自动将 data URL 上传到 CDN（mmbiz.qpic.cn）
3. 上传后 `<img>` 的 src 会从 data URL 变为 CDN URL
4. **内容可能很大（4张图约 878KB），必须用 `curl -d @file` 传入 JS**

### 草稿卡片操作（⚠️ 已知问题）

以下方式**均无法**打开草稿编辑器：
- `clickAt` 点击 `.weui-desktop-card` 或 `#appmsg_publish_record`
- JS `el.click()` 或 `el.dispatchEvent(new MouseEvent("click"))`
- JS `el.dispatchEvent(new MouseEvent("dblclick"))`

**解决方案：** 直接用 `window.location.assign(编辑URL)` 跳转，URL 格式：
```
https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&type=77&appmsgid={APPMSG_ID}&token={TOKEN}&lang=zh_CN
```

## 飞书文档内容结构注意事项

飞书 `feishu_fetch_doc` 返回的 markdown 有几个容易忽略的点：

1. **`---` 分隔线上方的内容**：通常是副标题/摘要，也是正文的一部分，不能丢弃
   ```
   Skill authors can now verify that their skills work...  ← 这行容易被丢
   ---
   Skill-creator now helps you write evals...
   ```

2. **图片位置**：`<image token="xxx"/>` 所在位置就是图片应在的两段文字之间

3. **易遗漏的短段落**：图片后面、章节标题前常有过渡句
   ```
   ...It tracks eval pass rate, elapsed time, and token usage.
   <image token="xxx"/>                          ← 图在这里
   Your evals and results stay with you...       ← 这种短句极易漏掉
   ## Next Section Title
   ```

4. **列表格式**：原文 `- item` 在 HTML 中应转为 `<ul><li>item</li></ul>`

## 已知限制

1. **个人主体账号**: 2025年7月起可能无法通过 API 发布，但 CDP 浏览器操作不受此限制
2. **图片格式**: 仅支持 gif/jpeg/png/svg/webp
3. **正文大小**: HTML ≤ 20k 字符，≤ 1MB（base64 内联图片后通常 800KB-1MB）
4. **标题长度**: ≤ 32 字符
5. **外部图片 URL**: 会被过滤，必须通过本地上传或素材库选择
6. **截图超时**: 频繁调用 screenshot 可能导致 SIGTERM，建议间隔 ≥2 秒
7. **草稿 appmsgid**: 保存后可通过 URL 参数或 DOM 推断，用于后续重新打开编辑

---

## Token 管理与登录态判断（⭐ 2026-04-05 更新）

### Token 获取流程

```
打开公众号后台首页 (mp.weixin.qq.com)
    │
    ▼
从 location.href 正则提取 token=([^&]+)
    │
    ▼
拼接编辑器 URL（token 作为必需参数）
    │
    ▼
window.location.href = 编辑器URL（在已登录 tab 内跳转）
```

### 「请重新登录」误判处理

```
编辑器页面显示「请重新登录」？
    │
    ├── 是 → 不要急着让用户扫码！
    │     ▼
    │   回退到 mp.weixin.qq.com 首页
    │     │
    │     ├── 首页正常显示（文章数/用户数等）→ session 在，只是 token 过期
    │     │   → 从首页 URL 提取新 token → 重新跳转编辑器 ✅
    │     │
    │     └── 首页也显示「请重新登录」→ 真的掉登录了 → 让用户扫码 🔑
    │
    └── 否 → 继续操作 ✅
```

**关键经验**：2026-04-05 再次打开编辑器时用旧 token 拼接 URL 导致「请重新登录」。
实际 session 还在（Chrome 未重启，cookie 有效），问题出在 token 过期。
回首页拿新 token 后一切正常。

### Session 保持策略

| 场景 | Session 状态 | 建议 |
|------|-------------|------|
| Chrome 重启 | ❌ cookie 清失 | 需重新扫码登录 |
| Chrome 未重启，数小时内 | ✅ 有效 | 直接用 |
| Chrome 未重启，超过 24h | ⚠️ 可能过期 | 先验证首页 |
| `--user-data-dir` 持久化 | ✅ cookie 保留 | 不主动 kill Chrome 进程 |

---

## 主题 CSS 内联系统（⭐ 2026-04-05 新增）

### 架构

```
飞书文档 Markdown
    │
    ▼
构建 HTML（内联 base64 图片）→ /tmp/wx_final.html (~878KB)
    │
    ▼
apply_theme.py CSS 内联 → /tmp/wx_themed.html (+6KB 样式)
    │
    ▼
生成注入 JS → /tmp/wx_inject.js
    │
    ▼
CDP eval 注入到微信 ProseMirror 编辑器
    │
    ▼
微信自动将 data URL 图片上传到 CDN → 保存草稿 ✅
```

### apply_theme.py 技术细节

- **纯 Python 标准库实现**，零外部依赖（html.parser + re）
- 基于 HTMLParser 遍历每个元素，匹配 CSS 选择器后合并 style 属性
- 支持的选择器：标签(`h2`)、类(`.note-info`)、标签.类(`code.x`)、后代(`blockquote p`)
- 特异性排序：高优先级规则后处理，自然覆盖低优先级
- 已知限制：不支持 `:hover`/`:before`/伪元素、CSS 变量、`calc()`、`flex`/`grid`

### 微信编辑器 CSS 兼容性白名单

以下属性经测试可在微信 ProseMirror 编辑器中**正确渲染**：

| 类别 | 安全属性 | 不支持/危险 |
|------|---------|-------------|
| 字体 | font-family, font-size, font-weight, font-style | @font-face |
| 文字 | color, letter-spacing, text-align, text-indent | text-shadow(可能) |
| 间距 | margin, padding (px/em 单位) | rem/vh/vw |
| 背景 | background-color | linear-gradient(降级为纯色) |
| 边框 | border, border-left/right/top/bottom, border-radius | box-shadow(部分支持) |
| 布局 | display(block/inline-block), max-width, width(%) | flex/grid/position:absolute |
| 行为 | line-height, word-wrap, word-break | overflow:hidden(可能) |
| 列表 | list-style (有限支持) | counter |

**设计原则**：tech.css 只使用白名单属性，确保最大兼容性。

### 切换/扩展主题

在 `themes/` 目录下新建 `.css` 文件即可：
```bash
python3 scripts/apply_theme.py /tmp/wx_final.html themes/elegant.css /tmp/wx_themed.html
```
主题文件只需遵循上述 CSS 白名单，无需修改任何脚本代码。
