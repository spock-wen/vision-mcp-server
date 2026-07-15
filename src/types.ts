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
