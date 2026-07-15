import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Logger } from '../utils/logger.js';

export function buildTransport(logger: Logger): StreamableHTTPServerTransport {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  transport.onerror = (err) => {
    logger.error({ err: err.message }, 'transport error');
  };
  logger.info('stateless Streamable HTTP transport created');
  return transport;
}
