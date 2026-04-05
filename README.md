# memolite-n

`memolite-n` 是 [`memolite`](https://github.com/shaun17/memolite) 的 Node.js / TypeScript 重写版本。  
发布到 npm 后，包名使用 `memolite-n`，但对外命令保持为 `memolite`。

项目目标：

- 完整迁移 Python 版的核心业务能力到 Node.js
- 保持原有数据路径和数据文件兼容
- 保持 REST、MCP、CLI、SDK、OpenClaw 集成的整体行为一致
- 支持本地模型下载后直接使用，与 Python 版 provider / 默认模型保持一致

## 特性

- 单包发布：npm 包名 `memolite-n`，命令名 `memolite`
- SQLite 真值存储，兼容 `~/.memolite/memolite.sqlite3` 和旧版 `memlite.sqlite3`
- Kùzu 图投影兼容，复用同一个 Kùzu 目录
- 统一 CLI，覆盖 `serve`、`configure`、`mcp`、`service`、`openclaw`
- REST API、MCP HTTP、MCP stdio
- Episodic memory、semantic memory、short-term memory
- 向量同步、snapshot 导入导出、repair / reconcile / rebuild-vectors
- Node SDK
- OpenClaw 插件运行时和配置管理

## 架构总览

`memolite-n` 采用“接口层 -> 组装层 -> 领域服务 -> 存储与模型适配层”的结构。

### 1. 接口层

- CLI：`src/cli`
- HTTP API：`src/http`
- MCP：`src/mcp`
- SDK：`src/sdk`
- OpenClaw / service 管理：`src/openclaw`、`src/service`

这一层只负责输入输出契约，不直接承载业务规则。

### 2. 组装层

- `src/app/resources.ts`
- `src/app/background-tasks.ts`

这里统一创建运行时资源：

- 配置加载
- SQLite / Kùzu / graph mirror
- embedder / reranker provider
- memory search / lifecycle / config 服务
- 后台恢复与补偿任务

### 3. 领域服务层

- `src/memory`
- `src/semantic`
- `src/episodic`
- `src/semantic-config`
- `src/derivatives`

主要职责：

- episodic 检索与上下文扩展
- semantic feature 检索、过滤、删除
- short-term memory 摘要与上下文恢复
- derivative chunk 生成
- 语义配置、分类、标签、禁用分类
- episode / session / project 删除时的语义级联清理

### 4. 存储与适配层

- `src/storage`
- `src/graph`
- `src/vector`
- `src/common/models`
- `src/compatibility`

主要职责：

- SQLite schema、CRUD、迁移兼容
- Kùzu 图投影与 graph mirror
- BLOB 向量编码、sqlite-vec 兼容路径
- provider runtime
- SQLite / 向量 / 图投影之间的同步与修复

## 目录结构

```text
memolite-n/
├── assets/
│   └── openclaw-plugin/
├── bin/
│   └── memolite.js
├── scripts/
│   ├── start_local.sh
│   ├── verify_memolite.sh
│   ├── setup_openclaw_memolite.sh
│   └── memolite_service.sh
├── src/
│   ├── app/
│   ├── cli/
│   ├── common/
│   ├── compatibility/
│   ├── derivatives/
│   ├── episodic/
│   ├── graph/
│   ├── http/
│   ├── mcp/
│   ├── memory/
│   ├── metrics/
│   ├── openclaw/
│   ├── sdk/
│   ├── semantic/
│   ├── semantic-config/
│   ├── service/
│   ├── storage/
│   ├── tools/
│   └── vector/
└── tests/
    ├── integration/
    └── unit/
```

## 数据兼容

默认数据目录：

- `~/.memolite/memolite.sqlite3`
- `~/.memolite/kuzu`

兼容旧路径：

- 如果 `~/.memolite/memolite.sqlite3` 不存在，但 `~/.memolite/memlite.sqlite3` 存在，会自动回退使用旧文件

## 模型策略

与 Python 版保持一致：

- embedder provider
  - `hash`
  - `sentence_transformer`
- reranker provider
  - `none`
  - `cross_encoder`

默认模型：

- `sentence_transformer`：`BAAI/bge-small-zh-v1.5`
- `cross_encoder`：`BAAI/bge-reranker-base`

运行时通过 `@huggingface/transformers` 加载模型。可以配置本地模型目录，也可以允许远程下载。

## 安装

### 发布到 npm 之后

```bash
npm install -g memolite-n
```

安装后命令仍然是：

```bash
memolite
```

### 从源码开发

```bash
git clone https://github.com/shaun17/memolite-n.git
cd memolite-n
npm install
npm run build
```

## 运行环境

- Node.js `>=24 <26`
- 推荐本地有可写的数据目录
- 如果启用 Kùzu，需要本机能够加载 `kuzu` 依赖
- 如果启用 `sentence_transformer` / `cross_encoder`，首次运行可能会下载模型

## 配置

最常用环境变量：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `MEMOLITE_HOST` | HTTP / MCP HTTP 监听地址 | `127.0.0.1` |
| `MEMOLITE_PORT` | HTTP / MCP HTTP 监听端口 | `18731` |
| `MEMOLITE_SQLITE_PATH` | SQLite 文件路径 | 自动解析到 `~/.memolite/memolite.sqlite3` |
| `MEMOLITE_KUZU_PATH` | Kùzu 目录 | `~/.memolite/kuzu` |
| `MEMOLITE_SQLITE_VEC_EXTENSION_PATH` | sqlite-vec 扩展路径 | 空 |
| `MEMOLITE_MCP_API_KEY` | MCP 鉴权 key | 空 |
| `MEMOLITE_EMBEDDER_PROVIDER` | embedder provider | `hash` |
| `MEMOLITE_EMBEDDER_MODEL` | embedder 模型名 | provider 默认值 |
| `MEMOLITE_RERANKER_PROVIDER` | reranker provider | `none` |
| `MEMOLITE_RERANKER_MODEL` | reranker 模型名 | provider 默认值 |
| `MEMOLITE_MODEL_BASE_PATH` | 本地模型目录 | 空 |
| `MEMOLITE_MODEL_CACHE_DIR` | 模型缓存目录 | 空 |
| `MEMOLITE_ALLOW_REMOTE_MODELS` | 是否允许远程下载模型 | `true` |

可以先生成样例配置：

```bash
memolite configure sample-config --output .env.example
```

也可以直接生成运行时配置：

```bash
memolite configure configure --output .env --overwrite
```

`memolite` 运行时会自动读取当前工作目录下的 `.env`。

## 使用方法

### 1. 初始化本地数据目录

```bash
memolite configure init
```

### 2. 启动 HTTP 服务

```bash
memolite serve
```

默认监听：

```text
http://127.0.0.1:18731
```

可用基础端点：

- `GET /health`
- `GET /version`
- `GET /openapi.json`
- `GET /metrics`

### 3. HTTP API 示例

创建项目：

```bash
curl -X POST http://127.0.0.1:18731/projects \
  -H 'content-type: application/json' \
  -d '{
    "org_id": "demo-org",
    "project_id": "demo-project",
    "description": "demo"
  }'
```

创建 session：

```bash
curl -X POST http://127.0.0.1:18731/sessions \
  -H 'content-type: application/json' \
  -d '{
    "session_key": "session-a",
    "org_id": "demo-org",
    "project_id": "demo-project",
    "session_id": "session-a",
    "user_id": "user-1"
  }'
```

写入 memory：

```bash
curl -X POST http://127.0.0.1:18731/memories \
  -H 'content-type: application/json' \
  -d '{
    "session_key": "session-a",
    "semantic_set_id": "session-a",
    "episodes": [
      {
        "uid": "ep-1",
        "session_key": "session-a",
        "session_id": "session-a",
        "producer_id": "user-1",
        "producer_role": "user",
        "sequence_num": 1,
        "content": "Ramen is my favorite food."
      }
    ]
  }'
```

搜索 memory：

```bash
curl -X POST http://127.0.0.1:18731/memories/search \
  -H 'content-type: application/json' \
  -d '{
    "query": "favorite food",
    "session_key": "session-a",
    "session_id": "session-a",
    "semantic_set_id": "session-a",
    "mode": "mixed"
  }'
```

### 4. MCP

启动 MCP stdio：

```bash
memolite mcp stdio
```

启动 MCP HTTP：

```bash
memolite mcp http
```

MCP HTTP 端点：

- `GET /tools`
- `POST /call-tool`

如果设置了 `MEMOLITE_MCP_API_KEY`，调用工具时需要在 `input` 中携带 `api_key`。

### 5. 配置与维护命令

导出 snapshot：

```bash
memolite configure export --output ./snapshot.json
```

导入 snapshot：

```bash
memolite configure import --input ./snapshot.json
```

检查 sqlite-vec：

```bash
memolite configure detect-sqlite-vec --extension-path /path/to/sqlite-vec
```

对齐并修复当前状态：

```bash
memolite configure reconcile --output ./reconcile.json
memolite configure repair --output ./repair.json
memolite configure rebuild-vectors --target all --output ./rebuild.json
```

压测与基准：

```bash
memolite configure benchmark-search --output ./benchmark.json
memolite configure load-test --base-url http://127.0.0.1:18731 --output ./load-test.json
```

### 6. service 管理

macOS 和 Linux 都支持用户级 service 管理：

```bash
memolite service install
memolite service enable
memolite service status
memolite service restart
memolite service disable
memolite service uninstall
```

### 7. OpenClaw 集成

```bash
memolite openclaw setup
memolite openclaw status
memolite openclaw doctor
memolite openclaw uninstall
```

配置查看和修改：

```bash
memolite openclaw configure show
memolite openclaw configure set --base-url http://127.0.0.1:18731
memolite openclaw configure reset
```

## SDK 使用

```ts
import { MemoliteClient } from "memolite-n";

const client = new MemoliteClient({
  baseUrl: "http://127.0.0.1:18731"
});

await client.projects.create({
  orgId: "demo-org",
  projectId: "demo-project"
});

await client.memory.add({
  sessionKey: "session-a",
  semanticSetId: "session-a",
  episodes: [
    {
      uid: "ep-1",
      session_key: "session-a",
      session_id: "session-a",
      producer_id: "user-1",
      producer_role: "user",
      content: "Ramen is my favorite food."
    }
  ]
});

const result = await client.memory.search({
  query: "favorite food",
  sessionKey: "session-a",
  sessionId: "session-a",
  semanticSetId: "session-a",
  mode: "mixed"
});

console.log(result.combined);
await client.close();
```

语义配置和 memory config 也可以通过 `client.config` 访问。

## 开发与验证

```bash
npm test
npm run typecheck
npm run build
```

当前仓库包含完整的 unit / integration tests，覆盖：

- CLI 契约
- REST 路由
- MCP stdio / HTTP
- semantic config
- snapshot / repair / reconcile / rebuild-vectors
- provider runtime
- OpenClaw
- SDK roundtrip
- 删除级联与兼容同步

## 附带脚本

仓库额外提供了几个便捷脚本：

- `scripts/start_local.sh`
- `scripts/verify_memolite.sh`
- `scripts/setup_openclaw_memolite.sh`
- `scripts/memolite_service.sh`

这些脚本主要用于本地调试和运维包装。

## 发布说明

后续发布到 npm 时：

- npm 包名：`memolite-n`
- 全局命令名：`memolite`

这两者是刻意分离的，目的是避免包名冲突，同时保留历史命令入口。
