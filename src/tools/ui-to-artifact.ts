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

export function registerUiToArtifact(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'ui_to_artifact',
    {
      title: 'UI 截图转代码',
      description: '根据 UI 截图生成代码/提示词/设计规范/描述。task: code | prompt | design-spec | description。',
      inputSchema: {
        image: ImageInputSchema,
        task: z.enum(['code', 'prompt', 'design-spec', 'description']),
      } as unknown as ZodRawShapeCompat,
    },
    async (args) => toolText(() =>
      runSingleImageTool({ ctx, image: args.image, mode: 'standard', prompt: SYSTEM_PROMPTS.uiToArtifact, question: `目标产物类型: ${args.task}` }),
    ),
  );
}
