import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { runSingleImageTool, ImageInputSchema, toolText, type ToolContext } from './shared.js';
import { SYSTEM_PROMPTS } from '../prompts/index.js';

export function registerImageAnalysis(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'image_analysis',
    {
      title: '通用图像分析',
      description: '对任意图片进行基于问题的通用分析，返回分析结论与细节。',
      inputSchema: {
        image: ImageInputSchema,
        question: z.string().min(1).describe('分析问题'),
      } as unknown as ZodRawShapeCompat,
    },
    async (args) => toolText(() =>
      runSingleImageTool({ ctx, image: args.image, mode: 'standard', prompt: SYSTEM_PROMPTS.imageAnalysis, question: args.question }),
    ),
  );
}
