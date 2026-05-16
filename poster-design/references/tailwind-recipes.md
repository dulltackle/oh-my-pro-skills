# 组件选择指南与代码片段

> **HTML 代码以 `scripts/scaffold.py` 为唯一来源。**
> 需要完整骨架：`python3 scripts/scaffold.py --layout A --output poster.html`
> 需要单个组件：`python3 scripts/scaffold.py --layout A --snippet A5`
> 查看可用组件：`python3 scripts/scaffold.py --layout A --list-snippets`
>
> 配色变量见 `color-strategy.md`，字体配置见 `typography.md`，区块角色见 `poster-anatomy.md`。

---

## 通用：Tailwind Config（骨架不包含，需手动配置）

每次项目从 `color-strategy.md` 选配色、从 `typography.md` 选字体后，替换骨架中 `:root` 变量和 `tailwind.config` 的对应值。

```html
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = {
  theme: {
    extend: {
      colors: { /* 从 color-strategy.md 复制 */ },
      fontFamily: { /* 从 typography.md 复制 */ },
      letterSpacing: {
        hero: '18px', title: '14px', label: '10px',
        name: '12px', tag: '3px', wide: '6px', wider: '8px',
      },
    },
  },
}
</script>
```

---

## Layout A：照片主角型（默认推荐）

适用：有主讲人照片的讲座/人物介绍/课程海报。
结构：左侧人物信息 + 右侧大照片 → 标签 → 内容卡 → Info Bar → CTA → Footer

| 组件 | Snippet ID | 设计要点 |
|------|-----------|---------|
| Brand Row | A1 | 极轻量，品牌 uppercase + 日期斜体 |
| Title Area | A2 | 标签文字 + 主标题(102px) + 副标题(112px) + 几何装饰线 |
| Photo + Person Info | A3 | flex row，左侧 240px 人物信息 + 右侧 500px 照片带光晕边框 |
| Tags | A4 | rounded-full 胶囊标签，accent 8% bg + 16% border |
| Content Card | A5 | 白底 70% 半透明卡片，左侧竖线 + 勾选图标列表 |
| Info Bar | A6 | 横向等分，小标签 uppercase + 大数字 |
| CTA | A7 | 渐变背景 + 点阵纹理 + 白字胶囊按钮 |
| Footer | A8 | 分隔线 + 机构名 + 一句话 |

---

## Layout B：居中优雅型

适用：无照片的活动/发布会/简约风格。所有内容居中，大留白。

| 组件 | Snippet ID | 设计要点 |
|------|-----------|---------|
| Brand Row | B1 | 同 A1 |
| Hero Title | B2 | 超大 120px 居中标题 + 几何分隔 |
| Content Card | B3 | 居中卡片 max-w-[800px]，正文 26px |
| Info Row | B4 | 横向 gap-12 居中信息组 |
| CTA | B5 | 同 A7 但限宽 max-w-[800px] |
| Footer | B6 | 同 A8 |

---

## Layout C：分割杂志型

适用：信息量大、多主题。左右或上下分栏。

| 组件 | Snippet ID | 设计要点 |
|------|-----------|---------|
| Brand Row | C1 | 同 A1 |
| Left-Right Split | C2 | grid 5 列，左 2 右 3，标题 + 内容 vs 照片 |
| Tags | C3 | 同 A4 |
| Multi-Card Row | C4 | grid 2 列并排卡片 |
| CTA | C5 | 同 A7 全宽 |
| Footer | C6 | 同 A8 |

---

## Layout D：全幅冲击型

适用：音乐节、创意活动、极简宣传。字号极大(120px+)、文字即视觉。

| 组件 | Snippet ID | 设计要点 |
|------|-----------|---------|
| Brand Row | D1 | 同 A1 |
| Impact Title | D2 | 130-140px 双行撑满宽度 |
| Decorative Divider | D3 | 线+圆点几何分隔 |
| One-liner | D4 | 30px 描述文字 max-w-[800px] |
| CTA | D5 | 同 B5 |
| Footer | D6 | 同 A8 |

---

## 背景装饰（通用，可叠加到任何布局）

以下片段骨架已内置，手动拼装时直接复制：

### 径向渐变 mesh

```html
<div class="absolute inset-0 z-0" style="background:
  radial-gradient(ellipse 80% 60% at 20% 10%, rgba(196,90,78,.07) 0%, transparent 60%),
  radial-gradient(ellipse 60% 50% at 85% 20%, rgba(184,146,94,.05) 0%, transparent 55%),
  radial-gradient(ellipse 70% 55% at 75% 75%, rgba(196,90,78,.05) 0%, transparent 55%),
  var(--bg);"></div>
```

### 大形状光斑

```html
<div class="absolute -top-[100px] -right-[60px] w-[520px] h-[520px] rounded-full bg-[radial-gradient(circle,rgba(196,90,78,.08)_0%,transparent_65%)] z-0"></div>
<div class="absolute -bottom-[80px] -left-[40px] w-[420px] h-[420px] rounded-full bg-[radial-gradient(circle,rgba(184,146,94,.06)_0%,transparent_60%)] z-0"></div>
```

### 角标装饰

```html
<div class="absolute top-5 left-5 w-9 h-9 border-t border-l border-accent/18 rounded-tl z-50"></div>
<div class="absolute bottom-5 right-5 w-9 h-9 border-b border-r border-accent/18 rounded-br z-50"></div>
```
