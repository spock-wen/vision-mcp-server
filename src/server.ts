import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppConfig } from './config.js';
import { createLogger } from './utils/logger.js';
import type { Logger } from './utils/logger.js';
import { KeyPool } from './services/key-pool.js';
import { ModelClient } from './services/model-client.js';
import { ImageProcessor } from './services/image-processor.js';
import { ConcurrencyLimiter } from './services/concurrency.js';
import { registerAllTools } from './tools/index.js';
import { buildTransport } from './transport/streamable-http.js';
import type { ToolContext } from './tools/shared.js';
import pkg from '../package.json' with { type: 'json' };

export interface VisionMcpServer {
  /** Shared logger (services use the same one). */
  logger: Logger;
  /** Build a fresh, connected McpServer for introspection/testing (registers all tools). */
  buildServer: () => Promise<McpServer>;
  /** Handle one HTTP request with a fresh transport+server (stateless, per-request). */
  handleRequest: (req: IncomingMessage, res: ServerResponse, parsedBody?: unknown) => Promise<void>;
  keyPool: KeyPool;
  limiter: ConcurrencyLimiter;
}

export function createVisionServer(cfg: AppConfig): VisionMcpServer {
  const logger = createLogger(cfg.logLevel);

  const keyPool = new KeyPool({ keys: cfg.apiKeys, perKeyConcurrency: cfg.perKeyConcurrency, cooldownMs: cfg.keyCooldownMs }, logger);
  const model = new ModelClient(cfg, keyPool, logger);
  const processor = new ImageProcessor(
    { maxSizeBytes: cfg.imageMaxSizeBytes, standardMaxDim: cfg.imageStandardMaxDim, ocrMaxDim: cfg.imageOcrMaxDim, diffMaxDim: cfg.imageDiffMaxDim },
    logger,
  );
  const limiter = new ConcurrencyLimiter(cfg.maxConcurrency, logger);
  const ctx: ToolContext = { processor, model, limiter };

  // Shared factory: builds a fresh McpServer with all tools registered + a fresh transport, connected.
  const buildServer = async (): Promise<McpServer> => {
    const server = new McpServer({ name: 'vision-mcp-server', version: pkg.version });
    registerAllTools(server, ctx);
    const transport = buildTransport(logger);
    await server.connect(transport);
    return server;
  };

  const handleRequest = async (req: IncomingMessage, res: ServerResponse, parsedBody?: unknown) => {
    const transport = buildTransport(logger);
    const server = new McpServer({ name: 'vision-mcp-server', version: pkg.version });
    registerAllTools(server, ctx);
    await server.connect(transport);
    try {
      await transport.handleRequest(req, res, parsedBody);
    } finally {
      // clean up per-request resources; ignore close errors on an already-closed transport
      await transport.close().catch(() => {});
      await server.close().catch(() => {});
    }
  };

  return { logger, buildServer, handleRequest, keyPool, limiter };
}

/**
 * Build a vision McpServer connected to a StdioServerTransport (local MCP use).
 * Shares the same services/tools as the HTTP server, but talks over stdin/stdout
 * so cc (or any MCP client) can spawn it as a local process — letting tools read
 * local image paths directly instead of receiving base64 over the wire.
 */
export async function createStdioServer(cfg: AppConfig): Promise<McpServer> {
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const logger = createLogger(cfg.logLevel);

  const keyPool = new KeyPool({ keys: cfg.apiKeys, perKeyConcurrency: cfg.perKeyConcurrency, cooldownMs: cfg.keyCooldownMs }, logger);
  const model = new ModelClient(cfg, keyPool, logger);
  const processor = new ImageProcessor(
    { maxSizeBytes: cfg.imageMaxSizeBytes, standardMaxDim: cfg.imageStandardMaxDim, ocrMaxDim: cfg.imageOcrMaxDim, diffMaxDim: cfg.imageDiffMaxDim },
    logger,
  );
  const limiter = new ConcurrencyLimiter(cfg.maxConcurrency, logger);
  const ctx: ToolContext = { processor, model, limiter };

  const server = new McpServer({ name: 'vision-mcp-server', version: pkg.version });
  registerAllTools(server, ctx);
  await server.connect(new StdioServerTransport());
  return server;
}
