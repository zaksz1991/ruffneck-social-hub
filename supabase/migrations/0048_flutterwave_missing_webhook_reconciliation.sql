-- RuffNeck Social Hub v6.3.0
-- Controlled manual intake for successful initial payments whose authenticated
-- Flutterwave webhook was not delivered. This does not verify transactions with
-- Flutterwave and does not activate a subscription. It creates a pending review
-- record only after an administrator enters the dashboard details and the exact
-- values independently match a pending RuffNeck invoice.

alter table public.flutterwave_manual_payment_reviews
  add column if not exists review_source text not null default 'webhook',
  add column if not exists reconciliation_note text not null default '',
  add column if not exists reconciled_by uuid references auth.users(id) on delete set null,
  add column if not exists reconciled_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'flutterwave_manual_reviews_source_check'
      and conrelid = 'public.flutterwave_manual_payment_reviews'::regclass
  ) then
    alter table public.flutterwave_manual_payment_reviews
      add constraint flutterwave_manual_reviews_source_check
      check (review_source in ('webhook', 'manual_reconciliation'));
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'flutterwave_manual_reviews_reconciliation_note_check'
      and conrelid = 'public.flutterwave_manual_payment_reviews'::regclass
  ) then
    alter table public.flutterwave_manual_payment_reviews
      add constraint flutterwave_manual_reviews_reconciliation_note_check
      check (char_length(reconciliation_note) <= 2000);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'flutterwave_manual_reviews_reconciliation_actor_check'
      and conrelid = 'public.flutterwave_manual_payment_reviews'::regclass
  ) then
    alter table public.flutterwave_manual_payment_reviews
      add constraint flutterwave_manual_reviews_reconciliation_actor_check
      check (
        (review_source = 'manual_reconciliation' and reconciled_by is not null and reconciled_at is not null)
        or review_source = 'webhook'
      );
  end if;
end;
$$;

create or replace function public.register_flutterwave_missing_webhook_review(
  target_provider_transaction_id text,
  target_reference text,
  target_amount numeric,
  target_currency text,
  target_customer_email text,
  target_provider_plan_id text,
  target_paid_at timestamptz,
  target_reviewer_id uuid,
  target_confirmation_phrase text,
  target_reconciliation_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.billing_payments%rowtype;
  existing_review public.flutterwave_manual_payment_reviews%rowtype;
  new_review_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if target_reviewer_id is null then
    raise exception 'A platform billing administrator is required' using errcode = '22023';
  end if;
  if target_confirmation_phrase is distinct from 'RECONCILE' then
    raise exception 'Explicit reconciliation confirmation is required' using errcode = '22023';
  end if;
  if target_provider_transaction_id is null or target_provider_transaction_id !~ '^[0-9]{1,30}$' then
    raise exception 'Invalid Flutterwave transaction identifier' using errcode = '22023';
  end if;
  if target_reference is null or pg_catalog.char_length(pg_catalog.btrim(target_reference)) not between 3 and 160 then
    raise exception 'Invalid Flutterwave transaction reference' using errcode = '22023';
  end if;
  if target_amount is null or target_amount <= 0 or target_amount > 9999999999.99 or
     target_amount <> pg_catalog.round(target_amount, 2) then
    raise exception 'Invalid payment amount' using errcode = '22023';
  end if;
  if target_currency is null or target_currency !~ '^[A-Z]{3}$' then
    raise exception 'Invalid payment currency' using errcode = '22023';
  end if;
  if target_customer_email is null or target_customer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid customer email' using errcode = '22023';
  end if;
  if target_provider_plan_id is null or target_provider_plan_id !~ '^[0-9]{1,20}$' then
    raise exception 'A numeric Flutterwave payment plan ID is required' using errcode = '22023';
  end if;
  if target_paid_at is null or target_paid_at > now() + interval '5 minutes' then
    raise exception 'Invalid payment timestamp' using errcode = '22023';
  end if;
  if target_reconciliation_note is null or
     pg_catalog.char_length(pg_catalog.btrim(target_reconciliation_note)) < 20 or
     pg_catalog.char_length(target_reconciliation_note) > 2000 or
     pg_catalog.strpos(target_reconciliation_note, target_provider_transaction_id) = 0 then
    raise exception 'A transaction-specific reconciliation note is required' using errcode = '22023';
  end if;

  -- Lock the exact pending invoice. The provider reference must be the original
  -- RuffNeck invoice reference; no arbitrary workspace or customer can be chosen.
  select * into payment_row
  from public.billing_payments p
  where p.reference = pg_catalog.btrim(target_reference)
  for update;
  if not found then
    raise exception 'No RuffNeck invoice matches this provider reference' using errcode = 'P0002';
  end if;
  if payment_row.status is distinct from 'pending' then
    raise exception 'The RuffNeck invoice is no longer pending' using errcode = '55000';
  end if;
  if payment_row.workspace_id is null or payment_row.provider_plan_id is null then
    raise exception 'The invoice has no complete workspace or payment-plan mapping' using errcode = '55000';
  end if;
  if payment_row.amount is distinct from target_amount or
     coalesce(pg_catalog.upper(payment_row.currency), '') <> target_currency or
     coalesce(pg_catalog.lower(pg_catalog.btrim(payment_row.customer_email)), '') <> pg_catalog.lower(pg_catalog.btrim(target_customer_email)) or
     payment_row.provider_plan_id is distinct from target_provider_plan_id then
    raise exception 'Dashboard payment details do not match the pending RuffNeck invoice' using errcode = '22023';
  end if;

  -- Idempotent retry: the exact same manually reconciled transaction may be
  -- submitted again without creating a second record. Other duplicate IDs fail.
  select * into existing_review
  from public.flutterwave_manual_payment_reviews r
  where r.provider_transaction_id = target_provider_transaction_id
  for update;
  if found then
    if existing_review.review_source = 'manual_reconciliation' and
       existing_review.provider_reference = pg_catalog.btrim(target_reference) and
       existing_review.amount = target_amount and
       existing_review.currency = target_currency and
       pg_catalog.lower(existing_review.customer_email) = pg_catalog.lower(target_customer_email) and
       existing_review.provider_plan_id = target_provider_plan_id and
       existing_review.billing_payment_id = payment_row.id then
      return existing_review.id;
    end if;
    raise exception 'This Flutterwave transaction ID already exists in the review ledger' using errcode = '23505';
  end if;

  if exists (
    select 1 from public.flutterwave_manual_payment_reviews r
    where r.billing_payment_id = payment_row.id
      and r.review_status in ('pending', 'approved')
  ) then
    raise exception 'This RuffNeck invoice already has a pending or approved payment review' using errcode = '55000';
  end if;

  insert into public.flutterwave_manual_payment_reviews (
    provider_transaction_id, provider_reference, provider_status,
    amount, currency, customer_email, provider_plan_id, expected_plan_id,
    billing_payment_id, workspace_id, invoice_match, paid_at,
    review_status, review_source, reconciliation_note, reconciled_by, reconciled_at
  ) values (
    target_provider_transaction_id, pg_catalog.btrim(target_reference), 'successful',
    target_amount, target_currency, pg_catalog.lower(pg_catalog.btrim(target_customer_email)),
    target_provider_plan_id, payment_row.provider_plan_id,
    payment_row.id, payment_row.workspace_id, true, target_paid_at,
    'pending', 'manual_reconciliation', pg_catalog.btrim(target_reconciliation_note),
    target_reviewer_id, now()
  ) returning id into new_review_id;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
  ) values (
    payment_row.workspace_id,
    target_reviewer_id,
    'billing.flutterwave_missing_webhook_reconciled',
    'flutterwave_manual_payment_review',
    new_review_id::text,
    'success',
    pg_catalog.jsonb_build_object(
      'provider_transaction_id', target_provider_transaction_id,
      'reference', pg_catalog.btrim(target_reference),
      'amount', target_amount,
      'currency', target_currency,
      'review_source', 'manual_reconciliation',
      'activation', 'pending_manual_approval'
    )
  );
  return new_review_id;
end;
$$;

revoke all on function public.register_flutterwave_missing_webhook_review(text, text, numeric, text, text, text, timestamptz, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.register_flutterwave_missing_webhook_review(text, text, numeric, text, text, text, timestamptz, uuid, text, text)
  to service_role;

comment on function public.register_flutterwave_missing_webhook_review(text, text, numeric, text, text, text, timestamptz, uuid, text, text) is
  'Creates a pending manual-review record for a dashboard-confirmed initial payment whose webhook was not delivered. Exact pending invoice matches are enforced; this function never activates a subscription.';
