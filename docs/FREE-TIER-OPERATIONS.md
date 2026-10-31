# Free-tier operating model
- Supabase: Auth/Postgres/storage within documented quotas; monitor pausing, database, egress, storage, Edge Function and Cron limits.
- Render: pilot hosting only where cold starts/sleep are acceptable; do not depend on free always-on background workers.
- Upstash: optional Redis; never the sole queue or source of truth.
- GitHub: source, review and CI within plan limits.
- Vercel: optional preview use; not the commercial production target on Hobby.
- Local AI: hardware-dependent and not zero-resource.
No silent paid upgrades, mandatory paid API keys or paid aggregator dependency. Warn before quota exhaustion and preserve queued work when dispatch is unavailable.
