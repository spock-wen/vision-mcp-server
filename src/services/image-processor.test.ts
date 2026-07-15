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
  await assert.rejects(async () => proc.process(await png(2000, 2000), 'standard'), ImageTooLargeError);
});
