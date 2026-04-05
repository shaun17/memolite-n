# OpenClaw Plugin Guide

插件已内嵌在 `assets/openclaw-plugin`。

## 安装

```bash
memolite-n openclaw setup
```

或手动安装：

```bash
openclaw plugins install ./assets/openclaw-plugin
```

## 一键配置

```bash
memolite-n openclaw setup \
  --base-url http://127.0.0.1:18732 \
  --org-id demo-org \
  --project-id demo-project \
  --user-id demo-user
```

## 配置项

- `baseUrl` — 默认：`http://127.0.0.1:18732`
- `orgId`
- `projectId`
- `userId`
- `autoCapture` — 默认：`true`
- `autoRecall` — 默认：`true`
- `searchThreshold` — 默认：`0.5`
- `topK` — 默认：`5`

## 推荐配置

```json
{
  "baseUrl": "http://127.0.0.1:18732",
  "orgId": "demo-org",
  "projectId": "demo-project",
  "userId": "demo-user",
  "autoCapture": true,
  "autoRecall": true,
  "searchThreshold": 0.5,
  "topK": 5
}
```

## 提供的 tools

- `memory_search` / `memolite_search`
- `memory_store` / `memolite_store`
- `memory_get` / `memolite_get`
- `memory_list` / `memolite_list`
- `memory_forget` / `memolite_forget`
- `memolite_status`

`memory_*` 为通用 memory 工具兼容名称，`memolite_*` 为同功能别名，在多 memory 插件场景中可明确指向 memolite。`memolite_status` 用于验证调用链是否真正到达后端。

## 自动行为

- **`autoCapture`**：agent 结束后把消息写入 memolite
- **`autoRecall`**：agent 启动前根据 prompt 检索并注入上下文

## 状态检查与诊断

```bash
memolite-n openclaw status
memolite-n openclaw doctor
```

## 验证真实调用

1. 执行 `memolite_status`，确认返回 `provider: "memolite"`、`executed: true`、`data.health.status: "ok"`
2. 检查 `memory_search` 等返回包络包含 `provider: "memolite"` 和 `executed: true`
3. 查看插件日志中是否有 `openclaw-memolite-n: <tool> invoked` 和 `openclaw-memolite-n: <tool> succeeded`

## 卸载

```bash
memolite-n openclaw uninstall
```
