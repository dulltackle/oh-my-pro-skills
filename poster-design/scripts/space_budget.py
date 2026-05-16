#!/usr/bin/env python3
"""
海报空间预算与字号计算器 (Poster Space Budget Calculator)
用法:
  python3 space_budget.py                    # 交互式
  python3 space_budget.py --layout A         # 用 Layout A 默认配置
  python3 space_budget.py --layout B --body-lines 4  # 指定正文行数
  python3 space_budget.py --list              # 列出可用布局模式
"""
import argparse
import sys

# ============================================================
# 常量
# ============================================================
CANVAS_W = 1080
CANVAS_H = 1920
TOP_SAFE = 60      # pt-12
BOTTOM_SAFE = 70   # pb-6 + 自然间距

# 默认行高
LINE_HEIGHT_BODY = 1.75
LINE_HEIGHT_TITLE = 1.08
LINE_HEIGHT_LABEL = 1.6

# 最小字号约束（来自 typography.md）
MIN_BODY = 28       # 人物介绍/信息密集型
MIN_BODY_EVENT = 34 # 纯活动海报
MIN_CAPTION = 16
MIN_MICRO = 13
MIN_RATIO = 2.5     # 标题:正文 最小比例

# ============================================================
# 预设布局模式
# ============================================================
LAYOUTS = {
    "A": {
        "name": "照片主角型",
        "desc": "有主讲人照片的讲座/人物介绍/课程海报",
        "blocks": [
            {"name": "Brand Row",       "pct": 2.5,  "fixed": True},
            {"name": "Title Area",      "pct": 11.5, "fixed": False},
            {"name": "Hero Zone",       "pct": 38.0, "fixed": False, "note": "照片+左栏信息"},
            {"name": "Tags",            "pct": 3.6,  "fixed": True},
            {"name": "Content Card",    "pct": 17.5, "fixed": False, "note": "核心文字区"},
            {"name": "成就卡片",        "pct": 10.5, "fixed": False},
            {"name": "Footer",          "pct": 6.3,  "fixed": True},
        ],
        "gap_pct": 10.0,   # 间距占总高度百分比
        "default_body_lines": 4,
        "default_title_lines": 2,
    },
    "B": {
        "name": "居中优雅型",
        "desc": "无照片的活动/发布会/简约风格",
        "blocks": [
            {"name": "Brand Row",       "pct": 2.0,  "fixed": True},
            {"name": "Title Area",      "pct": 18.0, "fixed": False, "note": "超大居中标题"},
            {"name": "Content Card",    "pct": 30.0, "fixed": False, "note": "居中正文"},
            {"name": "Info Bar",        "pct": 12.0, "fixed": False},
            {"name": "CTA",             "pct": 15.0, "fixed": False},
            {"name": "Footer",          "pct": 8.0,  "fixed": True},
        ],
        "gap_pct": 7.0,
        "default_body_lines": 5,
        "default_title_lines": 2,
    },
    "C": {
        "name": "分割杂志型",
        "desc": "信息量大、多主题、左右分栏",
        "blocks": [
            {"name": "Brand Row",       "pct": 2.5,  "fixed": True},
            {"name": "Title + 左栏",    "pct": 22.0, "fixed": False},
            {"name": "Photo / 右栏",    "pct": 28.0, "fixed": False},
            {"name": "Content Card",    "pct": 20.0, "fixed": False},
            {"name": "辅助信息",         "pct": 12.0, "fixed": False},
            {"name": "Footer",          "pct": 6.0,  "fixed": True},
        ],
        "gap_pct": 9.0,
        "default_body_lines": 4,
        "default_title_lines": 1,
    },
    "D": {
        "name": "全幅冲击型",
        "desc": "极简信息、超大标题、音乐节/创意活动",
        "blocks": [
            {"name": "Brand Row",       "pct": 2.0,  "fixed": True},
            {"name": "Title Area",      "pct": 40.0, "fixed": False, "note": "超大标题撑满宽度"},
            {"name": "Description",     "pct": 15.0, "fixed": False, "note": "一句话描述"},
            {"name": "CTA",             "pct": 20.0, "fixed": False},
            {"name": "辅助信息",         "pct": 12.0, "fixed": False},
            {"name": "Footer",          "pct": 6.0,  "fixed": True},
        ],
        "gap_pct": 5.0,
        "default_body_lines": 2,
        "default_title_lines": 2,
    },
}


def calc(layout_key, body_lines=None, title_lines=None,
         canvas_h=CANVAS_H, top_safe=TOP_SAFE, bottom_safe=BOTTOM_SAFE,
         min_body=MIN_BODY, min_ratio=MIN_RATIO):
    """执行空间预算计算，返回推荐字号"""

    if layout_key not in LAYOUTS:
        print(f"❌ 未知布局模式 '{layout_key}'")
        print(f"   可用模式: {', '.join(LAYOUTS.keys())}")
        return None

    layout = LAYOUTS[layout_key]
    body_lines = body_lines or layout["default_body_lines"]
    title_lines = title_lines or layout["default_title_lines"]

    # Step 1: 计算可用高度
    total_fixed = top_safe + bottom_safe
    gap_h = canvas_h * layout["gap_pct"] / 100
    usable = canvas_h - total_fixed - gap_h

    # Step 2: 分配各区块
    blocks_out = []
    content_block = None
    title_block = None
    for b in layout["blocks"]:
        bh = usable * b["pct"] / 100
        blocks_out.append({**b, "height_px": round(bh, 1)})
        if "Content" in b["name"] or "内容" in b["name"]:
            content_block = blocks_out[-1]
        if "Title" in b["name"]:
            title_block = blocks_out[-1]

    # Step 3: 从 Content Card 反推正文字号
    if not content_block:
        print("⚠️ 当前布局没有 Content Card 区块，无法自动反推正文")
        body_px = min_body
    else:
        # Content Card 内部开销估算
        card_padding_v = 48   # py-6 × 2 (上下padding)
        section_head = 45     # 区块标题 + mb
        inner_content = content_block["height_px"] - card_padding_v - section_head

        if inner_content <= 0:
            print(f"⚠️ Content Card 高度({content_block['height_px']:.0f}px)不足以容纳内部元素")
            print(f"   建议：增大该区块占比或减少其他区块")
            inner_content = 120  # fallback

        # 反推：单行可用 = 内容区 ÷ 行数 ÷ 行高
        single_line = inner_content / body_lines / LINE_HEIGHT_BODY
        body_px = max(min_body, round(single_line))

        if single_line < min_body:
            print(f"⚠️ 按当前空间预算，正文只能放 {single_line:.0f}px（{body_lines}行）")
            print(f"   已提升到最小值 {min_body}px")
            print(f"   建议：增加 Content Card 占比 或 减少正文行数")

    # Step 4: 从 Title Area 反推标题字号
    if title_block:
        title_padding = 32
        title_inner = title_block["height_px"] - title_padding
        title_single = title_inner / title_lines / LINE_HEIGHT_TITLE
        title_px = max(72, round(title_single))
    else:
        title_px = 82  # default

    # Step 5: 比例验证
    ratio = title_px / body_px
    ratio_ok = ratio >= min_ratio

    # 输出结果
    result = {
        "layout": layout["name"],
        "canvas": f"{CANVAS_W}×{canvas_h}",
        "usable_h": round(usable, 1),
        "gap_h": round(gap_h, 1),
        "title_px": title_px,
        "body_px": body_px,
        "ratio": round(ratio, 2),
        "ratio_ok": ratio_ok,
        "title_lines": title_lines,
        "bold_px": body_px + 2,
        "caption_px": max(MIN_CAPTION, round(body_px * 0.65)),
        "micro_px": max(MIN_MICRO, round(body_px * 0.5)),
        "label_px": max(17, round(body_px * 0.72)),
        "badge_px": max(14, round(body_px * 0.52)),
        "blocks": blocks_out,
        "body_lines": body_lines,
        "content_inner": round(inner_content, 1) if 'inner_content' in dir() else None,
    }
    return result


def print_result(r):
    """格式化输出计算结果"""
    sep = "─" * 50
    print(f"\n{' '*4}📐 海报空间预算计算结果\n")

    print(f"  布局模式：{r['layout']} | 画布 {r['canvas']}")
    print(f"  可用高度：{r['usable_h']}px（含间距 {r['gap_h']}px）\n")

    print(f"  {'区块':<16} {'占比':>6} {'高度':>8}")
    print(f"  {sep}")
    for b in r["blocks"]:
        note = f"  ← {b['note']}" if "note" in b else ""
        fix = " [固定]" if b.get("fixed") else ""
        print(f"  {b['name']:<14} {b['pct']:>5.1f}% {b['height_px']:>7.0f}px{fix}{note}")

    print(f"\n  {sep}")
    print(f"  📝 推荐字号体系\n")
    print(f"  {'元素':<18} {'字号':>6}  说明")
    print(f"  {'-':<18} {'-':>6}  {'-':<30}")

    items = [
        ("主标题", r["title_px"], f"{r['title_lines']}行, leading {LINE_HEIGHT_TITLE}"),
        ("正文", r["body_px"], f"{r['body_lines']}行, leading {LINE_HEIGHT_BODY}, **核心**"),
        ("加粗关键词", r["bold_px"], f"正文+{r['bold_px']-r['body_px']}px"),
        ("卡片标题", r["label_px"], f"≈ 正文×0.72"),
        ("卡片描述", r["caption_px"], f"≈ 正文×0.65, opacity≥0.85"),
        ("标签/badge", r["badge_px"], f"≈ 正文×0.52"),
        ("Footer英文", r["micro_px"], f"≈ 正文×0.5, opacity≥0.7"),
    ]

    for name, size, note in items:
        print(f"  {name:<18} {size:>4}px  {note}")

    print(f"\n  {sep}")
    status = "✅ 通过" if r["ratio_ok"] else "⚠️ 偏低"
    print(f"  📊 比例验证：标题 {r['title_px']}px : 正文 {r['body_px']}px = {r['ratio']}:1  {status}")
    if not r["ratio_ok"]:
        print(f"     建议：缩小标题到 {round(r['body_px'] * MIN_RATIO)}px 或接受人物介绍海报放宽标准")

    # Tailwind 参考值提示
    nearest_body = round(r["body_px"] / 4) * 4  # 对齐到 4 的倍数
    print(f"\n  💡 Tailwind 近似值：text-[{nearest_body}px] (或 text-[{nearest_body-2}px] ~ text-[{nearest_body+2}px])")


def main():
    parser = argparse.ArgumentParser(description="海报空间预算与字号计算器")
    parser.add_argument("--layout", "-l", choices=list(LAYOUTS.keys()), default="A",
                        help="布局模式 (默认: A)")
    parser.add_argument("--body-lines", "-b", type=int, default=None,
                        help="正文预计行数 (默认按布局模式)")
    parser.add_argument("--title-lines", "-t", type=int, default=None,
                        help="标题预计行数 (默认按布局模式)")
    parser.add_argument("--list", action="store_true",
                        help="列出所有布局模式")
    parser.add_argument("--min-body", type=float, default=MIN_BODY,
                        help=f"最小正文字号 (默认:{MIN_BODY})")
    parser.add_argument("--json", action="store_true",
                        help="输出 JSON 格式结果")
    args = parser.parse_args()

    if args.list:
        print("\n可用的布局模式：\n")
        for k, v in LAYOUTS.items():
            blocks_str = ", ".join([b["name"] for b in v["blocks"]])
            print(f"  {k}: {v['name']}")
            print(f"     {v['desc']}")
            print(f"     区块: {blocks_str}\n")
        return

    result = calc(args.layout, args.body_lines, args.title_lines,
                  min_body=args.min_body)
    if result:
        if args.json:
            import json
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            print_result(result)


if __name__ == "__main__":
    main()
