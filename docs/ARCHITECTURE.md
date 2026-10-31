# Architecture and decisions
## Shape
Modular monolith first. Next.js handles UI and authenticated application routes. Supabase Postgres owns durable state. Supabase Edge Functions/Cron execute bounded dispatch tasks. Upstash Redis is optional cache/rate limiter/short lease only. Provider adapters are isolated modules.

## Durable publishing
Persist before execution. Use unique idempotency keys, claim leases, bounded retries, backoff, attempt records and manual review. A timeout after request transmission is ambiguous: reconcile provider state or move to `needs_review`; never blindly retry. Exactly-once delivery cannot be promised where a provider lacks idempotency support.

## AI boundary
Pipeline: event normalisation -> tenant resolution -> context retrieval -> model proposal -> schema validation -> deterministic policy -> human approval -> executor -> audit. Model output never contains execution credentials and cannot grant permissions.

## Free-first hosting
Supabase is the durable store and scheduled dispatcher. Render free service may sleep and is not an always-on worker. Vercel Hobby is not the commercial production host. Redis is optional. Local AI has no per-token API bill but consumes hardware, power and bandwidth. Free tiers do not guarantee uptime, scale or unlimited storage.
