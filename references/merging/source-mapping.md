# 来源映射

本次融合以 `creating-skill-pro` 作为正式承载目录，早期 vendor `skill-creator` 副本作为外部来源。

## 顶层文档

| 来源 | 去向 | 处理方式 |
| --- | --- | --- |
| `creating-skill-pro/SKILL.md` | `SKILL.md` | 重写为中文路由层 |
| 早期 vendor `SKILL.md` | `SKILL.md` / `references/` | 提炼评测与迭代能力，下沉到 references 和 scripts |

## references

| 来源 | 去向 | 处理方式 |
| --- | --- | --- |
| 原 `references/patterns.md` | `references/authoring/patterns.md` | 中文重写 |
| 原 `references/workflows.md` | `references/authoring/workflows.md` | 中文重写 |
| 原 `references/output-patterns.md` | `references/authoring/output-patterns.md` | 中文重写 |
| 原 `references/example.md` | `references/authoring/example.md` | 中文重写 |
| vendor `references/schemas.md` | `references/evaluation/schemas.md` | 保留 schema 族，统一中文说明 |

## 脚本与工具链

| 来源 | 去向 | 处理方式 |
| --- | --- | --- |
| 原 `scripts/init_skill.py` | `scripts/init_skill.py` | 保留并升级中文模板 |
| 原 `scripts/quick_validate.py` | `scripts/quick_validate.py` | 保留并扩展校验项 |
| 原 `scripts/package_skill.py` | `scripts/package_skill.py` | 保留并适配新结构 |
| vendor `scripts/utils.py` | `scripts/utils.py` | 迁入并中立化 |
| vendor `scripts/run_eval.py` | `scripts/run_eval.py` | 迁入并移除供应商硬依赖 |
| vendor `scripts/improve_description.py` | `scripts/improve_description.py` | 迁入并改为可配置优化器接口 |
| vendor `scripts/run_loop.py` | `scripts/run_loop.py` | 迁入并改为中立迭代入口 |
| vendor `scripts/aggregate_benchmark.py` | `scripts/aggregate_benchmark.py` | 迁入并保留 |
| vendor `scripts/generate_report.py` | `scripts/generate_report.py` | 迁入并保留 |

## 评测子系统

| 来源 | 去向 | 处理方式 |
| --- | --- | --- |
| vendor `agents/*.md` | `agents/*.md` | 中文重写 |
| vendor `eval-viewer/generate_review.py` | `eval-viewer/generate_review.py` | 迁入并中文化 CLI |
| vendor `eval-viewer/viewer.html` | `eval-viewer/viewer.html` | 迁入，保持可用 |

## 许可证与舍弃项

| 来源 | 处理方式 | 说明 |
| --- | --- | --- |
| vendor `LICENSE.txt` | 保留为 `LICENSE.txt` | Apache 2.0 许可证文本 |
| vendor `README.md` | 舍弃 | 不属于正式 skill 内容 |
| vendor `THIRD_PARTY_NOTICES.md` | 舍弃 | 当前最终交付未分发其中列出的第三方二进制或运行时产物 |
| vendor 整体目录 | 最终删除 | 待迁移、校验与归属完成后移除 |
