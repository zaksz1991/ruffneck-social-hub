import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { normalizeEntitlementSnapshot } from '@/lib/billing/entitlement-rules.mjs';
import { normalizeAgencyClientUsage } from '@/lib/agency/client-management.mjs';

export const dynamic = 'force-dynamic';

type UsageCardData = { used: number; limit: number; remaining: number; percent: number; reached: boolean };

function count(value: number): string {
  return new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(value);
}

function UsageCard({ title, description, value, unit = '' }: {
  title: string;
  description: string;
  value: UsageCardData;
  unit?: string;
}) {
  const tone = value.reached ? 'usage-full' : value.percent >= 80 ? 'usage-high' : 'usage-normal';
  return (
    <article className="usage-card">
      <div className="usage-card-heading"><div><h2>{title}</h2><p>{description}</p></div><span className={`usage-pill ${tone}`}>{value.reached ? 'Limit reached' : `${value.percent}% used`}</span></div>
      <div className="usage-number"><strong>{count(value.used)}</strong><span>of {count(value.limit)}{unit}</span></div>
      <div className="usage-track" role="progressbar" aria-label={`${title} usage`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value.percent}><span style={{ width: `${value.percent}%` }} /></div>
      <p className="usage-remaining">{count(value.remaining)} remaining</p>
    </article>
  );
}

export default async function BillingUsagePage({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: workspaceRows } = await supabase.from('workspaces').select('id,name').order('created_at', { ascending: true });
  const workspaces = (workspaceRows ?? []) as { id: string; name: string }[];
  const workspace = workspaces.find((row) => row.id === params.workspace) ?? workspaces[0];
  if (!workspace) {
    return <main className="usage-page"><div className="usage-wrap"><Link href="/" className="usage-back">← Workspace overview</Link><h1>Plan usage</h1><p>Create a workspace before viewing usage.</p></div></main>;
  }

  const { data: membership } = await supabase.from('workspace_members').select('role')
    .eq('workspace_id', workspace.id).eq('user_id', user.id).maybeSingle();
  if (!membership) redirect('/');

  const [snapshotResult, clientUsageResult] = await Promise.all([
    supabase.rpc('get_workspace_entitlement_snapshot', { target_workspace_id: workspace.id }),
    supabase.rpc('get_agency_client_usage_snapshot', { p_workspace_id: workspace.id }),
  ]);
  const snapshot = snapshotResult.error ? null : normalizeEntitlementSnapshot(snapshotResult.data);
  const resources = snapshot?.resources;
  const managedClients = clientUsageResult.error ? null : normalizeAgencyClientUsage(clientUsageResult.data);

  return (
    <main className="usage-page">
      <div className="usage-wrap">
        <header className="usage-top"><Link href={`/?workspace=${workspace.id}`} className="usage-back">← Workspace overview</Link><span className="usage-brand">RUFFNECK SOCIAL HUB</span></header>
        <section className="usage-hero">
          <span className="usage-eyebrow">SUBSCRIPTION CAPACITY</span>
          <h1>Plan usage</h1>
          <p>See how much of your workspace allowance has been used and what remains for <strong>{workspace.name}</strong>.</p>
          {snapshot && <div className="usage-plan-line"><span>Current plan</span><strong>{snapshot.plan_name}</strong><span className="usage-status">{snapshot.subscription_status.replaceAll('_', ' ')}</span></div>}
        </section>

        {snapshotResult.error || !snapshot || !resources ? (
          <section className="usage-error" role="alert">
            <h2>Usage information is not available yet</h2>
            <p>The usage service could not return a plan snapshot. The database administrator must apply migrations <code>0043_billing_subscription_foundation.sql</code> and <code>0044_subscription_entitlement_enforcement.sql</code>. Apply <code>0045_agency_client_management.sql</code> to enable managed-client usage. No resource counts are guessed or shown as zero.</p>
            <Link href={`/billing?workspace=${workspace.id}`} className="usage-primary">Return to plans and billing</Link>
          </section>
        ) : (
          <>
            <div className="usage-grid">
              <UsageCard title="Connected social accounts" description="Social profiles currently connected to this workspace." value={resources.connected_accounts} />
              <UsageCard title="Brands" description="Brand profiles saved in this workspace." value={resources.brands} />
              <UsageCard title="Team members" description="People who currently belong to this workspace." value={resources.team_members} />
              <UsageCard title="AI content generations" description="AI content drafts and platform-variant batches in the current UTC calendar month." value={resources.ai_generations} unit=" / month" />
              {managedClients && <UsageCard title="Managed client accounts" description="Open client records in the agency portfolio. Closing a client record frees a managed-client slot." value={managedClients} />} 
            </div>
            <section className="usage-notes">
              <h2>How these limits work</h2>
              <p><strong>Connected accounts:</strong> only accounts whose connection state is <code>connected</code> count. Disconnected or pending accounts do not use a slot.</p>
              <p><strong>AI usage:</strong> one successful AI content draft counts as one generation. One multi-platform variant batch also counts once, regardless of how many platforms are selected. Failed generation attempts are released and do not consume the allowance. The counter follows UTC calendar months.</p>
              <p><strong>When a limit is reached:</strong> existing records remain available. New brand creation, new team-member additions, new social account connections or metered AI generation are blocked until capacity becomes available or the workspace moves to a plan with a higher allowance.</p>
              <p><strong>Managed client accounts:</strong> migration 0045 counts each client record that is not marked closed against the plan's managed-client allowance. These are agency-side client records only; this feature does not give the agency access to a client's separate workspace or social accounts. AI inbox replies, AI triage and campaign-insight generation are not included in the AI content-generation meter.</p>{clientUsageResult.error && <p><strong>Client allowance unavailable:</strong> apply <code>0045_agency_client_management.sql</code> after migration 0044 to enable managed-client counting.</p>}
              <p className="usage-month">Usage period starts: {snapshot.usage_month || 'Current UTC month'} (UTC)</p>
            </section>
          </>
        )}
        <footer className="usage-footer"><Link href={`/billing?workspace=${workspace.id}`} className="usage-primary">Plans & billing</Link><Link href={`/agency/clients?workspace=${workspace.id}`} className="usage-back">Manage clients</Link><Link href={`/?workspace=${workspace.id}`} className="usage-back">Return to workspace</Link></footer>
      </div>
      <style>{`
        .usage-page{min-height:100vh;background:#f4f7fb;color:#17243c;padding:36px 22px 60px}.usage-wrap{max-width:1120px;margin:0 auto}.usage-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:42px}.usage-back{color:#40536f;text-decoration:none;font-weight:700}.usage-brand{font-size:11px;letter-spacing:.16em;font-weight:850;color:#73839b}.usage-hero{max-width:760px;margin-bottom:28px}.usage-eyebrow{font-size:11px;letter-spacing:.15em;font-weight:850;color:#0b94ad}.usage-hero h1{font-size:clamp(34px,5vw,50px);letter-spacing:-.045em;margin:10px 0;color:#14223a}.usage-hero>p{color:#687991;line-height:1.65}.usage-plan-line{display:inline-flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:10px;padding:10px 14px;background:#e8f3fa;border-radius:12px;color:#47617d;font-size:12px}.usage-plan-line strong{color:#142b48;font-size:14px}.usage-status{padding:4px 8px;border-radius:20px;background:#fff;text-transform:capitalize}.usage-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.usage-card{background:#fff;border:1px solid #e0e7f0;border-radius:18px;padding:22px;box-shadow:0 8px 24px #172d4a08}.usage-card-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}.usage-card h2{font-size:17px;margin:0 0 6px}.usage-card-heading p{color:#718096;font-size:12px;line-height:1.5;margin:0}.usage-pill{white-space:nowrap;border-radius:20px;padding:6px 9px;font-size:10px;font-weight:800}.usage-normal{background:#e4f8ee;color:#12623d}.usage-high{background:#fff3db;color:#80510b}.usage-full{background:#ffe8e8;color:#a33131}.usage-number{display:flex;align-items:baseline;gap:7px;margin:22px 0 12px}.usage-number strong{font-size:34px;letter-spacing:-.04em}.usage-number span{font-size:12px;color:#7b899c}.usage-track{height:9px;overflow:hidden;background:#edf1f5;border-radius:20px}.usage-track span{display:block;height:100%;border-radius:20px;background:linear-gradient(90deg,#0a9db4,#2bc5bd)}.usage-remaining{margin:9px 0 0;color:#65768b;font-size:12px;font-weight:700}.usage-notes{margin-top:22px;padding:22px 24px;background:#fff;border:1px solid #e0e7f0;border-radius:16px}.usage-notes h2{margin:0 0 13px;font-size:20px}.usage-notes p{font-size:13px;color:#586b82;line-height:1.65;margin:10px 0}.usage-notes code,.usage-error code{font-size:12px;background:#f0f3f7;padding:2px 5px;border-radius:5px}.usage-month{padding-top:12px;border-top:1px solid #edf1f5;font-weight:750}.usage-error{padding:22px;background:#fff8e9;border:1px solid #f0dfb8;border-radius:16px;color:#72541c}.usage-error p{line-height:1.65}.usage-error h2{margin-top:0}.usage-primary{display:inline-flex;align-items:center;justify-content:center;padding:11px 15px;border-radius:10px;background:#102746;color:white;text-decoration:none;font-size:12px;font-weight:750}.usage-footer{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:28px;padding-top:18px;border-top:1px solid #dfe6ef}@media(max-width:680px){.usage-page{padding:22px 14px 42px}.usage-top{margin-bottom:30px}.usage-grid{grid-template-columns:1fr}.usage-card{padding:18px}.usage-card-heading{flex-direction:column}.usage-notes{padding:18px}.usage-footer{align-items:flex-start;flex-direction:column}}
      `}</style>
    </main>
  );
}
