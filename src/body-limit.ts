export const MAX_BODY_BYTES = 50 * 1024 * 1024;

export function bodyAccumulator(maxBytes: number = MAX_BODY_BYTES): {
  push: (chunk: Buffer) => boolean;
  chunks: Buffer[];
  total: () => number;
} {
  const chunks: Buffer[] = [];
  let total = 0;
  return {
    chunks,
    push: (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) return false;
      chunks.push(chunk);
      return true;
    },
    total: () => total,
  };
}
