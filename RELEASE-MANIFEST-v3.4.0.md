# Release manifest — v3.4.0

Base: complete RuffNeck Social Hub v3.3.0 project.

Feature: workspace-scoped AI-assisted conversation intent/sentiment triage and human-applied priority suggestion for Instagram and Facebook Messenger.

Migration: `supabase/migrations/0023_inbox_ai_conversation_triage.sql` (apply once after 0022).

Permissions: workspace members can read triage results through RLS. Owners, admins, managers, publishers and client approvers can run inference through the server action and role-checked database RPC. Owners, admins, managers and publishers can apply the suggested priority through the pre-existing protected workflow RPC. Direct browser writes to the triage table are revoked.

Inference: up to 12 recent text messages and the brand voice profile are sent to server-configured `LOCAL_AI_BASE_URL`; OpenAI-compatible JSON response required; redirect disabled; 25-second timeout; strict schema and bounded summary/reason validation. Endpoint must be private and access-controlled.

Staleness: result is anchored to the newest inbound message. Database RPC rejects a save if a newer message appeared during inference. Priority application rechecks that same source message is still the newest message and preserves current workflow status and assignment.

Boundaries: no automatic provider sends, auto-replies, public comment replies, assignment changes, workflow status changes, or automatic priority changes. Model confidence is not a calibrated probability. Summary redaction is prompt-based, not a guaranteed privacy filter.

Verification status:
- Source audit, project syntax, custom regression checks and ZIP integrity are run before packaging.
- Full dependency installation, full Vitest suite, complete TypeScript check, Next.js production build and live Supabase migration are not represented as passed unless explicitly recorded after execution.
