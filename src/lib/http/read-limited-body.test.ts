import { describe, expect, it } from 'vitest';
import { readTextWithLimit } from './read-limited-body';

function streamOf(chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

describe('readTextWithLimit', () => {
  it('reads a body exactly at the configured byte limit', async () => {
    const result = await readTextWithLimit(streamOf([new TextEncoder().encode('hello')]), 5);
    expect(result).toEqual({ ok: true, text: 'hello', bytes: 5 });
  });

  it('counts UTF-8 bytes rather than JavaScript characters', async () => {
    const bytes = new TextEncoder().encode('é');
    const result = await readTextWithLimit(streamOf([bytes]), 2);
    expect(result).toEqual({ ok: true, text: 'é', bytes: 2 });
  });

  it('rejects oversized streamed bodies before buffering the remainder', async () => {
    const result = await readTextWithLimit(streamOf([
      new TextEncoder().encode('1234'),
      new TextEncoder().encode('5678'),
    ]), 5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('too_large');
  });

  it('treats a missing request body as empty', async () => {
    expect(await readTextWithLimit(null, 1)).toEqual({ ok: true, text: '', bytes: 0 });
  });
});
