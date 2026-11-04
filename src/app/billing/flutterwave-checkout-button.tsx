'use client';

import { useState } from 'react';
import { createWorkspaceSubscriptionCheckout } from '@/app/actions/billing';

type CheckoutConfig = {
  public_key: string;
  tx_ref: string;
  amount: number;
  currency: string;
  payment_options: string;
  payment_plan: number;
  redirect_url: string;
  customer: { email: string; name: string };
  customizations: { title: string; description: string };
  meta: { ruffneck_reference: string; ruffneck_plan_code: string; ruffneck_workspace_id: string };
};
type FlutterwaveWindow = Window & {
  FlutterwaveCheckout?: (config: CheckoutConfig) => unknown;
  __ruffneckFlutterwaveLoad?: Promise<void>;
};

function ensureFlutterwaveScript(): Promise<void> {
  const target = window as FlutterwaveWindow;
  if (target.FlutterwaveCheckout) return Promise.resolve();
  if (target.__ruffneckFlutterwaveLoad) return target.__ruffneckFlutterwaveLoad;
  target.__ruffneckFlutterwaveLoad = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-ruffneck-flutterwave="true"]');
    const script = existing ?? document.createElement('script');
    script.src = 'https://checkout.flutterwave.com/v3.js';
    script.async = true;
    script.dataset.ruffneckFlutterwave = 'true';
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => {
      target.__ruffneckFlutterwaveLoad = undefined;
      script.remove();
      reject(new Error('Flutterwave checkout library could not be loaded.'));
    }, { once: true });
    if (!existing) document.head.appendChild(script);
    if (existing && target.FlutterwaveCheckout) resolve();
  });
  return target.__ruffneckFlutterwaveLoad;
}

export function FlutterwaveCheckoutButton({ workspaceId, planCode }: { workspaceId: string; planCode: string }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  async function startCheckout() {
    if (busy) return;
    setBusy(true);
    setNotice('Preparing secure Flutterwave checkout…');
    try {
      const result = await createWorkspaceSubscriptionCheckout(workspaceId, planCode);
      if (!result.ok) {
        setNotice(result.message);
        setBusy(false);
        return;
      }
      await ensureFlutterwaveScript();
      const flutterwave = window as FlutterwaveWindow;
      if (!flutterwave.FlutterwaveCheckout) throw new Error('Flutterwave checkout did not initialise. No payment was launched.');
      flutterwave.FlutterwaveCheckout({
        public_key: result.publicKey,
        tx_ref: result.reference,
        amount: result.amount,
        currency: result.currency,
        payment_options: 'card',
        payment_plan: Number(result.providerPlanId),
        redirect_url: result.redirectUrl,
        customer: { email: result.customerEmail, name: result.customerName },
        customizations: {
          title: 'RuffNeck Social Hub',
          description: `${planCode.replace(/_/g, ' ')} workspace subscription`,
        },
        meta: {
          ruffneck_reference: result.reference,
          ruffneck_plan_code: planCode,
          ruffneck_workspace_id: workspaceId,
        },
      });
      setNotice('Flutterwave checkout opened. Your subscription remains pending until the payment is checked in the Flutterwave dashboard and approved by a RuffNeck billing administrator.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Checkout could not be started. The payment record remains pending until it is checked.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="ruffneck-flw-checkout">
    <button className="billing-select-button" type="button" disabled={busy} onClick={startCheckout}>
      {busy ? 'Opening Flutterwave…' : 'Continue to Flutterwave checkout'}
    </button>
    {notice && <p className="ruffneck-flw-checkout-notice" role="status">{notice}</p>}
    <style>{`.ruffneck-flw-checkout{margin-top:auto;padding-top:18px}.ruffneck-flw-checkout-notice{margin:9px 0 0;color:#6b7890;font-size:11px;line-height:1.55}`}</style>
  </div>;
}
