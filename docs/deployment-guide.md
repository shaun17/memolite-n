# Deployment Guide

## 部署模式

memolite-n 当前面向：

- 本地开发
- 单机服务
- 轻量级内网部署

## 目录规划

```text
~/.memolite/
├── memolite.sqlite3
└── kuzu/
```

## 初始化

```bash
memolite-n configure configure --output .env --data-dir ~/.memolite
memolite-n configure init --data-dir ~/.memolite
```

## 环境变量

最小部署：

```bash
MEMOLITE_HOST=127.0.0.1
MEMOLITE_PORT=18732
MEMOLITE_SQLITE_PATH=/absolute/path/memolite.sqlite3
MEMOLITE_KUZU_PATH=/absolute/path/kuzu
```

可选：

```bash
MEMOLITE_SQLITE_VEC_EXTENSION_PATH=/path/to/sqlite-vec.dylib
MEMOLITE_MCP_API_KEY=replace-me
MEMOLITE_EMBEDDER_PROVIDER=sentence_transformer
MEMOLITE_RERANKER_PROVIDER=cross_encoder
MEMOLITE_SEMANTIC_SEARCH_CANDIDATE_MULTIPLIER=3
MEMOLITE_SEMANTIC_SEARCH_MAX_CANDIDATES=100
MEMOLITE_EPISODIC_SEARCH_CANDIDATE_MULTIPLIER=4
MEMOLITE_EPISODIC_SEARCH_MAX_CANDIDATES=100
```

## 启动 API 服务

```bash
memolite-n serve
```

## 启动 MCP

```bash
# stdio
memolite-n mcp stdio

# HTTP
memolite-n mcp http
```

## 系统服务管理

```bash
memolite-n service install --enable   # 安装并启用自动启动
memolite-n service start
memolite-n service stop
memolite-n service status
memolite-n service uninstall
```

## 验证部署

```bash
curl http://127.0.0.1:18732/health
```

或运行：

```bash
bash scripts/verify_memolite.sh
```
