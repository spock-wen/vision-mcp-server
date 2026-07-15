import pino, { type Logger } from 'pino';

export function createLogger(level: string = 'info'): Logger {
  return pino({
    level,
    base: { service: 'vision-mcp-server' },
    redact: ['*.key', 'apiKeys', '*.api_key'],
  });
}

export type { Logger };
