import Link from 'next/link';
import Script from 'next/script';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import WhatsAppEmbeddedSignup from './embedded-signup';
import { getWhatsAppGraphVersion } from '@/lib/integrations/whatsapp';
import '../channels.css';

export const maxDuration = 60;

export default async function WhatsAppConnectPage({ searchParams }: { searchParams: Promise<{ workspace?: string; brand?: string }> }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const workspaceId = params.workspace ?? '';
  const brandId = params.brand ?? '';
  const { data: membership } = await supabase.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle();
  if (!membership || !['owner','admin','manager'].includes(membership.role)) redirect('/channels?error=permission');
  const { data: brand } = await supabase.from('brands').select('id,name').eq('id', brandId).eq('workspace_id', workspaceId).maybeSingle();
  if (!brand) redirect('/channels?error=selection');
  const appId = process.env.FACEBOOK_APP_ID ?? '';
  const configId = process.env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID ?? '';
  const configured = Boolean(appId && configId && process.env.FACEBOOK_APP_SECRET && process.env.SOCIAL_TOKEN_ENCRYPTION_KEY);
  let graphVersion = 'v26.0';
  try { graphVersion = getWhatsAppGraphVersion(); } catch { /* The backend reports invalid configuration on submit. */ }
  return <main className="channels-shell"><header className="channels-topbar"><Link href="/channels" className="channels-logo"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub"/></Link><nav><Link href="/">Overview</Link><Link href="/channels">Connected channels</Link><Link href="/inbox/conversations">Unified Inbox</Link></nav><span className="channels-secure">WHATSAPP BUSINESS SETUP</span></header><div className="channels-main"><div className="channels-heading"><div><span className="channels-kicker">OFFICIAL META CLOUD API · EMBEDDED SIGNUP V4</span><h1>Connect WhatsApp Business</h1><p>Brand: {brand.name}. The selected WhatsApp phone number will be linked to this brand and its workspace.</p></div><div className="channels-workspace"><span>CONNECTION SECURITY</span><strong>Encrypted token vault</strong><small>Server-side only</small></div></div>{configured ? <><Script src="https://connect.facebook.net/en_US/sdk.js" strategy="afterInteractive"/><WhatsAppEmbeddedSignup appId={appId} configId={configId} graphVersion={graphVersion} workspaceId={workspaceId} brandId={brandId}/></> : <div className="channels-notice channels-error">WhatsApp Embedded Signup is not configured. Set FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID and SOCIAL_TOKEN_ENCRYPTION_KEY in Vercel.</div>}<div className="channels-notice"><strong>Meta setup requirements</strong><p>Configure WhatsApp Embedded Signup version 4, the same Meta app's WhatsApp product and webhook callback <code>/api/webhooks/whatsapp</code>. Subscribe to the <code>messages</code> webhook field. The Meta app must have WhatsApp Business Management and Messaging permissions approved for the account's access level.</p></div><Link href={`/channels?workspace=${workspaceId}`} className="inbox-back">Back to channels</Link></div></main>;
}
