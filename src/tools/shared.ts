import { z } from 'zod';
import type { ImageProcessor } from '../services/image-processor.js';
import type { ModelClient } from '../services/model-client.js';
import type { ConcurrencyLimiter } from '../services/concurrency.js';
import type { ImageInput, ProcessMode } from '../types.js';

export const ImageInputSchema = z.object({
  base64: z.string().min(1),
  mimeType: z.string().optional(),
});

export interface ToolContext {
  processor: ImageProcessor;
  model: ModelClient;
  limiter: ConcurrencyLimiter;
}

export async function runSingleImageTool(args: {
  ctx: ToolContext;
  image: ImageInput;
  mode: ProcessMode;
  prompt: string;
  question: string;
  maxTokens?: number;
}): Promise<string> {
  return args.ctx.limiter.run(async () => {
    const image = await args.ctx.processor.process(args.image, args.mode);
    const result = await args.ctx.model.complete({
      system: args.prompt,
      userText: args.question,
      image,
      maxTokens: args.maxTokens,
    });
    return result.text;
  });
}

export async function runDoubleImageTool(args: {
  ctx: ToolContext;
  before: ImageInput;
  after: ImageInput;
  mode: ProcessMode;
  prompt: string;
  question: string;
  maxTokens?: number;
}): Promise<string> {
  return args.ctx.limiter.run(async () => {
    const [before, after] = await Promise.all([
      args.ctx.processor.process(args.before, args.mode),
      args.ctx.processor.process(args.after, args.mode),
    ]);
    const result = await args.ctx.model.completeMulti({
      system: args.prompt,
      userText: args.question,
      images: [before, after],
      maxTokens: args.maxTokens,
    });
    return result.text;
  });
}

export async function toolText(fn: () => Promise<string>): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  try {
    return { content: [{ type: 'text' as const, text: await fn() }] };
  } catch (e) {
    return { content: [{ type: 'text' as const, text: e instanceof Error ? e.message : '工具执行失败' }], isError: true };
  }
}
