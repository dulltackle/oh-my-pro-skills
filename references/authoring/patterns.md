# 结构模式

本文件用于选择 skill 的组织方式，重点是“什么内容留在顶层，什么内容下沉”。

## 模式 1：轻顶层 + 重引用

适用于技能支持多个子流程、多个框架或多个工具链。

结构：

```text
skill/
├── SKILL.md
└── references/
    ├── authoring/...
    ├── evaluation/...
    └── triggering/...
```

原则：

- 顶层只做路由
- 变体差异下沉
- 让调用方只读取当前任务真正需要的文件

## 模式 2：说明 + 脚本双轨

适用于一部分逻辑需要自然语言判断，另一部分逻辑需要确定性执行。

结构：

```text
skill/
├── SKILL.md
├── references/
└── scripts/
```

原则：

- 解释“为什么”放文档
- 重复、易错、机械性的部分放脚本
- 在顶层明确何时调用脚本，避免脚本存在但不被使用

## 模式 3：评测子系统外挂

适用于 skill 本身负责创建/改造其它 skill，同时需要 benchmark、grading、viewer 等工具。

结构：

```text
skill/
├── SKILL.md
├── scripts/
├── agents/
└── eval-viewer/
```

原则：

- 顶层只声明评测能力存在
- grading / comparator / analyzer 放独立说明
- viewer 是可选输出层，不应成为主流程硬依赖

## 模式 4：多来源融合

适用于把两份 skill 融成一份正式 skill。

推荐顺序：

1. 先比较定位和边界
2. 决定骨架继承还是能力注入
3. 统一命名、术语和目录
4. 再迁移脚本和 references
5. 最后做迁移清单和许可证收尾

避免：

- 直接拼接两个 `SKILL.md`
- 把所有脚本原样复制后再慢慢清理
- 忽略外部来源的许可证与 notice
