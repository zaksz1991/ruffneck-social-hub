import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptProviderSecret, readTokenEncryptionKey } from '@/lib/integrations/token-crypto';
import { getWhatsAppGraphVersion, isStaticWhatsAppTemplate } from '@/lib/integrations/whatsapp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
type Obj = Record<string, unknown>;
function object(value: unknown): value is Obj { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get('account') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) return NextResponse.json({ error: 'Invalid WhatsApp account.' }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const { data: account } = await supabase.from('social_accounts').select('id,workspace_id,provider,provider_account_id,connection_state,capabilities').eq('id', accountId).maybeSingle();
  if (!account || account.provider !== 'whatsapp' || account.connection_state !== 'connected') return NextResponse.json({ error: 'Connected WhatsApp account not found.' }, { status: 404 });
  const { data: membership } = await supabase.from('workspace_members').select('role').eq('workspace_id', account.workspace_id).eq('user_id', user.id).maybeSingle();
  if (!membership) return NextResponse.json({ error: 'Workspace access denied.' }, { status: 403 });
  try {
    const admin = createSupabaseAdminClient();
    const [{ data: vault }, key] = await Promise.all([
      admin.from('social_account_token_vault').select('ciphertext,iv,auth_tag,token_expires_at').eq('social_account_id', account.id).maybeSingle(),
      Promise.resolve(readTokenEncryptionKey()),
    ]);
    if (!vault || Date.parse(vault.token_expires_at) <= Date.now()) return NextResponse.json({ error: 'WhatsApp token expired. Reconnect the account.' }, { status: 409 });
    const token = decryptProviderSecret({ ciphertext: vault.ciphertext, iv: vault.iv, authTag: vault.auth_tag }, key);
    const wabaId = typeof account.capabilities?.waba_id === 'string' ? account.capabilities.waba_id : '';
    if (!/^\d{5,30}$/.test(wabaId)) return NextResponse.json({ error: 'WhatsApp Business Account identifier is unavailable.' }, { status: 409 });
    const url = new URL(`https://graph.facebook.com/${getWhatsAppGraphVersion()}/${wabaId}/message_templates`);
    url.searchParams.set('fields', 'name,status,language,category,components'); url.searchParams.set('limit', '100');
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !object(body)) return NextResponse.json({ error: 'Meta could not retrieve approved templates.' }, { status: 502 });
    const rows = Array.isArray(body.data) ? body.data : [];
    const templates = rows.flatMap((row) => {
      if (!object(row) || row.status !== 'APPROVED' || typeof row.name !== 'string' || typeof row.language !== 'string') return [];
      const components = Array.isArray(row.components) ? row.components : [];
      const requiresParameters = !isStaticWhatsAppTemplate(components);
      return [{ name: row.name.slice(0, 512), language: row.language.slice(0, 32), category: typeof row.category === 'string' ? row.category : 'UTILITY', requiresParameters }];
    }).slice(0, 100);
    return NextResponse.json({ templates });
  } catch {
    return NextResponse.json({ error: 'WhatsApp template lookup failed.' }, { status: 503 });
  }
}
