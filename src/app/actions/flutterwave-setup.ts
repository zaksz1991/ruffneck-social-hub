'use server';

import { redirect } from 'next/navigation';

// v6.1.2 no longer provisions plans through the authenticated Flutterwave API.
// Without a Secret Key, platform admins create plans in their merchant dashboard
// and register the numeric ID using the Public-Key setup screen.
export async function testFlutterwaveConnection(): Promise<void> {
  redirect('/platform/billing-setup?result=public_key_mode_only');
}

export async function provisionFlutterwavePlans(_formData: FormData): Promise<void> {
  redirect('/platform/billing-setup?result=manual_plan_mapping_required');
}
