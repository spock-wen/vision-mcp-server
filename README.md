# Vision MCP Server

[English](./README.md) | [中文](./README.zh-CN.md)

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that exposes **7 vision tools** — general image analysis, UI→code, OCR, error diagnosis, diagram understanding, data-viz analysis, and UI diff — on top of **any Anthropic-Messages-compatible vision model**.

It works with **Claude Code** and any other MCP-compatible client. You point it at your own model API (base URL + API key + model id) and get a set of ready-to-use vision capabilities.

### Install it with one prompt

Copy this to your AI agent (Claude, etc.) — replace the values with your own:

```
Install this MCP https://github.com/spock-wen/vision-mcp-server
Configure with:
API_KEY: your-api-key
API_BASE_URL: your-model-api-url
MODEL_ID: multimodal model id, e.g. kimi-k2.6
Also set up the slash commands
```

---

## AI Agent Quick Config

> **For AI agents (Claude, etc.):** When a user asks you to install this MCP server, follow the steps below. Only `API_KEY` is strictly required; `API_BASE_URL` and `MODEL_ID` have built-in defaults but should be set to the user's provider. The server appends `/v1/messages` to `API_BASE_URL` automatically.

### Step 1 — Configure MCP server

Add to `~/.claude.json` → `mcpServers`:

```json
{
  "mcpServers": {
    "vision-mcp-server": {
      "command": "npx",
      "args": ["-y", "@spock-wen/vision-mcp-server"],
      "env": {
        "API_KEY": "<REQUIRED: user's model API key>",
        "API_BASE_URL": "<model API base URL, server appends /v1/messages>",
        "MODEL_ID": "<vision model id>"
      }
    }
  }
}
```

Or via CLI:
```bash
claude mcp add vision-mcp-server -e API_KEY=<key> -e API_BASE_URL=<url> -e MODEL_ID=<model> -- npx -y @spock-wen/vision-mcp-server
```

### Step 2 — Install slash commands

Slash commands let the user explicitly trigger a specific tool. Run this in the **project root directory** to download them:

```bash
mkdir -p .claude/commands
curl -sL https://raw.githubusercontent.com/spock-wen/vision-mcp-server/main/commands/vision-analyze.md -o .claude/commands/vision-analyze.md
curl -sL https://raw.githubusercontent.com/spock-wen/vision-mcp-server/main/commands/vision-ui2code.md -o .claude/commands/vision-ui2code.md
curl -sL https://raw.githubusercontent.com/spock-wen/vision-mcp-server/main/commands/vision-err.md -o .claude/commands/vision-err.md
curl -sL https://raw.githubusercontent.com/spock-wen/vision-mcp-server/main/commands/vision-diagram.md -o .claude/commands/vision-diagram.md
curl -sL https://raw.githubusercontent.com/spock-wen/vision-mcp-server/main/commands/vision-dataviz.md -o .claude/commands/vision-dataviz.md
curl -sL https://raw.githubusercontent.com/spock-wen/vision-mcp-server/main/commands/vision-ocr.md -o .claude/commands/vision-ocr.md
curl -sL https://raw.githubusercontent.com/spock-wen/vision-mcp-server/main/commands/vision-diff.md -o .claude/commands/vision-diff.md
```

> If the repo is cloned locally (e.g. `command: "node", args: ["build/index.js"]`), copy or symlink the `commands/` folder to `.claude/commands/` instead.

| Command | Tool called |
|---|---|
| `/vision-analyze` | `image_analysis` |
| `/vision-ui2code` | `ui_to_artifact` |
| `/vision-err` | `diagnose_error_screenshot` |
| `/vision-diagram` | `understand_technical_diagram` |
| `/vision-dataviz` | `analyze_data_visualization` |
| `/vision-ocr` | `extract_text_from_screenshot` |
| `/vision-diff` | `ui_diff_check` |

### Provider examples

| Provider | `API_BASE_URL` | `MODEL_ID` |
|---|---|---|
| iFLYTEK (讯飞) MaaS | `https://maas-coding-api.cn-huabei-1.xf-yun.com/anthropic` | `xopkimik26` |
| Moonshot (Kimi) | *(verify with your provider)* | `kimi-k2.6` |
| OpenRouter | *(verify with your provider)* | *(depends on your plan)* |
| Any Anthropic-compatible | `<your-endpoint>` | `<your-model-id>` |

> The model API must accept `POST /v1/messages` with base64 images in the Anthropic Messages `source` format. The key is sent as `x-api-key` header.

---

## Tools

| Tool | What it does | Key params | Resolution cap |
|---|---|---|---|
| `image_analysis` | Answer a free-form question about an image | `question` (required) | 2048 |
| `ui_to_artifact` | Turn a UI screenshot into code / prompt / design-spec / description | `task`: `code` \| `prompt` \| `design-spec` \| `description` | 2048 |
| `diagnose_error_screenshot` | Diagnose an error screenshot, locate cause, suggest fix | `context` (optional) | 2048 |
| `understand_technical_diagram` | Structured reading of a technical diagram | `diagram_type`: `architecture` \| `flowchart` \| `uml` \| `er` \| `general` (optional) | 2048 |
| `analyze_data_visualization` | Analyze a chart — trends / anomalies / summary | `analysis_focus`: `trends` \| `anomalies` \| `summary` \| `all` (optional) | 2048 |
| `extract_text_from_screenshot` | High-accuracy OCR, preserves layout & structure | `language` (optional) | 4096 |
| `ui_diff_check` | Compare two screenshots, list visual diffs by severity | two images + `focus` (optional) | 1536×2 |

Each tool accepts an image as a **local `path`** (preferred — image bytes stay out of your conversation context) or **`base64`**. Supported formats: **PNG, JPEG, GIF, WebP, BMP**. All images are re-encoded to JPEG Q80 before sending to the model.

## Other setup options

### Remote HTTP mode (self-host, multi-device)

```bash
git clone https://github.com/spock-wen/vision-mcp-server.git
cd vision-mcp-server
npm install && npm run build
API_KEY=your-key API_BASE_URL=https://your-endpoint MODEL_ID=your-model npm start
```

Listens on `PORT` (default 3000). Endpoints: `POST /mcp` (MCP), `GET /health`.

```bash
claude mcp add -s user vision-mcp-server --transport http http://localhost:3000/mcp
```

Docker:
```bash
cat > .env << 'EOF'
API_KEY=your-key
API_BASE_URL=https://your-endpoint
MODEL_ID=your-model
EOF
docker compose up -d
```

### Verify installation

**HTTP mode:**
```bash
curl http://localhost:3000/health
# → {"status":"ok","keys":{"total":1,"available":1,"cooldown":0},"concurrency":{"current":0,"max":100}}
```

**Stdio mode:**
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' | API_KEY=test npx -y @spock-wen/vision-mcp-server
```

## Prerequisites

- **Node.js >= 20** (check with `node -v`)
- **npm** (ships with Node 20+)
- Works on Linux, macOS, and Windows

## Configuration

All config is via environment variables. **Three are about your model** — the rest are tuning knobs with sensible defaults.

### Required

| Variable | Description |
|---|---|
| `API_KEY` | Your model API key (single). Must be set. |

### Model connection

| Variable | Default | Description |
|---|---|---|
| `API_KEYS` | *(none)* | Comma-separated keys for multi-key rotation. Merged with `API_KEY`. |
| `API_BASE_URL` | `https://maas-coding-api.cn-huabei-1.xf-yun.com/anthropic` | Model API base URL (the server appends `/v1/messages`). |
| `MODEL_ID` | `xopkimik26` | Model id sent in the request body. |
| `REJECT_UNAUTHORIZED` | `1` | Set `0` to skip TLS verification — **intranet self-signed endpoints only**. Warning: disables TLS verification process-wide. |

### Tuning

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port (HTTP mode only). |
| `MAX_CONCURRENCY` | `100` | Global max concurrent requests. |
| `PER_KEY_CONCURRENCY` | `20` | Per-key max concurrent requests. |
| `MAX_RETRIES` | `3` | Max retries per request. |
| `RETRY_DELAY_MS` | `1000` | Base delay (ms) for exponential backoff between retries. |
| `MAX_RETRY_DELAY_MS` | `10000` | Maximum backoff delay (ms) between retries. |
| `KEY_COOLDOWN_MS` | `60000` | Cooldown for failed keys (401/403/429). |
| `IMAGE_MAX_SIZE_MB` | `10` | Max input image file size. |
| `IMAGE_MAX_DIMENSION` | `2048` | Standard-mode resolution cap. |
| `IMAGE_OCR_MAX_DIMENSION` | `4096` | OCR-mode resolution cap. |
| `IMAGE_DIFF_MAX_DIMENSION` | `1536` | Diff-mode resolution cap (per image). |
| `MODEL_TIMEOUT_MS` | `30000` | Timeout per model API request (ms). |
| `LOG_LEVEL` | `info` | [pino](https://github.com/pinojs/pino) log level. |

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `AllKeysUnavailableError` | All API keys in cooldown or at concurrency limit | Wait for cooldown, add more keys via `API_KEYS`, or increase `PER_KEY_CONCURRENCY` |
| `UnsupportedImageFormatError` | Image format not supported | Use PNG, JPEG, GIF, WebP, or BMP |
| `ImageTooLargeError` | Image exceeds size limit | Reduce image size or increase `IMAGE_MAX_SIZE_MB` |
| HTTP 413 `Payload Too Large` | Request body exceeds 50MB | Reduce image size (HTTP mode only) |
| TLS connection errors | Self-signed certificate on model endpoint | Set `REJECT_UNAUTHORIZED=0` (intranet only) |
| `sharp` native binding failure | Missing `libvips` on minimal Linux | Install: `apt install libvips` or `brew install vips` |
| `-32000` MCP connection error on Linux/macOS | `npx` can't execute `cli.js` | Ensure Node.js >= 20; this was fixed in v1.0.1 (shebang) |

## Security

- **API keys** are sent as `x-api-key` header to the model endpoint. Protect your config files (e.g. `chmod 600 ~/.claude.json`).
- **HTTP endpoint has no authentication.** Anyone who can reach `POST /mcp` can use your API keys. Use a reverse proxy or firewall in production.
- **`REJECT_UNAUTHORIZED=0`** disables TLS verification process-wide, not just for model requests. Only use on trusted intranets.
- **Body size limit**: 50MB hard cap on HTTP request body prevents memory exhaustion.
- **Logging**: API keys are redacted from pino log output.

## Development

```bash
npm test          # unit tests (node:test over src/**/*.test.ts)
npm run test:e2e  # e2e tests (real API, requires .env)
npm run typecheck # tsc --noEmit
npm run dev       # tsx watch src/index.ts (HTTP mode)
```

E2E tests require a `.env` file (copy from `.env.example` and fill in `API_KEY`).

Tech: TypeScript (ESM/NodeNext), `@modelcontextprotocol/sdk`, `zod`, `sharp`, `pino`. No external test framework — built-in `node:test`.

## License

MIT
