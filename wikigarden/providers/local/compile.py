#!/usr/bin/env python3
"""compile.py - 知识编译辅助脚本

用法: python3 compile.py <kb_root_dir> [mode]
mode: full | incremental (默认 incremental)

此脚本扫描 raw/ 目录，输出编译计划，不自动执行 LLM 编译。
"""

import sys
from pathlib import Path


def main():
    if len(sys.argv) < 2:
        print("用法: python3 compile.py <知识库目录> [full|incremental]", file=sys.stderr)
        sys.exit(1)

    kb_root = Path(sys.argv[1]).resolve()
    mode = sys.argv[2] if len(sys.argv) > 2 else 'incremental'

    raw_dir = kb_root / 'raw'
    wiki_dir = kb_root / 'wiki'

    if not raw_dir.exists():
        print(f"❌ raw/ 目录不存在: {raw_dir}", file=sys.stderr)
        sys.exit(1)

    for d in ['summaries', 'concepts', 'topics', 'links']:
        (wiki_dir / d).mkdir(parents=True, exist_ok=True)

    print("📚 知识库编译分析")
    print(f"   根目录: {kb_root}")
    print(f"   模式: {mode}")
    print()

    pending = 0
    processed = 0
    total = 0
    pending_items = []

    meta_dir = raw_dir / 'meta'
    if meta_dir.exists():
        for meta in sorted(meta_dir.glob('*.md')):
            try:
                content = meta.read_text(encoding='utf-8', errors='ignore')
            except Exception:
                continue

            item_id = ''
            item_type = ''
            item_title = '无标题'
            for line in content.splitlines():
                if line.startswith('- id:') and not item_id:
                    item_id = line[len('- id:'):].strip()
                elif line.startswith('- type:') and not item_type:
                    item_type = line[len('- type:'):].strip()
                elif line.startswith('- title:') and item_title == '无标题':
                    item_title = line[len('- title:'):].strip()

            total += 1
            is_processed = 'status: processed' in content
            if is_processed:
                processed += 1
                if mode == 'full':
                    pending_items.append((item_id, item_type, item_title))
            else:
                pending += 1
                pending_items.append((item_id, item_type, item_title))

    articles_dir = raw_dir / 'articles'
    if articles_dir.exists():
        for article in sorted(articles_dir.glob('*.md')):
            base_stem = article.stem
            meta_file = meta_dir / f"{base_stem}.md"
            if not meta_file.exists():
                total += 1
                pending += 1
                pending_items.append((base_stem, 'article', article.stem))

    wiki_pages = 0
    for md in wiki_dir.rglob('*.md'):
        if 'links' not in md.parts:
            wiki_pages += 1

    print("📊 当前状态:")
    print(f"   Raw 素材: {total} 篇 (待处理: {pending}, 已处理: {processed})")
    print(f"   Wiki 页面: {wiki_pages} 个")
    print()

    if mode == 'incremental' and pending == 0:
        print("✅ 没有待处理的素材，wiki 已是最新。")
        return

    print("📋 待处理素材列表:")
    print()
    print(f"{'ID':<40} {'类型':<10} {'标题'}")
    print(f"{'-' * 40} {'-' * 10} {'-' * 20}")
    for item_id, item_type, item_title in pending_items:
        print(f"{item_id or '?':<40} {item_type or '?':<10} {item_title}")

    print()
    print("💡 提示: 请基于以上列表，按 references/compile.md 的流程执行 LLM 编译")
    print("   建议先从 summaries 开始，再提炼 concepts，最后组织 topics")

    if pending > 0:
        print()
        print("## 编译计划（待 LLM 分析填充）")
        print(f"- 素材总数: {total} 篇 (新增 pending: {pending})")
        print("- 核心主题: [待分析]")
        print("- 关键概念: [待分析]")
        print("- 受影响的专题页: [待分析]")
        print("- 预计改动: ~? 个 Wiki 页面")


if __name__ == '__main__':
    main()
