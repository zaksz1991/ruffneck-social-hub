export type LimitedBodyResult =
  | { ok: true; text: string; bytes: number }
  | { ok: false; reason: 'too_large' | 'read_failed'; bytes: number };

/** Read a request stream without buffering more than maxBytes in memory. */
export async function readTextWithLimit(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<LimitedBodyResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError('maxBytes must be a non-negative safe integer.');
  }
  if (!stream) return { ok: true, text: '', bytes: 0 };

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        try { await reader.cancel(); } catch { /* The size limit remains authoritative. */ }
        return { ok: false, reason: 'too_large', bytes };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, text, bytes };
  } catch {
    try { await reader.cancel(); } catch { /* Preserve the read failure result. */ }
    return { ok: false, reason: 'read_failed', bytes };
  } finally {
    reader.releaseLock();
  }
}
