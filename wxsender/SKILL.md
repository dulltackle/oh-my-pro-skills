---
name: wxsender
description: 当用户要通过本地桌面版微信给联系人即时发送文本、图片或文件，演练发送流程，查询发送历史、限频、静默时段、安全配置，维护联系人搜索结果位次，或排查微信窗口、依赖、附件、限频导致的发送失败时使用。适用于“发微信给某人”“微信发这个文件”“查最近发送记录”“张三选搜索结果第 2 个”“为什么发送失败”等请求；不用于修改 wxsender 源码、测试或讨论通用 Python/SQLite/桌面自动化问题。
---

# Wxsender

这个 skill 用于操作本地 `wxsender` CLI。主职责是按用户明确要求即时发送微信；次职责是在发送前后查询状态、排障，或维护联系人搜索结果位次。

## 任务分流

- 即时发送文本：`send-text --contact <联系人> --message <文本>`
- 即时发送图片或文件：`send-file --contact <联系人> --file <本地路径>`
- 演练发送：在 `send-text` 或 `send-file` 后追加 `--dry-run`
- 查询与排障：`history`、`status --json`、`config --json`、`contact --list --json`
- 联系人位次管理：`contact --set <联系人> --search-index <N>`

## 调用规则

- 命令默认在 skill 根目录执行，统一入口是 `python3 scripts/wxsender_cli.py ...`。
- 真实发送必须来自用户明确要求；用户要求发送文本、图片或文件时，直接调用 `send-text` 或 `send-file`。
- 联系人、文本内容、附件路径缺失或有歧义时必须先追问；不要猜测联系人、附件路径或消息正文。
- 不得改写、润色、补全用户要发送的消息内容。
- `--force` 只能在用户明确要求强制发送或绕过限频时使用。
- `--search-index <N>` 表示微信搜索后用于选择目标结果的 1-based 搜索结果位次；第 1 个结果执行 0 次 `Down`，第 N 个结果执行 N-1 次 `Down`。
- 未显式传入 `--search-index` 时，CLI 会读取 `contact --set` 保存的位置；联系人未配置时会报错。
- `history` 始终输出 JSON；`status`、`config`、`contact --list` 需要结构化解析时显式使用 `--json`。
- `--dry-run` 只用于流程演练，不用于验证真实 GUI 环境、依赖、窗口状态或限频结果。
- 不要把真实发送自动降级成 `--dry-run`。
- 状态文件默认落在 `./.state/state.db`。

## 参考资料

- 命令映射与即时发送示例：见 [references/command-map.md](references/command-map.md)
- 发送前需要确认的信息与 `dry-run` 语义：见 [references/safety-and-preflight.md](references/safety-and-preflight.md)
- 发送失败与限频排障：见 [references/troubleshooting.md](references/troubleshooting.md)
