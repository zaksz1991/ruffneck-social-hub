# v3.9.0 Release Manifest

Base: v3.8.0 cumulative project ZIP.

Version: 3.9.0

New route: `/inbox/customers`

New database migration: `0026_inbox_customer_crm.sql` (apply after 0025).

New files:
- `src/app/actions/inbox-customers.ts`
- `src/app/inbox/customers/page.tsx`
- `src/lib/inbox/customer-crm.ts`
- `src/lib/inbox/customer-crm.test.ts`
- `scripts/audit-inbox-customer-crm.mjs`
- `scripts/test-inbox-customer-crm.mjs`
- `README-v3.9.0-CUSTOMER-CRM.md`
- `RELEASE-NOTES-v3.9.0.md`
- `RELEASE-MANIFEST-v3.9.0.md`

Updated files:
- `src/app/page.tsx`
- `src/app/inbox/page.tsx`
- `src/app/inbox/conversations/page.tsx`
- `src/app/inbox/sla/page.tsx`
- `src/app/inbox/automation/page.tsx`
- `src/app/inbox/automation/insights/page.tsx`
- `src/app/inbox/inbox.css`
- `package.json`
- `CHANGELOG.md`

This is a cumulative replacement ZIP based on the v3.8.0 snapshot. Packaging does not change GitHub, Vercel or Supabase; apply migration 0026 and deploy the repository separately.
