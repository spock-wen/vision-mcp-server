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

export function registerAnalyzeDataViz(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'analyze_data_visualization',
    {
      title: '数据可视化分析',
      description: '分析数据图表，输出趋势、异常与业务要点。analysis_focus: trends | anomalies | summary | all。',
      inputSchema: {
        image: ImageInputSchema,
        analysis_focus: z.enum(['trends', 'anomalies', 'summary', 'all']).optional(),
      } as unknown as ZodRawShapeCompat,
    },
    async (args) => toolText(() =>
      runSingleImageTool({
        ctx,
        image: args.image,
        mode: 'standard',
        prompt: SYSTEM_PROMPTS.analyzeDataViz,
        question: args.analysis_focus ? `分析重点: ${args.analysis_focus}` : '请全面分析该数据可视化。',
      }),
    ),
  );
}
