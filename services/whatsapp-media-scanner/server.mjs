import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { timingSafeEqual } from 'node:crypto';

const PORT = Number(process.env.PORT || 8080);
const TOKEN = process.env.WHATSAPP_MEDIA_SCANNER_TOKEN || '';
const MAX_BYTES = 16 * 1024 * 1024;
let busy = false;

function authorised(header = '') {
  const expected = `Bearer ${TOKEN}`;
  const left = Buffer.from(header);
  const right = Buffer.from(expected);
  return TOKEN.length >= 32 && left.length === right.length && timingSafeEqual(left, right);
}

function send(response, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(body);
}

function clamdCommand(command, bytes = null) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port: 3310 });
    const response = [];
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      error ? reject(error) : resolve(value);
    };
    socket.setTimeout(30_000, () => finish(new Error('clamd_timeout')));
    socket.on('error', (error) => finish(error));
    socket.on('data', (chunk) => {
      response.push(chunk);
      const joined = Buffer.concat(response);
      if (joined.includes(0)) finish(null, joined.toString('utf8').replace(/\0.*$/s, '').trim());
      else if (joined.length > 2048) finish(new Error('clamd_response_too_large'));
    });
    socket.on('connect', () => {
      if (command === 'VERSION') {
        socket.write('zVERSION\0');
        return;
      }
      if (!bytes || bytes.length > MAX_BYTES) return finish(new Error('scan_size_invalid'));
      socket.write('zINSTREAM\0');
      const chunkSize = 64 * 1024;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
        const size = Buffer.allocUnsafe(4);
        size.writeUInt32BE(chunk.length, 0);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
  });
}

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/healthz') {
    try {
      const version = await clamdCommand('VERSION');
      return send(response, 200, { ok: true, engine: 'clamav', version: version.slice(0, 80) });
    } catch {
      return send(response, 503, { ok: false, engine: 'clamav_unavailable' });
    }
  }
  if (request.method !== 'POST' || request.url !== '/scan') return send(response, 404, { error: 'not_found' });
  if (!authorised(request.headers.authorization || '')) return send(response, 401, { error: 'unauthorised' });
  if (request.headers['content-type'] !== 'application/octet-stream') return send(response, 415, { error: 'unsupported_media_type' });
  if (busy) return send(response, 429, { error: 'scanner_busy' });

  busy = true;
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      const part = Buffer.from(chunk);
      size += part.length;
      if (size > MAX_BYTES) {
        send(response, 413, { error: 'file_too_large' });
        setImmediate(() => request.destroy());
        return;
      }
      chunks.push(part);
    }
    if (!size) return send(response, 400, { error: 'empty_file' });
    const bytes = Buffer.concat(chunks, size);
    const result = await clamdCommand('INSTREAM', bytes);
    if (result === 'stream: OK') {
      let version = 'current';
      try { version = await clamdCommand('VERSION'); } catch {}
      return send(response, 200, { status: 'clean', engine: 'clamav', version: version.slice(0, 80) });
    }
    if (result.includes('FOUND')) return send(response, 200, { status: 'infected', engine: 'clamav' });
    return send(response, 503, { error: 'scan_incomplete' });
  } catch {
    return send(response, 503, { error: 'scanner_unavailable' });
  } finally {
    busy = false;
  }
});

server.headersTimeout = 10_000;
server.requestTimeout = 60_000;
server.listen(PORT, '0.0.0.0');
