import type { Metadata } from 'next';
import Link from 'next/link';
import {
  getOrganizationCapabilitySummary,
  organizationCapabilityGroups,
  organizationReadinessNotes,
  providerCapabilityMatrix,
} from '@/lib/product/organization-capabilities.mjs';
import styles from './organizations.module.css';

export const metadata: Metadata = {
  title: 'For Organizations',
  description: 'A practical overview of RuffNeck Social Hub for organisations, agencies and multi-brand teams.',
  robots: { index: true, follow: true },
};

const statusLabels = {
  available: 'Available in the product',
  setup: 'Requires connection or setup',
  manual: 'Human-led / approval required',
} as const;

export default function OrganizationsPage() {
  const summary = getOrganizationCapabilitySummary();
  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <Link href="/" className={styles.brand} aria-label="RuffNeck Social Hub home">
          <span className={styles.brandMark}>R</span>
          <span>RUFFNECK <b>SOCIAL HUB</b></span>
        </Link>
        <nav aria-label="Main navigation" className={styles.navLinks}>
          <a href="#capabilities">Capabilities</a>
          <a href="#platforms">Platforms</a>
          <a href="#governance">Governance</a>
          <Link href="/login" className={styles.navButton}>Workspace sign in</Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>SOCIAL OPERATIONS FOR ORGANISATIONS</p>
          <h1>One operating layer for every brand, channel and customer conversation.</h1>
          <p className={styles.heroText}>
            RuffNeck Social Hub brings multi-brand content planning, supported publishing,
            team workflows, customer conversations and governed AI assistance into one
            workspace-led platform.
          </p>
          <div className={styles.heroActions}>
            <Link href="/login" className={styles.primaryButton}>Open the workspace</Link>
            <a href="#capabilities" className={styles.secondaryButton}>Explore capabilities</a>
          </div>
          <p className={styles.heroNote}>A capability overview, not a promise that every provider account is already connected.</p>
        </div>
        <div className={styles.heroPanel} aria-label="Platform operating model">
          <div className={styles.panelLabel}>ONE CONTROLLED WORKSPACE</div>
          <div className={styles.flowNode}><span>01</span><div><b>Plan</b><small>Brands · campaigns · content</small></div></div>
          <div className={styles.flowLine}/>
          <div className={styles.flowNode}><span>02</span><div><b>Coordinate</b><small>Teams · inbox · customer context</small></div></div>
          <div className={styles.flowLine}/>
          <div className={styles.flowNode}><span>03</span><div><b>Review and publish</b><small>Provider-specific actions · human control</small></div></div>
          <div className={styles.flowLine}/>
          <div className={styles.flowNode}><span>04</span><div><b>Measure</b><small>Campaigns · approved metrics · exports</small></div></div>
          <div className={styles.panelFoot}>WORKSPACE ISOLATION · ROLE CONTROLS · APPROVAL-FIRST AI</div>
        </div>
      </section>

      <section className={styles.summary} aria-label="Capability summary">
        <div><strong>{summary.total}</strong><span>documented capability areas</span></div>
        <div><strong>{summary.available}</strong><span>available in the product</span></div>
        <div><strong>{summary.setup}</strong><span>connection or setup dependent</span></div>
        <div><strong>{summary.manual}</strong><span>human-led or approval-gated</span></div>
      </section>

      <section id="capabilities" className={styles.section}>
        <div className={styles.sectionHeading}>
          <p className={styles.kicker}>HOW TEAMS USE IT</p>
          <h2>From content operations to customer care.</h2>
          <p>Capabilities are labelled by what the product supports today and what still depends on external access or a human decision.</p>
        </div>
        <div className={styles.groupGrid}>
          {organizationCapabilityGroups.map((group) => (
            <article key={group.title} className={styles.groupCard}>
              <h3>{group.title}</h3>
              <p className={styles.groupIntro}>{group.intro}</p>
              <div className={styles.capabilityList}>
                {group.capabilities.map((capability) => (
                  <div className={styles.capability} key={capability.title}>
                    <div className={styles.capabilityTop}>
                      <h4>{capability.title}</h4>
                      <span className={`${styles.status} ${styles[capability.status]}`}>{statusLabels[capability.status]}</span>
                    </div>
                    <p>{capability.detail}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="platforms" className={`${styles.section} ${styles.platformSection}`}>
        <div className={styles.sectionHeading}>
          <p className={styles.kicker}>INTEGRATION REALITY</p>
          <h2>Connected through official provider pathways.</h2>
          <p>Each platform has different permissions, review requirements and publishing limits. The product does not treat a provider name in a menu as proof of full feature parity.</p>
        </div>
        <div className={styles.providerGrid}>
          {providerCapabilityMatrix.map((provider) => (
            <article className={styles.providerCard} key={provider.provider}>
              <h3>{provider.provider}</h3>
              <b>{provider.state}</b>
              <p>{provider.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="governance" className={styles.governance}>
        <div>
          <p className={styles.kicker}>GOVERNED OPERATIONS</p>
          <h2>Automation should make teams more capable, not less accountable.</h2>
          <p>Workspace membership policies, server-side role checks, protected database operations, encrypted provider tokens and explicit review steps are part of the product architecture.</p>
        </div>
        <div className={styles.guardrailList}>
          <div><span>01</span><p><b>Tenant separation</b><small>Workspace-scoped records and database-enforced access policies.</small></p></div>
          <div><span>02</span><p><b>Least-privilege provider access</b><small>Provider scopes and account capabilities gate individual workflows.</small></p></div>
          <div><span>03</span><p><b>Human approval</b><small>AI drafts and routing suggestions do not silently become public actions.</small></p></div>
          <div><span>04</span><p><b>Safe reporting</b><small>Operational queue records and provider-confirmed metrics are distinguished.</small></p></div>
        </div>
      </section>

      <section className={styles.requirements}>
        <div className={styles.sectionHeading}>
          <p className={styles.kicker}>BEFORE A PRODUCTION ROLLOUT</p>
          <h2>What an organisation needs to bring.</h2>
        </div>
        <div className={styles.requirementGrid}>
          <article><b>Provider access</b><p>Organisation-owned Meta, LinkedIn, TikTok, YouTube or WhatsApp accounts, with eligible permissions and approved app access.</p></article>
          <article><b>Operating ownership</b><p>Named workspace owners, administrators, managers and publishers, with clear approval and escalation rules.</p></article>
          <article><b>AI choice</b><p>An optional reachable OpenAI-compatible inference endpoint. A self-hosted model can avoid a separate hosted-AI subscription, but requires compute and maintenance.</p></article>
          <article><b>Deployment and controls</b><p>Supabase and Vercel configuration, secret management, backups, monitoring and usage checks appropriate to the organisation's volume.</p></article>
        </div>
      </section>

      <section className={styles.limitations}>
        <h2>Important readiness notes</h2>
        <ul>{organizationReadinessNotes.map((note) => <li key={note}>{note}</li>)}</ul>
      </section>

      <footer className={styles.footer}>
        <div><b>RUFFNECK SOCIAL HUB</b><span>Multi-brand social operations, under organisational control.</span></div>
        <div className={styles.footerLinks}><Link href="/login">Workspace sign in</Link><a href="https://github.com/zaksz1991/ruffneck-social-hub" target="_blank" rel="noreferrer">Source repository</a></div>
        <small>Capability statements reflect the documented v6.6.0 application baseline. Account-level access, deployment configuration and provider permissions must be verified before purchase or rollout decisions.</small>
      </footer>
    </main>
  );
}
