# Quickstart

## 目标

在本地启动 memolite-n，创建一个项目和会话，写入一条记忆并完成检索。

## 前提

- Node.js `>=24`
- 已安装项目依赖（`npm install`）

## 1. 初始化本地数据目录

```bash
memolite-n configure configure --output .env --data-dir ~/.memolite
memolite-n configure init --data-dir ~/.memolite
```

## 2. 启动服务

```bash
memolite-n serve
```

默认地址：`http://127.0.0.1:18732`

## 3. 创建项目

```bash
curl -X POST http://127.0.0.1:18732/projects \
  -H 'content-type: application/json' \
  -d '{
    "org_id": "demo-org",
    "project_id": "demo-project",
    "description": "quickstart"
  }'
```

## 4. 创建会话

```bash
curl -X POST http://127.0.0.1:18732/sessions \
  -H 'content-type: application/json' \
  -d '{
    "session_key": "demo-session",
    "org_id": "demo-org",
    "project_id": "demo-project",
    "session_id": "demo-session",
    "user_id": "demo-user"
  }'
```

## 5. 写入一条记忆

```bash
curl -X POST http://127.0.0.1:18732/memories \
  -H 'content-type: application/json' \
  -d '{
    "session_key": "demo-session",
    "semantic_set_id": "demo-session",
    "episodes": [
      {
        "uid": "ep-1",
        "session_key": "demo-session",
        "session_id": "demo-session",
        "producer_id": "demo-user",
        "producer_role": "user",
        "sequence_num": 1,
        "content": "Ramen is my favorite food."
      }
    ]
  }'
```

## 6. 检索记忆

```bash
curl -X POST http://127.0.0.1:18732/memories/search \
  -H 'content-type: application/json' \
  -d '{
    "query": "favorite food",
    "session_key": "demo-session",
    "session_id": "demo-session",
    "semantic_set_id": "demo-session",
    "mode": "mixed",
    "limit": 5,
    "context_window": 1
  }'
```

期望返回：

- `episodic_matches`
- `combined`
- `short_term_context`

## 7. TypeScript SDK

```typescript
import { MemoliteClient } from "memolite-n";

const client = new MemoliteClient({ baseUrl: "http://127.0.0.1:18732" });

await client.projects.create({ orgId: "demo-org", projectId: "demo-project" });

await client.memory.add({
  sessionKey: "demo-session",
  episodes: [
    {
      uid: "ep-1",
      sessionKey: "demo-session",
      sessionId: "demo-session",
      producerId: "demo-user",
      producerRole: "user",
      sequenceNum: 1,
      content: "Ramen is my favorite food.",
    },
  ],
});

const result = await client.memory.search({
  query: "favorite food",
  sessionKey: "demo-session",
  sessionId: "demo-session",
});
console.log(result.combined);
```

## 8. 下一步

- 部署参数：`docs/deployment-guide.md`
- 配置说明：`docs/config-reference.md`
- API 说明：`docs/api-reference.md`
- MCP 接入：`docs/mcp-guide.md`
