'use client';

import { useState } from 'react';

export default function InviteLink({ href }: { href: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="team-share-link">
      <input aria-label="Invitation link" readOnly value={href} onFocus={(event: React.FocusEvent<HTMLInputElement>) => event.currentTarget.select()} />
      <button type="button" onClick={copyLink}>{copied ? 'Copied' : 'Copy link'}</button>
    </div>
  );
}
