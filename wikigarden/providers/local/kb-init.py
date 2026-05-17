#!/usr/bin/env python3
"""kb-init.py — 知识库项目初始化脚本（local 后端专属）

用法: python3 kb-init.py <数据目录> <名称>

示例:
    python3 kb-init.py ~/kb/my-project "AI落地关键技术"

依赖: python3, PyYAML（无 PyYAML 时自动降级为直接写入）

此脚本:
  1. 生成项目配置并注册到 ~/.kb/<slug>.conf.yaml
  2. 创建本地数据目录结构
  3. 输出初始化摘要
"""

import os
import sys
import re
from datetime import date
from pathlib import Path


def slugify(text: str) -> str:
    result = re.sub(r'[^a-zA-Z0-9]', '-', text)
    result = re.sub(r'-+', '-', result).strip('-').lower()
    if not result or result == '-':
        result = f"kb-{hash(text) & 0xFFFFFFFF:08x}"
    return result


def generate_config(conf_path: Path, name: str, data_dir: str, today: str):
    try:
        import yaml
        config = {
            'name': name,
            'description': '',
            'created_at': today,
            'provider': 'local',
            'provider_config': {
                'root': os.path.expanduser(data_dir)
            }
        }
        with open(conf_path, 'w', encoding='utf-8') as f:
            yaml.dump(config, f, allow_unicode=True, default_flow_style=False, sort_keys=False)
        print(f"✅ 配置已注册: {conf_path}")
    except ImportError:
        with open(conf_path, 'w', encoding='utf-8') as f:
            f.write(f"name: {name}\n")
            f.write('description: ""\n')
            f.write(f"created_at: {today}\n")
            f.write("provider: local\n")
            f.write("provider_config:\n")
            f.write(f"  root: {data_dir}\n")
        print(f"✅ 配置已注册(降级模式): {conf_path}")


def create_dirs(data_dir: Path):
    subdirs = [
        'raw/articles', 'raw/papers', 'raw/images',
        'raw/repos', 'raw/datasets', 'raw/manual', 'raw/meta',
        'wiki/summaries', 'wiki/concepts', 'wiki/topics',
        'wiki/links', 'wiki/comparisons',
        'output/reports', 'output/slides', 'output/visualizations',
        'logs',
    ]
    for d in subdirs:
        (data_dir / d).mkdir(parents=True, exist_ok=True)

    for name in ['index.md', 'log.md', 'glossary.md']:
        (data_dir / 'wiki' / name).touch(exist_ok=True)

    print(f"✅ 本地数据目录已创建: {data_dir}")


def main():
    if len(sys.argv) < 3:
        print("用法: python3 kb-init.py <数据目录> <名称>", file=sys.stderr)
        sys.exit(1)

    data_dir = os.path.expanduser(sys.argv[1])
    name = sys.argv[2]

    slug = slugify(name)
    conf_dir = Path.home() / '.kb'
    conf_dir.mkdir(parents=True, exist_ok=True)
    conf_path = conf_dir / f"{slug}.conf.yaml"

    if conf_path.exists():
        confirm = input(f"⚠️ 配置已存在: {conf_path}\n是否覆盖？(y/N) ").strip().lower()
        if confirm != 'y':
            print("已取消")
            return

    today = date.today().isoformat()
    generate_config(conf_path, name, data_dir, today)
    create_dirs(Path(data_dir))

    print()
    print("📦 知识库初始化完成")
    print()
    print(f"   项目:     {name}")
    print("   后端:     local")
    print(f"   配置:     {conf_path}")
    print(f"   数据:     {data_dir}")
    print()
    print("   下一步:")
    print("   → 开始采集素材 (Ingest 阶段)")


if __name__ == '__main__':
    main()
