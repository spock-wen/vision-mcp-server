# Vision MCP Server

[English](./README.md) | [中文](./README.zh-CN.md)

一个 [MCP](https://modelcontextprotocol.io)（Model Context Protocol）服务器，基于**任意兼容 Anthropic Messages 协议的识图模型**，提供 **7 个视觉工具**——通用图像分析、UI 转代码、OCR、错误诊断、图表理解、数据可视化分析、UI 对比。

兼容 **Claude Code** 及任何 MCP 客户端。你只需指向自己的模型 API（地址 + Key + 模型 ID），即可获得一套开箱即用的视觉能力。

### 一句话安装

复制下面的提示词发给你的 AI agent（Claude 等），替换成你自己的值即可：

```
安装下这个 MCP https://github.com/spock-wen/vision-mcp-server
配置下
API_KEY: 你的APIKey
API_BASE_URL: 你的URL
MODEL_ID: 指定的多模态模型ID，例如kimi-k2.6
并配置下斜杆命令
```

---

## AI Agent 快速配置

> **给 AI agent（Claude 等）：** 当用户要求你安装此 MCP 服务器时，按以下步骤操作。只有 `API_KEY` 是严格必填；`API_BASE_URL` 和 `MODEL_ID` 有内置默认值，但应根据用户的模型提供商设置。服务器会自动在 `API_BASE_URL` 后拼接 `/v1/messages`。

### 第 1 步 — 配置 MCP 服务器

添加到 `~/.claude.json` → `mcpServers`：

```json
{
  "mcpServers": {
    "vision-mcp-server": {
      "command": "npx",
      "args": ["-y", "@spock-wen/vision-mcp-server"],
      "env": {
        "API_KEY": "<必填：用户的模型 API Key>",
        "API_BASE_URL": "<模型 API 基础地址，服务器自动拼接 /v1/messages>",
        "MODEL_ID": "<视觉模型 ID>"
      }
    }
  }
}
```

或通过命令行：
```bash
claude mcp add vision-mcp-server -e API_KEY=<key> -e API_BASE_URL=<url> -e MODEL_ID=<model> -- npx -y @spock-wen/vision-mcp-server
```

### 第 2 步 — 安装 Slash 命令

Slash 命令让用户可以显式触发特定工具。在**项目根目录**下执行以下命令下载：

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

> 如果仓库已克隆到本地（如 `command: "node", args: ["build/index.js"]`），直接复制或软链接 `commands/` 文件夹到 `.claude/commands/` 即可。

| 命令 | 调用的工具 |
|---|---|
| `/vision-analyze` | `image_analysis` |
| `/vision-ui2code` | `ui_to_artifact` |
| `/vision-err` | `diagnose_error_screenshot` |
| `/vision-diagram` | `understand_technical_diagram` |
| `/vision-dataviz` | `analyze_data_visualization` |
| `/vision-ocr` | `extract_text_from_screenshot` |
| `/vision-diff` | `ui_diff_check` |

### 常见提供商配置示例

| 提供商 | `API_BASE_URL` | `MODEL_ID` |
|---|---|---|
| 讯飞 MaaS | `https://maas-coding-api.cn-huabei-1.xf-yun.com/anthropic` | `xopkimik26` |
| Moonshot（Kimi） | *（需向提供商确认）* | `kimi-k2.6` |
| OpenRouter | *（需向提供商确认）* | *（取决于你的套餐）* |
| 任意 Anthropic 兼容端点 | `<你的端点>` | `<你的模型 ID>` |

> 模型 API 必须支持 `POST /v1/messages`，并接受 Anthropic Messages `source` 格式的 base64 图片。Key 以 `x-api-key` 请求头发送。

---

## 工具一览

| 工具 | 功能 | 关键参数 | 分辨率上限 |
|---|---|---|---|
| `image_analysis` | 基于任意问题分析图片 | `question`（必填） | 2048 |
| `ui_to_artifact` | UI 截图转代码 / 提示词 / 设计规范 / 描述 | `task`：`code` \| `prompt` \| `design-spec` \| `description` | 2048 |
| `diagnose_error_screenshot` | 诊断错误截图，定位原因并给修复建议 | `context`（可选） | 2048 |
| `understand_technical_diagram` | 结构化解读技术图表 | `diagram_type`：`architecture` \| `flowchart` \| `uml` \| `er` \| `general`（可选） | 2048 |
| `analyze_data_visualization` | 分析数据图表——趋势 / 异常 / 摘要 | `analysis_focus`：`trends` \| `anomalies` \| `summary` \| `all`（可选） | 2048 |
| `extract_text_from_screenshot` | 高精度 OCR，保留排版与结构 | `language`（可选） | 4096 |
| `ui_diff_check` | 对比两张截图，按严重程度列出视觉差异 | 两张图 + `focus`（可选） | 1536×2 |

每个工具支持以**本地 `path`**（推荐——图片字节不进入对话上下文）或 **`base64`** 传入图片。支持格式：**PNG、JPEG、GIF、WebP、BMP**。所有图片在发送给模型前会重新编码为 JPEG Q80。

## 其他部署方式

### 远程 HTTP 模式（自部署，多设备共享）

```bash
git clone https://github.com/spock-wen/vision-mcp-server.git
cd vision-mcp-server
npm install && npm run build
API_KEY=你的key API_BASE_URL=https://你的端点 MODEL_ID=你的模型 npm start
```

监听 `PORT`（默认 3000）。端点：`POST /mcp`（MCP）、`GET /health`。

```bash
claude mcp add -s user vision-mcp-server --transport http http://localhost:3000/mcp
```

Docker：
```bash
cat > .env << 'EOF'
API_KEY=你的key
API_BASE_URL=https://你的端点
MODEL_ID=你的模型
EOF
docker compose up -d
```

### 验证安装

**HTTP 模式：**
```bash
curl http://localhost:3000/health
# → {"status":"ok","keys":{"total":1,"available":1,"cooldown":0},"concurrency":{"current":0,"max":100}}
```

**Stdio 模式：**
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' | API_KEY=test npx -y @spock-wen/vision-mcp-server
```

## 前置条件

- **Node.js >= 20**（用 `node -v` 检查）
- **npm**（随 Node 20+ 自带）
- 支持 Linux、macOS、Windows

## 配置

全部通过环境变量配置。**前三个与你的模型相关**——其余均为带合理默认值的调参项。

### 必填

| 变量 | 说明 |
|---|---|
| `API_KEY` | 你的模型 API Key（单个）。必须设置。 |

### 模型连接

| 变量 | 默认值 | 说明 |
|---|---|---|
| `API_KEYS` | *（无）* | 逗号分隔的多个 Key（多 Key 轮换）。与 `API_KEY` 合并。 |
| `API_BASE_URL` | `https://maas-coding-api.cn-huabei-1.xf-yun.com/anthropic` | 模型 API 基础地址（服务器会拼接 `/v1/messages`）。 |
| `MODEL_ID` | `xopkimik26` | 请求体中携带的模型 ID。 |
| `REJECT_UNAUTHORIZED` | `1` | 设 `0` 跳过 TLS 校验——**仅限内网自签端点**。警告：此设置会禁用整个进程的 TLS 校验。 |

### 调参

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3000` | HTTP 端口（仅 HTTP 模式）。 |
| `MAX_CONCURRENCY` | `100` | 全局最大并发请求数。 |
| `PER_KEY_CONCURRENCY` | `20` | 单 Key 最大并发请求数。 |
| `MAX_RETRIES` | `3` | 单请求最大重试次数。 |
| `RETRY_DELAY_MS` | `1000` | 重试间指数退避的基础延迟（毫秒）。 |
| `MAX_RETRY_DELAY_MS` | `10000` | 重试间指数退避的最大延迟（毫秒）。 |
| `KEY_COOLDOWN_MS` | `60000` | 失败 Key 的冷却时长（401/403/429）。 |
| `IMAGE_MAX_SIZE_MB` | `10` | 输入图片文件最大体积。 |
| `IMAGE_MAX_DIMENSION` | `2048` | 标准模式分辨率上限。 |
| `IMAGE_OCR_MAX_DIMENSION` | `4096` | OCR 模式分辨率上限。 |
| `IMAGE_DIFF_MAX_DIMENSION` | `1536` | Diff 模式分辨率上限（每张图）。 |
| `MODEL_TIMEOUT_MS` | `30000` | 单次模型 API 请求超时（毫秒）。 |
| `LOG_LEVEL` | `info` | [pino](https://github.com/pinojs/pino) 日志级别。 |

## 常见问题

| 错误 | 原因 | 解决 |
|---|---|---|
| `AllKeysUnavailableError` | 所有 API Key 处于冷却或并发上限 | 等待冷却结束、通过 `API_KEYS` 添加更多 Key、或增大 `PER_KEY_CONCURRENCY` |
| `UnsupportedImageFormatError` | 图片格式不支持 | 使用 PNG、JPEG、GIF、WebP 或 BMP |
| `ImageTooLargeError` | 图片超过大小限制 | 减小图片体积或增大 `IMAGE_MAX_SIZE_MB` |
| HTTP 413 `Payload Too Large` | 请求体超过 50MB | 减小图片体积（仅 HTTP 模式） |
| TLS 连接错误 | 模型端点使用自签证书 | 设置 `REJECT_UNAUTHORIZED=0`（仅限内网） |
| `sharp` 原生绑定失败 | Linux 精简环境缺少 `libvips` | 安装：`apt install libvips` 或 `brew install vips` |
| Linux/macOS 上 `-32000` MCP 连接错误 | `npx` 无法执行 `cli.js` | 确保 Node.js >= 20；此问题已在 v1.0.1 修复（shebang） |

## 安全

- **API Key** 以 `x-api-key` 请求头发送至模型端点。请保护你的配置文件（如 `chmod 600 ~/.claude.json`）。
- **HTTP 端点无认证。** 任何能访问 `POST /mcp` 的人都可以使用你的 API Key。生产环境请使用反向代理或防火墙。
- **`REJECT_UNAUTHORIZED=0`** 会禁用整个进程的 TLS 校验，不仅限于模型请求。仅在受信任的内网使用。
- **请求体大小限制**：HTTP 请求体硬上限 50MB，防止内存耗尽。
- **日志脱敏**：API Key 在 pino 日志输出中会被自动遮蔽。

## 开发

```bash
npm test          # node:test 跑 src/**/*.test.ts
npm run typecheck # tsc --noEmit
npm run dev       # tsx watch src/index.ts（HTTP 模式）
```

技术栈：TypeScript（ESM/NodeNext）、`@modelcontextprotocol/sdk`、`zod`、`sharp`、`pino`。无外部测试框架——用内置 `node:test`。

## License

MIT
