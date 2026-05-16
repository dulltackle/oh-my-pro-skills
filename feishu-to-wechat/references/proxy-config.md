# 微信 API 代理配置

## SOCKS5 隧道信息

| 项目 | 值 |
|------|-----|
| **代理类型** | SOCKS5 |
| **本地地址** | `socks5://127.0.0.1:12345` |
| **出口 IP** | `121.40.243.4`（阿里云固定 IP） |
| **服务器** | root@121.40.243.4 (Debian 12) |
| **SSH 密钥** | `/home/forclaw/.ssh/ali-nanobot.pem` |

## 使用方式

### 环境变量（推荐）
```bash
export ALL_PROXY=socks5://127.0.0.1:12345
export HTTPS_PROXY=socks5://127.0.0.1:12345
```

### curl 测试
```bash
curl -x socks5://127.0.0.1:12345 -s ifconfig.me
# 应返回: 121.40.243.4

curl -x socks5://127.0.0.1:12345 -s https://api.weixin.qq.com
# 应返回 JSON（非连接错误）
```

### Node.js / TypeScript 中使用
```typescript
// 方式 A: undici ProxyAgent (Node 18+ 原生 fetch)
import { ProxyAgent, setGlobalDispatcher } from 'undici';
setGlobalDispatcher(new ProxyAgent('socks5://127.0.0.1:12345'));

// 方式 B: hpagent (兼容性好)
import { SocksProxyAgent } from 'hpagent';
const agent = new SocksProxyAgent('socks5://127.0.0.1:12345');
// 传给 fetch 的 agent 参数
```

### Python requests 中使用
```python
import requests
proxies = {
    'http': 'socks5://127.0.0.1:12345',
    'https': 'socks5://127.0.0.1:12345',
}
requests.get('https://api.weixin.qq.com', proxies=proxies)
```

## 隧道管理

```bash
# 查看状态
bash scripts/wechat-proxy.sh status

# 手动重启
bash scripts/wechat-proxy.sh restart

# 停止
bash scripts/wechat-proxy.sh stop
```

## 自动保活

- Cron 每 5 分钟检查一次 (`crontab -l | grep wechat-proxy`)
- 隧道断开后自动重建
- SSH keepalive: 15 秒间隔，3 次失败后断开

## 微信公众号后台配置

将以下 IP 加入「开发 → 基本配置 → IP 白名单」：
```
121.40.243.4
```
