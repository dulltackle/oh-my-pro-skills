# 素材检查清单（写代码前的硬门槛）

> **收到图片后、写代码前，必须完整执行本清单。不通过不写代码。**
> 裁剪理论和 CSS 实现见 `image-cropping.md`。

---

## Step 1：命令行快速检查

```bash
file <图片路径>
```

**输出解读：**

| 输出特征 | 含义 | 后续策略 |
|---------|------|---------|
| `8-bit/color RGBA` | **透明底 PNG** | 最佳素材！用 `object-fit:contain` + `drop-shadow` 直接融入 |
| `8-bit/color RGB` | 不透明 PNG | 需判断背景色（白/深/复杂） |
| `JPEG image data` | JPEG（必然不透明） | 同上 |
| `width x height` | 实际像素尺寸 | 判断方向和比例 |

## Step 2：方向与比例判断

| 比例范围 | 方向 | 推荐容器策略 |
|---------|------|-------------|
| 宽 < 高 (如 922×1344) | 竖版 | 天然适合 Layout A 右侧主角区 |
| 宽 ≈ 高 (±15%) | 近似方形 | 缩小宽度到 40%，左侧信息区加宽 |
| 宽 > 高 (如 16:9) | 横版 | 放标题下方横贯全宽，或裁切为方形 |

## Step 3：背景类型判断（仅非透明底图片需要）

用视觉能力查看图片，判断背景类型：

| 背景类型 | 特征 | 融入策略 | 详见 |
|---------|------|---------|------|
| 纯白/浅色 | 证件照、写真 | 圆角+内阴影+渐变蒙版 或 建议用户提供抠图版 | `image-cropping.md` §五 |
| 纯深色 | 艺术照、棚拍 | drop-shadow + 微光晕即可自然融入 | `image-cropping.md` §四 |
| 复杂背景 | 环境/场景照 | 加实心边框/圆角/投影做隔离 | `image-cropping.md` §六 |
| **透明 (RGBA)** | 抠图 PNG | `object-fit:contain` + `drop-shadow` + `overflow:visible` | `image-cropping.md` §五 Knockout |

## Step 4：记录素材档案

写代码前确认以下信息：

```
格式: PNG(RGBA) / JPEG / PNG(RGB)
尺寸: W x H px
方向: 竖 / 横 / 方
背景: 透明 / 白 / 深 / 复杂
容器策略: contain+drop-shadow / cover+圆角 / cover+边框过渡
object-position: center XX%
```

**⚠️ 不完成此清单不写第一行 CSS。**
