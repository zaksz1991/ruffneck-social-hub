import Link from 'next/link';
import { saveBrandVoiceProfile } from '@/app/actions/workspaces';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatBrandVoiceList, readBrandVoiceProfile } from '@/lib/brands/voice-profile';
import './brands.css';

type Membership = { workspace_id: string; role: string };
type Workspace = { id: string; name: string };
type Brand = { id: string; workspace_id: string; name: string; timezone: string; voice_profile: unknown };
const roleCanManage = (role: string) => role === 'owner' || role === 'admin';

export default async function BrandsPage({ searchParams }: { searchParams: Promise<{ workspace?: string; saved?: string; error?: string }> }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main className="brands-empty-screen"><section><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub"/><h1>Sign in to manage brand profiles</h1><p>Brand voice settings are private to each workspace.</p><Link href="/login">Open sign in</Link></section></main>;
  const { data: membershipsData, error: membershipsError } = await supabase
    .from('workspace_members').select('workspace_id,role').eq('user_id', user.id);
  const memberships = (membershipsData ?? []) as Membership[];
  const workspaceIds = memberships.map((item) => item.workspace_id);
  const { data: workspacesData, error: workspacesError } = workspaceIds.length
    ? await supabase.from('workspaces').select('id,name').in('id', workspaceIds).order('created_at', { ascending: true })
    : { data: [], error: null };
  const workspaces = (workspacesData ?? []) as Workspace[];
  const activeWorkspace = workspaces.find((item) => item.id === params.workspace) ?? workspaces[0] ?? null;
  const activeMembership = memberships.find((item) => item.workspace_id === activeWorkspace?.id);
  const role = activeMembership?.role ?? 'member';
  const canManage = roleCanManage(role);
  const { data: brandRows, error: brandError } = activeWorkspace
    ? await supabase.from('brands').select('id,workspace_id,name,timezone,voice_profile').eq('workspace_id', activeWorkspace.id).order('created_at', { ascending: true })
    : { data: [], error: null };
  const brands = (brandRows ?? []) as Brand[];
  const errorMessages: Record<string, string> = {
    'voice-input': 'The brand voice fields contain invalid or oversized text. Each list accepts up to 12 lines of 240 characters.',
    'voice-permission': 'Only workspace owners and admins can edit brand voice profiles.',
    'voice-save': 'The brand voice profile could not be saved. Confirm migration 0019 is applied and try again.',
  };
  const loadError = Boolean(membershipsError || workspacesError || brandError);
  return <main className="brands-shell">
    <header className="brands-topbar">
      <Link href="/" className="brands-logo"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub"/></Link>
      <nav aria-label="Workspace navigation"><Link href="/">Overview</Link><span>Brands &amp; clients</span><Link href="/content">Content Studio</Link><Link href="/team">Team access</Link><Link href="/channels">Channels</Link></nav>
      <Link href="/" className="brands-back">Back to overview</Link>
    </header>
    <section className="brands-main">
      <div className="brands-heading"><div><span className="eyebrow">WORKSPACE CONFIGURATION</span><h1>Brands &amp; client profiles</h1><p>Define how each brand should sound, what it may safely claim and when conversations must be escalated.</p></div>{activeWorkspace && <div className="brands-workspace-chip"><small>ACTIVE WORKSPACE</small><strong>{activeWorkspace.name}</strong><span>{role.toUpperCase()}</span></div>}</div>
      {workspaces.length > 1 && <div className="brands-workspace-switcher"><span>Switch workspace</span>{workspaces.map((workspace) => <Link key={workspace.id} href={`/brands?workspace=${workspace.id}`} className={workspace.id === activeWorkspace?.id ? 'selected' : ''}>{workspace.name}</Link>)}</div>}
      {params.error && <p className="brands-alert error" role="alert">{errorMessages[params.error] ?? 'The requested operation could not be completed.'}</p>}
      {params.saved === 'voice' && <p className="brands-alert success" role="status">Brand voice profile saved. New AI drafts will use the updated guidance.</p>}
      {loadError && <p className="brands-alert error" role="alert">Some workspace or brand information could not be loaded. Refresh the page before editing.</p>}
      {!activeWorkspace ? <section className="brands-empty"><h2>No workspace available</h2><p>Create a workspace or ask an administrator to invite you.</p><Link href="/">Return to overview</Link></section> : brands.length ? <div className="brands-list">
        {brands.map((brand, index) => {
          const profile = readBrandVoiceProfile(brand.voice_profile);
          return <article className="brand-profile-card" key={brand.id}>
            <div className="brand-profile-heading"><div className={`brand-profile-avatar avatar-${index % 4}`}>{brand.name.slice(0, 1).toUpperCase()}</div><div className="brand-profile-title"><h2>{brand.name}</h2><p>Brand profile · {brand.timezone} · {profile.approved_facts.length} approved facts</p></div><span className="brand-profile-status">{canManage ? 'ADMINISTRATOR CONTROL' : 'READ ONLY'}</span></div>
            <div className="brand-profile-explainer"><strong>AI brand voice configuration</strong><span>These fields are supplied as context to supported AI drafting and reply-assistance features. They do not override provider rules or human review.</span></div>
            <form action={saveBrandVoiceProfile} className="brand-voice-form">
              <input type="hidden" name="workspace_id" value={activeWorkspace.id}/>
              <input type="hidden" name="brand_id" value={brand.id}/>
              <div className="brand-voice-fields-top">
                <label>Brand tone and style
                  <input name="tone" defaultValue={profile.tone} maxLength={240} placeholder="e.g. Warm, confident, plain-spoken and respectful" readOnly={!canManage}/>
                  <small>Describe the writing personality in 120 characters or fewer.</small>
                </label>
                <label>Supported languages
                  <input name="languages" defaultValue={profile.languages} maxLength={240} placeholder="e.g. English, Hausa and Nigerian Pidgin" readOnly={!canManage}/>
                  <small>AI tools use this as language guidance, not a guarantee of translation accuracy.</small>
                </label>
              </div>
              <div className="brand-voice-fields-list">
                <label>Approved facts <span>Claims the AI may repeat when relevant</span>
                  <textarea name="approved_facts" rows={4} maxLength={3000} defaultValue={formatBrandVoiceList(profile.approved_facts)} placeholder={'One fact per line\nOfficial opening hours\nVerified product information'} readOnly={!canManage}/>
                </label>
                <label>Forbidden claims <span>Claims the AI must not make</span>
                  <textarea name="forbidden_claims" rows={4} maxLength={3000} defaultValue={formatBrandVoiceList(profile.forbidden_claims)} placeholder={'One rule per line\nDo not promise guaranteed results\nDo not invent prices or discounts'} readOnly={!canManage}/>
                </label>
                <label>Escalation triggers <span>Topics that should be handed to a person</span>
                  <textarea name="escalation_triggers" rows={4} maxLength={3000} defaultValue={formatBrandVoiceList(profile.escalation_triggers)} placeholder={'One trigger per line\nRefund or charge dispute\nLegal complaint\nSafety concern'} readOnly={!canManage}/>
                </label>
              </div>
              <div className="brand-voice-footer"><span>Each list supports up to 12 entries. Individual entries are limited to 240 characters. Profile values are workspace-scoped.</span>{canManage && <button type="submit">Save brand voice profile</button>}</div>
            </form>
          </article>;
        })}
      </div> : <section className="brands-empty"><h2>No brands in this workspace</h2><p>Add a brand from your workspace overview before setting its voice profile.</p><Link href="/">Open workspace overview</Link></section>}
      <footer className="brands-footer"><span>RUFFNECK SOCIAL HUB</span><i/> WORKSPACE-SCOPED BRAND GUIDANCE · HUMAN REVIEW REQUIRED</footer>
    </section>
  </main>;
}
