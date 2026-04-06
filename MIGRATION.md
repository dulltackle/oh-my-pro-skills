# skills 仓库迁移说明

## 当前结构

- 根仓库 `oh-my-pro-skills` 现在直接跟踪所有技能目录内容，GitHub 上会直接显示文件，不再显示为 submodule 指针。
- `brainstorming-pro` 和 `creating-skill-pro` 保留独立发布能力，通过 `git subtree` 与各自仓库同步。
- 其他目录只在根仓库维护，不再单独发布。

## 为什么弃用 submodule

- 根仓库在 GitHub 上只能看到子模块指针，不能直接浏览子目录文件。
- 日常更新需要分别处理父仓库和子模块，维护成本高。
- 当前目标是“根仓库可直接浏览全部内容”，`subtree` 更适合。

## 已配置的独立远程

- `brainstorming-pro-origin` -> `git@github.com:dulltackle/brainstorming-pro.git`
- `creating-skill-pro-origin` -> `git@github.com:dulltackle/creating-skill-pro.git`

说明：

- `creating-skill-pro` 的 GitHub 仓库已存在。
- `brainstorming-pro` 的远程地址已经配置，但目标 GitHub 仓库还未创建；首次推送前需要先在 GitHub 上创建 `dulltackle/brainstorming-pro`。

## 日常操作

根仓库正常推送：

```bash
git push origin main
```

发布 `brainstorming-pro`：

```bash
git subtree push --prefix=brainstorming-pro brainstorming-pro-origin main
```

拉回 `brainstorming-pro` 远程变更：

```bash
git subtree pull --prefix=brainstorming-pro brainstorming-pro-origin main
```

发布 `creating-skill-pro`：

```bash
git subtree push --prefix=creating-skill-pro creating-skill-pro-origin main
```

拉回 `creating-skill-pro` 远程变更：

```bash
git subtree pull --prefix=creating-skill-pro creating-skill-pro-origin main
```

## 常见误操作

- 不要重新执行 `git submodule add`，否则根仓库会再次退回 gitlink 结构。
- 不要在子目录里重新初始化 `.git`，否则会变成嵌套仓库。
- 如果只想更新独立仓库，不要直接进入子目录单独提交；应在根仓库提交后，再执行对应的 `git subtree push`。
- 如果独立仓库先有变更，先执行对应的 `git subtree pull`，再继续在根仓库开发，避免历史分叉。

## 本次迁移校验

- 已确认根仓库索引中不存在 `160000` 类型条目。
- 已确认各技能子目录下不存在残留 `.git`。
- 已在本地临时裸仓库上完成 `brainstorming-pro` 和 `creating-skill-pro` 的 `subtree push/pull` smoke test。
