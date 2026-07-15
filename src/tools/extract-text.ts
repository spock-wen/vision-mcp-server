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

export function registerExtractText(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'extract_text_from_screenshot',
    {
      title: 'OCR 文字提取',
      description: '从截图中高精度提取文字，保留原始排版与结构。OCR 模式使用更高分辨率。',
      inputSchema: {
        image: ImageInputSchema,
        language: z.string().optional().describe('语言提示，可选'),
      } as unknown as ZodRawShapeCompat,
    },
    async (args) => toolText(() =>
      runSingleImageTool({
        ctx,
        image: args.image,
        mode: 'ocr',
        prompt: SYSTEM_PROMPTS.extractText,
        question: args.language ? `语言提示: ${args.language}` : '请提取图片中的全部文字。',
      }),
    ),
  );
}
