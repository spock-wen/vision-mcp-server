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

export function registerDiagnoseError(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'diagnose_error_screenshot',
    {
      title: '错误截图诊断',
      description: '分析错误截图（堆栈/控制台/报错弹窗），定位原因并给出修复建议。',
      inputSchema: {
        image: ImageInputSchema,
        context: z.string().optional().describe('额外上下文描述，可选'),
      } as unknown as ZodRawShapeCompat,
    },
    async (args) => toolText(() =>
      runSingleImageTool({
        ctx,
        image: args.image,
        mode: 'standard',
        prompt: SYSTEM_PROMPTS.diagnoseError,
        question: args.context ? `额外上下文: ${args.context}` : '请诊断该错误截图。',
      }),
    ),
  );
}
