# skills 仓库协作说明

## 仓库结构

- 根仓库 `oh-my-pro-skills` 直接管理所有技能目录内容。
- `brainstorming-pro` 和 `creating-skill-pro` 额外保留独立 GitHub 仓库，通过 `git subtree` 同步。
- 其他目录只在根仓库维护，不单独发布。

## 日常使用规范

### 1. 根仓库开发与推送

- 日常修改统一在根仓库完成。
- 提交后，推送根仓库：

```bash
git push origin main
```

### 2. 发布独立目录

当需要同步独立仓库时，在根仓库执行：

发布 `brainstorming-pro`：

```bash
git subtree push --prefix=brainstorming-pro brainstorming-pro-origin main
```

发布 `creating-skill-pro`：

```bash
git subtree push --prefix=creating-skill-pro creating-skill-pro-origin main
```

### 3. 拉回独立仓库变更

如果独立仓库先发生了更新，先拉回根仓库，再继续开发：

拉回 `brainstorming-pro`：

```bash
git subtree pull --prefix=brainstorming-pro brainstorming-pro-origin main
```

拉回 `creating-skill-pro`：

```bash
git subtree pull --prefix=creating-skill-pro creating-skill-pro-origin main
```

## 禁止事项

- 不要重新把任何技能目录改回 `git submodule`。
- 不要在技能子目录里重新初始化 `.git`。
- 不要进入 `brainstorming-pro` 或 `creating-skill-pro` 目录单独作为嵌套仓库提交；应始终在根仓库提交，再按需执行 `git subtree push`。

## 推荐流程

1. 在根仓库修改文件。
2. 在根仓库提交。
3. 执行 `git push origin main`。
4. 如果本次改动需要同步独立仓库，再执行对应的 `git subtree push`。
