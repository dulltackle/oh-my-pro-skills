#!/usr/bin/env python3
"""healthcheck.py - 知识库健康检查脚本

用法: python3 healthcheck.py <kb_root_dir>

执行自动化检查项，输出结构化报告到 stdout 和 logs/healthcheck.log。

评分规则从 references/lint-rules.yaml 读取（单一数据源）。
报告结构遵循 references/maintenance.md 的报告格式定义。
"""

import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    import yaml
except ImportError:
    print("❌ 需要 PyYAML: pip install pyyaml", file=sys.stderr)
    sys.exit(1)

SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_ROOT = SCRIPT_DIR.parent.parent
LINT_RULES_PATH = SKILL_ROOT / 'references' / 'lint-rules.yaml'


def load_rules() -> dict:
    if not LINT_RULES_PATH.exists():
        print(f"❌ 评分规则文件不存在: {LINT_RULES_PATH}", file=sys.stderr)
        sys.exit(1)
    with open(LINT_RULES_PATH, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)


def render_score(score: int, total_slots: int, star_full: str, star_empty: str) -> str:
    filled = max(0, min(score, total_slots))
    empty = total_slots - filled
    return star_full * filled + star_empty * empty


def collect_md_files(directory: Path) -> list[Path]:
    if not directory.exists():
        return []
    return sorted(directory.rglob('*.md'))


def collect_md_files_glob(directory: Path, pattern: str) -> list[Path]:
    if not directory.exists():
        return []
    return sorted(directory.glob(pattern))


def find_markdown_links(content: str) -> list[str]:
    return re.findall(r'\[[^\]]*\]\(([^)#]+)', content)


def find_wikilinks(content: str) -> list[str]:
    return re.findall(r'\[\[([^\]]+)', content)


def check_consistency(wiki_dir: Path, rules_dim: dict, notes: list[str]) -> tuple[int, int]:
    score = rules_dim['max_score']
    issues = 0

    glossary = wiki_dir / 'glossary.md'
    if glossary.exists():
        notes.append("✅ 术语表存在")
    else:
        for ded in rules_dim['deductions']:
            if ded['check'] == 'glossary_missing':
                score -= ded['penalty']
                break
        notes.append("⚠️ 术语表不存在 (建议创建)")
        issues += 1

    empty_pages = [p for p in collect_md_files(wiki_dir) if p.stat().st_size == 0]
    if empty_pages:
        count = len(empty_pages)
        for ded in rules_dim['deductions']:
            if ded['check'] == 'empty_pages' and 'penalty_per_item' in ded:
                score -= ded['penalty_per_item'] * count
                break
        notes.append(f"🔴 发现 {count} 个空文件")
        issues += 1
    else:
        notes.append("✅ 无空文件")

    min_score = rules_dim.get('min_score', 1)
    return max(min_score, score), issues


def check_completeness(wiki_dir: Path, raw_dir: Path, rules_dim: dict, notes: list[str]) -> tuple[int, int]:
    score = rules_dim['max_score']
    issues = 0

    index = wiki_dir / 'index.md'
    if index.exists():
        notes.append("✅ 总索引存在 (index.md)")

        broken_links = 0
        for md in collect_md_files(wiki_dir):
            try:
                content = md.read_text(encoding='utf-8', errors='ignore')
            except Exception:
                continue

            for link in find_markdown_links(content):
                if link.startswith(('http://', 'https://')):
                    continue
                target = (md.parent / link).resolve()
                if not target.exists():
                    broken_links += 1

            for concept in find_wikilinks(content):
                found = False
                for subdir in ['concepts', 'topics']:
                    candidate = wiki_dir / subdir / f"{concept}.md"
                    if candidate.exists():
                        found = True
                        break
                if not found:
                    broken_links += 1

        if broken_links > 0:
            for ded in rules_dim['deductions']:
                if ded['check'] == 'broken_links':
                    score -= ded['penalty']
                    break
            notes.append(f"⚠️ 约 {broken_links} 个可能悬空的内部链接")
            issues += 1
        else:
            notes.append("✅ 未发现明显悬空链接")
    else:
        for ded in rules_dim['deductions']:
            if ded['check'] == 'index_missing':
                score -= ded['penalty']
                break
        notes.append("🔴 总索引不存在 (index.md)")
        issues += 1

    articles_dir = raw_dir / 'articles'
    summaries_dir = wiki_dir / 'summaries'
    if articles_dir.exists() and summaries_dir.exists():
        raw_count = len(collect_md_files_glob(articles_dir, '*.md'))
        sum_count = len(collect_md_files_glob(summaries_dir, '*.md'))
        if raw_count > 0:
            coverage_pct = sum_count * 100 // raw_count
            if coverage_pct < 50:
                for ded in rules_dim['deductions']:
                    if ded['check'] == 'summary_coverage_low':
                        score -= ded['penalty']
                        break
                notes.append(f"⚠️ 摘要覆盖率低: {sum_count}/{raw_count} ({coverage_pct}%)")
                issues += 1
            else:
                notes.append(f"✅ 摘要覆盖率: {sum_count}/{raw_count} ({coverage_pct}%)")

    min_score = rules_dim.get('min_score', 1)
    return max(min_score, score), issues


def check_structure(wiki_dir: Path, rules_dim: dict, notes: list[str]) -> tuple[int, int]:
    score = rules_dim['max_score']
    issues = 0

    large_threshold = 200
    for ded in rules_dim['deductions']:
        if ded['check'] == 'large_pages' and 'threshold' in ded:
            large_threshold = ded['threshold']
            break

    large_pages = 0
    for md in collect_md_files(wiki_dir):
        if 'links' in md.parts:
            continue
        try:
            lines = md.read_text(encoding='utf-8', errors='ignore').count('\n')
        except Exception:
            continue
        if lines > large_threshold:
            large_pages += 1

    if large_pages > 0:
        for ded in rules_dim['deductions']:
            if ded['check'] == 'large_pages':
                score -= ded['penalty']
                break
        notes.append(f"⚠️ {large_pages} 个页面超过 {large_threshold} 行")
        issues += 1
    else:
        notes.append(f"✅ 所有页面大小合理 (< {large_threshold} 行)")

    orphan_count = 0
    index = wiki_dir / 'index.md'
    if index.exists():
        try:
            index_content = index.read_text(encoding='utf-8', errors='ignore')
        except Exception:
            index_content = ''
        for md in collect_md_files(wiki_dir):
            if md.name == 'index.md' or 'links' in md.parts:
                continue
            if md.name not in index_content:
                orphan_count += 1

    if orphan_count > 0:
        notes.append(f"ℹ️ 约 {orphan_count} 个页面未在 index.md 中引用（可能是正常子页面）")
        issues += 1
    else:
        notes.append("✅ 所有关键页面已在索引中")

    min_score = rules_dim.get('min_score', 1)
    return max(min_score, score), issues


def check_freshness(wiki_dir: Path, raw_dir: Path, rules_dim: dict, notes: list[str]) -> tuple[int, int]:
    score = rules_dim['max_score']
    issues = 0

    threshold_14 = 14
    threshold_30 = 30
    for ded in rules_dim['deductions']:
        if ded['check'] == 'stale_days':
            if ded.get('threshold', 0) == 14:
                threshold_14 = 14
            elif ded.get('threshold', 0) == 30:
                threshold_30 = 30

    newest_mtime = 0
    newest_file = None
    for md in collect_md_files(wiki_dir):
        if 'links' in md.parts:
            continue
        mt = md.stat().st_mtime
        if mt > newest_mtime:
            newest_mtime = mt
            newest_file = md

    if newest_file:
        days_since = int(time.time() - newest_mtime) // 86400
        if days_since > threshold_30:
            for ded in rules_dim['deductions']:
                if ded['check'] == 'stale_days' and ded.get('threshold') == 30:
                    score -= ded['penalty']
                    break
            notes.append(f"🔴 Wiki 已 {days_since} 天未更新")
            issues += 1
        elif days_since > threshold_14:
            for ded in rules_dim['deductions']:
                if ded['check'] == 'stale_days' and ded.get('threshold') == 14:
                    score -= ded['penalty']
                    break
            notes.append(f"⚠️ Wiki 已 {days_since} 天未更新")
        else:
            notes.append(f"✅ 最近更新: {days_since} 天前")

    pending_raw = 0
    meta_dir = raw_dir / 'meta'
    if meta_dir.exists():
        for meta in collect_md_files_glob(meta_dir, '*.md'):
            try:
                content = meta.read_text(encoding='utf-8', errors='ignore')
                if 'status: pending' in content:
                    pending_raw += 1
            except Exception:
                continue

    if pending_raw > 0:
        for ded in rules_dim['deductions']:
            if ded['check'] == 'pending_raw':
                score -= ded['penalty']
                break
        notes.append(f"⚠️ 有 {pending_raw} 篇原始素材待编译")
    else:
        notes.append("✅ 所有原始素材已处理")

    min_score = rules_dim.get('min_score', 1)
    return max(min_score, score), issues


def check_coverage(wiki_dir: Path, rules_dim: dict, notes: list[str]) -> tuple[int, int]:
    score = rules_dim['max_score']
    issues = 0

    concepts_dir = wiki_dir / 'concepts'
    topics_dir = wiki_dir / 'topics'

    if concepts_dir.exists() and topics_dir.exists():
        concept_count = len(collect_md_files_glob(concepts_dir, '*.md'))
        topic_count = len(collect_md_files_glob(topics_dir, '*.md'))
        if concept_count == 0 and topic_count == 0:
            for ded in rules_dim['deductions']:
                if ded['check'] == 'concepts_and_topics_empty':
                    score -= ded['penalty']
                    break
            notes.append("⚠️ 概念页和专题页均为空，知识库可能未开始编译")
        elif topic_count == 0:
            for ded in rules_dim['deductions']:
                if ded['check'] == 'no_topics':
                    score -= ded['penalty']
                    break
            notes.append("ℹ️ 无专题页，跨文档综合内容可能缺失")
        else:
            notes.append(f"✅ 概念页: {concept_count}, 专题页: {topic_count}")
    else:
        for ded in rules_dim['deductions']:
            if ded['check'] == 'coverage_dirs_missing':
                score -= ded['penalty']
                break
        notes.append("⚠️ 概念或专题目录不存在")
        issues += 1

    min_score = rules_dim.get('min_score', 1)
    return max(min_score, score), issues


CHECK_FUNCS = {
    'consistency': check_consistency,
    'completeness': check_completeness,
    'structure': check_structure,
    'freshness': check_freshness,
    'coverage': check_coverage,
}


def main():
    if len(sys.argv) < 2:
        print("用法: python3 healthcheck.py <知识库目录>", file=sys.stderr)
        sys.exit(1)

    kb_root = Path(sys.argv[1]).resolve()
    wiki_dir = kb_root / 'wiki'
    raw_dir = kb_root / 'raw'
    log_dir = kb_root / 'logs'

    if not wiki_dir.exists():
        print(f"❌ wiki/ 目录不存在: {wiki_dir}", file=sys.stderr)
        sys.exit(1)

    log_dir.mkdir(parents=True, exist_ok=True)
    rules = load_rules()
    dimensions = rules['dimensions']
    render_cfg = rules['render']
    severity = render_cfg['severity']

    wiki_pages = len(collect_md_files(wiki_dir))
    raw_files = len([p for p in collect_md_files(raw_dir) if p.suffix in ('.md', '.pdf', '.txt')])

    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    scores = {}
    all_notes = {}
    critical = 0
    warning = 0
    info = 0

    for dim_key, check_fn in CHECK_FUNCS.items():
        dim_rules = dimensions[dim_key]
        notes = []
        args = [wiki_dir, dim_rules, notes]
        if dim_key in ('completeness', 'freshness'):
            args.insert(1, raw_dir)
        score, dim_issues = check_fn(*args)
        scores[dim_key] = score
        all_notes[dim_key] = notes
        if dim_issues > 0:
            warning += dim_issues

    total_issues = critical + warning + info

    print("# Wiki Lint 报告")
    print(f"- 时间: {timestamp} · 页面总数: {wiki_pages} · Raw 总数: {raw_files}")
    print()
    print("## 基本信息")
    print(f"- Wiki 页面总数: {wiki_pages}")
    print(f"- Raw 素材总数: {raw_files}")
    print()
    print("## 评分")
    print("| 维度 | 评分 | 说明 |")
    print("|------|------|------|")

    for dim_key in dimensions:
        dim = dimensions[dim_key]
        name = dim['name']
        score = scores[dim_key]
        rendered = render_score(
            score,
            render_cfg['total_slots'],
            render_cfg['star_full'],
            render_cfg['star_empty'],
        )
        notes_str = '  '.join(all_notes[dim_key])
        padded_name = f"{name:　<3}"
        print(f"| {padded_name} | {rendered} | {notes_str} |")

    print()
    print("## 问题汇总")
    print(f"- {severity['critical']} 严重: {critical}")
    print(f"- {severity['warning']} 警告: {warning}")
    print(f"- {severity['info']}  提示: {info}")
    print(f"- **总计: {total_issues}**")

    logfile = log_dir / 'healthcheck.log'
    with open(logfile, 'a', encoding='utf-8') as f:
        f.write("---\n")
        f.write(f"timestamp: {timestamp}\n")
        f.write(f"critical: {critical}\n")
        f.write(f"warning: {warning}\n")
        f.write(f"info: {info}\n")
        scores_str = ' '.join(f"{k}={v}" for k, v in scores.items())
        f.write(f"scores: {scores_str}\n")

    print()
    print(f"📋 报告已追加到: {logfile}")


if __name__ == '__main__':
    main()
