-- RuffNeck Social Hub v6.1.2
-- Public-key-only Flutterwave V3 checkout with administrator-reviewed activation.
-- This is an interim mode for merchants who have a Public Key but do not yet
-- have a Live Secret Key. Webhook authenticity is checked with FLW_SECRET_HASH,
-- but Flutterwave's guidance still requires server-side API verification before
-- releasing value. Therefore webhook events are queued; they never activate a
-- subscription automatically.

create table if not exists public.flutterwave_manual_payment_reviews (
  id uuid primary key default gen_random_uuid(),
  provider_transaction_id text not null unique check (provider_transaction_id ~ '^[0-9]{1,30}$'),
  provider_reference text not null check (char_length(provider_reference) between 3 and 160),
  provider_status text not null check (provider_status in ('successful','failed')),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  customer_email text not null check (char_length(customer_email) between 5 and 254),
  provider_plan_id text check (provider_plan_id is null or provider_plan_id ~ '^[0-9]{1,20}$'),
  expected_plan_id text check (expected_plan_id is null or expected_plan_id ~ '^[0-9]{1,20}$'),
  billing_payment_id uuid references public.billing_payments(id) on delete set null,
  subscription_id uuid references public.workspace_subscriptions(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  invoice_match boolean not null default false,
  paid_at timestamptz not null,
  review_status text not null default 'needs_attention'
    check (review_status in ('pending','needs_attention','approved','rejected','not_required')),
  review_note text not null default '' check (char_length(review_note) <= 2000),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (review_status = 'approved' and reviewed_by is not null and reviewed_at is not null and workspace_id is not null)
    or review_status <> 'approved'
  )
);

create index if not exists flutterwave_manual_reviews_status_created_idx
  on public.flutterwave_manual_payment_reviews(review_status, created_at desc);
create index if not exists flutterwave_manual_reviews_workspace_created_idx
  on public.flutterwave_manual_payment_reviews(workspace_id, created_at desc);

alter table public.flutterwave_manual_payment_reviews enable row level security;
revoke all on table public.flutterwave_manual_payment_reviews from public, anon, authenticated;
grant select, insert, update on table public.flutterwave_manual_payment_reviews to service_role;

create or replace function public.approve_flutterwave_manual_payment_review(
  target_provider_transaction_id text,
  target_reviewer_id uuid,
  target_review_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  review_row public.flutterwave_manual_payment_reviews%rowtype;
  payment_row public.billing_payments%rowtype;
  subscription_row public.workspace_subscriptions%rowtype;
  activated_workspace_id uuid;
  renewal_reference text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if target_provider_transaction_id is null or target_provider_transaction_id !~ '^[0-9]{1,30}$' then
    raise exception 'Invalid Flutterwave transaction identifier' using errcode = '22023';
  end if;
  if target_reviewer_id is null or target_review_note is null or
     pg_catalog.char_length(pg_catalog.btrim(target_review_note)) < 20 or
     pg_catalog.char_length(target_review_note) > 2000 then
    raise exception 'A reviewer and a review note of at least 20 characters are required' using errcode = '22023';
  end if;

  select * into review_row
  from public.flutterwave_manual_payment_reviews r
  where r.provider_transaction_id = target_provider_transaction_id
  for update;
  if not found then raise exception 'Manual payment review record not found' using errcode = 'P0002'; end if;
  if review_row.review_status = 'approved' then
    return review_row.workspace_id;
  end if;
  if review_row.review_status <> 'pending' or review_row.provider_status <> 'successful' or
     review_row.invoice_match is not true or review_row.workspace_id is null then
    raise exception 'Payment is not eligible for manual approval; inspect the provider record and invoice match' using errcode = '55000';
  end if;
  if review_row.paid_at is null or review_row.paid_at > now() + interval '5 minutes' then
    raise exception 'Payment timestamp is invalid' using errcode = '22023';
  end if;

  if review_row.billing_payment_id is not null then
    select * into payment_row
    from public.billing_payments p
    where p.id = review_row.billing_payment_id
    for update;
    if not found or payment_row.status <> 'pending' then
      raise exception 'The original workspace invoice is no longer pending' using errcode = '55000';
    end if;
    if payment_row.reference <> review_row.provider_reference or
       payment_row.workspace_id <> review_row.workspace_id or
       payment_row.amount <> review_row.amount or
       payment_row.currency <> review_row.currency or
       lower(payment_row.customer_email) <> lower(review_row.customer_email) or
       payment_row.provider_plan_id <> review_row.expected_plan_id or
       (review_row.provider_plan_id is not null and review_row.provider_plan_id <> payment_row.provider_plan_id) then
      raise exception 'Provider event does not match the pending RuffNeck invoice' using errcode = '22023';
    end if;
    activated_workspace_id := public.activate_workspace_billing_payment(
      payment_row.reference,
      review_row.provider_transaction_id,
      review_row.paid_at
    );
  elsif review_row.subscription_id is not null then
    select * into subscription_row
    from public.workspace_subscriptions s
    where s.id = review_row.subscription_id
    for update;
    if not found or subscription_row.status not in ('active','past_due') then
      raise exception 'The recurring subscription is no longer active or past due' using errcode = '55000';
    end if;
    if subscription_row.workspace_id <> review_row.workspace_id or
       lower(subscription_row.customer_email) <> lower(review_row.customer_email) or
       subscription_row.amount <> review_row.amount or
       subscription_row.currency <> review_row.currency or
       subscription_row.provider_plan_id <> review_row.expected_plan_id or
       (review_row.provider_plan_id is not null and review_row.provider_plan_id <> subscription_row.provider_plan_id) or
       review_row.paid_at <= subscription_row.last_payment_at then
      raise exception 'Recurring provider event does not match the active workspace subscription' using errcode = '22023';
    end if;
    renewal_reference := 'flw_manual_renewal_' || review_row.provider_transaction_id;
    perform public.record_workspace_subscription_renewal(
      subscription_row.workspace_id,
      renewal_reference,
      review_row.provider_transaction_id,
      review_row.amount,
      review_row.currency,
      review_row.paid_at
    );
    activated_workspace_id := subscription_row.workspace_id;
  else
    raise exception 'This provider event is not linked to a pending invoice or unique active subscription' using errcode = '55000';
  end if;

  update public.flutterwave_manual_payment_reviews
  set review_status = 'approved',
      review_note = pg_catalog.btrim(target_review_note),
      reviewed_by = target_reviewer_id,
      reviewed_at = now(),
      workspace_id = activated_workspace_id,
      updated_at = now()
  where id = review_row.id;

  insert into public.audit_events (
    workspace_id, actor_user_id, event_type, resource_type, resource_id, outcome, safe_metadata
  ) values (
    activated_workspace_id,
    target_reviewer_id,
    'billing.flutterwave_manual_review_approved',
    'flutterwave_manual_payment_review',
    review_row.id::text,
    'success',
    pg_catalog.jsonb_build_object(
      'provider_transaction_id', review_row.provider_transaction_id,
      'reference', review_row.provider_reference,
      'amount', review_row.amount,
      'currency', review_row.currency,
      'review_mode', 'manual_dashboard_verification'
    )
  );
  return activated_workspace_id;
end;
$$;

revoke all on function public.approve_flutterwave_manual_payment_review(text, uuid, text) from public, anon, authenticated;
grant execute on function public.approve_flutterwave_manual_payment_review(text, uuid, text) to service_role;

comment on table public.flutterwave_manual_payment_reviews is
  'Flutterwave V3 Public-Key checkout events awaiting manual verification in the merchant dashboard. Webhook receipt alone never activates a subscription.';
comment on function public.approve_flutterwave_manual_payment_review(text, uuid, text) is
  'Service-role-only approval after a platform billing administrator manually verifies the payment in Flutterwave dashboard; activates an initial invoice or records a recurring renewal.';
