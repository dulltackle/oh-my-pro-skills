# 测试说明

## 层级

- `tests/unit`：纯函数与共享模块测试，包括参数解析、请求构建、响应提取、错误分类、prompt 构建与 Markdown 分析。
- `tests/integration`：基于本地模拟 HTTP 服务的 CLI 级测试，覆盖统一入口、单图生成和批量生成流程。
- `tests/live`：真实 API 冒烟测试，用于检查 Tuzi 的线上兼容性。

## 命令

- `npm test`：运行离线测试（`unit` + `integration`）。
- `npm run typecheck`：运行 TypeScript 类型检查。
- `npm run test:live`：运行真实 API 冒烟测试。
- `npm run test:all`：按顺序运行离线测试和真实 API 冒烟测试。

## 真实测试所需密钥

- `TUZI_API_KEY`

如果缺少密钥，`test:live` 会快速失败。

## 常见问题

- 缺少密钥：确认当前 shell 或 CI 已设置对应的 API key。
- 速率限制或临时 API 故障：重新运行一次；真实测试包含重试逻辑。
- provider 响应格式变更：优先检查响应提取相关单元测试。
