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
