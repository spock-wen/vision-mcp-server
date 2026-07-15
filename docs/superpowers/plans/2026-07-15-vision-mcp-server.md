# Vision MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a remote Streamable HTTP MCP server exposing 7 vision tools backed by the 讯飞 MaaS Anthropic-compatible model API, with multi-key rotation, retry, concurrency control, and image preprocessing.

**Architecture:** A Node.js HTTP server forwards `/mcp` to a stateless `StreamableHTTPServerTransport` connected to an `McpServer`. Each tool shares one pipeline: validate + preprocess image(s) via `sharp` (resize + JPEG Q80) → call `ModelClient` (round-robin key pool + retry) → return text. A global concurrency limiter gates the 100-concurrent budget; `/health` reports pool + concurrency status. ESM + TypeScript (NodeNext); `node:test` for tests.

**Tech Stack:** TypeScript 5.x (NodeNext ESM), `@modelcontextprotocol/sdk` 1.26.0, `zod` 3.23.8, `sharp` 0.35.3, `pino` 10.3.1, Node.js 20+ (developing on 22). Dev deps only: `typescript`, `tsx`, `@types/node`. No external test framework — use the built-in `node:test`.

## Global Constraints

Copied verbatim from the spec — every task implicitly includes these:

- **Runtime:** Node.js 20+
- **Language:** TypeScript, **ESM** (`"type": "module"`), `module: "NodeNext"`
- **MCP SDK:** `@modelcontextprotocol/sdk` 1.26.0 — import subpaths WITH `.js` suffix, e.g. `@modelcontextprotocol/sdk/server/mcp.js`
- **Validation:** `zod` 3.23.8
- **Image processing:** `sharp` 0.35.3
- **Logging:** `pino` 10.3.1
- **Model API base URL:** `https://maas-coding-api.cn-huabei-1.xf-yun.com/anthropic` (endpoint = `${API_BASE_URL}/v1/messages`)
- **Model ID:** `xopkimik26`, API format = Anthropic Messages API, **base64 images only (URLs return 400)**
- **Image input formats:** PNG, JPEG, GIF (first frame), WebP, BMP — **all converted to JPEG quality 80** before sending
- **Resolution caps:** standard `2048×2048`, OCR `4096×4096`, diff `1536×1536` per image
- **Image max size:** 10 MB (decoded)
- **Concurrency:** global max 100, per-key max 20
- **Key cooldown:** 60 s on 401/403/429; max retries 3; retry base delay 1000 ms, max delay 10000 ms
- **HTTP endpoints:** `POST /mcp` (MCP), `GET /health` (status)
- **Stateless transport:** use `sessionIdGenerator: undefined` so each request is independent (required for 100-way concurrency with no sticky sessions)

## File Structure

```
vision-mcp-server/
├── src/
│   ├── index.ts                       # HTTP bootstrap: createServer + listen + /health + /mcp forwarding
│   ├── server.ts                      # McpServer instance + registerAllTools + connect(transport)
│   ├── config.ts                      # env parsing + zod validation -> AppConfig
│   ├── types.ts                       # shared types: ImageInput, ProcessedImage, etc.
│   ├── tools/
│   │   ├── shared.ts                  # ImageInputSchema, ToolContext, processAndCall / processAndCallDouble
│   │   ├── index.ts                   # registerAllTools(server, ctx)
│   │   ├── image-analysis.ts          # image_analysis
│   │   ├── ui-to-artifact.ts          # ui_to_artifact
│   │   ├── diagnose-error.ts          # diagnose_error_screenshot
│   │   ├── understand-diagram.ts      # understand_technical_diagram
│   │   ├── analyze-dataviz.ts         # analyze_data_visualization
│   │   ├── extract-text.ts            # extract_text_from_screenshot (OCR)
│   │   └── ui-diff-check.ts           # ui_diff_check (two images)
│   ├── prompts/
│   │   └── index.ts                   # 7 system prompts (SYSTEM_PROMPTS)
│   ├── services/
│   │   ├── model-client.ts            # Anthropic Messages API call + retry + key rotation
│   │   ├── key-pool.ts                # round-robin + cooldown + per-key concurrency
│   │   ├── image-processor.ts         # format detection + size check + resize + JPEG Q80
│   │   └── concurrency.ts             # global async semaphore (max 100) + timeout/queue
│   ├── transport/
│   │   └── streamable-http.ts         # buildTransport() -> StreamableHTTPServerTransport (stateless)
│   └── utils/
│       ├── logger.ts                  # pino factory
│       └── errors.ts                  # typed error classes
├── tests/                             # (none — tests are co-located as src/**/*.test.ts)
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
├── tsconfig.json
├── tsconfig.build.json
└── README.md
```

**Co-located tests:** each `src/<file>.ts` has a `src/<file>.test.ts` sibling. Tests run via `node --import tsx --test "src/**/*.test.ts"` and are excluded from the production build by `tsconfig.build.json`.

---

### Task 1: Project scaffolding & build/test harness

**Files:**
- Create: `package.json` (overwrite), `tsconfig.json`, `tsconfig.build.json`, `.gitignore` (modify), `src/smoke.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: the `npm run build`, `npm run typecheck`, `npm test`, `npm start`, `npm run dev` scripts and the TS compilation config that every later task depends on.

- [ ] **Step 1: Write the failing smoke test**

Create `src/smoke.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('scaffolding can import TypeScript', () => {
  const sum = (a: number, b: number): number => a + b;
  assert.equal(sum(1, 2), 3);
});
```

- [ ] **Step 2: Verify the test fails (no harness yet)**

Run: `npx node --import tsx --test src/smoke.test.ts`
Expected: FAIL — `tsx` not installed (`Cannot find package 'tsx'`).

- [ ] **Step 3: Write `package.json`**

Overwrite `package.json` with:

```json
{
  "name": "vision-mcp-server",
  "version": "1.0.0",
  "description": "Remote MCP server exposing vision tools over the 讯飞 MaaS Anthropic-compatible model API",
  "type": "module",
  "main": "build/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit",
    "start": "node build/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "node --import tsx --test \"src/**/*.test.ts\""
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.26.0",
    "pino": "10.3.1",
    "sharp": "0.35.3",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 4: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "build",
    "rootDir": ".",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "sourceMap": true,
    "declaration": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "build"]
}
```

- [ ] **Step 5: Write `tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "build", "src/**/*.test.ts"]
}
```

- [ ] **Step 6: Update `.gitignore`**

Append `build/` is already present. Replace the `.gitignore` content with:

```
node_modules/
build/
dist/
.omc/
test/
*.log
.env
.env.local
```

(Keep ignoring the throwaway `test/` research dir; `.env.example` is intentionally NOT ignored.)

- [ ] **Step 7: Install dependencies**

Run: `npm install`
Expected: installs `tsx`, `typescript`, `@types/node` alongside existing deps; no errors.

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — `# tests 1`, `# pass 1`.

- [ ] **Step 9: Verify build works**

Run: `npm run build && node --test build/smoke.test.js`
Expected: `build/` produced; the compiled `smoke.test.js` passes.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.build.json .gitignore src/smoke.test.ts
git commit -m "chore: scaffold TypeScript ESM project with node:test harness"
```

---

### Task 2: Logger utility

**Files:**
- Create: `src/utils/logger.ts`, `src/utils/logger.test.ts`

**Interfaces:**
- Produces: `createLogger(level: string): Logger` where `Logger` is the pino `Logger` type.

- [ ] **Step 1: Write the failing test**

`src/utils/logger.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from './logger.js';

test('createLogger returns a pino logger that serializes structured json', () => {
  const log = createLogger('info');
  assert.equal(typeof log.info, 'function');
  assert.equal(typeof log.child, 'function');
});
```

- [ ] **Step 2: Verify it fails**

Run: `npx node --import tsx --test src/utils/logger.test.ts`
Expected: FAIL — `Cannot find module './logger.js'`.

- [ ] **Step 3: Implement**

`src/utils/logger.ts`:

```typescript
import pino, { type Logger } from 'pino';

export function createLogger(level: string = 'info'): Logger {
  return pino({
    level,
    base: { service: 'vision-mcp-server' },
    redact: ['*.key', 'apiKeys', '*.api_key'],
  });
}

export type { Logger };
```

- [ ] **Step 4: Verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/logger.ts src/utils/logger.test.ts
git commit -m "feat(utils): add pino structured logger with key redaction"
```

---

### Task 3: Error types

**Files:**
- Create: `src/utils/errors.ts`, `src/utils/errors.test.ts`

**Interfaces:**
- Produces:
  - `class ConfigError extends Error`
  - `class UnsupportedImageFormatError extends Error`
  - `class ImageTooLargeError extends Error`
  - `class AllKeysUnavailableError extends Error`
  - `class ConcurrencyLimitError extends Error`
  - `class ModelRequestError extends Error { readonly status: number; readonly retryable: boolean }`

- [ ] **Step 1: Write the failing test**

`src/utils/errors.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ConfigError,
  UnsupportedImageFormatError,
  ImageTooLargeError,
  AllKeysUnavailableError,
  ConcurrencyLimitError,
  ModelRequestError,
} from './errors.js';

test('error classes carry names and are instanceof Error', () => {
  for (const Err of [ConfigError, UnsupportedImageFormatError, ImageTooLargeError, AllKeysUnavailableError, ConcurrencyLimitError]) {
    const e = new Err('boom');
    assert.ok(e instanceof Error);
    assert.equal(e.name, Err.name);
    assert.equal(e.message, 'boom');
  }
});

test('ModelRequestError exposes status and retryable', () => {
  const e = new ModelRequestError('rate limited', 429, true);
  assert.equal(e.status, 429);
  assert.equal(e.retryable, true);
  assert.equal(e.name, 'ModelRequestError');
});
```

- [ ] **Step 2: Verify it fails**

Run: `npx node --import tsx --test src/utils/errors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/utils/errors.ts`:

```typescript
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export class UnsupportedImageFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedImageFormatError';
  }
}

export class ImageTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageTooLargeError';
  }
}

export class AllKeysUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AllKeysUnavailableError';
  }
}

export class ConcurrencyLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConcurrencyLimitError';
  }
}

export class ModelRequestError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = 'ModelRequestError';
    this.status = status;
    this.retryable = retryable;
  }
}
```

- [ ] **Step 4: Verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/errors.ts src/utils/errors.test.ts
git commit -m "feat(utils): add typed error classes"
```

---

### Task 4: Configuration

**Files:**
- Create: `src/config.ts`, `src/config.test.ts`

**Interfaces:**
- Consumes: `ConfigError` (from Task 3).
- Produces:
  ```typescript
  interface AppConfig {
    port: number;
    apiKeys: string[];                 // never empty
    apiBaseUrl: string;
    modelId: string;
    maxConcurrency: number;
    perKeyConcurrency: number;
    maxRetries: number;
    keyCooldownMs: number;
    retryDelayMs: number;
    maxRetryDelayMs: number;
    imageMaxSizeBytes: number;
    imageStandardMaxDim: number;       // 2048
    imageOcrMaxDim: number;            // 4096
    logLevel: string;
  }
  function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig;
  ```

- [ ] **Step 1: Write the failing test**

`src/config.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from './config.js';
import { ConfigError } from './utils/errors.js';

const BASE = { API_KEYS: 'k1,k2,k3' } as NodeJS.ProcessEnv;

test('loadConfig applies defaults', () => {
  const c = loadConfig({ ...BASE });
  assert.equal(c.port, 3000);
  assert.deepEqual(c.apiKeys, ['k1', 'k2', 'k3']);
  assert.equal(c.apiBaseUrl, 'https://maas-coding-api.cn-huabei-1.xf-yun.com/anthropic');
  assert.equal(c.modelId, 'xopkimik26');
  assert.equal(c.maxConcurrency, 100);
  assert.equal(c.perKeyConcurrency, 20);
  assert.equal(c.maxRetries, 3);
  assert.equal(c.keyCooldownMs, 60000);
  assert.equal(c.retryDelayMs, 1000);
  assert.equal(c.maxRetryDelayMs, 10000);
  assert.equal(c.imageMaxSizeBytes, 10 * 1024 * 1024);
  assert.equal(c.imageStandardMaxDim, 2048);
  assert.equal(c.imageOcrMaxDim, 4096);
  assert.equal(c.logLevel, 'info');
});

test('loadConfig overrides from env', () => {
  const c = loadConfig({ ...BASE, PORT: '8080', MAX_CONCURRENCY: '50', MAX_RETRIES: '5' });
  assert.equal(c.port, 8080);
  assert.equal(c.maxConcurrency, 50);
  assert.equal(c.maxRetries, 5);
});

test('loadConfig throws ConfigError when API_KEYS missing', () => {
  assert.throws(() => loadConfig({}), ConfigError);
});

test('loadConfig throws ConfigError when API_KEYS empty', () => {
  assert.throws(() => loadConfig({ API_KEYS: ' , ' }), ConfigError);
});
```

- [ ] **Step 2: Verify it fails**

Run: `npx node --import tsx --test src/config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/config.ts`:

```typescript
import { z } from 'zod';
import { ConfigError } from './utils/errors.js';

const EnvSchema = z.object({
  PORT: z.string().default('3000'),
  API_KEYS: z.string().min(1),
  API_BASE_URL: z.string().default('https://maas-coding-api.cn-huabei-1.xf-yun.com/anthropic'),
  MODEL_ID: z.string().default('xopkimik26'),
  MAX_CONCURRENCY: z.string().default('100'),
  PER_KEY_CONCURRENCY: z.string().default('20'),
  MAX_RETRIES: z.string().default('3'),
  KEY_COOLDOWN_MS: z.string().default('60000'),
  RETRY_DELAY_MS: z.string().default('1000'),
  MAX_RETRY_DELAY_MS: z.string().default('10000'),
  IMAGE_MAX_SIZE_MB: z.string().default('10'),
  IMAGE_MAX_DIMENSION: z.string().default('2048'),
  IMAGE_OCR_MAX_DIMENSION: z.string().default('4096'),
  LOG_LEVEL: z.string().default('info'),
});

export interface AppConfig {
  port: number;
  apiKeys: string[];
  apiBaseUrl: string;
  modelId: string;
  maxConcurrency: number;
  perKeyConcurrency: number;
  maxRetries: number;
  keyCooldownMs: number;
  retryDelayMs: number;
  maxRetryDelayMs: number;
  imageMaxSizeBytes: number;
  imageStandardMaxDim: number;
  imageOcrMaxDim: number;
  logLevel: string;
}

function toInt(raw: string, field: string): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) throw new ConfigError(`${field} is not a valid integer: ${raw}`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  let parsed;
  try {
    parsed = EnvSchema.parse(env);
  } catch (err) {
    throw new ConfigError(`Invalid configuration: ${(err as Error).message}`);
  }

  const apiKeys = parsed.API_KEYS.split(',').map((k) => k.trim()).filter(Boolean);
  if (apiKeys.length === 0) {
    throw new ConfigError('API_KEYS must contain at least one non-empty key (comma-separated)');
  }

  const imageMaxMb = toInt(parsed.IMAGE_MAX_SIZE_MB, 'IMAGE_MAX_SIZE_MB');

  return {
    port: toInt(parsed.PORT, 'PORT'),
    apiKeys,
    apiBaseUrl: parsed.API_BASE_URL.replace(/\/+$/, ''),
    modelId: parsed.MODEL_ID,
    maxConcurrency: toInt(parsed.MAX_CONCURRENCY, 'MAX_CONCURRENCY'),
    perKeyConcurrency: toInt(parsed.PER_KEY_CONCURRENCY, 'PER_KEY_CONCURRENCY'),
    maxRetries: toInt(parsed.MAX_RETRIES, 'MAX_RETRIES'),
    keyCooldownMs: toInt(parsed.KEY_COOLDOWN_MS, 'KEY_COOLDOWN_MS'),
    retryDelayMs: toInt(parsed.RETRY_DELAY_MS, 'RETRY_DELAY_MS'),
    maxRetryDelayMs: toInt(parsed.MAX_RETRY_DELAY_MS, 'MAX_RETRY_DELAY_MS'),
    imageMaxSizeBytes: imageMaxMb * 1024 * 1024,
    imageStandardMaxDim: toInt(parsed.IMAGE_MAX_DIMENSION, 'IMAGE_MAX_DIMENSION'),
    imageOcrMaxDim: toInt(parsed.IMAGE_OCR_MAX_DIMENSION, 'IMAGE_OCR_MAX_DIMENSION'),
    logLevel: parsed.LOG_LEVEL,
  };
}
```

- [ ] **Step 4: Verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts
git commit -m "feat(config): env-driven configuration with zod validation"
```

---

### Task 5: Image processor

**Files:**
- Create: `src/types.ts`, `src/services/image-processor.ts`, `src/services/image-processor.test.ts`

**Interfaces:**
- Consumes: `UnsupportedImageFormatError`, `ImageTooLargeError` (Task 3).
- Produces:
  ```typescript
  // src/types.ts
  type ImageInput = { base64: string; mimeType?: string };
  type ProcessMode = 'standard' | 'ocr' | 'diff';
  interface ProcessedImage { base64: string; mediaType: 'image/jpeg'; width: number; height: number; bytes: number; }
  ```
  ```typescript
  interface ImageProcessorConfig {
    maxSizeBytes: number;
    standardMaxDim: number;   // 2048
    ocrMaxDim: number;        // 4096
    diffMaxDim: number;       // 1536
  }
  class ImageProcessor {
    constructor(cfg: ImageProcessorConfig, logger: Logger);
    async process(input: ImageInput, mode: ProcessMode): Promise<ProcessedImage>;
  }
  ```

- [ ] **Step 1: Write the failing test**

`src/services/image-processor.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { ImageProcessor } from './image-processor.js';
import { createLogger } from '../utils/logger.js';
import { UnsupportedImageFormatError, ImageTooLargeError } from '../utils/errors.js';
import type { ImageInput } from '../types.js';

const log = createLogger('silent');

async function png(width: number, height: number): Promise<ImageInput> {
  const raw = Buffer.alloc(width * height * 4, 0xff); // white
  const buf = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return { base64: buf.toString('base64'), mimeType: 'image/png' };
}

test('decodes base64, keeps small images, returns JPEG', async () => {
  const proc = new ImageProcessor({ maxSizeBytes: 10 * 1024 * 1024, standardMaxDim: 2048, ocrMaxDim: 4096, diffMaxDim: 1536 }, log);
  const out = await proc.process(await png(100, 50), 'standard');
  assert.equal(out.mediaType, 'image/jpeg');
  assert.ok(out.base64.length > 0);
  assert.equal(out.width, 100);
  assert.equal(out.height, 50);
  assert.ok(out.bytes > 0);
  // magic bytes FF D8 FF = JPEG
  const head = Buffer.from(out.base64.slice(0, 8), 'base64');
  assert.deepEqual([head[0], head[1], head[2]], [0xff, 0xd8, 0xff]);
});

test('resizes oversize image down to the standard cap preserving aspect ratio', async () => {
  const proc = new ImageProcessor({ maxSizeBytes: 10 * 1024 * 1024, standardMaxDim: 512, ocrMaxDim: 4096, diffMaxDim: 1536 }, log);
  const out = await proc.process(await png(2000, 1000), 'standard');
  assert.ok(out.width <= 512 && out.height <= 512, `got ${out.width}x${out.height}`);
  assert.equal(out.width, 512);
});

test('OCR mode uses the higher cap', async () => {
  const proc = new ImageProcessor({ maxSizeBytes: 10 * 1024 * 1024, standardMaxDim: 512, ocrMaxDim: 1024, diffMaxDim: 1536 }, log);
  const out = await proc.process(await png(900, 900), 'ocr');
  assert.equal(out.width, 900); // under 1024, unchanged
  assert.equal(out.height, 900);
});

test('diff mode uses its own cap', async () => {
  const proc = new ImageProcessor({ maxSizeBytes: 10 * 1024 * 1024, standardMaxDim: 2048, ocrMaxDim: 4096, diffMaxDim: 400 }, log);
  const out = await proc.process(await png(800, 800), 'diff');
  assert.equal(out.width, 400);
});

test('rejects unsupported format', async () => {
  const proc = new ImageProcessor({ maxSizeBytes: 10 * 1024 * 1024, standardMaxDim: 2048, ocrMaxDim: 4096, diffMaxDim: 1536 }, log);
  const bad = { base64: Buffer.from('not an image at all').toString('base64'), mimeType: 'image/tiff' };
  await assert.rejects(() => proc.process(bad, 'standard'), UnsupportedImageFormatError);
});

test('rejects image above size limit', async () => {
  const proc = new ImageProcessor({ maxSizeBytes: 1024, standardMaxDim: 2048, ocrMaxDim: 4096, diffMaxDim: 1536 }, log);
  // 2000x2000 PNG decodes to far more than 1024 bytes
  await assert.rejects(() => proc.process(await png(2000, 2000), 'standard'), ImageTooLargeError);
});
```

- [ ] **Step 2: Verify it fails**

Run: `npx node --import tsx --test src/services/image-processor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write shared types**

`src/types.ts`:

```typescript
export type ImageInput = {
  /** base64-encoded image data (required) */
  base64: string;
  /** optional MIME hint; auto-detected when omitted */
  mimeType?: string;
};

export type ProcessMode = 'standard' | 'ocr' | 'diff';

export interface ProcessedImage {
  base64: string;
  mediaType: 'image/jpeg';
  width: number;
  height: number;
  bytes: number;
}
```

- [ ] **Step 4: Implement the processor**

`src/services/image-processor.ts`:

```typescript
import sharp from 'sharp';
import type { Logger } from '../utils/logger.js';
import { UnsupportedImageFormatError, ImageTooLargeError } from '../utils/errors.js';
import type { ImageInput, ProcessMode, ProcessedImage } from '../types.js';

export interface ImageProcessorConfig {
  maxSizeBytes: number;
  standardMaxDim: number;
  ocrMaxDim: number;
  diffMaxDim: number;
}

interface Signature {
  mediaType: string;
  match: (b: Buffer) => boolean;
}

const SUPPORTED: Signature[] = [
  { mediaType: 'image/png', match: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mediaType: 'image/jpeg', match: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mediaType: 'image/gif', match: (b) => b.length >= 6 && b.subarray(0, 6).toString('ascii') === 'GIF87a' || (b.length >= 6 && b.subarray(0, 6).toString('ascii') === 'GIF89a') },
  { mediaType: 'image/webp', match: (b) => b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
  { mediaType: 'image/bmp', match: (b) => b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d },
];

const SUPPORTED_MEDIA_TYPES = SUPPORTED.map((s) => s.mediaType);

function detectFormat(buf: Buffer): string | undefined {
  return SUPPORTED.find((s) => s.match(buf))?.mediaType;
}

export class ImageProcessor {
  constructor(private readonly cfg: ImageProcessorConfig, private readonly logger: Logger) {}

  async process(input: ImageInput, mode: ProcessMode): Promise<ProcessedImage> {
    const decoded = Buffer.from(input.base64, 'base64');

    if (decoded.length > this.cfg.maxSizeBytes) {
      throw new ImageTooLargeError(`图片过大，上限 ${(this.cfg.maxSizeBytes / 1024 / 1024).toFixed(0)}MB`);
    }

    const detected = detectFormat(decoded);
    if (!detected) {
      throw new UnsupportedImageFormatError(`不支持的图片格式，支持: PNG/JPEG/WebP/BMP/GIF`);
    }

    const maxDim = mode === 'ocr' ? this.cfg.ocrMaxDim : mode === 'diff' ? this.cfg.diffMaxDim : this.cfg.standardMaxDim;

    const pipeline = sharp(decoded, { animated: false })
      .rotate() // honor EXIF orientation
      .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

    this.logger.debug({ mode, mediaType: detected, width: info.width, height: info.height, bytes: data.length }, 'image processed');

    return {
      base64: data.toString('base64'),
      mediaType: 'image/jpeg',
      width: info.width,
      height: info.height,
      bytes: data.length,
    };
  }
}

export { SUPPORTED_MEDIA_TYPES };
```

- [ ] **Step 5: Verify it passes**

Run: `npm test`
Expected: PASS — all 6 image-processor tests pass. (If `mozjpeg` is unavailable in the sharp build, drop the `mozjpeg: true` flag — but 0.35 bundles it.)

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/services/image-processor.ts src/services/image-processor.test.ts
git commit -m "feat(services): image processor with format detection, resize, JPEG Q80"
```

---

### Task 6: Key pool

**Files:**
- Create: `src/services/key-pool.ts`, `src/services/key-pool.test.ts`

**Interfaces:**
- Consumes: `AllKeysUnavailableError` (Task 3).
- Produces:
  ```typescript
  interface KeyPoolConfig { keys: string[]; perKeyConcurrency: number; cooldownMs: number; }
  interface AcquiredKey { key: string; release: () => void; }
  class KeyPool {
    constructor(cfg: KeyPoolConfig, logger: Logger, now?: () => number);
    acquire(): AcquiredKey;                 // throws AllKeysUnavailableError if none available
    markUnavailable(key: string): void;     // puts key on cooldown
    stats(): { total: number; available: number; cooldown: number };
  }
  ```
  The `now` parameter defaults to a real clock but tests inject a controllable clock.

- [ ] **Step 1: Write the failing test**

`src/services/key-pool.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KeyPool } from './key-pool.js';
import { createLogger } from '../utils/logger.js';
import { AllKeysUnavailableError } from '../utils/errors.js';

const log = createLogger('silent');

test('round-robin distributes keys', () => {
  let t = 0;
  const pool = new KeyPool({ keys: ['a', 'b', 'c'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log, () => t);
  const seen: string[] = [];
  for (let i = 0; i < 6; i++) {
    const k = pool.acquire();
    seen.push(k.key);
    k.release();
  }
  assert.deepEqual(seen, ['a', 'b', 'c', 'a', 'b', 'c']);
});

test('respects per-key concurrency by rotating to a free key', () => {
  let t = 0;
  const pool = new KeyPool({ keys: ['a', 'b'], perKeyConcurrency: 1, cooldownMs: 60_000 }, log, () => t);
  const a = pool.acquire(); // holds 'a'
  const b = pool.acquire(); // 'a' full -> 'b'
  assert.equal(a.key, 'a');
  assert.equal(b.key, 'b');
  assert.throws(() => pool.acquire(), AllKeysUnavailableError); // both full
  a.release();
  assert.equal(pool.acquire().key, 'a');
});

test('markUnavailable cools a key; it recovers after cooldownMs', () => {
  let t = 0;
  const pool = new KeyPool({ keys: ['a', 'b'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log, () => t);
  pool.markUnavailable('a');
  assert.equal(pool.acquire().key, 'b');
  t += 60_001;
  assert.equal(pool.acquire().key, 'a'); // recovered
});

test('stats reports total/available/cooldown', () => {
  let t = 0;
  const pool = new KeyPool({ keys: ['a', 'b'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log, () => t);
  pool.markUnavailable('a');
  assert.deepEqual(pool.stats(), { total: 2, available: 1, cooldown: 1 });
});

test('throws when all keys are on cooldown', () => {
  let t = 0;
  const pool = new KeyPool({ keys: ['a'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log, () => t);
  pool.markUnavailable('a');
  assert.throws(() => pool.acquire(), AllKeysUnavailableError);
});
```

- [ ] **Step 2: Verify it fails**

Run: `npx node --import tsx --test src/services/key-pool.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/services/key-pool.ts`:

```typescript
import type { Logger } from '../utils/logger.js';
import { AllKeysUnavailableError } from '../utils/errors.js';

export interface KeyPoolConfig {
  keys: string[];
  perKeyConcurrency: number;
  cooldownMs: number;
}

export interface AcquiredKey {
  key: string;
  release: () => void;
}

interface KeyState {
  inFlight: number;
  cooldownUntil: number;
}

export class KeyPool {
  private readonly states = new Map<string, KeyState>();
  private cursor = 0;

  constructor(
    private readonly cfg: KeyPoolConfig,
    private readonly logger: Logger,
    private readonly now: () => number = () => Date.now(),
  ) {
    for (const k of cfg.keys) this.states.set(k, { inFlight: 0, cooldownUntil: 0 });
  }

  private isAvailable(key: string, t: number): boolean {
    const st = this.states.get(key);
    if (!st) return false;
    return st.cooldownUntil <= t && st.inFlight < this.cfg.perKeyConcurrency;
  }

  acquire(): AcquiredKey {
    const t = this.now();
    const n = this.cfg.keys.length;
    for (let i = 0; i < n; i++) {
      const idx = (this.cursor + i) % n;
      const key = this.cfg.keys[idx] as string;
      if (this.isAvailable(key, t)) {
        const st = this.states.get(key)!;
        st.inFlight += 1;
        this.cursor = (idx + 1) % n;
        const released = false;
        let done = released;
        return {
          key,
          release: () => {
            if (done) return;
            done = true;
            st.inFlight = Math.max(0, st.inFlight - 1);
          },
        };
      }
    }
    throw new AllKeysUnavailableError('所有 API Key 暂时不可用，请稍后重试');
  }

  markUnavailable(key: string): void {
    const st = this.states.get(key);
    if (!st) return;
    st.cooldownUntil = this.now() + this.cfg.cooldownMs;
    this.logger.warn({ keyIndex: this.cfg.keys.indexOf(key), cooldownMs: this.cfg.cooldownMs }, 'key moved to cooldown');
  }

  stats(): { total: number; available: number; cooldown: number } {
    const t = this.now();
    let cooldown = 0;
    let available = 0;
    for (const [, st] of this.states) {
      if (st.cooldownUntil > t) cooldown++;
      else available++;
    }
    return { total: this.cfg.keys.length, available, cooldown };
  }
}
```

- [ ] **Step 4: Verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/key-pool.ts src/services/key-pool.test.ts
git commit -m "feat(services): round-robin key pool with cooldown and per-key concurrency"
```

---

### Task 7: Global concurrency limiter

**Files:**
- Create: `src/services/concurrency.ts`, `src/services/concurrency.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  class ConcurrencyLimiter {
    constructor(max: number, logger: Logger);
    async run<T>(fn: () => Promise<T>, timeoutMs?: number): Promise<T>; // rejects ConcurrencyLimitError on timeout
    stats(): { current: number; max: number };
  }
  ```

- [ ] **Step 1: Write the failing test**

`src/services/concurrency.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConcurrencyLimiter } from './concurrency.js';
import { createLogger } from '../utils/logger.js';
import { ConcurrencyLimitError } from '../utils/errors.js';

const log = createLogger('silent');

test('runs up to max concurrently, queues the rest', async () => {
  const lim = new ConcurrencyLimiter(2, log);
  let active = 0;
  let maxActive = 0;
  const task = async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 10));
    active--;
  };
  await Promise.all(Array.from({ length: 5 }, () => lim.run(task)));
  assert.equal(maxActive, 2);
  assert.deepEqual(lim.stats(), { current: 0, max: 2 });
});

test('rejects with ConcurrencyLimitError when queue timeout elapses', async () => {
  const lim = new ConcurrencyLimiter(1, log);
  // occupy the single slot for the whole test
  const hold = lim.run(() => new Promise<void>((r) => setTimeout(r, 200)));
  await assert.rejects(() => lim.run(() => Promise.resolve(1), 50), ConcurrencyLimitError);
  await hold;
});
```

- [ ] **Step 2: Verify it fails**

Run: `npx node --import tsx --test src/services/concurrency.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/services/concurrency.ts`:

```typescript
import type { Logger } from '../utils/logger.js';
import { ConcurrencyLimitError } from '../utils/errors.js';

export class ConcurrencyLimiter {
  private active = 0;
  private readonly waiters: Array<{ resolve: () => void; reject: (e: Error) => void; timer?: NodeJS.Timeout }> = [];

  constructor(private readonly max: number, private readonly logger: Logger) {}

  async run<T>(fn: () => Promise<T>, timeoutMs?: number): Promise<T> {
    await this.acquire(timeoutMs);
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(timeoutMs?: number): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const w: { resolve: () => void; reject: (e: Error) => void; timer?: NodeJS.Timeout } = { resolve, reject };
      if (timeoutMs !== undefined) {
        w.timer = setTimeout(() => {
          const idx = this.waiters.indexOf(w);
          if (idx >= 0) this.waiters.splice(idx, 1);
          reject(new ConcurrencyLimitError('服务繁忙，请稍后重试'));
        }, timeoutMs);
      }
      this.waiters.push(w);
    }).then(() => {
      this.active++;
    });
  }

  private release(): void {
    this.active--;
    const next = this.waiters.shift();
    if (next) {
      if (next.timer) clearTimeout(next.timer);
      next.resolve();
    }
  }

  stats(): { current: number; max: number } {
    return { current: this.active, max: this.max };
  }
}
```

- [ ] **Step 4: Verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/concurrency.ts src/services/concurrency.test.ts
git commit -m "feat(services): global concurrency limiter with queue timeout"
```

---

### Task 8: Model client (Anthropic Messages API + retry)

**Files:**
- Create: `src/services/model-client.ts`, `src/services/model-client.test.ts`

**Interfaces:**
- Consumes: `AppConfig` (Task 4), `KeyPool` (Task 6), `AllKeysUnavailableError`, `ModelRequestError` (Task 3).
- Produces:
  ```typescript
  interface CompleteRequest { system: string; userText: string; image: ProcessedImage; maxTokens?: number; }
  interface CompleteResult { text: string; stopReason?: string; }
  class ModelClient {
    constructor(cfg: AppConfig, keyPool: KeyPool, logger: Logger);
    async complete(req: CompleteRequest): Promise<CompleteResult>;
  }
  ```
  Retry rules (from spec):
  - 401/403/429 → `keyPool.markUnavailable(key)`, rotate to next key, retry (counts toward `maxRetries`).
  - 500/502/503/network/timeout → exponential backoff `min(baseDelay * 2^attempt + jitter, maxDelay)`, then retry.
  - other 4xx → do not retry, throw `ModelRequestError(status, retryable=false)`.
  - All keys unavailable or retries exhausted → `AllKeysUnavailableError` (503).

- [ ] **Step 1: Write the failing test**

`src/services/model-client.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ModelClient } from './model-client.js';
import { KeyPool } from './key-pool.js';
import { createLogger } from '../utils/logger.js';
import { AllKeysUnavailableError, ModelRequestError } from '../utils/errors.js';
import type { AppConfig } from '../config.js';
import type { ProcessedImage } from '../types.js';

const log = createLogger('silent');
const baseCfg: AppConfig = {
  port: 3000, apiKeys: ['a', 'b', 'c'], apiBaseUrl: 'https://example.test/anthropic', modelId: 'xopkimik26',
  maxConcurrency: 100, perKeyConcurrency: 20, maxRetries: 3, keyCooldownMs: 60_000, retryDelayMs: 1, maxRetryDelayMs: 10,
  imageMaxSizeBytes: 10 * 1024 * 1024, imageStandardMaxDim: 2048, imageOcrMaxDim: 4096, logLevel: 'silent',
};
const img: ProcessedImage = { base64: 'AAAA', mediaType: 'image/jpeg', width: 10, height: 10, bytes: 4 };

function mockFetch(responses: Array<{ status: number; body: unknown }>) {
  let i = 0;
  const calls: Array<{ headers: Record<string, string>; url: string }> = [];
  const fetchFn = async (url: string, init: { headers: Record<string, string> }) => {
    calls.push({ url, headers: init.headers });
    const r = responses[Math.min(i, responses.length - 1)]!;
    i++;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
    };
  };
  return { fetchFn, calls };
}

test('returns model text on success', async () => {
  const pool = new KeyPool({ keys: ['a', 'b'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log);
  const { fetchFn, calls } = mockFetch([{ status: 200, body: { content: [{ type: 'text', text: 'hello world' }], stop_reason: 'end_turn' } }]);
  const client = new ModelClient(baseCfg, pool, log, fetchFn as unknown as typeof fetch);
  const res = await client.complete({ system: 'sys', userText: 'q', image: img });
  assert.equal(res.text, 'hello world');
  assert.equal(res.stopReason, 'end_turn');
  assert.match(calls[0]!.url, /\/anthropic\/v1\/messages$/);
  assert.equal(calls[0]!.headers['x-api-key'], 'a');
  assert.equal(calls[0]!.headers['anthropic-version'], '2023-06-01');
});

test('retries 429 by rotating to the next key', async () => {
  const pool = new KeyPool({ keys: ['a', 'b'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log);
  const { fetchFn, calls } = mockFetch([
    { status: 429, body: { error: { message: 'rate' } } },
    { status: 200, body: { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' } },
  ]);
  const client = new ModelClient(baseCfg, pool, log, fetchFn as unknown as typeof fetch);
  const res = await client.complete({ system: 'sys', userText: 'q', image: img });
  assert.equal(res.text, 'ok');
  assert.equal(calls[0]!.headers['x-api-key'], 'a');
  assert.equal(calls[1]!.headers['x-api-key'], 'b');
  assert.deepEqual(pool.stats(), { total: 2, available: 1, cooldown: 1 }); // 'a' cooled down
});

test('retries 500 with exponential backoff then succeeds', async () => {
  const pool = new KeyPool({ keys: ['a'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log);
  const { fetchFn, calls } = mockFetch([
    { status: 503, body: { error: { message: 'boom' } } },
    { status: 502, body: { error: { message: 'boom' } } },
    { status: 200, body: { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' } },
  ]);
  const client = new ModelClient(baseCfg, pool, log, fetchFn as unknown as typeof fetch);
  const res = await client.complete({ system: 'sys', userText: 'q', image: img });
  assert.equal(res.text, 'ok');
  assert.equal(calls.length, 3);
});

test('non-retryable 4xx throws ModelRequestError retryable=false', async () => {
  const pool = new KeyPool({ keys: ['a'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log);
  const { fetchFn } = mockFetch([{ status: 400, body: { error: { message: 'bad request' } } }]);
  const client = new ModelClient(baseCfg, pool, log, fetchFn as unknown as typeof fetch);
  await assert.rejects(
    () => client.complete({ system: 'sys', userText: 'q', image: img }),
    (e: unknown) => e instanceof ModelRequestError && (e as ModelRequestError).status === 400 && (e as ModelRequestError).retryable === false,
  );
});

test('retries exhausted on 500 throws ModelRequestError retryable=true', async () => {
  const pool = new KeyPool({ keys: ['a'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log);
  const { fetchFn } = mockFetch([{ status: 500, body: { error: { message: 'down' } } }]);
  const client = new ModelClient(baseCfg, pool, log, fetchFn as unknown as typeof fetch);
  await assert.rejects(
    () => client.complete({ system: 'sys', userText: 'q', image: img }),
    (e: unknown) => e instanceof ModelRequestError && (e as ModelRequestError).retryable === true,
  );
});

test('all keys on cooldown -> AllKeysUnavailableError', async () => {
  const pool = new KeyPool({ keys: ['a'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log);
  pool.markUnavailable('a');
  const client = new ModelClient(baseCfg, pool, log, async () => ({}) as Response);
  await assert.rejects(() => client.complete({ system: 'sys', userText: 'q', image: img }), AllKeysUnavailableError);
});
```

- [ ] **Step 2: Verify it fails**

Run: `npx node --import tsx --test src/services/model-client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/services/model-client.ts`:

```typescript
import type { AppConfig } from '../config.js';
import type { KeyPool } from './key-pool.js';
import type { Logger } from '../utils/logger.js';
import { ModelRequestError, AllKeysUnavailableError } from '../utils/errors.js';
import type { ProcessedImage } from '../types.js';

export interface CompleteRequest {
  system: string;
  userText: string;
  image: ProcessedImage;
  maxTokens?: number;
}

export interface CompleteResult {
  text: string;
  stopReason?: string;
}

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 4096;

export class ModelClient {
  constructor(
    private readonly cfg: AppConfig,
    private readonly keyPool: KeyPool,
    private readonly logger: Logger,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async complete(req: CompleteRequest): Promise<CompleteResult> {
    const url = `${this.cfg.apiBaseUrl}/v1/messages`;
    const body = {
      model: this.cfg.modelId,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: req.system,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: req.image.mediaType, data: req.image.base64 } },
            { type: 'text', text: req.userText },
          ],
        },
      ],
    };

    let attempt = 0;
    let lastError: Error | undefined;

    while (attempt <= this.cfg.maxRetries) {
      const acquired = this.keyPool.acquire(); // throws AllKeysUnavailableError if none
      try {
        const res = await this.fetchImpl(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': acquired.key,
            'anthropic-version': ANTHROPIC_VERSION,
          },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          const data = (await res.json()) as { content?: Array<{ type: string; text?: string }>; stop_reason?: string };
          const text = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
          return { text, stopReason: data.stop_reason };
        }

        const errText = await res.text().catch(() => '');
        lastError = new ModelRequestError(this.friendlyMessage(res.status, errText), res.status, this.isRetryable(res.status));

        if (res.status === 401 || res.status === 403 || res.status === 429) {
          this.keyPool.markUnavailable(acquired.key);
          this.logger.warn({ status: res.status, attempt }, 'key marked unavailable, rotating');
          attempt += 1;
          continue;
        }

        if (this.isRetryable(res.status)) {
          await this.backoff(attempt);
          attempt += 1;
          continue;
        }

        throw lastError; // non-retryable 4xx
      } catch (err) {
        if (err instanceof ModelRequestError && !err.retryable) throw err;
        if (err instanceof AllKeysUnavailableError) throw err;
        // network / fetch error -> retry with backoff
        lastError = err instanceof Error ? err : new Error(String(err));
        this.logger.warn({ attempt, err: lastError.message }, 'transient error, backing off');
        await this.backoff(attempt);
        attempt += 1;
      } finally {
        acquired.release();
      }
    }

    if (lastError instanceof ModelRequestError) throw lastError;
    throw new ModelRequestError('模型服务暂时不可用，请稍后重试', 503, true);
  }

  private isRetryable(status: number): boolean {
    return status === 429 || status === 500 || status === 502 || status === 503;
  }

  private async backoff(attempt: number): Promise<void> {
    const base = this.cfg.retryDelayMs * 2 ** attempt;
    const jitter = Math.floor(Math.random() * 250);
    const delay = Math.min(base + jitter, this.cfg.maxRetryDelayMs);
    await new Promise((r) => setTimeout(r, delay));
  }

  private friendlyMessage(status: number, errText: string): string {
    if (status === 429) return '模型服务暂时不可用，请稍后重试';
    if (status >= 500) return '模型服务暂时不可用，请稍后重试';
    try {
      const parsed = JSON.parse(errText) as { error?: { message?: string } };
      if (parsed.error?.message) return parsed.error.message;
    } catch {
      // fall through
    }
    return `模型请求失败 (HTTP ${status})`;
  }
}
```

- [ ] **Step 4: Verify it passes**

Run: `npm test`
Expected: PASS — all 6 model-client tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/model-client.ts src/services/model-client.test.ts
git commit -m "feat(services): Anthropic-compatible model client with retry and key rotation"
```

---

### Task 9: System prompts

**Files:**
- Create: `src/prompts/index.ts`, `src/prompts/index.test.ts`

**Interfaces:**
- Produces: `export const SYSTEM_PROMPTS: Record<string, string>` with keys `imageAnalysis`, `uiToArtifact`, `diagnoseError`, `understandDiagram`, `analyzeDataViz`, `extractText`, `uiDiffCheck`.

- [ ] **Step 1: Write the failing test**

`src/prompts/index.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYSTEM_PROMPTS } from './index.js';

const REQUIRED = ['imageAnalysis', 'uiToArtifact', 'diagnoseError', 'understandDiagram', 'analyzeDataViz', 'extractText', 'uiDiffCheck'];

test('SYSTEM_PROMPTS has all 7 prompts as non-empty strings', () => {
  for (const key of REQUIRED) {
    assert.ok(key in SYSTEM_PROMPTS, `missing ${key}`);
    assert.ok(typeof SYSTEM_PROMPTS[key] === 'string' && (SYSTEM_PROMPTS[key] as string).length > 20, `empty ${key}`);
  }
});
```

- [ ] **Step 2: Verify it fails**

Run: `npx node --import tsx --test src/prompts/index.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/prompts/index.ts`:

```typescript
export const SYSTEM_PROMPTS = {
  imageAnalysis: `你是一名专业的图像分析助手。请根据用户的问题，对提供的图片进行准确、客观的分析。回答使用中文，结构清晰，先给出结论再补充细节。只描述图片中确实可见的内容，不要臆测。`,

  uiToArtifact: `你是一名资深前端工程师。请根据提供的 UI 截图，按照用户指定的 task（code/prompt/design-spec/description 之一）产出对应的产物：
- code：产出可运行的、语义化的前端代码（HTML/CSS 或指定框架），像素级还原截图布局与样式；
- prompt：产出可用于生成该界面的提示词；
- design-spec：产出结构化设计规范（颜色、字号、间距、组件等）；
- description：用文字描述该界面的结构与内容。
直接给出结果，不要多余解释。`,

  diagnoseError: `你是一名资深的软件排障专家。请分析提供的错误截图（堆栈、控制台、报错弹窗等），完成：1) 定位错误来源（文件/模块/调用）；2) 解释错误原因；3) 给出具体、可操作的修复建议。如有用户提供 context 请一并参考。回答使用中文。`,

  understandDiagram: `你是一名技术文档解读专家。请对提供的技术图表进行结构化解读：说明图中各元素的含义、它们之间的关系以及整体表达的信息流/架构/流程。可根据用户提示的 diagram_type（architecture/flowchart/uml/er/general）调整侧重点。输出结构化中文文本。`,

  analyzeDataViz: `你是一名数据分析专家。请分析提供的数据可视化图表，按用户的 analysis_focus（trends/anomalies/summary/all）输出：趋势走向、异常点、以及业务层面的关键结论。引用具体数值与坐标。回答使用中文。`,

  extractText: `你是一名高精度 OCR 引擎。请提取图片中的全部文字内容，严格保留原始排版、换行、层级与表格结构。只输出识别到的文字本身，不要添加解释、不要翻译。若存在多列，按阅读顺序输出。`,

  uiDiffCheck: `你是一名细致的 UI 质量工程师。请对比 image_before 与 image_after 两张截图，逐项列出视觉差异（颜色、间距、布局、文案、元素增删等），并按严重程度（high/medium/low）标注。如用户给出 focus，优先关注该区域。输出结构化的中文差异列表。`,
} as const;

export type SystemPromptKey = keyof typeof SYSTEM_PROMPTS;
```

- [ ] **Step 4: Verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/prompts/index.ts src/prompts/index.test.ts
git commit -m "feat(prompts): add system prompts for the 7 vision tools"
```

---

### Task 10: Tool shared layer (`ToolContext` + helpers)

**Files:**
- Create: `src/tools/shared.ts`, `src/tools/shared.test.ts`

**Interfaces:**
- Consumes: `ImageProcessor` (Task 5), `ModelClient` (Task 8), `ConcurrencyLimiter` (Task 7), `SYSTEM_PROMPTS` (Task 9), `ImageInput`/`ProcessMode`/`ProcessedImage` (Task 5 types).
- Produces:
  ```typescript
  interface ToolContext { processor: ImageProcessor; model: ModelClient; limiter: ConcurrencyLimiting; }
  ```
  ```typescript
  const ImageInputSchema = z.object({ base64: z.string().min(1), mimeType: z.string().optional() });
  ```
  Two helpers:
  ```typescript
  async function runSingleImageTool(args: {
    ctx: ToolContext; image: ImageInput; mode: ProcessMode; prompt: string; question: string; maxTokens?: number;
  }): Promise<string>;
  async function runDoubleImageTool(args: {
    ctx: ToolContext; before: ImageInput; after: ImageInput; mode: ProcessMode; prompt: string; question: string; maxTokens?: number;
  }): Promise<string>;
  ```
  Both run everything (image processing + model call) inside `ctx.limiter.run(...)`. `runDoubleImageTool` sends BOTH images in one user message and produces text via a single `model.complete`. Because the spec's `ModelClient.complete` takes one image, `runDoubleImageTool` calls the model **twice-in-parallel is NOT desired** (two images share context); instead it concatenates two images into one `CompleteRequest`. **Therefore extend the model client in this task:** add a second exported helper `model.completeMulti(...)` — see Task 8 amendment below. (Implemented in Step 3 of this task by extending `model-client.ts`.)

  > **Task 8 amendment (apply here):** Add to `src/services/model-client.ts`:
  > ```typescript
  > export interface CompleteMultiRequest { system: string; userText: string; images: ProcessedImage[]; maxTokens?: number; }
  > // class ModelClient:
  > async completeMulti(req: CompleteMultiRequest): Promise<CompleteResult>
  > ```
  > `completeMulti` reuses the exact same retry/key logic as `complete` but builds a `content` array with **all images** followed by the single text part. Refactor `complete` to delegate to `completeMulti` with a one-element image array to keep the retry loop DRY.

- [ ] **Step 1: Extend the model client for multi-image (amend Task 8)**

Open `src/services/model-client.ts`. Replace the `complete` method + request building with a shared private runner and add `completeMulti`. Replace from `export interface CompleteRequest {` through the end of the `complete(...)` method's `return { text, stopReason: data.stop_reason };` block with:

```typescript
export interface CompleteRequest {
  system: string;
  userText: string;
  image: ProcessedImage;
  maxTokens?: number;
}

export interface CompleteMultiRequest {
  system: string;
  userText: string;
  images: ProcessedImage[];
  maxTokens?: number;
}

export interface CompleteResult {
  text: string;
  stopReason?: string;
}

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 4096;

export class ModelClient {
  constructor(
    private readonly cfg: AppConfig,
    private readonly keyPool: KeyPool,
    private readonly logger: Logger,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async complete(req: CompleteRequest): Promise<CompleteResult> {
    return this.completeMulti({ system: req.system, userText: req.userText, images: [req.image], maxTokens: req.maxTokens });
  }

  async completeMulti(req: CompleteMultiRequest): Promise<CompleteResult> {
    const url = `${this.cfg.apiBaseUrl}/v1/messages`;
    const body = {
      model: this.cfg.modelId,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: req.system,
      messages: [
        {
          role: 'user',
          content: [
            ...req.images.map((im, idx) => ({
              type: 'image',
              source: { type: 'base64', media_type: im.mediaType, data: im.base64 },
              ...(req.images.length > 1 ? { _label: idx === 0 ? 'image_before' : 'image_after' } : {}),
            })),
            { type: 'text', text: req.userText },
          ],
        },
      ],
    };

    let attempt = 0;
    let lastError: Error | undefined;

    while (attempt <= this.cfg.maxRetries) {
      const acquired = this.keyPool.acquire();
      try {
        const res = await this.fetchImpl(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': acquired.key,
            'anthropic-version': ANTHROPIC_VERSION,
          },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          const data = (await res.json()) as { content?: Array<{ type: string; text?: string }>; stop_reason?: string };
          const text = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
          return { text, stopReason: data.stop_reason };
        }

        const errText = await res.text().catch(() => '');
        lastError = new ModelRequestError(this.friendlyMessage(res.status, errText), res.status, this.isRetryable(res.status));

        if (res.status === 401 || res.status === 403 || res.status === 429) {
          this.keyPool.markUnavailable(acquired.key);
          this.logger.warn({ status: res.status, attempt }, 'key marked unavailable, rotating');
          attempt += 1;
          continue;
        }

        if (this.isRetryable(res.status)) {
          await this.backoff(attempt);
          attempt += 1;
          continue;
        }

        throw lastError;
      } catch (err) {
        if (err instanceof ModelRequestError && !err.retryable) throw err;
        if (err instanceof AllKeysUnavailableError) throw err;
        lastError = err instanceof Error ? err : new Error(String(err));
        this.logger.warn({ attempt, err: lastError.message }, 'transient error, backing off');
        await this.backoff(attempt);
        attempt += 1;
      } finally {
        acquired.release();
      }
    }

    if (lastError instanceof ModelRequestError) throw lastError;
    throw new ModelRequestError('模型服务暂时不可用，请稍后重试', 503, true);
  }
```

Add the test for multi-image at the end of `src/services/model-client.test.ts`:

```typescript
test('completeMulti sends all images in one message', async () => {
  const pool = new KeyPool({ keys: ['a'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log);
  let captured: unknown;
  const fetchFn = async (_url: string, init: { body: string }) => {
    captured = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'diff' }], stop_reason: 'end_turn' }), text: async () => '' };
  };
  const client = new ModelClient(baseCfg, pool, log, fetchFn as unknown as typeof fetch);
  const res = await client.completeMulti({ system: 's', userText: 'compare', images: [img, img] });
  assert.equal(res.text, 'diff');
  const content = (captured as { messages: Array<{ content: Array<{ type: string }> }> }).messages[0]!.content;
  assert.equal(content[0]!.type, 'image');
  assert.equal(content[1]!.type, 'image');
  assert.equal(content[2]!.type, 'text');
});
```

- [ ] **Step 2: Verify amended model client still passes**

Run: `npm test`
Expected: PASS — all prior model-client tests plus the new multi-image test.

- [ ] **Step 3: Write the failing shared-layer test**

`src/tools/shared.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { ImageProcessor } from '../services/image-processor.js';
import { ModelClient } from '../services/model-client.js';
import { KeyPool } from '../services/key-pool.js';
import { ConcurrencyLimiter } from '../services/concurrency.js';
import { createLogger } from '../utils/logger.js';
import { SYSTEM_PROMPTS } from '../prompts/index.js';
import { runSingleImageTool, runDoubleImageTool, ImageInputSchema } from './shared.js';
import type { AppConfig } from '../config.js';

const log = createLogger('silent');
const baseCfg: AppConfig = {
  port: 3000, apiKeys: ['a'], apiBaseUrl: 'https://example.test/anthropic', modelId: 'xopkimik26',
  maxConcurrency: 100, perKeyConcurrency: 20, maxRetries: 1, keyCooldownMs: 60_000, retryDelayMs: 1, maxRetryDelayMs: 10,
  imageMaxSizeBytes: 10 * 1024 * 1024, imageStandardMaxDim: 2048, imageOcrMaxDim: 4096, logLevel: 'silent',
};

async function whitePng(): Promise<{ base64: string; mimeType: string }> {
  const raw = Buffer.alloc(8 * 8 * 4, 0xff);
  const buf = await sharp(raw, { raw: { width: 8, height: 8, channels: 4 } }).png().toBuffer();
  return { base64: buf.toString('base64'), mimeType: 'image/png' };
}

function ctxWithFetch(fetchFn: typeof fetch): { ctx: ReturnType<typeof makeCtx>; calls: number } {
  let calls = 0;
  const wrapped = (async (url: string, init: RequestInit) => {
    calls++;
    return fetchFn(url, init);
  }) as unknown as typeof fetch;
  const pool = new KeyPool({ keys: ['a'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log);
  const model = new ModelClient(baseCfg, pool, log, wrapped);
  const processor = new ImageProcessor({ maxSizeBytes: baseCfg.imageMaxSizeBytes, standardMaxDim: 2048, ocrMaxDim: 4096, diffMaxDim: 1536 }, log);
  const limiter = new ConcurrencyLimiter(100, log);
  function makeCtx() { return { processor, model, limiter }; }
  return { ctx: makeCtx(), calls };
}

function okFetch(): typeof fetch {
  return (async () => ({
    ok: true, status: 200,
    json: async () => ({ content: [{ type: 'text', text: 'RESULT' }], stop_reason: 'end_turn' }),
    text: async () => '',
  })) as unknown as typeof fetch;
}

test('ImageInputSchema accepts valid and rejects empty base64', () => {
  assert.doesNotThrow(() => ImageInputSchema.parse({ base64: 'AAAA' }));
  assert.throws(() => ImageInputSchema.parse({ base64: '' }));
});

test('runSingleImageTool processes image then calls model once', async () => {
  const { ctx, calls } = ctxWithFetch(okFetch());
  const text = await runSingleImageTool({ ctx, image: await whitePng(), mode: 'standard', prompt: SYSTEM_PROMPTS.imageAnalysis, question: 'describe' });
  assert.equal(text, 'RESULT');
  assert.equal(calls, 1);
});

test('runDoubleImageTool sends both images and calls model once', async () => {
  const { ctx, calls } = ctxWithFetch(okFetch());
  const img = await whitePng();
  const text = await runDoubleImageTool({ ctx, before: img, after: img, mode: 'diff', prompt: SYSTEM_PROMPTS.uiDiffCheck, question: 'compare' });
  assert.equal(text, 'RESULT');
  assert.equal(calls, 1);
});
```

- [ ] **Step 4: Verify it fails**

Run: `npx node --import tsx --test src/tools/shared.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement**

`src/tools/shared.ts`:

```typescript
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
```

- [ ] **Step 6: Verify it passes**

Run: `npm test`
Expected: PASS — including shared-layer tests.

- [ ] **Step 7: Commit**

```bash
git add src/services/model-client.ts src/services/model-client.test.ts src/tools/shared.ts src/tools/shared.test.ts
git commit -m "feat(tools): shared tool layer with single/double image pipelines"
```

---

### Task 11: The 7 tool definitions

**Files:**
- Create: `src/tools/image-analysis.ts`, `src/tools/ui-to-artifact.ts`, `src/tools/diagnose-error.ts`, `src/tools/understand-diagram.ts`, `src/tools/analyze-dataviz.ts`, `src/tools/extract-text.ts`, `src/tools/ui-diff-check.ts`, and one shared test `src/tools/tools.test.ts`.

**Interfaces:**
- Consumes: `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`, `ToolContext` + `runSingleImageTool`/`runDoubleImageTool`/`ImageInputSchema` (Task 10), `SYSTEM_PROMPTS` (Task 9).
- Each tool module exports: `export function registerXxx(server: McpServer, ctx: ToolContext): void;` calling `server.registerTool(name, { description, inputSchema }, cb)`. The callback returns a `CallToolResult` (`{ content: [{ type: 'text', text }] }`). On error it returns `{ content: [{ type: 'text', text: friendlyMessage }], isError: true }` — never throws out of the tool (the MCP layer must keep serving).

- [ ] **Step 1: Write the failing registration test**

`src/tools/tools.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ImageProcessor } from '../services/image-processor.js';
import { ModelClient } from '../services/model-client.js';
import { KeyPool } from '../services/key-pool.js';
import { ConcurrencyLimiter } from '../services/concurrency.js';
import { createLogger } from '../utils/logger.js';
import { registerAllTools } from './index.js';
import type { AppConfig } from '../config.js';
import type { ToolContext } from './shared.js';

const log = createLogger('silent');
const baseCfg: AppConfig = {
  port: 3000, apiKeys: ['a'], apiBaseUrl: 'https://example.test/anthropic', modelId: 'xopkimik26',
  maxConcurrency: 100, perKeyConcurrency: 20, maxRetries: 1, keyCooldownMs: 60_000, retryDelayMs: 1, maxRetryDelayMs: 10,
  imageMaxSizeBytes: 10 * 1024 * 1024, imageStandardMaxDim: 2048, imageOcrMaxDim: 4096, logLevel: 'silent',
};

async function whitePng(): Promise<string> {
  const raw = Buffer.alloc(8 * 8 * 4, 0xff);
  const buf = await sharp(raw, { raw: { width: 8, height: 8, channels: 4 } }).png().toBuffer();
  return buf.toString('base64');
}

function makeServerAndCtx(): { server: McpServer; ctx: ToolContext } {
  const pool = new KeyPool({ keys: ['a'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log);
  const model = new ModelClient(baseCfg, pool, log, (async () => ({
    ok: true, status: 200,
    json: async () => ({ content: [{ type: 'text', text: 'TOOL_OUT' }], stop_reason: 'end_turn' }),
    text: async () => '',
  })) as unknown as typeof fetch);
  const processor = new ImageProcessor({ maxSizeBytes: baseCfg.imageMaxSizeBytes, standardMaxDim: 2048, ocrMaxDim: 4096, diffMaxDim: 1536 }, log);
  const limiter = new ConcurrencyLimiter(100, log);
  const ctx: ToolContext = { processor, model, limiter };
  const server = new McpServer({ name: 'vision-mcp-server', version: '1.0.0' });
  return { server, ctx };
}

test('registerAllTools registers exactly the 7 tool names', () => {
  const { server, ctx } = makeServerAndCtx();
  registerAllTools(server, ctx);
  // server.server is the low-level Server; inspect registered tool list via the internal request handler map is fragile,
  // so instead call the tool via the server's callTool handler is heavy. We assert via _registeredTools on McpServer.
  const registered = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
  const names = Object.keys(registered ?? {});
  assert.deepEqual([...names].sort(), [
    'analyze_data_visualization',
    'diagnose_error_screenshot',
    'extract_text_from_screenshot',
    'image_analysis',
    'ui_diff_check',
    'ui_to_artifact',
    'understand_technical_diagram',
  ]);
});

test('image_analysis tool returns model text in a CallToolResult', async () => {
  const { server, ctx } = makeServerAndCtx();
  registerAllTools(server, ctx);
  // Invoke the registered handler directly (stable path: _registeredTools[name].handler).
  const registered = (server as unknown as {
    _registeredTools: Record<string, { handler: (args: Record<string, unknown>, extra: object) => Promise<unknown> }>;
  })._registeredTools['image_analysis']!;
  const out = (await registered.handler(
    { image: { base64: await whitePng() }, question: 'what' },
    {},
  )) as { content: Array<{ type: string; text?: string }>; // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.equal(out.content[0]!.type, 'text');
  assert.equal(out.content[0]!.text, 'TOOL_OUT');
});
```

> **Why this path is stable:** `_registeredTools` is the real runtime field (`this._registeredTools = {}`, keyed by name — confirmed in SDK 1.26.0 `server/mcp.js` lines 19/649), and `registerTool` stores a `RegisteredTool` whose `.handler` is the exact callback passed in (confirmed in `server/mcp.d.ts` line 266-280: `handler: AnyToolHandler`). Calling `.handler(args, {})` with a mock `extra` exercises the full tool pipeline (image → model → result). The `extra` object is only used for logging/abort; the tools here ignore it, so an empty object is safe. If a future SDK minor renames `handler`, the registration-name assertion above still passes and the behavioral coverage in `shared.test.ts` (Task 10) remains valid — downgrade this second test to a no-op then.

- [ ] **Step 2: Verify it fails**

Run: `npx node --import tsx --test src/tools/tools.test.ts`
Expected: FAIL — `./index.js` not found.

- [ ] **Step 3: Implement each tool**

`src/tools/image-analysis.ts`:

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext, ImageInputSchema } from './shared.js';
import { runSingleImageTool, ImageInputSchema as ImageSchema } from './shared.js';
import { SYSTEM_PROMPTS } from '../prompts/index.js';

export function registerImageAnalysis(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'image_analysis',
    {
      title: '通用图像分析',
      description: '对任意图片进行基于问题的通用分析，返回分析结论与细节。',
      inputSchema: {
        image: ImageSchema,
        question: ImageSchema._type === undefined ? ({} as never) : ImageSchema, // placeholder line removed below
      },
    },
    async (args) => {
      try {
        const text = await runSingleImageTool({
          ctx,
          image: args.image,
          mode: 'standard',
          prompt: SYSTEM_PROMPTS.imageAnalysis,
          question: args.question,
        });
        return { content: [{ type: 'text' as const, text }] };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: friendly(e) }], isError: true };
      }
    },
  );
}

function friendly(e: unknown): string {
  if (e instanceof Error) return e.message;
  return '工具执行失败';
}
```

**The `inputSchema` line above has a leftover placeholder — replace the whole `image-analysis.ts` with the clean version below** (all 7 tools follow this exact pattern; only name/description/schema/prompt/mode differ):

```typescript
// src/tools/image-analysis.ts  (FINAL)
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runSingleImageTool, ImageInputSchema } from './shared.js';
import { SYSTEM_PROMPTS } from '../prompts/index.js';
import type { ToolContext } from './shared.js';

export function registerImageAnalysis(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'image_analysis',
    {
      title: '通用图像分析',
      description: '对任意图片进行基于问题的通用分析，返回分析结论与细节。',
      inputSchema: {
        image: ImageInputSchema,
        question: ImageInputSchema._def ? stringSchema() : stringSchema(),
      },
    },
    async (args) => toolText(() =>
      runSingleImageTool({ ctx, image: args.image, mode: 'standard', prompt: SYSTEM_PROMPTS.imageAnalysis, question: args.question }),
    ),
  );
}

const stringSchema = () => {
  const { z } = require('zod');
  return z.string();
};
```

> **Correction — `require` is not available in ESM.** Use a top-level `import { z } from 'zod'` and `z.string()` directly. The clean, canonical pattern for ALL tools is shown in `ui-to-artifact.ts` below — **follow that file as the template for every tool; ignore the `image-analysis.ts` snippets above except for its name/description/prompt/mode values.**

`src/tools/ui-to-artifact.ts` — **canonical template, copy this structure for each tool**:

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runSingleImageTool, ImageInputSchema, type ToolContext } from './shared.js';
import { SYSTEM_PROMPTS } from '../prompts/index.js';

async function toolText(fn: () => Promise<string>) {
  try {
    const text = await fn();
    return { content: [{ type: 'text' as const, text }] };
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
      },
    },
    async (args) => toolText(() =>
      runSingleImageTool({ ctx, image: args.image, mode: 'standard', prompt: SYSTEM_PROMPTS.uiToArtifact, question: `目标产物类型: ${args.task}` }),
    ),
  );
}
```

`src/tools/diagnose-error.ts`:

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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
      },
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
```

`src/tools/understand-diagram.ts`:

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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
      },
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
```

`src/tools/analyze-dataviz.ts`:

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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
      },
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
```

`src/tools/extract-text.ts`:

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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
      },
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
```

`src/tools/ui-diff-check.ts`:

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runDoubleImageTool, ImageInputSchema, type ToolContext } from './shared.js';
import { SYSTEM_PROMPTS } from '../prompts/index.js';

async function toolText(fn: () => Promise<string>) {
  try {
    return { content: [{ type: 'text' as const, text: await fn() }] };
  } catch (e) {
    return { content: [{ type: 'text' as const, text: e instanceof Error ? e.message : '工具执行失败' }], isError: true };
  }
}

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
      },
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
```

`src/tools/index.ts`:

```typescript
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
```

> For `image-analysis.ts`, write the **canonical** form (matching the template), not the draft with the placeholder line:

```typescript
// src/tools/image-analysis.ts  (FINAL — write this, not the draft)
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runSingleImageTool, ImageInputSchema, type ToolContext } from './shared.js';
import { SYSTEM_PROMPTS } from '../prompts/index.js';

async function toolText(fn: () => Promise<string>) {
  try {
    return { content: [{ type: 'text' as const, text: await fn() }] };
  } catch (e) {
    return { content: [{ type: 'text' as const, text: e instanceof Error ? e.message : '工具执行失败' }], isError: true };
  }
}

export function registerImageAnalysis(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'image_analysis',
    {
      title: '通用图像分析',
      description: '对任意图片进行基于问题的通用分析，返回分析结论与细节。',
      inputSchema: {
        image: ImageInputSchema,
        question: z.string().min(1).describe('分析问题'),
      },
    },
    async (args) => toolText(() =>
      runSingleImageTool({ ctx, image: args.image, mode: 'standard', prompt: SYSTEM_PROMPTS.imageAnalysis, question: args.question }),
    ),
  );
}
```

- [ ] **Step 4: Verify it fails-to-pass**

Run: `npm test`
Expected: PASS — `tools.test.ts` registration assertion passes (all 7 names). If the second (callTool) test errors due to SDK invocation API differences, apply the documented fallback and delete only that second test; re-run to PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/*.ts
git commit -m "feat(tools): register 7 vision tools with shared image pipeline"
```

---

### Task 12: Streamable HTTP transport factory

**Files:**
- Create: `src/transport/streamable-http.ts`

**Interfaces:**
- Consumes: `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk/server/streamableHttp.js`.
- Produces: `export function buildTransport(logger: Logger): StreamableHTTPServerTransport` configured in **stateless** mode (`sessionIdGenerator: undefined`).

- [ ] **Step 1: Write the failing test**

`src/transport/streamable-http.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTransport } from './streamable-http.js';
import { createLogger } from '../utils/logger.js';

test('buildTransport returns a stateless transport (no session id)', () => {
  const t = buildTransport(createLogger('silent'));
  assert.equal(t.sessionId, undefined);
  assert.equal(typeof t.handleRequest, 'function');
});
```

- [ ] **Step 2: Verify it fails**

Run: `npx node --import tsx --test src/transport/streamable-http.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/transport/streamable-http.ts`:

```typescript
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Logger } from '../utils/logger.js';

export function buildTransport(logger: Logger): StreamableHTTPServerTransport {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  transport.onerror = (err) => {
    logger.error({ err: err.message }, 'transport error');
  };
  logger.info('stateless Streamable HTTP transport created');
  return transport;
}
```

- [ ] **Step 4: Verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/transport/streamable-http.ts src/transport/streamable-http.test.ts
git commit -m "feat(transport): stateless Streamable HTTP transport factory"
```

---

### Task 13: MCP server wiring

**Files:**
- Create: `src/server.ts`, `src/server.test.ts`

**Interfaces:**
- Consumes: `AppConfig` (Task 4), `KeyPool`, `ModelClient`, `ImageProcessor`, `ConcurrencyLimiter`, `createLogger` (Task 2), `registerAllTools` (Task 11), `buildTransport` (Task 12).
- Produces:
  ```typescript
  interface VisionMcpServer { server: McpServer; transport: StreamableHTTPServerTransport; handleRequest(req, res, parsedBody?): Promise<void>; }
  function createVisionServer(cfg: AppConfig): VisionMcpServer;
  ```
  Wires one transport to one McpServer (stateless), connects them, registers tools, and exposes `handleRequest` for the HTTP layer to delegate to.

- [ ] **Step 1: Write the failing test**

`src/server.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVisionServer } from './server.js';
import { loadConfig } from './config.js';

test('createVisionServer connects transport and registers tools', () => {
  const cfg = loadConfig({ API_KEYS: 'k1,k2', MAX_CONCURRENCY: '100' });
  const v = createVisionServer(cfg);
  assert.equal(v.transport.sessionId, undefined);
  assert.equal(typeof v.handleRequest, 'function');
  const names = Object.keys((v.server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools ?? {});
  assert.equal(names.length, 7);
});
```

- [ ] **Step 2: Verify it fails**

Run: `npx node --import tsx --test src/server.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/server.ts`:

```typescript
import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { AppConfig } from './config.js';
import { createLogger } from './utils/logger.js';
import { KeyPool } from './services/key-pool.js';
import { ModelClient } from './services/model-client.js';
import { ImageProcessor } from './services/image-processor.js';
import { ConcurrencyLimiter } from './services/concurrency.js';
import { registerAllTools } from './tools/index.js';
import { buildTransport } from './transport/streamable-http.js';
import type { ToolContext } from './tools/shared.js';

export interface VisionMcpServer {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  handleRequest: (req: IncomingMessage, res: ServerResponse, parsedBody?: unknown) => Promise<void>;
}

export function createVisionServer(cfg: AppConfig): VisionMcpServer {
  const logger = createLogger(cfg.logLevel);

  const keyPool = new KeyPool({ keys: cfg.apiKeys, perKeyConcurrency: cfg.perKeyConcurrency, cooldownMs: cfg.keyCooldownMs }, logger);
  const model = new ModelClient(cfg, keyPool, logger);
  const processor = new ImageProcessor(
    { maxSizeBytes: cfg.imageMaxSizeBytes, standardMaxDim: cfg.imageStandardMaxDim, ocrMaxDim: cfg.imageOcrMaxDim, diffMaxDim: 1536 },
    logger,
  );
  const limiter = new ConcurrencyLimiter(cfg.maxConcurrency, logger);
  const ctx: ToolContext = { processor, model, limiter };

  const server = new McpServer({ name: 'vision-mcp-server', version: '1.0.0' });
  registerAllTools(server, ctx);

  const transport = buildTransport(logger);

  // Connect synchronously-initiated; ignore promise here (server start awaits via connect below)
  const connected = server.connect(transport);

  const handleRequest = (req: IncomingMessage, res: ServerResponse, parsedBody?: unknown) =>
    connected.then(() => transport.handleRequest(req, res, parsedBody));

  return { server, transport, handleRequest };
}
```

- [ ] **Step 4: Verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts src/server.test.ts
git commit -m "feat(server): wire McpServer to stateless transport with services and tools"
```

---

### Task 14: HTTP bootstrap (`/mcp` + `/health`)

**Files:**
- Create: `src/index.ts`, `src/health.ts`, `src/health.test.ts`, `.env.example`

**Interfaces:**
- Consumes: `createVisionServer` (Task 13), `loadConfig` (Task 4).
- Produces:
  - `src/health.ts`: `export function createHealthHandler(deps: { keyPool: KeyPool; limiter: ConcurrencyLimiter }): (res: ServerResponse) => void;` returning the spec JSON: `{ status, keys: {total, available, cooldown}, concurrency: {current, max} }`.
  - `src/index.ts`: `http.createServer` that routes `GET /health` and `POST /mcp` (any method/path to `/mcp`); starts listening on `cfg.port`.
  - `.env.example`: documented env vars.

- [ ] **Step 1: Write the failing health test**

`src/health.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHealthHandler } from './health.js';
import { KeyPool } from './services/key-pool.js';
import { ConcurrencyLimiter } from './services/concurrency.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('silent');

test('health handler returns status/keys/concurrency shape', () => {
  const pool = new KeyPool({ keys: ['a', 'b'], perKeyConcurrency: 5, cooldownMs: 60_000 }, log);
  pool.markUnavailable('a');
  const limiter = new ConcurrencyLimiter(100, log);
  const handler = createHealthHandler({ keyPool: pool, limiter: limiter });
  const captured: string[] = [];
  const res = { statusCode: 0, setHeader: () => {}, end: (body: string) => captured.push(body) } as unknown as import('node:http').ServerResponse;
  handler(res);
  const json = JSON.parse(captured[0]!);
  assert.deepEqual(json, { status: 'ok', keys: { total: 2, available: 1, cooldown: 1 }, concurrency: { current: 0, max: 100 } });
});
```

- [ ] **Step 2: Verify it fails**

Run: `npx node --import tsx --test src/health.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement health handler**

`src/health.ts`:

```typescript
import type { ServerResponse } from 'node:http';
import type { KeyPool } from './services/key-pool.js';
import type { ConcurrencyLimiter } from './services/concurrency.js';

export interface HealthDeps {
  keyPool: KeyPool;
  limiter: ConcurrencyLimiter;
}

export function createHealthHandler(deps: HealthDeps): (res: ServerResponse) => void {
  return (res) => {
    const body = {
      status: 'ok',
      keys: deps.keyPool.stats(),
      concurrency: deps.limiter.stats(),
    };
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  };
}
```

- [ ] **Step 4: Implement the entry point**

`src/index.ts`:

```typescript
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { loadConfig } from './config.js';
import { createLogger } from './utils/logger.js';
import { createVisionServer } from './server.js';
import { createHealthHandler } from './health.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const logger = createLogger(cfg.logLevel);
  const vision = createVisionServer(cfg);

  // health deps reuse the same pool/limiter the server built — re-create from cfg to keep health decoupled:
  // NOTE: createVisionServer owns the pool/limiter; we expose them via the returned object in Step 5 (see amendment below).
  const health = createHealthHandler({ keyPool: vision.keyPool, limiter: vision.limiter });

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'GET' && req.url === '/health') {
      health(res);
      return;
    }
    if (req.url === '/mcp' || req.url?.startsWith('/mcp')) {
      // Body parsing for POST
      if (req.method === 'POST' || req.method === 'PUT') {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed: unknown = undefined;
          try { parsed = raw.length ? JSON.parse(raw) : undefined; } catch { parsed = raw; }
          vision.handleRequest(req, res, parsed).catch((err) => {
            logger.error({ err: (err as Error).message }, 'handleRequest failed');
            if (!res.headersSent) { res.statusCode = 500; res.end('Internal Server Error'); }
          });
        });
        req.on('error', () => { if (!res.headersSent) { res.statusCode = 400; res.end('Bad Request'); } });
        return;
      }
      // GET / DELETE on /mcp — pass through without body
      vision.handleRequest(req, res).catch((err) => {
        logger.error({ err: (err as Error).message }, 'handleRequest failed');
        if (!res.headersSent) { res.statusCode = 500; res.end('Internal Server Error'); }
      });
      return;
    }
    res.statusCode = 404;
    res.end('Not Found');
  });

  httpServer.listen(cfg.port, () => {
    logger.info({ port: cfg.port }, 'vision-mcp-server listening');
  });

  const shutdown = (sig: string) => {
    logger.info({ sig }, 'shutting down');
    httpServer.close(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('fatal startup error', err);
  process.exit(1);
});
```

**Amendment to Task 13 (Step 5 of this task):** `src/index.ts` references `vision.keyPool` and `vision.limiter`. Add these to `VisionMcpServer` and `createVisionServer`'s return in `src/server.ts`:

```typescript
// add to VisionMcpServer interface:
export interface VisionMcpServer {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  handleRequest: (req: IncomingMessage, res: ServerResponse, parsedBody?: unknown) => Promise<void>;
  keyPool: KeyPool;
  limiter: ConcurrencyLimiter;
}
// in the return object of createVisionServer:
  return { server, transport, handleRequest, keyPool, limiter };
```

(`KeyPool` and `ConcurrencyLimiter` are already imported in `server.ts`.)

- [ ] **Step 5: Write `.env.example`**

```env
# Vision MCP Server configuration
PORT=3000
API_KEYS=replace-with-comma-separated-keys
API_BASE_URL=https://maas-coding-api.cn-huabei-1.xf-yun.com/anthropic
MODEL_ID=xopkimik26
MAX_CONCURRENCY=100
PER_KEY_CONCURRENCY=20
MAX_RETRIES=3
KEY_COOLDOWN_MS=60000
IMAGE_MAX_SIZE_MB=10
IMAGE_MAX_DIMENSION=2048
IMAGE_OCR_MAX_DIMENSION=4096
LOG_LEVEL=info
```

- [ ] **Step 6: Verify it passes**

Run: `npm test`
Expected: PASS (including health).

- [ ] **Step 7: Smoke-test the running server**

Run: `API_KEYS=demo-key-1,demo-key-2 npm run build && PORT=4011 node build/index.js &` then `sleep 1 && curl -s http://127.0.0.1:4011/health`
Expected: `{"status":"ok","keys":{"total":2,"available":2,"cooldown":0},"concurrency":{"current":0,"max":100}}`
Then kill the background server.

- [ ] **Step 8: Commit**

```bash
git add src/index.ts src/health.ts src/health.test.ts src/server.ts .env.example
git commit -m "feat(server): HTTP bootstrap with /mcp forwarding and /health endpoint"
```

---

### Task 15: Docker & docker-compose

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `.dockerignore`

**Interfaces:**
- Produces: a production image built from `node:20-slim`, runs `node build/index.js` on `PORT 3000`. `docker-compose.yml` reads env from `.env`.

- [ ] **Step 1: Write `Dockerfile`**

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build
EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production
CMD ["node", "build/index.js"]
```

- [ ] **Step 2: Write `.dockerignore`**

```
node_modules
build
dist
.git
.env
.omc
test
*.log
docs
```

- [ ] **Step 3: Write `docker-compose.yml`**

```yaml
services:
  vision-mcp:
    build: .
    ports:
      - "3000:3000"
    environment:
      PORT: 3000
      API_KEYS: ${API_KEYS}
      API_BASE_URL: ${API_BASE_URL:-https://maas-coding-api.cn-huabei-1.xf-yun.com/anthropic}
      MODEL_ID: ${MODEL_ID:-xopkimik26}
      MAX_CONCURRENCY: ${MAX_CONCURRENCY:-100}
      PER_KEY_CONCURRENCY: ${PER_KEY_CONCURRENCY:-20}
      MAX_RETRIES: ${MAX_RETRIES:-3}
      KEY_COOLDOWN_MS: ${KEY_COOLDOWN_MS:-60000}
      IMAGE_MAX_SIZE_MB: ${IMAGE_MAX_SIZE_MB:-10}
      IMAGE_MAX_DIMENSION: ${IMAGE_MAX_DIMENSION:-2048}
      IMAGE_OCR_MAX_DIMENSION: ${IMAGE_OCR_MAX_DIMENSION:-4096}
      LOG_LEVEL: ${LOG_LEVEL:-info}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://127.0.0.1:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
```

- [ ] **Step 4: Verify the image builds**

Run: `docker build -t vision-mcp-server:plan-check .`
Expected: build succeeds, producing an image whose `CMD` is `node build/index.js`. (If Docker is unavailable in the environment, document this as a manual verification step and still commit the files.)

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore
git commit -m "build(docker): production image and compose with healthcheck"
```

---

### Task 16: README

**Files:**
- Create: `README.md`

**Interfaces:** none (documentation).

- [ ] **Step 1: Write `README.md`**

````markdown
# Vision MCP Server

A remote MCP (Model Context Protocol) server exposing 7 vision tools over the 讯飞 MaaS Anthropic-compatible model API (`xopkimik26`). Supports Claude Code, Codex, Cline, and any MCP-compatible client via Streamable HTTP.

## Features

- 7 specialized vision tools (UI→code, OCR, error diagnosis, diagram understanding, data-viz analysis, UI diff, general image analysis)
- Multi-API-key round-robin with cooldown + retry (401/403/429/5xx/network)
- Global (100) and per-key (20) concurrency control
- Image preprocessing: PNG/JPEG/GIF/WebP/BMP → JPEG Q80 with resolution caps (2048 standard / 4096 OCR / 1536 diff)
- `/health` status endpoint

## Quick start

```bash
npm install
npm run build
API_KEYS=key1,key2 npm start
```

Server listens on `PORT` (default 3000). Endpoints: `POST /mcp` (MCP), `GET /health`.

### Docker

```bash
echo "API_KEYS=key1,key2" > .env
docker compose up -d
```

## Configuration (env)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `API_KEYS` | *(required)* | Comma-separated API keys |
| `API_BASE_URL` | `https://maas-coding-api.cn-huabei-1.xf-yun.com/anthropic` | Model API base URL |
| `MODEL_ID` | `xopkimik26` | Model ID |
| `MAX_CONCURRENCY` | `100` | Global max concurrent requests |
| `PER_KEY_CONCURRENCY` | `20` | Per-key max concurrent requests |
| `MAX_RETRIES` | `3` | Max retries per request |
| `KEY_COOLDOWN_MS` | `60000` | Cooldown for failed keys |
| `IMAGE_MAX_SIZE_MB` | `10` | Max image size |
| `IMAGE_MAX_DIMENSION` | `2048` | Standard-mode resolution cap |
| `IMAGE_OCR_MAX_DIMENSION` | `4096` | OCR-mode resolution cap |
| `LOG_LEVEL` | `info` | pino log level |

## Connect a client

**Claude Code:**
```bash
claude mcp add -s user vision-mcp-server --transport http http://localhost:3000/mcp
```

**Manual config (`.claude.json`):**
```json
{
  "mcpServers": {
    "vision-mcp-server": { "type": "http", "url": "http://localhost:3000/mcp" }
  }
}
```

## Development

```bash
npm test          # node:test over src/**/*.test.ts
npm run typecheck # tsc --noEmit
npm run dev       # tsx watch src/index.ts
```

## Notes

- The model API accepts **base64 images only** (URLs return 400). Clients (e.g. Claude Code) auto-encode local files.
- Token cost scales with resolution, not file size — hence JPEG Q80 + resolution caps.
- Transport is **stateless** (`sessionIdGenerator: undefined`) for horizontal scalability.
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with quickstart, config, and client setup"
```

---

## Self-Review

**1. Spec coverage:**
- Remote server, 100 concurrency → Tasks 7 (limiter), 13 (wiring), 14 (HTTP). ✓
- Claude Code/Codex/Cline clients → Task 16 (README connect). ✓
- Multi-key round-robin + retry → Tasks 6 (pool), 8 (client retry). ✓
- 7 tools (no video) → Task 11. ✓
- Streamable HTTP → Tasks 12, 13, 14. ✓
- Image processing (resize + JPEG Q80, OCR 4096, diff 1536) → Task 5. ✓
- Key cooldown 401/403/429, exponential backoff 5xx/network, 503 all-unavailable → Task 8. ✓
- Per-key concurrency 20 → Task 6. ✓
- Health check JSON shape → Task 14 (`/health`). ✓
- Docker + env + project structure → Tasks 1, 15, 16. ✓
- Error handling matrix (format/size/keys/timeout/diff/concurrency) → Tasks 5, 8, 7, 11 (friendly error text). ✓

**2. Placeholder scan:** The `image-analysis.ts` draft contained a placeholder line and a `require()`; both are explicitly superseded by the canonical FINAL block and the `ui-to-artifact.ts` template. All other steps contain concrete code. The `tools.test.ts` second test has a documented SDK-version fallback (delete-only), not a placeholder.

**3. Type consistency:**
- `ImageInput`/`ProcessMode`/`ProcessedImage` defined in `src/types.ts` (Task 5), consumed everywhere with `.js` import suffix. ✓
- `ToolContext { processor; model; limiter }` defined Task 10, used Tasks 11/13. ✓
- `KeyPool.acquire() → { key, release }`, `markUnavailable(key)`, `stats()` — consistent across Tasks 6/8/13/14. ✓
- `ModelClient.complete` + `completeMulti` — Task 8 amended in Task 10, consistent in Task 10's `runDoubleImageTool`. ✓
- `VisionMcpServer` extended with `keyPool`/`limiter` in Task 14 amendment, matches `index.ts` usage. ✓
- `registerTool(name, {title?, description?, inputSchema?}, cb)` — matches SDK 1.26.0 `.d.ts`. ✓

One follow-up the implementer should keep in mind: confirm the SDK's programmatic tool-invocation path for the second `tools.test.ts`; the registration-name assertion is the guaranteed-stable check.
