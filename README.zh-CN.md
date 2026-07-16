# Vision MCP Server

[English](./README.md) | [中文](./README.zh-CN.md)

一个 [MCP](https://modelcontextprotocol.io)（Model Context Protocol）服务器，基于**任意兼容 Anthropic Messages 协议的识图模型**，提供 **7 个视觉工具**——通用图像分析、UI 转代码、OCR、错误诊断、图表理解、数据可视化分析、UI 对比。

兼容 **Claude Code** 及任何 MCP 客户端。你只需指向自己的模型 API（地址 + Key + 模型 ID），即可获得一套开箱即用的视觉能力。

## 为什么需要它

- **7 个聚焦工具**，而非一个泛泛的"看图"调用——每个任务配专用系统提示词（OCR、对比、数据可视化……），效果远好于通用调用。
- **两种传输模式**：**本地 stdio**（Claude Code 直接拉起进程；工具读本地文件**路径**，图片字节不进入对话上下文）和**远程 HTTP**（自部署，多设备共享）。
- **生产级管线**：多 Key 轮换 + 冷却重试、全局与每 Key 并发控制、图像预处理（缩放 + JPEG Q80）+ 分模式分辨率上限。
- **模型无关**：只要能对接 Anthropic Messages API（`POST /v1/messages` + base64 图片）即可。内置默认值只是示例。

## 工具一览

| 工具 | 功能 | 分辨率上限 |
|---|---|---|
| `image_analysis` | 基于任意问题分析图片 | 2048 |
| `ui_to_artifact` | UI 截图转 代码 / 提示词 / 设计规范 / 描述 | 2048 |
| `diagnose_error_screenshot` | 诊断错误截图（堆栈/控制台/弹窗），定位原因并给修复建议 | 2048 |
| `understand_technical_diagram` | 结构化解读技术图表（架构/流程图/UML/ER） | 2048 |
| `analyze_data_visualization` | 分析数据图表——趋势 / 异常 / 摘要 | 2048 |
| `extract_text_from_screenshot` | 高精度 OCR，保留排版与结构 | 4096 |
| `ui_diff_check` | 对比两张截图，按严重程度列出视觉差异 | 1536×2 |

每个工具支持以**本地 `path`**（stdio 模式，推荐）或 **`base64`** 传入图片，外加任务相关参数。

## 快速开始

### 方式 A——本地 stdio 模式（推荐，个人/团队本地使用）

Claude Code 把本项目作为本地进程拉起。工具直接读本地文件路径，**图片不进入对话上下文**——零 base64 开销。

在 Claude Code 的 MCP 配置（`~/.claude.json`）中加入：

```json
{
  "mcpServers": {
    "vision-mcp-server": {
      "command": "npx",
      "args": ["-y", "github:spock-wen/vision-mcp-server"],
      "env": {
        "API_KEY": "你的模型 API Key",
        "API_BASE_URL": "https://your-model-endpoint.example.com",
        "MODEL_ID": "your-model-id"
      }
    }
  }
}
```

然后在 Claude Code 里说：*"分析 /Users/me/screenshot.png"*——路径会传给工具，由本地进程读取。

或用命令行添加：
```bash
claude mcp add vision-mcp-server -- npx -y github:spock-wen/vision-mcp-server
```

### 方式 B——远程 HTTP 模式（自部署，多设备共享）

```bash
git clone https://github.com/spock-wen/vision-mcp-server.git
cd vision-mcp-server
npm install && npm run build
API_KEYS=key1,key2 npm start
```

监听 `PORT`（默认 3000）。端点：`POST /mcp`（MCP）、`GET /health`。

```bash
claude mcp add -s user vision-mcp-server --transport http http://localhost:3000/mcp
```

Docker：
```bash
echo "API_KEYS=key1,key2" > .env
docker compose up -d
```

## 在 Claude Code 中使用工具

你需要在消息中**指定工具名**，模型才会调用正确的工具。贴上**本地图片路径**并写明工具名；服务器在本地读取文件，图片字节**完全不进入你的对话上下文**（不占 token、不卡顿）。

> 务必优先使用**本地 `path`**（`image.path`）。只有 `image.base64` 会进入上下文——仅在本地没有文件时才用。

| 工具 | 在 Claude Code 里这样说 | 关键参数 |
|---|---|---|
| `image_analysis` | *"使用 `image_analysis` 工具分析下 /Users/me/pic.jpg 里有什么"* | `question` |
| `ui_to_artifact` | *"使用 `ui_to_artifact` 工具把 /Users/me/login.png 转成 React + Tailwind 代码"* | `task`：`code` \| `prompt` \| `design-spec` \| `description` |
| `diagnose_error_screenshot` | *"使用 `diagnose_error_screenshot` 工具诊断这张报错截图 /Users/me/err.png"* | `context`（可选） |
| `understand_technical_diagram` | *"使用 `understand_technical_diagram` 工具解读下这张架构图 /Users/me/arch.png"* | `diagram_type`（可选） |
| `analyze_data_visualization` | *"使用 `analyze_data_visualization` 工具总结下 /Users/me/chart.png 的数据趋势"* | `analysis_focus`（可选） |
| `extract_text_from_screenshot` | *"使用 `extract_text_from_screenshot` 工具识别下 /Users/me/receipt.png 里的文字"* | `language`（可选） |
| `ui_diff_check` | *"使用 `ui_diff_check` 工具对比 /Users/me/v1.png 和 /Users/me/v2.png，哪里变了？"* | 两张图 + `focus`（可选） |

### Slash 命令——显式指定工具

本项目自带 **7 个 Slash 命令**（`commands/` 目录下的 `.md` 文件），让你**直接告诉 Claude 调用哪个 MCP 工具**——无需依赖模型猜测，零歧义。本地安装本项目（或将 `commands/` 文件夹复制到你的项目），然后输入命令加图片路径即可：

| 命令 | 调用的工具 | 示例 |
|---|---|---|
| `/vision-analyze` | `image_analysis` | `/vision-analyze /Users/me/pic.jpg 里有什么` |
| `/vision-ui2code` | `ui_to_artifact` | `/vision-ui2code /Users/me/login.png` |
| `/vision-err` | `diagnose_error_screenshot` | `/vision-err /Users/me/err.png` |
| `/vision-diagram` | `understand_technical_diagram` | `/vision-diagram /Users/me/arch.png` |
| `/vision-dataviz` | `analyze_data_visualization` | `/vision-dataviz /Users/me/chart.png` |
| `/vision-ocr` | `extract_text_from_screenshot` | `/vision-ocr /Users/me/receipt.png` |
| `/vision-diff` | `ui_diff_check` | `/vision-diff /Users/me/v1.png /Users/me/v2.png` |

每条命令会自动从你的输入中提取图片路径，映射到对应工具参数（`image.path`、`image_before`/`image_after` 等），你无需关心参数名。

> **提示：** 如果你克隆了仓库并以本地 MCP 服务器方式运行（如 `command: "node", args: ["dist/index.js"]`），`commands/` 目录已就绪——直接输入 slash 命令即可。如果你用 `npx` 运行服务器，需将 `commands/` 文件夹复制到你的项目根目录或工作区，Claude Code 才能发现这些命令。

## 配置

全部通过环境变量配置。**前三个与你的模型相关**——其余均为带合理默认值的调参项。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `API_KEY` | *（必填）* | 你的模型 API Key（单个）。 |
| `API_KEYS` | *（可选）* | 逗号分隔的多个 Key（多 Key 轮换）。与 `API_KEY` 合并。 |
| `API_BASE_URL` | *（见说明）* | 模型 API 基础地址（服务器会拼接 `/v1/messages`）。 |
| `MODEL_ID` | *（见说明）* | 请求体中携带的模型 ID。 |
| `REJECT_UNAUTHORIZED` | `1` | 设 `0` 跳过 TLS 校验——**仅限内网自签端点**。 |
| `PORT` | `3000` | HTTP 端口（仅 HTTP 模式）。 |
| `MAX_CONCURRENCY` | `100` | 全局最大并发请求数。 |
| `PER_KEY_CONCURRENCY` | `20` | 单 Key 最大并发请求数。 |
| `MAX_RETRIES` | `3` | 单请求最大重试次数。 |
| `KEY_COOLDOWN_MS` | `60000` | 失败 Key 的冷却时长（401/403/429）。 |
| `IMAGE_MAX_SIZE_MB` | `10` | 解码后图片最大体积。 |
| `IMAGE_MAX_DIMENSION` | `2048` | 标准模式分辨率上限。 |
| `IMAGE_OCR_MAX_DIMENSION` | `4096` | OCR 模式分辨率上限。 |
| `LOG_LEVEL` | `info` | [pino](https://github.com/pinojs/pino) 日志级别。 |

> **默认值仅为示例。** 内置默认值指向某个特定端点，是为了开箱即用；但本服务器与模型无关——把 `API_BASE_URL` 和 `MODEL_ID` 指向任意兼容 Anthropic Messages 的识图模型即可。只有 `API_KEY` 是严格必填。

> **内网自签证书端点：** 若 `API_BASE_URL` 使用自签证书（如公司内部模型网关），需设 `REJECT_UNAUTHORIZED=0`，否则连接失败。仅在受信任的内网使用。

## 开发

```bash
npm test          # node:test 跑 src/**/*.test.ts
npm run typecheck # tsc --noEmit
npm run dev       # tsx watch src/index.ts（HTTP 模式）
```

技术栈：TypeScript（ESM/NodeNext）、`@modelcontextprotocol/sdk`、`zod`、`sharp`、`pino`。无外部测试框架——用内置 `node:test`。

## 说明

- **优先用本地路径。** stdio 模式下传 `image.path`，工具直接读文件，图片字节不进入对话上下文。仅当没有本地文件时才用 `image.base64`。
- 模型 API 必须能接收 **Anthropic Messages `source` 格式的 base64 图片**。本地 path 支持是我们的便捷层——服务器最终仍会 base64 编码后再调模型。
- Token 成本随分辨率而非文件大小增长——故用 JPEG Q80 + 分模式上限。
- HTTP 传输为**无状态**（`sessionIdGenerator: undefined`）以支持水平扩展；每个请求创建独立的 transport 与 server。

## License

MIT
