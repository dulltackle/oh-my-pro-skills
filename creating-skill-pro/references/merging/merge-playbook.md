# 融合指南

本文件用于把两份 skill 融成一个正式 skill。

## 第一步：比较现状

至少回答以下问题：

- 两份 skill 各自解决什么问题
- 重叠范围在哪里
- 哪一份更适合做最终骨架
- 哪些脚本、references、assets 具备复用价值
- 是否存在许可证、命名或术语冲突

## 第二步：选择融合策略

### 骨架继承

适用：

- 一份 skill 的顶层结构明显更清晰
- 另一份主要提供工具链或补充能力

做法：

- 保留主骨架的目录和入口
- 把另一份的脚本、agents、viewer、schema 迁进来
- 统一命名和路径

### 能力注入

适用：

- 现有 skill 基础稳定
- 只需引入新的 eval、benchmark、description 优化能力

做法：

- 尽量不改 skill 标识和定位
- 只新增必要的 `references/`、`scripts/`、`agents/`
- 在顶层增加新的任务入口和读取指引

### 双层拆分

适用：

- 两份 skill 的职责都比较重
- 完全合并会导致顶层失控

做法：

- 保留一个主 skill
- 把另一个改造成内部资料或工具子系统
- 在顶层只暴露主 skill 的统一入口

## 第三步：统一术语

至少统一以下项目：

- 主体名称：Agent / 编码代理
- 任务名称：eval、baseline、benchmark、grader、viewer
- 目录名称：`references/`、`scripts/`、`agents/`
- 配置和数据文件名：`evals.json`、`grading.json`、`benchmark.json`

## 第四步：整理迁移清单

在删除旧副本前，用一份简短清单记录每个文件属于：

- 直接保留
- 重写后迁入
- 舍弃

这份清单应与许可证处理一起完成，不要求再维护单独的映射文档。
