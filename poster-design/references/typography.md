# 排版规则

排版承担设计质量的最大份额。字体选对，设计就对了 50%。

## 字体配对原则

### 每次必须用不同配对

不要在所有项目里重复同一对字体。从下面的池子里每次选不同的组合。

### 推荐配对池

| # | Display（标题） | Body（正文） | 气质 | 适用方向 |
|---|-----------------|-------------|------|---------|
| 1 | **DM Serif Display** | DM Sans / Noto Sans SC | 编辑感、温暖 | Editorial, Warm Editorial |
| 2 | **Playfair Display** | Source Sans 3 | 经典、奢华 | Luxury, Art Deco |
| 3 | **Cormorant Garamond** | Montserrat | 优雅、精致 | Luxury, Organic |
| 4 | **Fraunces** | Inter | 现代衬线、亲和 | Soft Pastel, Organic |
| 5 | **Instrument Serif** | Instrument Sans | 时尚、极简 | Minimal Swiss |
| 6 | **Libre Baskerville** | Karla | 可读、编辑 | Editorial |
| 7 | **Bebas Neue** | Source Sans 3 | 大胆、冲击 | Maximalist |
| 8 | **Noto Serif SC** | Noto Sans SC | 中文原生、正式 | 通用默认 |

### 中文字体强制要求

- **标题**：`"Noto Serif SC", "DM Serif Display", serif` — 必须有衬线
- **正文**：`"Noto Sans SC", "PingFang SC", sans-serif`
- **装饰/英文**：Cormorant Garamond（斜体）或 Playfair Display
- Google Fonts 同时加载中文字体和西文字体

```html
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500;600;700;900&family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Noto+Sans+SC:wght@300;400;500;700;900&family=Noto+Serif+SC:wght@400;600;700;900&display=swap" rel="stylesheet">
```

---

## 尺度系统（Typography Scale）

### 海报专用尺度

海报不是网页——尺度要**戏剧性**。正常网页的 1.25x 倍率在这里不够。

```
Hero Title:    82 - 100px   （THE 记忆点）
Sub Title:     90 - 110px   （可略大于主标题）
Section Head:  26 - 32px     （卡片标题等）
Body Text:     **28 - 34px**   （列表项、描述、正文——**优先放大**）
Caption:       16 - 20px     （标签、辅助信息）
Micro:         13 - 15px     （品牌行、页脚注）
```

**⚠️ 核心原则：文字是海报传递信息的主要途径，字号必须优先保证可读性。**

宁可牺牲一点标题的戏剧性（从120px降到82-90px），也要把正文、头衔、描述文字放大到舒适阅读的大小。在手机/打印/远距离观看场景下，< 24px 的中文几乎无法舒适阅读。

**关键比例**：
- Hero Title : Body ≥ **2.5:1**（人物介绍/信息类海报可放宽到 2.5:1，纯活动海报保持 ≥ 4:1）
- Section Head : Body ≥ **1.1:1**
- Body : Micro ≥ **1.8:1**

如果比例不够大，看起来就像 AI 生成的——因为 AI 倾向于使用保守的中间值。

### 字重对比

| 元素 | 字重 | 说明 |
|------|------|------|
| Hero Title | 900 (Black) 或 normal (serif) | 衬线体用 normal 就够粗 |
| Section Head | 800 (ExtraBold) | 明确层级 |
| Body | 500-600 (Medium-Semibold) | 比网页正文稍粗（海报阅读距离远） |
| Caption | 600-700 (Semibold-Bold) | 标签需要醒目 |
| Micro | 700 (Bold) / 600 | 品牌 bold，注 regular |

### 行高

| 元素 | line-height | 说明 |
|------|-------------|------|
| Hero Title | 1.0 - 1.08 | 紧凑，戏剧性 |
| Body | 1.45 - 1.55 | 舒适阅读 |
| Multi-line body | 1.5 - 1.6 | 长文本必须宽松 |

### 字间距（Letter-spacing）

| 元素 | spacing | Tailwind config |
|------|---------|----------------|
| Hero Title | 14-18px | `tracking-hero` |
| Sub Title | 12-16px | `tracking-title` |
| Name | 10-14px | `tracking-name` |
| Label/Tag | 8-12px | `tracking-label` / `tracking-wider` |
| Brand | 5-7px | `tracking-wide` |
| CTA | 4-6px | `tracking-wide` |
| Body | 0-1px | 默认（不设） |

中文标题**必须加大字间距**——默认间距在超大字号下太拥挤。

---

## 中文排版注意事项

1. **竖排文字**用于人物头衔：`writing-mode:vertical-rl;text-orientation:upright`
2. **不使用 justify**——中文两端对齐容易产生难看的大空白
3. **标点符号**：标题中尽量不用标点，或用空格替代逗号
4. **数字**：日期、电话等用半角数字，与中文形成视觉节奏
5. **英文混排**：人名拼音、品牌名等用斜体西文字体（Cormorant Garamond）

---

## 反模式

- ❌ 全页只用一个字体家族
- ❌ Hero title 和 body text 尺度比 < 3:1
- ❌ 中文标题不加字间距（超大字号下像糊在一起）
- ❌ 用 emoji 当图标或装饰
- ❌ 正文 < **26px**（海报阅读距离比屏幕远；人物介绍/信息密集型海报建议 ≥ 28px）
- ❌ 头衔/标签 < **16px**（这类信息是核心内容不是装饰）
- ❌ 居中大段文字块（正文左对齐，仅标题居中）
