# 项目初始化与目录约定

## 项目初始化流程

每个知识库项目必须先初始化：生成项目配置并注册到 `~/.kb/`，然后初始化存储结构。

### Step 1: 确认基本信息 ⏸️ GATE

与用户确认：
- **知识库名称**：用于标识，将注册为 `~/.kb/<slug>.conf.yaml`
- **存储后端**：根据需求选择，详见 `providers/` 目录
- **后端配置参数**：不同 provider 需要不同的参数
  - local 后端：本地数据目录路径（如 `~/kb/my-project`）
  - 其他后端：按对应 provider 文档的配置章节提供

### Step 2: 确认存储后端

根据用户需求选择 provider。当前可用后端：

| 后端 | 适用场景 | 配置复杂度 | 详见 |
|------|---------|-----------|------|
| local | 个人使用、离线场景、git 版本控制 | 低（仅数据目录路径） | `providers/local.md` |

> 接口契约和新增 provider 方式见 `providers/INTERFACE.md`。

### Step 3: 生成配置并初始化存储

按 INTERFACE.md 的配置文件格式规范和对应 provider 文档的配置章节生成配置，注册到 `~/.kb/<slug>.conf.yaml`。

- **local 后端**：使用初始化脚本（推荐），同时创建数据目录和注册配置：

  ```bash
  python3 providers/local/kb-init.py <数据目录> <名称>
  ```

- **其他后端**：按照对应 provider 文档的 `init` 接口描述执行初始化，配置直接注册到 `~/.kb/<slug>.conf.yaml`。

### Step 4: 验证

1. 确认 `~/.kb/<slug>.conf.yaml` 已生成且可读取
2. 调用 provider 的 `healthcheck` 接口，确认存储结构完整

## 项目注册目录

> 项目注册目录的路径、配置文件格式和项目发现机制见 `providers/INTERFACE.md`。

## 目录结构约定

> 知识库的逻辑路径体系（raw/wiki/output 三层）见 `providers/INTERFACE.md` 的"逻辑路径约定"章节。物理存储结构由各 provider 自行映射，见对应 provider 文档的"逻辑路径映射表"。
