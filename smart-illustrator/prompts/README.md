# Prompts 目录说明

本目录集中管理 Smart Illustrator 的所有 AI prompt 模板。

## 为什么集中管理？

- **修改方便**：不需要修改代码，直接编辑 Markdown 文件
- **便于迭代**：方便对比不同版本的 prompt 效果
- **易于分享**：其他用户可以轻松自定义 prompt
- **降低门槛**：非技术用户也能调整生成策略

## Prompt 文件列表

当前目录没有独立的可执行 prompt 片段文件。
图像生成规则主要维护在 `styles/` 下的风格文件中。

## 其他 Prompt 在哪里？

- **风格文件**：`styles/style-light.md` 和 `styles/style-dark.md` 定义了核心设计规则
- **品牌配色**：`styles/brand-colors.md` 定义了配色方案

## 如何自定义？

1. **修改风格提示**：编辑 `styles/style-*.md` 中对应的风格模板

修改后无需重启，下次生成时自动生效。

## 注意事项

- ⚠️ 修改 prompt 后建议先测试生成效果
- ⚠️ 不要删除必需的字段，可以调整描述和说明
