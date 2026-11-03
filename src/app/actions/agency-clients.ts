'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  isAgencyClientStatus,
  validateAgencyClientInput,
  validateAgencyClientNote,
} from '@/lib/agency/client-management.mjs';

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function returnToClients(workspaceId: string, result: string): never {
  redirect(`/agency/clients?workspace=${encodeURIComponent(workspaceId)}&result=${encodeURIComponent(result)}`);
}

async function requireClientManager(workspaceId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: membership, error } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error || !membership || !['owner', 'admin', 'manager'].includes(String(membership.role))) {
    returnToClients(workspaceId, 'permission');
  }
  return supabase;
}

export async function createAgencyClient(formData: FormData) {
  const workspaceId = text(formData, 'workspace_id');
  if (!isUuid(workspaceId)) redirect('/agency/clients?result=invalid');

  const parsed = validateAgencyClientInput({
    clientName: text(formData, 'client_name'),
    contactName: text(formData, 'contact_name'),
    contactEmail: text(formData, 'contact_email'),
    contactPhone: text(formData, 'contact_phone'),
    website: text(formData, 'website'),
    status: text(formData, 'status') || 'prospect',
    serviceLevel: text(formData, 'service_level') || 'standard',
    monthlyRetainer: text(formData, 'monthly_retainer'),
    retainerCurrency: text(formData, 'retainer_currency') || 'NGN',
    startDate: text(formData, 'start_date'),
    nextReviewDate: text(formData, 'next_review_date'),
  });
  if (!parsed.ok) returnToClients(workspaceId, 'invalid');

  const supabase = await requireClientManager(workspaceId);
  const value = parsed.value;
  const { error } = await supabase.rpc('create_agency_client', {
    p_workspace_id: workspaceId,
    p_client_name: value.clientName,
    p_contact_name: value.contactName,
    p_contact_email: value.contactEmail,
    p_contact_phone: value.contactPhone,
    p_website: value.website,
    p_status: value.status,
    p_service_level: value.serviceLevel,
    p_monthly_retainer: value.monthlyRetainer,
    p_retainer_currency: value.retainerCurrency,
    p_start_date: value.startDate || null,
    p_next_review_date: value.nextReviewDate || null,
  });
  if (error) {
    const message = String(error.message ?? '');
    if (message.includes('subscription_client_limit')) returnToClients(workspaceId, 'limit');
    if (error.code === '42501') returnToClients(workspaceId, 'permission');
    returnToClients(workspaceId, 'save_error');
  }
  revalidatePath('/agency/clients');
  revalidatePath('/billing/usage');
  returnToClients(workspaceId, 'created');
}

export async function updateAgencyClientStatus(formData: FormData) {
  const workspaceId = text(formData, 'workspace_id');
  const clientId = text(formData, 'client_id');
  const status = text(formData, 'status');
  if (!isUuid(workspaceId) || !isUuid(clientId) || !isAgencyClientStatus(status)) {
    if (isUuid(workspaceId)) returnToClients(workspaceId, 'invalid');
    redirect('/agency/clients?result=invalid');
  }
  const supabase = await requireClientManager(workspaceId);
  const { error } = await supabase.rpc('update_agency_client_status', {
    p_workspace_id: workspaceId,
    p_client_id: clientId,
    p_status: status,
  });
  if (error) {
    if (String(error.message ?? '').includes('subscription_client_limit')) returnToClients(workspaceId, 'limit');
    returnToClients(workspaceId, 'status_error');
  }
  revalidatePath('/agency/clients');
  revalidatePath('/billing/usage');
  returnToClients(workspaceId, 'status_updated');
}

export async function updateAgencyClientProfile(formData: FormData) {
  const workspaceId = text(formData, 'workspace_id');
  const clientId = text(formData, 'client_id');
  if (!isUuid(workspaceId) || !isUuid(clientId)) redirect('/agency/clients?result=invalid');
  const parsed = validateAgencyClientInput({
    clientName: text(formData, 'client_name'),
    contactName: text(formData, 'contact_name'),
    contactEmail: text(formData, 'contact_email'),
    contactPhone: text(formData, 'contact_phone'),
    website: text(formData, 'website'),
    status: 'prospect',
    serviceLevel: text(formData, 'service_level') || 'standard',
    monthlyRetainer: text(formData, 'monthly_retainer'),
    retainerCurrency: text(formData, 'retainer_currency') || 'NGN',
    startDate: text(formData, 'start_date'),
    nextReviewDate: text(formData, 'next_review_date'),
  });
  if (!parsed.ok) returnToClients(workspaceId, 'invalid');
  const supabase = await requireClientManager(workspaceId);
  const value = parsed.value;
  const { error } = await supabase.rpc('update_agency_client_profile', {
    p_workspace_id: workspaceId,
    p_client_id: clientId,
    p_client_name: value.clientName,
    p_contact_name: value.contactName,
    p_contact_email: value.contactEmail,
    p_contact_phone: value.contactPhone,
    p_website: value.website,
    p_service_level: value.serviceLevel,
    p_monthly_retainer: value.monthlyRetainer,
    p_retainer_currency: value.retainerCurrency,
    p_start_date: value.startDate || null,
    p_next_review_date: value.nextReviewDate || null,
  });
  if (error) returnToClients(workspaceId, 'profile_error');
  revalidatePath('/agency/clients');
  returnToClients(workspaceId, 'profile_updated');
}

export async function addAgencyClientNote(formData: FormData) {
  const workspaceId = text(formData, 'workspace_id');
  const clientId = text(formData, 'client_id');
  if (!isUuid(workspaceId) || !isUuid(clientId)) redirect('/agency/clients?result=invalid');
  const parsed = validateAgencyClientNote(text(formData, 'note_text'));
  if (!parsed.ok) returnToClients(workspaceId, 'invalid_note');
  const supabase = await requireClientManager(workspaceId);
  const { error } = await supabase.rpc('add_agency_client_note', {
    p_workspace_id: workspaceId,
    p_client_id: clientId,
    p_note_text: parsed.value,
  });
  if (error) returnToClients(workspaceId, 'note_error');
  revalidatePath('/agency/clients');
  returnToClients(workspaceId, 'note_added');
}
