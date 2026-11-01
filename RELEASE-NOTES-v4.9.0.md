# Release v4.9.0 — WhatsApp secure inbound media

- Signed WhatsApp webhook ingestion now records provider media IDs, declared MIME types, optional Meta SHA-256 hashes and sanitized document filenames. Temporary download URLs are never persisted.
- Added manual server-side media retrieval through the official Meta Graph media lookup/download flow.
- Added exact media CDN host/path validation, redirect denial, 16 MiB bounded reads, MIME allowlisting, binary signature verification and Meta SHA-256 verification.
- Added a bearer-protected ClamAV scanner container with a daemon-aware health check and signature refresh notification. The integration fails closed when scanner configuration, availability or response validation fails. Detected threats are blocked.
- Added a private Supabase Storage bucket and authenticated workspace-scoped download route. Files are served as attachments with `nosniff` and no-store headers.
- Added 30-day object retention and a daily GitHub Actions purge workflow using existing cron secrets.
- Added migration `0036_whatsapp_secure_media_storage.sql`, including composite message/conversation/workspace/account integrity constraints, focused tests and a source/security audit.
- No new Meta scope is required. Outbound media sending remains disabled.

## Hosting requirement

- The included ClamAV scanner is not a free-tier deployment. ClamAV recommends at least 3 GiB RAM (4 GiB preferred); Render free is 512 MB. Use a suitably sized host or leave inbound media unavailable.
