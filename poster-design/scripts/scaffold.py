#!/usr/bin/env python3
"""
Poster Design HTML 骨架生成器

根据布局模式生成差异化的 HTML 骨架（head + 结构化空容器）。
可选配合 space_budget.py 自动计算并注入字号体系。

用法:
  python3 scaffold.py --layout A --output poster.html --title "标题"
  python3 scaffold.py --layout B --output poster.html --title "活动名"
  python3 scaffold.py --layout A --from-budget --output poster.html --title "标题"
  python3 scaffold.py --layout A --snippet A5            # 输出单个组件
  python3 scaffold.py --list
"""
import re
import argparse
import json
import sys
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


LAYOUTS = {
    "A": "照片主角型 — 有主讲人照片的讲座/人物介绍/课程海报",
    "B": "居中优雅型 — 无照片的活动/发布会/简约风格",
    "C": "分割杂志型 — 信息量大、多主题、左右分栏",
    "D": "全幅冲击型 — 极简信息、超大标题、音乐节/创意活动",
}

LAYOUT_BODIES = {
    "A": """\
  <div class="main relative z-[5] px-[60px] pt-9 pb-6">
    <!-- A1. Brand Row -->
    <div class="flex justify-between items-center mb-3">
      <span class="text-[11px] font-bold tracking-wider uppercase text-accent opacity-50">品牌名</span>
      <span class="font-accent italic text-[13px] text-ink-muted tracking-wide">2026 · May</span>
    </div>

    <!-- A2. Title Area -->
    <div class="relative mb-4">
      <span class="block text-[11px] font-semibold tracking-label uppercase text-accent opacity-65 mb-2">标签文字</span>
      <div class="font-display text-[102px] leading-[1.05] tracking-hero text-ink">主标题</div>
      <div class="font-display text-[112px] leading-[1.05] tracking-title title-gradient mt-1">副标题</div>
      <div class="flex items-center gap-3 mt-3 ml-1">
        <div class="h-[3px] w-[80px] rounded-sm bg-accent opacity-60"></div>
        <div class="w-[10px] h-[10px] rounded-full bg-gold shadow-[0_0_16px_rgba(184,146,94,.35)]"></div>
        <div class="h-[3px] w-[36px] rounded-sm bg-accent opacity-25"></div>
        <div class="w-7 h-7 rounded-full border-2 border-accent/20 shrink-0"></div>
      </div>
    </div>

    <!-- A3. Photo + Person Info (left-right) -->
    <div class="flex items-end mt-4 relative">
      <div class="w-[240px] shrink-0 pr-6 pb-6 flex flex-col justify-end">
        <div class="font-display text-[52px] leading-[1.1] tracking-name text-ink">
          姓名<span class="block w-14 h-[3px] bg-gradient-to-r from-accent to-transparent rounded-sm mt-2.5"></span>
        </div>
        <div class="font-accent italic text-[15px] tracking-widest text-accent opacity-40 uppercase mt-2">Pinyin</div>
        <ul class="p-titles mt-4"><!-- 竖排头衔，数量 ≤5 --></ul>
      </div>
      <div class="flex-1 relative flex justify-center items-end pb-3">
        <div class="relative w-[500px]">
          <div class="absolute -inset-[36px] bg-[radial-gradient(ellipse_at_55%_45%,rgba(accent,.09),transparent_60%)] rounded-3xl -z-10"></div>
          <div class="absolute inset-0 rounded-2xl border border-accent/16 pointer-events-none"></div>
          <div class="absolute -top-3 -right-3 w-9 h-9 border-t-[2.5px] border-r-[2.5px] border-accent rounded-tr-md"></div>
          <div class="absolute -bottom-3 -left-3 w-7 h-7 border-b-2 border-l-2 border-accent/18 rounded-bl"></div>
          <img class="w-full h-[540px] object-contain object-bottom rounded-2xl drop-shadow-[0_24px_60px_rgba(28,10,14,.14)]" src="{{PHOTO}}">
        </div>
      </div>
    </div>

    <!-- A4. Tags -->
    <div class="flex gap-2.5 my-3 flex-wrap">
      <span class="px-6 py-2.5 rounded-full text-[19px] font-semibold tracking-tag text-accent bg-accent/8 border border-accent/18">标签一</span>
      <span class="px-6 py-2.5 rounded-full text-[19px] font-semibold tracking-tag text-accent bg-accent/8 border border-accent/18">标签二</span>
      <span class="px-6 py-2.5 rounded-full text-[19px] font-semibold tracking-tag text-accent bg-accent/8 border border-accent/18">标签三</span>
    </div>

    <!-- A5. Content Card -->
    <div class="card-accent relative bg-white/70 border border-accent/12 rounded-2xl px-8 py-5 mb-3 shadow-[0_4px_24px_rgba(28,10,14,.06),inset_0_1px_0_rgba(255,255,255,.8)]">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-1.5 h-1.5 rounded-full bg-accent"></div>
        <div class="text-[28px] font-extrabold tracking-wider text-accent-deep">标题</div>
      </div>
      <ul class="c-list relative pl-5 list-none">
        <li class="flex items-start mb-2.5 text-[24px] leading-[1.55] text-ink-soft">
          <svg class="c-chk w-[18px] h-[18px] mr-2.5 mt-1 text-accent opacity-60 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          列表项内容...
        </li>
      </ul>
    </div>

    <!-- A6. Info Bar -->
    <div class="flex justify-around bg-white/60 border border-accent/10 rounded-xl px-6 py-3 mb-3 shadow-[0_2px_12px_rgba(28,10,14,.04)]">
      <div class="text-center flex-1 border-r border-accent/6 last:border-r-0">
        <div class="text-[14px] text-ink-muted tracking-widest uppercase mb-1.5 opacity-70">标签</div>
        <div class="text-[28px] font-bold text-accent-deep tracking-wide">值</div>
      </div>
    </div>

    <!-- A7. CTA -->
    <div class="cta-glow relative bg-gradient-to-r from-accent-deep to-accent rounded-2xl px-10 py-6 text-center overflow-hidden">
      <div class="absolute inset-0 opacity-[0.04]" style="background-image:radial-gradient(circle 2px,#fff 50%,transparent);background-size:80px 80px;"></div>
      <div class="relative z-10">
        <div class="text-white text-[14px] font-bold tracking-widest uppercase opacity-70 mb-2">紧迫文案</div>
        <div class="text-white text-[34px] font-black tracking-wider">行动召唤主文字</div>
        <div class="mt-3 inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-8 py-3 text-white text-[20px] font-bold tracking-wide border border-white/25">
          按钮文字
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
        </div>
      </div>
    </div>

    <!-- A8. Footer -->
    <div class="footer-wrap relative text-center pt-5 pb-4 mt-4">
      <div class="w-24 h-[1.5px] bg-gradient-to-r from-transparent via-accent/30 to-transparent mx-auto mb-3"></div>
      <div class="font-accent text-[20px] font-semibold text-ink-soft tracking-wider">机构名称</div>
      <div class="text-[14px] text-ink-muted tracking-wider">一句话描述</div>
    </div>
  </div>""",

    "B": """\
  <div class="main flex flex-col items-center justify-center min-h-[1600px] text-center px-16">
    <!-- B1. Brand Row -->
    <div class="flex justify-between items-center mb-6 w-full">
      <span class="text-[11px] font-bold tracking-wider uppercase text-accent opacity-50">品牌名</span>
      <span class="font-accent italic text-[13px] text-ink-muted tracking-wide">2026 · May</span>
    </div>

    <!-- B2. Hero Title (centered, large) -->
    <div class="mb-8">
      <div class="font-display text-[120px] font-bold leading-[1.0] tracking-hero text-ink">超大标题</div>
      <div class="mt-4 flex items-center justify-center gap-4">
        <div class="h-[2px] w-24 bg-accent/30"></div>
        <div class="w-3 h-3 rounded-full bg-accent"></div>
        <div class="h-[2px] w-24 bg-accent/30"></div>
      </div>
    </div>

    <!-- B3. Content Card (centered) -->
    <div class="bg-white/70 border border-accent/12 rounded-2xl px-12 py-8 max-w-[800px] shadow-[0_4px_24px_rgba(28,10,14,.06)] mb-8">
      <p class="text-[26px] leading-[1.7] text-ink-soft">居中的正文内容...</p>
    </div>

    <!-- B4. Info Row (centered) -->
    <div class="flex gap-12 mb-8 text-center">
      <div>
        <div class="text-[14px] text-ink-muted tracking-widest uppercase mb-1.5 opacity-70">标签</div>
        <div class="text-[28px] font-bold text-accent-deep tracking-wide">值</div>
      </div>
      <div>
        <div class="text-[14px] text-ink-muted tracking-widest uppercase mb-1.5 opacity-70">标签</div>
        <div class="text-[28px] font-bold text-accent-deep tracking-wide">值</div>
      </div>
    </div>

    <!-- B5. CTA -->
    <div class="cta-glow relative bg-gradient-to-r from-accent-deep to-accent rounded-2xl px-10 py-6 text-center overflow-hidden w-full max-w-[800px]">
      <div class="absolute inset-0 opacity-[0.04]" style="background-image:radial-gradient(circle 2px,#fff 50%,transparent);background-size:80px 80px;"></div>
      <div class="relative z-10">
        <div class="text-white text-[34px] font-black tracking-wider">行动召唤</div>
      </div>
    </div>

    <!-- B6. Footer -->
    <div class="footer-wrap relative text-center pt-6 pb-4 mt-8">
      <div class="w-24 h-[1.5px] bg-gradient-to-r from-transparent via-accent/30 to-transparent mx-auto mb-3"></div>
      <div class="font-accent text-[20px] font-semibold text-ink-soft tracking-wider">机构名称</div>
      <div class="text-[14px] text-ink-muted tracking-wider">一句话描述</div>
    </div>
  </div>""",

    "C": """\
  <div class="main relative z-[5] px-[60px] pt-9 pb-6">
    <!-- C1. Brand Row -->
    <div class="flex justify-between items-center mb-4">
      <span class="text-[11px] font-bold tracking-wider uppercase text-accent opacity-50">品牌名</span>
      <span class="font-accent italic text-[13px] text-ink-muted tracking-wide">2026 · May</span>
    </div>

    <!-- C2. Left-Right Split -->
    <div class="grid grid-cols-5 gap-8 mb-4">
      <div class="col-span-2">
        <div class="font-display text-[72px] leading-[1.1] tracking-name text-ink mb-6">标题</div>
        <div class="space-y-4 text-[22px] text-ink-soft leading-relaxed">
          <p>左侧内容...</p>
        </div>
      </div>
      <div class="col-span-3">
        <img class="w-full rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,.12)]" src="{{PHOTO}}">
      </div>
    </div>

    <!-- C3. Tags -->
    <div class="flex gap-2.5 my-3 flex-wrap">
      <span class="px-6 py-2.5 rounded-full text-[19px] font-semibold tracking-tag text-accent bg-accent/8 border border-accent/18">标签一</span>
      <span class="px-6 py-2.5 rounded-full text-[19px] font-semibold tracking-tag text-accent bg-accent/8 border border-accent/18">标签二</span>
    </div>

    <!-- C4. Multi-Card Row -->
    <div class="grid grid-cols-2 gap-4 mb-4">
      <div class="bg-white/70 border border-accent/12 rounded-2xl px-6 py-5 shadow-[0_4px_24px_rgba(28,10,14,.06)]">
        <div class="text-[24px] font-extrabold tracking-wider text-accent-deep mb-2">卡片一</div>
        <p class="text-[22px] leading-[1.55] text-ink-soft">内容...</p>
      </div>
      <div class="bg-white/70 border border-accent/12 rounded-2xl px-6 py-5 shadow-[0_4px_24px_rgba(28,10,14,.06)]">
        <div class="text-[24px] font-extrabold tracking-wider text-accent-deep mb-2">卡片二</div>
        <p class="text-[22px] leading-[1.55] text-ink-soft">内容...</p>
      </div>
    </div>

    <!-- C5. CTA (full width) -->
    <div class="cta-glow relative bg-gradient-to-r from-accent-deep to-accent rounded-2xl px-10 py-6 text-center overflow-hidden mb-3">
      <div class="absolute inset-0 opacity-[0.04]" style="background-image:radial-gradient(circle 2px,#fff 50%,transparent);background-size:80px 80px;"></div>
      <div class="relative z-10">
        <div class="text-white text-[34px] font-black tracking-wider">行动召唤</div>
      </div>
    </div>

    <!-- C6. Footer -->
    <div class="footer-wrap relative text-center pt-5 pb-4">
      <div class="w-24 h-[1.5px] bg-gradient-to-r from-transparent via-accent/30 to-transparent mx-auto mb-3"></div>
      <div class="font-accent text-[20px] font-semibold text-ink-soft tracking-wider">机构名称</div>
    </div>
  </div>""",

    "D": """\
  <div class="main flex flex-col items-center justify-center min-h-[1700px] text-center px-16">
    <!-- D1. Brand Row -->
    <div class="flex justify-between items-center mb-6 w-full">
      <span class="text-[11px] font-bold tracking-wider uppercase text-accent opacity-50">品牌名</span>
      <span class="font-accent italic text-[13px] text-ink-muted tracking-wide">2026 · May</span>
    </div>

    <!-- D2. Full-width Impact Title -->
    <div class="mb-8">
      <div class="font-display text-[130px] font-bold leading-[0.95] tracking-hero text-ink">超大标题</div>
      <div class="font-display text-[140px] font-bold leading-[0.95] tracking-hero title-gradient mt-1">撑满宽度</div>
    </div>

    <!-- D3. Decorative Divider -->
    <div class="flex items-center gap-4 mb-8">
      <div class="h-[2px] w-32 bg-accent/30"></div>
      <div class="w-3 h-3 rounded-full bg-accent"></div>
      <div class="h-[2px] w-32 bg-accent/30"></div>
    </div>

    <!-- D4. One-liner Description -->
    <p class="text-[30px] leading-[1.6] text-ink-soft mb-12 max-w-[800px]">一句话描述...</p>

    <!-- D5. CTA -->
    <div class="cta-glow relative bg-gradient-to-r from-accent-deep to-accent rounded-2xl px-12 py-6 text-center overflow-hidden w-full max-w-[800px] mb-8">
      <div class="absolute inset-0 opacity-[0.04]" style="background-image:radial-gradient(circle 2px,#fff 50%,transparent);background-size:80px 80px;"></div>
      <div class="relative z-10">
        <div class="text-white text-[34px] font-black tracking-wider">行动召唤</div>
      </div>
    </div>

    <!-- D6. Minimal Footer -->
    <div class="footer-wrap relative text-center pt-6 pb-4">
      <div class="w-24 h-[1.5px] bg-gradient-to-r from-transparent via-accent/30 to-transparent mx-auto mb-3"></div>
      <div class="font-accent text-[20px] font-semibold text-ink-soft tracking-wider">机构名称</div>
      <div class="text-[14px] text-ink-muted tracking-wider">一句话描述</div>
    </div>
  </div>""",
}

HEAD_TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=1080, initial-scale=1">
<title>{title}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Noto+Serif+SC:wght@400;600;700;900&family=Noto+Sans+SC:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = {{
  theme: {{
    extend: {{
      colors: {{
        'poster-bg': 'var(--bg)',
        'ink': 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        'ink-muted': 'var(--ink-muted)',
        'accent': 'var(--accent)',
        'accent-deep': 'var(--accent-deep)',
        'gold': 'var(--gold)',
      }},
      fontFamily: {{
        display: ['"Noto Serif SC"', '"DM Serif Display"', 'serif'],
        body: ['"Noto Sans SC"', '"PingFang SC"', 'sans-serif'],
        accent: ['"Cormorant Garamond"', 'serif'],
      }},
      letterSpacing: {{
        hero: '18px', title: '14px', label: '10px',
        name: '12px', tag: '3px', wide: '6px', wider: '8px',
      }},
    }},
  }},
}}
</script>
<style>
:root {{
  --bg: #f6ede7;
  --surface: #faf5f1;
  --ink: #1c0a0e;
  --ink-soft: rgba(26,21,18,.65);
  --ink-muted: rgba(26,21,18,.35);
  --accent: #c45a4e;
  --accent-deep: #9e3328;
  --gold: #b8925e;
}}
.title-gradient {{
  background: linear-gradient(135deg, #d4857a, #c45a4e, #9e3328, #c45a4e, #d4857a);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}}
.poster::after {{
  content:''; position:absolute; inset:0; z-index:100; pointer-events:none;
  background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='.035'/></svg>");
  background-repeat:repeat; background-size:200px 200px;
}}
</style>
</head>
<body>
<div class="poster w-[1080px] h-[1920px] relative overflow-hidden bg-poster-bg">
  <!-- 背景装饰 -->
  <div class="absolute inset-0 z-0" style="background:
    radial-gradient(ellipse 80% 60% at 20% 10%, rgba(196,90,78,.07) 0%, transparent 60%),
    radial-gradient(ellipse 60% 50% at 85% 20%, rgba(184,146,94,.05) 0%, transparent 55%),
    radial-gradient(ellipse 70% 55% at 75% 75%, rgba(196,90,78,.05) 0%, transparent 55%),
    var(--bg);"></div>
  <!-- 顶线 -->
  <div class="absolute top-0 left-0 right-0 h-[5px] z-[101]"
    style="background:linear-gradient(90deg,var(--accent),var(--gold),var(--accent))"></div>
  <!-- 角标装饰 -->
  <div class="absolute top-5 left-5 w-9 h-9 border-t border-l border-accent/18 rounded-tl z-50"></div>
  <div class="absolute bottom-5 right-5 w-9 h-9 border-b border-r border-accent/18 rounded-br z-50"></div>
  <!-- 底线 -->
  <div class="absolute bottom-0 left-0 right-0 h-[3px] z-[101]
    bg-gradient-to-r from-transparent via-accent/20 via-accent to-transparent"></div>
{body}
</div>
</body>
</html>"""


def load_budget(layout, body_lines=None, title_lines=None):
    from space_budget import calc
    return calc(layout, body_lines=body_lines, title_lines=title_lines)


def extract_snippet(layout, snippet_id):
    body = LAYOUT_BODIES.get(layout)
    if not body:
        print(f"错误: 未知布局 {layout}")
        return None
    pattern = rf'(<!-- {re.escape(snippet_id)}\..*?-->)(.*?)(?=<!-- \w\d+\.|$)'
    match = re.search(pattern, body, re.DOTALL)
    if not match:
        print(f"错误: 在布局 {layout} 中未找到组件 {snippet_id}")
        print(f"可用组件: {', '.join(re.findall(r'<!-- (\w\d+)\.', body))}")
        return None
    return (match.group(1) + match.group(2)).strip()


def main():
    parser = argparse.ArgumentParser(description="生成海报 HTML 骨架")
    parser.add_argument("--layout", choices=["A", "B", "C", "D"], default="A",
                        help="布局模式")
    parser.add_argument("--output", "-o", default="poster.html",
                        help="输出文件路径 (默认: poster.html)")
    parser.add_argument("--title", "-t", default="标题",
                        help="海报主标题")
    parser.add_argument("--list", action="store_true",
                        help="列出可用布局模式")
    parser.add_argument("--from-budget", action="store_true",
                        help="配合 space_budget.py 自动计算并注入字号体系")
    parser.add_argument("--body-lines", type=int, default=None,
                        help="正文预计行数 (配合 --from-budget)")
    parser.add_argument("--title-lines", type=int, default=None,
                        help="标题预计行数 (配合 --from-budget)")
    parser.add_argument("--snippet", "-s", default=None,
                        help="输出单个组件 (如 A5, B3, C2)")
    parser.add_argument("--list-snippets", action="store_true",
                        help="列出指定布局的可用组件")

    args = parser.parse_args()

    if args.list:
        print("可用布局模式:")
        for k, v in LAYOUTS.items():
            print(f"  {k}  {v}")
        return

    if args.list_snippets:
        body = LAYOUT_BODIES[args.layout]
        snippets = re.findall(r'<!-- (\w\d+)\.(.*?)-->', body)
        print(f"布局 {args.layout} 可用组件:")
        for sid, name in snippets:
            print(f"  {sid}  {name.strip()}")
        return

    if args.snippet:
        result = extract_snippet(args.layout, args.snippet)
        if result:
            print(result)
        return

    body = LAYOUT_BODIES[args.layout]
    head = HEAD_TEMPLATE

    if args.from_budget:
        budget = load_budget(args.layout, args.body_lines, args.title_lines)
        if budget:
            print(f"📐 空间预算: 标题 {budget['title_px']}px / 正文 {budget['body_px']}px (比例 {budget['ratio']}:1)")
            if not budget["ratio_ok"]:
                print(f"  ⚠️ 标题:正文比例 {budget['ratio']}:1 低于最小值 2.5:1")

    html = head.format(title=args.title, body=body)

    with open(args.output, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"已生成: {args.output} (布局 {args.layout}: {LAYOUTS[args.layout].split(' — ')[0]})")
    print(f"下一步: 替换占位内容，配色方案从 color-strategy.md 选择替换 :root 变量")


if __name__ == "__main__":
    main()
