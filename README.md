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
