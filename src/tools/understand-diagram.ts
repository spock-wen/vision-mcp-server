import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { runSingleImageTool, ImageInputSchema, type ToolContext } from './shared.js';
import { SYSTEM_PROMPTS } from '../prompts/index.js';

async function toolText(fn: () => Promise<string>) {
  try {
    return { content: [{ type: 'text' as const, text: await fn() }] };
  } catch (e) {
    return { content: [{ type: 'text' as const, text: e instanceof Error ? e.message : '工具执行失败' }], isError: true };
  }
}

export function registerUnderstandDiagram(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'understand_technical_diagram',
    {
      title: '技术图表理解',
      description: '对技术图表进行结构化解读。diagram_type: architecture | flowchart | uml | er | general。',
      inputSchema: {
        image: ImageInputSchema,
        diagram_type: z.enum(['architecture', 'flowchart', 'uml', 'er', 'general']).optional(),
      } as unknown as ZodRawShapeCompat,
    },
    async (args) => toolText(() =>
      runSingleImageTool({
        ctx,
        image: args.image,
        mode: 'standard',
        prompt: SYSTEM_PROMPTS.understandDiagram,
        question: args.diagram_type ? `图表类型: ${args.diagram_type}` : '请解读该技术图表。',
      }),
    ),
  );
}
