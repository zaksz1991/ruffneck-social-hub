import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Minimal liveness endpoint. It deliberately exposes no environment or secret state. */
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'ruffneck-social-hub',
      version: '2.19.0',
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}
