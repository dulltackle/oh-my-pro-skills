# 配色策略

## 核心法则：60-10 + CSS 变量

### 60-10 法则

| 层级 | 占比 | 作用 |
|------|------|------|
| **主背景/中性色** | ~60% | 画布底色、大面积区域 |
| **辅助中性** | ~30% | 卡片背景、内容区 |
| **强调色（1个）** | ~10% | CTA、标题渐变、关键装饰 |

**只有 1 个主强调色**。不要搞彩虹。

### CSS 变量模板（强制使用）

```css
:root {
  /* 背景层 */
  --bg: #f6ede7;           /* 主背景 — 带色调的白 */
  --surface: #faf5f1;      /* 卡片/内容区 — 稍亮 */
  
  /* 文字层 */
  --ink: #1c0a0e;          /* 主文字 — 带暖调的黑 */
  --ink-soft: rgba(28,10,14,.55);   /* 正文 */
  --ink-muted: rgba(28,10,14,.35);  /* 辅助 */
  
  /* 强调色（只有一个！）*/
  --accent: #c45a4e;       /* 主强调 */
  --accent-deep: #9e3328;  /* 深变体（用于 info bar 数字）*/
  --accent-pale: #e8bfb8;  /* 浅变体（用于边框）*/
  
  /* 可选第二色（极少用）*/
  --gold: #b8925e;         /* 仅用于点缀（点、线）*/
}
```

### 禁止

- ❌ `#000000` 或 `#ffffff` — 必须带色调
- ❌ 超过 2 个强调色
- ❌ 强调色出现在 >5 处
- ❌ 用颜色补偿糟糕的布局

---

## 按方向推荐的调色板

### Warm Editorial（女性/健康/私密）— 本项目默认

```css
--bg: #f6ede7;        /* 奶油玫瑰白 */
--ink: #1c0a0e;       /* 深棕红黑 */
--accent: #c45a4e;    /* 玫瑰红 */
--accent-deep: #9e3328;
--gold: #b8925e;      /* 金色点缀 */
```

### Luxury（高端/VIP）

```css
--bg: #1a1614;        /* 深暖黑 */
--ink: #f5efe8;       /* 暖白 */
--accent: #d4af37;    /* 金 */
--accent-deep: #b8962e;
/* 第二色: #8b6948 (铜) */
```

### Organic Natural（健康/养生）

```css
--bg: #f5f0ea;        /* 米白 */
--ink: #2d2420;       /* 深棕 */
--accent: #7a9e7e;    /* 鼠尾草绿 */
--accent-deep: #5c7e60;
/* 第二色: #c49a6c (陶土) */
```

### Soft Pastel（教育/亲子）

```css
--bg: #fdf8f3;        /* 近白 */
--ink: #3d3530;       /* 深灰棕 */
--accent: #9eb4c4;    /* 灰蓝粉 */
--accent-deep: #7a94a8;
```

---

## 对比度要求

- **正文文字** ≥ WCAG AA (4.5:1)
- **CTA 文字** 在彩色背景上必须清晰（用白色或最深色）
- **页脚文字** opacity 不低于 0.45（否则看不清）

常用安全组合：
- 暖白底 (#f6ede7) + 深棕红字 (#1c0a0e) ✅
- 玫瑰红背景 (#c45a4e) + 白字 (#fff) ✅
- 浅灰字 (< 0.35 opacity)在任何背景上 ❌

---

## 渐变使用规则

### ✅ 好的渐变

```css
/* 标题文字：4-5 色段来回渐变，有层次 */
background: linear-gradient(135deg, #d4857a, #c45a4e, #9e3328, #c45a4e, #d4857a);

/* CTA 背景：深→浅同色系 */
background: linear-gradient(to right, var(--accent-deep), var(--accent));

/* 分隔线：透明→色→透明 */
background: linear-gradient(90deg, transparent, var(--accent), transparent);
```

### ❌ 避免的渐变

- 紫色+白色（AI slop 的标志）
- 彩虹/多色渐变
- 没有理由的渐变（纯装饰）
- 高饱和度对比色渐变（如 红→蓝）

---

## 背景深度技巧

不要用纯色背景。至少加一层：

### 方案 A：径向渐变 mesh（推荐）

```css
background:
  radial-gradient(ellipse 80% 60% at 20% 10%, rgba(accent,.07) 0%, transparent 60%),
  radial-gradient(ellipse 60% 50% at 85% 20%, rgba(gold,.05) 0%, transparent 55%),
  radial-gradient(ellipse 70% 55% at 75% 75%, rgba(accent,.05) 0%, transparent 55%),
  var(--bg);
```

### 方案 B：噪点纹理 overlay

```html
<style>
.poster::after {
  content:'';position:absolute;inset:0;z-index:100;pointer-events:none;
  background-image:url("data:image/svg+xml,...");
  background-repeat:repeat;background-size:200px 200px;
  /* feTurbulence, baseFrequency .85, numOctaves 4, opacity .03-.04 */
}
</style>
```

### 方案 C：大形状光斑

```html
<div class="absolute -top-[100px] -right-[60px] w-[520px] h-[520px] rounded-full
  bg-[radial-gradient(circle,rgba(accent,.08)_0%,transparent_65%)]"></div>
```
