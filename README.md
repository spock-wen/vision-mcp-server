# Vision MCP Server

A remote MCP (Model Context Protocol) server exposing 7 vision tools over the 讯飞 MaaS Anthropic-compatible model API (`xopkimik26`). Supports Claude Code, Codex, Cline, and any MCP-compatible client via Streamable HTTP.

## Features

- 7 specialized vision tools (UI→code, OCR, error diagnosis, diagram understanding, data-viz analysis, UI diff, general image analysis)
- Multi-API-key round-robin with cooldown + retry (401/403/429/5xx/network)
- Global (100) and per-key (20) concurrency control
- Image preprocessing: PNG/JPEG/GIF/WebP/BMP → JPEG Q80 with resolution caps (2048 standard / 4096 OCR / 1536 diff)
- `/health` status endpoint

## Quick start

```bash
npm install
npm run build
API_KEYS=key1,key2 npm start
```

Server listens on `PORT` (default 3000). Endpoints: `POST /mcp` (MCP), `GET /health`.

### Docker

```bash
echo "API_KEYS=key1,key2" > .env
docker compose up -d
```

## Configuration (env)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `API_KEYS` | *(required)* | Comma-separated API keys |
| `API_BASE_URL` | `https://maas-coding-api.cn-huabei-1.xf-yun.com/anthropic` | Model API base URL |
| `MODEL_ID` | `xopkimik26` | Model ID |
| `MAX_CONCURRENCY` | `100` | Global max concurrent requests |
| `PER_KEY_CONCURRENCY` | `20` | Per-key max concurrent requests |
| `MAX_RETRIES` | `3` | Max retries per request |
| `KEY_COOLDOWN_MS` | `60000` | Cooldown for failed keys |
| `IMAGE_MAX_SIZE_MB` | `10` | Max image size |
| `IMAGE_MAX_DIMENSION` | `2048` | Standard-mode resolution cap |
| `IMAGE_OCR_MAX_DIMENSION` | `4096` | OCR-mode resolution cap |
| `LOG_LEVEL` | `info` | pino log level |

## Connect a client

### 本地 stdio 模式（推荐）

适合个人/团队本地使用。cc 直接 spawn 本地进程，工具读本地文件路径 —— **图片不进入对话上下文**，零 base64 开销。

每人需要自己配 **三个环境变量**：`API_KEY`（讯飞密钥）、`API_BASE_URL`（模型 API 地址）、`MODEL_ID`（模型 ID）。

在 cc 里加：

```bash
claude mcp add vision-mcp-server -- npx -y github:spock-wen/vision-mcp-server
```

然后编辑 `~/.claude.json` 补上三个环境变量（下面是示例值，按你的实际情况替换）：

```json
{
  "mcpServers": {
    "vision-mcp-server": {
      "command": "npx",
      "args": ["-y", "github:spock-wen/vision-mcp-server"],
      "env": {
        "API_KEY": "你的讯飞密钥整串（格式 id:secret）",
        "API_BASE_URL": "https://maas-coding-api.cn-huabei-1.xf-yun.com/anthropic",
        "MODEL_ID": "xopkimik26"
      }
    }
  }
}
```

> 如果不填 `API_BASE_URL` / `MODEL_ID`，会用上面的默认值（讯飞 MaaS + `xopkimik26`）；但 `API_KEY` **必填**，否则启动报错。

用法：在 cc 对话里直接给本地图片路径，例如「分析 /Users/me/x.png」，cc 会把路径传给工具，工具本地读取。

### 远程 HTTP 模式（可选）

适合集中部署、多设备共享。需先按 Quick start 起服务。

**Claude Code:**
```bash
claude mcp add -s user vision-mcp-server --transport http http://localhost:3000/mcp
```

**Manual config (`.claude.json`):**
```json
{
  "mcpServers": {
    "vision-mcp-server": { "type": "http", "url": "http://localhost:3000/mcp" }
  }
}
```

## Development

```bash
npm test          # node:test over src/**/*.test.ts
npm run typecheck # tsc --noEmit
npm run dev       # tsx watch src/index.ts
```

## Notes

- The model API accepts **base64 images only** (URLs return 400). Clients (e.g. Claude Code) auto-encode local files.
- Token cost scales with resolution, not file size — hence JPEG Q80 + resolution caps.
- Transport is **stateless** (`sessionIdGenerator: undefined`) for horizontal scalability.
