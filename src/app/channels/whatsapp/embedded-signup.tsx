'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    FB?: { init(options: Record<string, unknown>): void; login(callback: (response: unknown) => void, options: Record<string, unknown>): void };
  }
}

type SignupInfo = { waba_id: string; phone_number_id: string };

export default function WhatsAppEmbeddedSignup({ appId, configId, graphVersion, workspaceId, brandId }: {
  appId: string; configId: string; graphVersion: string; workspaceId: string; brandId: string;
}) {
  const [sdkReady, setSdkReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [registrationPin, setRegistrationPin] = useState('');
  const registrationPinRef = useRef('');
  registrationPinRef.current = registrationPin;
  const codeRef = useRef('');
  const signupRef = useRef<SignupInfo | null>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (window.FB) {
        window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: graphVersion });
        setSdkReady(true);
        window.clearInterval(timer);
      }
    }, 250);
    const onMessage = (event: MessageEvent) => {
      if (!['https://www.facebook.com', 'https://web.facebook.com'].includes(event.origin)) return;
      let data: unknown = event.data;
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return; } }
      if (!data || typeof data !== 'object') return;
      const message = data as Record<string, unknown>;
      if (message.type !== 'WA_EMBEDDED_SIGNUP') return;
      const payload = message.data && typeof message.data === 'object' ? message.data as Record<string, unknown> : {};
      if (payload.event === 'FINISH') {
        const wabaId = typeof payload.waba_id === 'string' ? payload.waba_id : '';
        const phoneId = typeof payload.phone_number_id === 'string' ? payload.phone_number_id : '';
        if (/^\d{5,30}$/.test(wabaId) && /^\d{5,30}$/.test(phoneId)) signupRef.current = { waba_id: wabaId, phone_number_id: phoneId };
      } else if (payload.event === 'CANCEL' || payload.event === 'ERROR') {
        setBusy(false); setError('WhatsApp Embedded Signup was cancelled or could not complete.');
      }
      void completeWhenReady();
    };
    async function completeWhenReady() {
      if (submittedRef.current || !codeRef.current || !signupRef.current) return;
      submittedRef.current = true; setBusy(true); setError('');
      try {
        const response = await fetch('/api/integrations/whatsapp/complete', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: codeRef.current, registrationPin: registrationPinRef.current, ...signupRef.current, workspaceId, brandId }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'WhatsApp connection could not be verified.');
        setDone(true);
        codeRef.current = '';
        signupRef.current = null;
        registrationPinRef.current = '';
        setRegistrationPin('');
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'WhatsApp connection failed.');
        submittedRef.current = false;
      } finally { setBusy(false); }
    }
    window.addEventListener('message', onMessage);
    return () => { window.clearInterval(timer); window.removeEventListener('message', onMessage); };
  }, [appId, brandId, graphVersion, workspaceId]);

  function start() {
    if (!window.FB || !sdkReady || busy || (registrationPin.length > 0 && !/^\d{6}$/.test(registrationPin))) return;
    setError(''); setBusy(true); submittedRef.current = false; signupRef.current = null; codeRef.current = '';
    window.FB.login((response: unknown) => {
      const auth = response && typeof response === 'object' ? (response as Record<string, unknown>).authResponse : null;
      const code = auth && typeof auth === 'object' ? (auth as Record<string, unknown>).code : null;
      if (typeof code !== 'string' || code.length > 4096) {
        setBusy(false); setError('Meta did not return a valid authorization code.'); return;
      }
      codeRef.current = code;
      if (signupRef.current && !submittedRef.current) {
        const event = new MessageEvent('message', { data: { type: 'WA_EMBEDDED_SIGNUP', data: { event: 'FINISH', ...signupRef.current } }, origin: 'https://www.facebook.com' });
        window.dispatchEvent(event);
      }
    }, { config_id: configId, response_type: 'code', override_default_response_type: true, extras: { version: 4, sessionInfoVersion: 4 } });
  }

  return <section className="wa-connect-card">
    <div className="wa-connect-step"><strong>1</strong><div><b>Authorize your Meta business</b><span>Choose the WhatsApp Business Account and phone number owned by this brand.</span></div></div>
    <div className="wa-connect-step"><strong>2</strong><div><b>Verify and subscribe</b><span>RuffNeck validates permissions, phone ownership and webhook subscription before saving encrypted credentials.</span></div></div>
    <label className="wa-registration-pin">WhatsApp two-step verification PIN (new or pending numbers only) <input type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{6}" minLength={6} maxLength={6} value={registrationPin} onChange={(event) => setRegistrationPin(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Optional unless number is not registered"/></label>
    <p className="wa-connect-pin-help">Already-connected Cloud API numbers do not need a PIN. For a new or pending number, enter a six-digit PIN to enable two-step verification during registration. It is sent directly to Meta and is never stored in RuffNeck. Keep the PIN in your own secure password manager for future phone verification.</p>
    <button type="button" className="platform-connect-button wa-signup-button" onClick={start} disabled={!sdkReady || busy || done || (registrationPin.length > 0 && !/^\d{6}$/.test(registrationPin))}>{done ? 'WhatsApp connected' : busy ? 'Completing secure connection…' : sdkReady ? 'Continue with Meta' : 'Loading Meta signup…'}</button>
    {error && <p className="wa-connect-error" role="alert">{error}</p>}
    {done && <p className="wa-connect-success" role="status">WhatsApp Business number verified and connected. Return to Channels to view the account.</p>}
  </section>;
}
