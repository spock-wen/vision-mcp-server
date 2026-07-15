import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { runDoubleImageTool, ImageInputSchema, toolText, type ToolContext } from './shared.js';
import { SYSTEM_PROMPTS } from '../prompts/index.js';

export function registerUiDiffCheck(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'ui_diff_check',
    {
      title: 'UI 对比检查',
      description: '对比两张 UI 截图的视觉差异并按严重程度标注。两张图共享上下文。',
      inputSchema: {
        image_before: ImageInputSchema,
        image_after: ImageInputSchema,
        focus: z.string().optional().describe('关注点，可选'),
      } as unknown as ZodRawShapeCompat,
    },
    async (args) => toolText(() =>
      runDoubleImageTool({
        ctx,
        before: args.image_before,
        after: args.image_after,
        mode: 'diff',
        prompt: SYSTEM_PROMPTS.uiDiffCheck,
        question: args.focus ? `关注点: ${args.focus}` : '请逐项列出两张截图的视觉差异。',
      }),
    ),
  );
}
