# Release manifest — v3.2.0

Base: complete RuffNeck Social Hub v3.1.0 project.

Feature: workspace-scoped saved reply library and draft creation picker for Instagram and Facebook Messenger conversations.

Migration: `supabase/migrations/0021_inbox_saved_replies.sql` (apply once after 0020).

Permissions: all workspace members may read workspace templates; only owners, admins and managers may create, update or delete them. Reply drafting follows existing provider draft permissions.

Safety: selecting a template creates an editable unsent draft tied to the latest inbound message. No provider send API is called. Existing Facebook human-review, permission, 24-hour window and one-attempt controls remain unchanged; Instagram remains draft-only.

Offline verification:
- stale-component cleanup: passed (no stale component present in the source snapshot)
- internal import/export and syntax audit: passed, 106 source files
- team inbox workflow audit: passed, 15 contracts
- saved reply integration audit: passed, 17 contracts
- team inbox workflow regression script: passed, 9/9
- saved reply regression script: passed, 16/16
- ZIP integrity: verified after packaging

Not verified in this environment: full Vitest suite, TypeScript compiler check, full Next.js production build, Supabase migration execution, live provider integration or Vercel deployment. Package dependencies were not available locally; a dependency install attempt timed out. Do not treat the offline audits as a substitute for `next build`.
