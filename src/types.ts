export type ImageInput = {
  /** local file path — preferred for local/stdio use (keeps image bytes out of the caller's context) */
  path?: string;
  /** base64-encoded image data (mutually exclusive with path) */
  base64?: string;
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
