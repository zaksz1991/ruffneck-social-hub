'use client';

import { useEffect, useState } from 'react';
import { createWhatsAppTemplateDraft } from '@/app/actions/whatsapp';

type Template = { name: string; language: string; category: string; requiresParameters: boolean };
export default function WhatsAppTemplatePicker({ accountId, conversationId }: { accountId: string; conversationId: string }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetch(`/api/integrations/whatsapp/templates?account=${encodeURIComponent(accountId)}`, { cache: 'no-store' })
      .then(async (response) => { const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Approved templates are unavailable.'); return body; })
      .then((body) => { if (active) setTemplates(Array.isArray(body.templates) ? body.templates : []); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'Template lookup failed.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accountId]);
  const supported = templates.filter((template) => !template.requiresParameters);
  return <section className="wa-template-picker"><div><span className="eyebrow">APPROVED MESSAGE TEMPLATES</span><h3>Business-initiated message</h3><p>Use an approved template outside the 24-hour service window. Templates requiring variables are not exposed by this first release.</p></div>
    {loading ? <p>Loading approved templates from Meta…</p> : error ? <p className="wa-error">{error}</p> : supported.length === 0 ? <p>No approved parameter-free templates were found for this account.</p> : <form action={createWhatsAppTemplateDraft}>
      <input type="hidden" name="conversation_id" value={conversationId}/>
      <label>Approved template<select name="template_choice" required defaultValue=""><option value="" disabled>Select a template</option>{supported.map((template) => <option key={`${template.name}:${template.language}`} value={`${template.name}|${template.language}`}>{template.name} · {template.language} · {template.category}</option>)}</select></label>
      <button type="submit">Create template draft</button>
    </form>}
  </section>;
}
