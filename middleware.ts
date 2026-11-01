import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getRequestBoundaryDecision } from '@/lib/auth/request-boundary';

function unavailableResponse(isApi: boolean) {
  if (isApi) {
    return NextResponse.json(
      { error: 'Authentication service is temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return new NextResponse('Authentication service is temporarily unavailable.', {
    status: 503,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  const initialDecision = getRequestBoundaryDecision(path, false);

  // APIs perform authentication at the route boundary. This is essential for
  // Meta webhooks and the scheduled publisher, which authenticate by signature
  // or service bearer token rather than by a browser Supabase session.
  if (initialDecision === 'delegate-api') return response;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // Keep the static authentication screens renderable so they can explain
    // configuration failures on the next form submission. Protected pages do
    // not pass through when auth configuration is missing.
    if (path === '/login' || path === '/signup') return response;
    return unavailableResponse(false);
  }

  let authenticated = false;
  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    const { data: { user } } = await supabase.auth.getUser();
    authenticated = Boolean(user);
  } catch {
    // Do not turn an auth-provider outage into an anonymous session.
    return unavailableResponse(false);
  }

  const decision = getRequestBoundaryDecision(path, authenticated);
  if (decision === 'redirect-to-login') {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (decision === 'redirect-to-home') {
    return NextResponse.redirect(new URL('/', request.url));
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)'],
};
