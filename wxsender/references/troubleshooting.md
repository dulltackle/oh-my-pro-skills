# 常见发送失败排查

排障对象是一轮真实发送动作。排查时优先看 `history` 的最近失败记录，再结合 `status --json` 和 `config --json` 判断原因。

注意：真实发送、`--dry-run`、`--force` 和 `search-index` 的使用边界以 `references/safety-and-preflight.md` 为准。

## 1. 提示缺少依赖

典型表现：

- `发送失败(preflight): 缺少依赖: xclip`
- `发送失败(preflight): 缺少依赖: xdotool`

排查顺序：

1. 确认系统是 Linux 图形桌面环境
2. 确认 `xclip` 已安装
3. 确认 `xdotool` 已安装
4. 重新执行一次真实发送

## 2. 找不到微信窗口

典型表现：

- `未找到窗口: 微信`
- `发送失败(preflight): 未找到窗口: 微信`

排查顺序：

1. 用 `history` 看最近失败记录中的 `error_summary`
2. 确认桌面版微信已经启动并登录
3. 确认微信处于当前图形会话
4. 确认窗口标题仍包含“微信”

## 3. 窗口激活失败或搜索中断

典型表现：

- `发送失败(activate_window): 窗口激活失败`
- `发送失败(search): 搜索步骤窗口丢失`

排查顺序：

1. 用 `history` 查看最近失败记录
2. 确认微信没有被最小化到不可激活状态
3. 确认当前桌面允许 `xdotool` 激活窗口
4. 避免在发送过程中切走焦点窗口

## 4. 被限频拒绝

典型表现：

- `限频拒绝: 静默时段`
- `限频拒绝: 已达每小时上限`
- `限频拒绝: 距上次发送间隔不足`
- `限频拒绝: 失败冷却中(...)`

排查顺序：

1. 执行 `python3 scripts/wxsender_cli.py status --json`
2. 执行 `python3 scripts/wxsender_cli.py config --json`
3. 如需判断失败冷却，再执行 `python3 scripts/wxsender_cli.py history`

如何判断：

- 静默时段：看 `status --json` 的 `quiet` 和 `config --json` 的 `quiet_hours`
- 小时上限：看 `hour_sent`、`hour_limit` 和 `max_per_hour`
- 最小发送间隔：看 `last_send` 和 `min_interval_sec`
- 失败冷却：看 `last_fail` 和 `fail_cooldown_sec`

## 5. 附件相关错误

典型表现：

- `附件文件不存在`
- 历史记录中 `payload_type` 为 `attachment`，但 `content` 路径不是预期文件

排查顺序：

1. 确认传入的是存在的本地路径
2. 优先使用绝对路径
3. 用 `history` 查看最近记录中的 `content`

## 6. 发送动作失败

典型表现：

- `发送失败(send): 未完成发送动作`
- `clipboard`、`paste` 或 `key` 步骤失败

排查顺序：

1. 用 `history` 查看最近失败记录中的 `error_summary`
2. 检查微信窗口是否仍然处于前台
3. 检查桌面环境是否允许剪贴板与按键注入
4. 必要时重新执行一次真实发送收集最新失败信息
