# Config Reference

## 环境变量总览

### 服务

- `MEMOLITE_HOST` — 默认：`127.0.0.1`
- `MEMOLITE_PORT` — 默认：`18732`
- `MEMOLITE_APP_NAME` — 默认：`MemoLite`
- `MEMOLITE_ENVIRONMENT` — 默认：`development`
- `MEMOLITE_LOG_LEVEL` — 默认：`INFO`

### 存储

- `MEMOLITE_SQLITE_PATH` — SQLite 主数据文件路径
- `MEMOLITE_KUZU_PATH` — Kùzu 数据目录
- `MEMOLITE_SQLITE_VEC_EXTENSION_PATH` — 可选，`sqlite-vec` 原生扩展路径

### MCP

- `MEMOLITE_MCP_API_KEY` — 可选；配置后，MCP tool 调用需要传入 `api_key`

### 模型

- `MEMOLITE_EMBEDDER_PROVIDER` — `hash`（默认）或 `sentence_transformer`
- `MEMOLITE_EMBEDDER_MODEL` — embedder 模型名（sentence_transformer 时生效）
- `MEMOLITE_EMBEDDER_CACHE_ENABLED` — 默认：`true`
- `MEMOLITE_EMBEDDER_CACHE_SIZE` — 默认：`1000`
- `MEMOLITE_RERANKER_PROVIDER` — `none`（默认）或 `cross_encoder`
- `MEMOLITE_RERANKER_MODEL` — reranker 模型名（cross_encoder 时生效）

### 检索调优

- `MEMOLITE_SEMANTIC_SEARCH_CANDIDATE_MULTIPLIER` — 默认：`3`
- `MEMOLITE_SEMANTIC_SEARCH_MAX_CANDIDATES` — 默认：`100`
- `MEMOLITE_EPISODIC_SEARCH_CANDIDATE_MULTIPLIER` — 默认：`4`
- `MEMOLITE_EPISODIC_SEARCH_MAX_CANDIDATES` — 默认：`100`

## `.env` 示例

```env
MEMOLITE_HOST=127.0.0.1
MEMOLITE_PORT=18732
MEMOLITE_SQLITE_PATH=/Users/example/.memolite/memolite.sqlite3
MEMOLITE_KUZU_PATH=/Users/example/.memolite/kuzu-n
MEMOLITE_LOG_LEVEL=INFO
MEMOLITE_MCP_API_KEY=replace-me
```

## Memory Config API 默认值

通过 `/memory-config/*` 接口读写，不直接来自环境变量。

### Episodic

- `top_k`
- `min_score`
- `context_window`
- `rerank_enabled`

### Short-term

- `message_capacity`

### Long-term

- `episodic_enabled`
- `semantic_enabled`
