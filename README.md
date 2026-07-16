# Vision MCP Server

[English](./README.md) | [中文](./README.zh-CN.md)

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that exposes **7 vision tools** — general image analysis, UI→code, OCR, error diagnosis, diagram understanding, data-viz analysis, and UI diff — on top of **any Anthropic-Messages-compatible vision model**.

It works with **Claude Code** and any other MCP-compatible client. You point it at your own model API (base URL + API key + model id) and get a set of ready-to-use vision capabilities.

## Why this exists

- **7 focused vision tools** instead of one generic "look at the image" call — the right system prompt per task (OCR, diff, data-viz, …) gives much better results.
- **Two transports**: a **local stdio** mode (Claude Code spawns it; tools read local file **paths**, so image bytes never enter the conversation context) and a **remote HTTP** mode (self-host, share across devices).
- **Production-grade plumbing**: multi-key round-robin with cooldown + retry, global & per-key concurrency limits, image preprocessing (resize + JPEG Q80) with per-mode resolution caps.
- **Model-agnostic**: anything that speaks the Anthropic Messages API (`POST /v1/messages` with base64 images). Defaults are just an example.

## Tools

| Tool | What it does | Image cap |
|---|---|---|
| `image_analysis` | Answer a free-form question about an image | 2048 |
| `ui_to_artifact` | Turn a UI screenshot into code / prompt / design-spec / description | 2048 |
| `diagnose_error_screenshot` | Diagnose an error screenshot (stack/console/popup), locate cause, suggest fix | 2048 |
| `understand_technical_diagram` | Structured reading of a technical diagram (architecture/flowchart/uml/er) | 2048 |
| `analyze_data_visualization` | Analyze a chart — trends / anomalies / summary | 2048 |
| `extract_text_from_screenshot` | High-accuracy OCR, preserves layout & structure | 4096 |
| `ui_diff_check` | Compare two screenshots, list visual diffs by severity | 1536×2 |

Each tool accepts an image as a **local `path`** (stdio mode — preferred) or **`base64`**, plus task-specific options.

## Quick start

### Option A — Local stdio mode (recommended for personal/team use)

Claude Code spawns this as a local process. Tools read local file paths directly, so **images never enter the conversation context** — zero base64 overhead.

Add to your Claude Code MCP config (`~/.claude.json`):

```json
{
  "mcpServers": {
    "vision-mcp-server": {
      "command": "npx",
      "args": ["-y", "github:spock-wen/vision-mcp-server"],
      "env": {
        "API_KEY": "your-model-api-key",
        "API_BASE_URL": "https://your-model-endpoint.example.com",
        "MODEL_ID": "your-model-id"
      }
    }
  }
}
```

Then in Claude Code: *"Analyze /Users/me/screenshot.png"* — the path is passed to the tool, which reads it locally.

Or via CLI:
```bash
claude mcp add vision-mcp-server -- npx -y github:spock-wen/vision-mcp-server
```

### Option B — Remote HTTP mode (self-host, multi-device)

```bash
git clone https://github.com/spock-wen/vision-mcp-server.git
cd vision-mcp-server
npm install && npm run build
API_KEYS=key1,key2 npm start
```

Listens on `PORT` (default 3000). Endpoints: `POST /mcp` (MCP), `GET /health`.

```bash
claude mcp add -s user vision-mcp-server --transport http http://localhost:3000/mcp
```

Docker:
```bash
echo "API_KEYS=key1,key2" > .env
docker compose up -d
```

## Configuration

All config is via environment variables. **Three are about your model** — the rest are tuning knobs with sensible defaults.

| Variable | Default | Description |
|---|---|---|
| `API_KEY` | *(required)* | Your model API key (single). |
| `API_KEYS` | *(optional)* | Comma-separated keys (multi-key rotation). Merged with `API_KEY`. |
| `API_BASE_URL` | *(see note)* | Model API base URL (the server appends `/v1/messages`). |
| `MODEL_ID` | *(see note)* | Model id sent in the request body. |
| `REJECT_UNAUTHORIZED` | `1` | Set `0` to skip TLS verification — **intranet self-signed endpoints only**. |
| `PORT` | `3000` | HTTP port (HTTP mode only). |
| `MAX_CONCURRENCY` | `100` | Global max concurrent requests. |
| `PER_KEY_CONCURRENCY` | `20` | Per-key max concurrent requests. |
| `MAX_RETRIES` | `3` | Max retries per request. |
| `KEY_COOLDOWN_MS` | `60000` | Cooldown for failed keys (401/403/429). |
| `IMAGE_MAX_SIZE_MB` | `10` | Max decoded image size. |
| `IMAGE_MAX_DIMENSION` | `2048` | Standard-mode resolution cap. |
| `IMAGE_OCR_MAX_DIMENSION` | `4096` | OCR-mode resolution cap. |
| `LOG_LEVEL` | `info` | [pino](https://github.com/pinojs/pino) log level. |

> **Defaults are just an example.** The built-in defaults point at one specific endpoint so the project runs out of the box, but this server is model-agnostic — set `API_BASE_URL` and `MODEL_ID` to any Anthropic-Messages-compatible vision model. Only `API_KEY` is strictly required.

> **Self-signed intranet endpoints:** if `API_BASE_URL` uses a self-signed certificate (e.g. a company-internal model gateway), set `REJECT_UNAUTHORIZED=0` or connections will fail. Use only on trusted intranets.

## Development

```bash
npm test          # node:test over src/**/*.test.ts
npm run typecheck # tsc --noEmit
npm run dev       # tsx watch src/index.ts (HTTP mode)
```

Tech: TypeScript (ESM/NodeNext), `@modelcontextprotocol/sdk`, `zod`, `sharp`, `pino`. No external test framework — built-in `node:test`.

## Notes

- **Local path is preferred.** In stdio mode, pass `image.path`; the tool reads the file directly so image bytes stay out of your conversation context. Use `image.base64` only when no local file is available.
- The model API must accept **base64 images** in the Anthropic Messages `source` format. Local-path support is our convenience layer — the server still base64-encodes before calling the model.
- Token cost scales with resolution, not file size — hence JPEG Q80 + per-mode caps.
- HTTP transport is **stateless** (`sessionIdGenerator: undefined`) for horizontal scalability; a fresh transport+server is created per request.

## License

MIT
