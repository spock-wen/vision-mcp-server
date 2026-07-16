/**
 * Local stdio MCP entry point.
 *
 * cc (or any MCP client) spawns this as a child process and talks JSON-RPC over
 * stdin/stdout. Tools then receive local file paths and read them directly, so
 * image bytes never travel through the caller's conversation context.
 *
 * Configuration comes from the environment (set in the client's mcp config):
 *   API_KEY       — 讯飞 key (the full `id:secret` string)
 *   API_BASE_URL  — model API base (default: 讯飞 MaaS Anthropic endpoint)
 *   MODEL_ID      — model id (default: xopkimik26)
 *   ...plus the usual concurrency / image caps (all optional, sensible defaults)
 *
 * Usage from cc config:
 *   command: npx
 *   args: ['-y', 'github:spock-wen/vision-mcp-server']
 *   env: { API_KEY: 'xxx:yyy' }
 */
import { loadConfig } from './config.js';
import { createStdioServer } from './server.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const server = await createStdioServer(cfg);
  // keep the process alive until the client disconnects stdio
  const onClose = () => { void server.close().catch(() => {}); process.exit(0); };
  process.on('SIGINT', onClose);
  process.on('SIGTERM', onClose);
}

main().catch((err) => {
  // stdio MCP must not write diagnostics to stdout (that's the JSON-RPC channel);
  // route fatal startup errors to stderr.
  console.error('vision-mcp (stdio) fatal:', err);
  process.exit(1);
});
