import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const destination = new URL('/', url.origin);
  if (code) {
    const response = NextResponse.redirect(destination);
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => request.cookies.getAll(), setAll: values => values.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } },
    );
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const workspaceName = typeof data.user.user_metadata?.workspace_name === 'string' ? data.user.user_metadata.workspace_name : '';
      if (workspaceName) {
        const { error: workspaceError } = await supabase.rpc('create_workspace_for_current_user', { workspace_name: workspaceName });
        if (workspaceError) return NextResponse.redirect(new URL('/login?error=workspace', url.origin));
      }
      return response;
    }
  }
  return NextResponse.redirect(new URL('/login?error=callback', url.origin));
}
