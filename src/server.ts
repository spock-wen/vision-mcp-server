import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { AppConfig } from './config.js';
import { createLogger } from './utils/logger.js';
import { KeyPool } from './services/key-pool.js';
import { ModelClient } from './services/model-client.js';
import { ImageProcessor } from './services/image-processor.js';
import { ConcurrencyLimiter } from './services/concurrency.js';
import { registerAllTools } from './tools/index.js';
import { buildTransport } from './transport/streamable-http.js';
import type { ToolContext } from './tools/shared.js';

export interface VisionMcpServer {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  handleRequest: (req: IncomingMessage, res: ServerResponse, parsedBody?: unknown) => Promise<void>;
  keyPool: KeyPool;
  limiter: ConcurrencyLimiter;
}

export function createVisionServer(cfg: AppConfig): VisionMcpServer {
  const logger = createLogger(cfg.logLevel);

  const keyPool = new KeyPool({ keys: cfg.apiKeys, perKeyConcurrency: cfg.perKeyConcurrency, cooldownMs: cfg.keyCooldownMs }, logger);
  const model = new ModelClient(cfg, keyPool, logger);
  const processor = new ImageProcessor(
    { maxSizeBytes: cfg.imageMaxSizeBytes, standardMaxDim: cfg.imageStandardMaxDim, ocrMaxDim: cfg.imageOcrMaxDim, diffMaxDim: 1536 },
    logger,
  );
  const limiter = new ConcurrencyLimiter(cfg.maxConcurrency, logger);
  const ctx: ToolContext = { processor, model, limiter };

  const server = new McpServer({ name: 'vision-mcp-server', version: '1.0.0' });
  registerAllTools(server, ctx);

  const transport = buildTransport(logger);

  // Connect synchronously-initiated; ignore promise here (server start awaits via connect below)
  const connected = server.connect(transport);

  const handleRequest = (req: IncomingMessage, res: ServerResponse, parsedBody?: unknown) =>
    connected.then(() => transport.handleRequest(req, res, parsedBody));

  return { server, transport, handleRequest, keyPool, limiter };
}
