# 命令映射

所有命令默认在 skill 根目录执行，统一入口：

```bash
python3 scripts/wxsender_cli.py <子命令> [参数]
```

## 即时发送

- 给联系人发送文本：
  ```bash
  python3 scripts/wxsender_cli.py send-text --contact 张三 --message "今晚 8 点到"
  ```
- 显式指定搜索结果位次：
  ```bash
  python3 scripts/wxsender_cli.py send-text --contact 张三 --message "今晚 8 点到" --search-index 2
  ```
- 给联系人发送附件：
  ```bash
  python3 scripts/wxsender_cli.py send-file --contact 张三 --file /abs/path/photo.png
  ```
- 演练一次发送流程：
  ```bash
  python3 scripts/wxsender_cli.py send-text --contact 王五 --message "明天见" --dry-run
  ```
- 忽略限频强制发送：
  ```bash
  python3 scripts/wxsender_cli.py send-text --contact 张三 --message "紧急通知" --force
  ```

说明：

- 不再维护待发送消息库存，也不再暴露消息 ID 发送入口。
- `--search-index <N>` 表示微信搜索后用于选择目标结果的 1-based 搜索结果位次；第 1 个结果执行 0 次 `Down`，第 N 个结果执行 N-1 次 `Down`。
- 未传 `--search-index` 时，会读取 `contact --set` 保存的联系人搜索结果位次。
- 附件路径必须存在，CLI 会转换为绝对路径写入发送历史。
- `--force` 只能在用户明确要求强制发送或绕过限频时使用。

## 查询发送状态

支持 JSON 的查询命令优先用 JSON，便于 Agent 解析。

- 查看发送历史：
  ```bash
  python3 scripts/wxsender_cli.py history
  python3 scripts/wxsender_cli.py history --contact 张三 --limit 20
  ```
- 查看限频状态：
  ```bash
  python3 scripts/wxsender_cli.py status --json
  ```
- 查看安全配置：
  ```bash
  python3 scripts/wxsender_cli.py config --json
  ```
- 查看联系人搜索结果位次：
  ```bash
  python3 scripts/wxsender_cli.py contact --list --json
  ```

`history` 始终输出 JSON，字段为 `id`、`contact`、`payload_type`、`content`、`status`、`error_summary`、`created_at`。不支持 `--json` 参数。

`status --json` 输出字段为 `hour_sent`、`hour_limit`、`quiet`、`last_send`、`last_fail`。

`contact --list --json` 输出数组，每项字段为 `contact`、`search_index`、`updated_at`。无联系人时输出 `[]`。

## 管理联系人和安全配置

- 设置联系人搜索结果位次：
  ```bash
  python3 scripts/wxsender_cli.py contact --set 张三 --search-index 2
  ```
- 调整安全配置：
  ```bash
  python3 scripts/wxsender_cli.py config --set max_per_hour=3
  python3 scripts/wxsender_cli.py config --set min_interval_sec=120
  python3 scripts/wxsender_cli.py config --set quiet_hours='[23,7]'
  python3 scripts/wxsender_cli.py config --set fail_cooldown_sec=600
  ```

## 结果解读

- 退出码 `0`：成功
- 退出码 `1`：参数或业务校验错误
- 退出码 `2`：限频拒绝，或 CLI 用法错误
- 退出码 `3`：发送阶段失败
