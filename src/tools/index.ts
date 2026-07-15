import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from './shared.js';
import { registerImageAnalysis } from './image-analysis.js';
import { registerUiToArtifact } from './ui-to-artifact.js';
import { registerDiagnoseError } from './diagnose-error.js';
import { registerUnderstandDiagram } from './understand-diagram.js';
import { registerAnalyzeDataViz } from './analyze-dataviz.js';
import { registerExtractText } from './extract-text.js';
import { registerUiDiffCheck } from './ui-diff-check.js';

export function registerAllTools(server: McpServer, ctx: ToolContext): void {
  registerImageAnalysis(server, ctx);
  registerUiToArtifact(server, ctx);
  registerDiagnoseError(server, ctx);
  registerUnderstandDiagram(server, ctx);
  registerAnalyzeDataViz(server, ctx);
  registerExtractText(server, ctx);
  registerUiDiffCheck(server, ctx);
}

export { ImageInputSchema } from './shared.js';
export type { ToolContext } from './shared.js';
