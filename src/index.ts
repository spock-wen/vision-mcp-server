import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { loadConfig } from './config.js';
import { createLogger } from './utils/logger.js';
import { createVisionServer } from './server.js';
import { createHealthHandler } from './health.js';
import { bodyAccumulator } from './body-limit.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const logger = createLogger(cfg.logLevel);
  const vision = createVisionServer(cfg);

  const health = createHealthHandler({ keyPool: vision.keyPool, limiter: vision.limiter });

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'GET' && req.url === '/health') {
      health(res);
      return;
    }
    if (req.url === '/mcp' || req.url?.startsWith('/mcp/') || req.url?.startsWith('/mcp?')) {
      // Body parsing for POST
      if (req.method === 'POST' || req.method === 'PUT') {
        const acc = bodyAccumulator();
        let tooLarge = false;
        req.on('data', (c: Buffer) => {
          if (tooLarge) return;
          if (!acc.push(c)) {
            tooLarge = true;
            if (!res.headersSent) { res.statusCode = 413; res.end('Payload Too Large'); }
            req.destroy();
            return;
          }
        });
        req.on('end', () => {
          if (tooLarge) return;
          const raw = Buffer.concat(acc.chunks).toString('utf8');
          let parsed: unknown = undefined;
          try { parsed = raw.length ? JSON.parse(raw) : undefined; } catch { parsed = raw; }
          vision.handleRequest(req, res, parsed).catch((err) => {
            logger.error({ err: (err as Error).message }, 'handleRequest failed');
            if (!res.headersSent) { res.statusCode = 500; res.end('Internal Server Error'); }
          });
        });
        req.on('error', () => { if (!res.headersSent) { res.statusCode = 400; res.end('Bad Request'); } });
        return;
      }
      // GET / DELETE on /mcp — pass through without body
      vision.handleRequest(req, res).catch((err) => {
        logger.error({ err: (err as Error).message }, 'handleRequest failed');
        if (!res.headersSent) { res.statusCode = 500; res.end('Internal Server Error'); }
      });
      return;
    }
    res.statusCode = 404;
    res.end('Not Found');
  });

  httpServer.listen(cfg.port, () => {
    logger.info({ port: cfg.port }, 'vision-mcp-server listening');
  });

  const shutdown = (sig: string) => {
    logger.info({ sig }, 'shutting down');
    httpServer.close(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('fatal startup error', err);
  process.exit(1);
});
