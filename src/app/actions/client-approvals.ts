'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/content/validation';
import {
  canUseClientApprovalPortal,
  parseClientApprovalDecision,
} from '@/lib/content/client-approval';

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function back(workspaceId: string, query: string): never {
  redirect(`/approvals?workspace=${encodeURIComponent(workspaceId)}&${query}`);
}

export async function reviewClientApproval(formData: FormData): Promise<void> {
  const workspaceId = field(formData, 'workspace_id');
  const contentId = field(formData, 'content_id');
  const parsed = parseClientApprovalDecision(
    field(formData, 'decision'),
    typeof formData.get('note') === 'string' ? String(formData.get('note')) : '',
  );

  if (!isUuid(workspaceId) || !isUuid(contentId) || !parsed.ok) {
    back(workspaceId || 'invalid', parsed.ok ? 'error=input' : `error=${parsed.reason}`);
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Check current membership before calling the protected review RPC. The RPC
  // remains authoritative and independently checks the actor, role and item.
  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError || !membership || !canUseClientApprovalPortal(membership.role)) {
    back(workspaceId, 'error=permission');
  }

  const { error } = await supabase.rpc('review_content_item', {
    target_content_id: contentId,
    review_decision: parsed.value.decision,
    review_note: parsed.value.note,
  });

  if (error) {
    console.error('[client-approvals.review] Review rejected:', { code: error.code });
    back(workspaceId, error.code === '42501' ? 'error=permission' : 'error=review');
  }

  revalidatePath('/approvals');
  revalidatePath('/content');
  revalidatePath('/publishing');
  back(workspaceId, parsed.value.decision === 'approved' ? 'saved=approved' : 'saved=changes');
}
