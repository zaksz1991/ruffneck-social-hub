# RuffNeck Social Hub v4.9.0 — WhatsApp secure inbound media

This release adds a controlled path for retrieving media received through WhatsApp Business Cloud API. It extends the existing inbox but does not enable outbound media messages.

## End-to-end flow

1. The signed WhatsApp webhook stores the provider media ID, declared MIME type, optional provider SHA-256 digest and a sanitized document filename. It never persists Meta's temporary media URL or the bytes.
2. An owner, admin, manager or publisher selects **Retrieve, validate and scan** on a media record in the WhatsApp conversation.
3. The server retrieves fresh media metadata from the official Graph API, validates the media ID, exact `lookaside.fbsbx.com` download host and attachment path, denies redirects and enforces a 16 MiB maximum.
4. The server checks the downloaded byte count, verifies the SHA-256 digest returned by Meta and compares the binary signature with the allowlisted MIME type.
5. The bytes are sent to the configured private ClamAV scanner over HTTPS with a bearer token. The app fails closed if the scanner is missing, offline, busy, timed out or returns an unsupported response. Infected or unsupported files are not stored.
6. Only a clean scan is stored in the private `whatsapp-media` Supabase Storage bucket. Downloads pass through a workspace-authorized server route and are delivered as attachments with `nosniff` and no-store headers.
7. Clean stored files expire after 30 days. A daily GitHub Actions workflow invokes the retention endpoint with the existing cron secret and removes expired objects.

## Supported media types and limits

The current allowlist is intentionally narrow:

- Images: `image/jpeg`, `image/png`, `image/webp`
- Video: `video/mp4`, `video/3gpp`
- Audio: `audio/aac`, `audio/mp4`, `audio/mpeg`, `audio/amr`, `audio/ogg`
- Documents: `application/pdf`, `text/plain`

The maximum accepted file size is 16 MiB. File signatures must match the declared MIME type. Office documents, archives, executable formats, unknown MIME types and any other unsupported file type remain unavailable. This is a conservative first release; it does not attempt to preview active content in the browser.

Media download URLs are temporary. The app obtains a fresh URL from Meta each time an operator starts retrieval. The app never accepts a browser-supplied media URL.

## ClamAV scanner service

The scanner service is supplied in `services/whatsapp-media-scanner`. It runs ClamAV locally inside the container and exposes only:

- `GET /healthz` — ClamAV daemon readiness check (returns 503 if clamd is unavailable).
- `POST /scan` — bearer-protected raw-byte scan; maximum request size 16 MiB.

It does not expose the ClamAV TCP port outside the container. It uses the ClamAV `INSTREAM` protocol and returns `clean` only when ClamAV returns `stream: OK`. A detected threat returns `infected`; daemon errors, scan errors and timeouts return an unavailable/error response. The Next.js app stores nothing unless the response confirms `engine: clamav` and `status: clean`.

### Deploy on a suitable HTTPS Docker host

The included ClamAV scanner is **not suitable for Render's free 512 MB instance**. ClamAV's official guidance recommends at least 3 GiB RAM (4 GiB preferred); its signature engine alone can use more than 1.2 GiB and database reloads can temporarily use about 2.4 GiB. Use a server with at least 3 GiB RAM and adequate disk, preferably 4 GiB, or keep the feature disabled. Render's published free-instance specification is 512 MB RAM, so do not deploy this scanner to a free Render instance and expect it to remain healthy. See [ClamAV system requirements](https://docs.clamav.net/) and [ClamAV Docker memory guidance](https://docs.clamav.net/manual/Installing/Docker.html).

When suitable compute is available:

1. Create a Docker Web Service from the RuffNeck Social Hub repository. Set the Docker build context/root directory to `services/whatsapp-media-scanner`.
2. Add the server-only `WHATSAPP_MEDIA_SCANNER_TOKEN`, a new random value of at least 32 characters. Do not reuse a Meta, Supabase or Vercel secret.
3. Deploy the scanner. Confirm `/healthz` returns a healthy response over HTTPS. It must be able to download and refresh ClamAV signatures during startup and operation.
4. In Vercel, add `WHATSAPP_MEDIA_SCANNER_URL` as the scanner's HTTPS base URL (without `/scan`) and `WHATSAPP_MEDIA_SCANNER_TOKEN` with the same token. Keep both server-only; never prefix them with `NEXT_PUBLIC_`.
5. Redeploy the Next.js app after changing environment variables.

If the scanner is not configured or cannot complete a scan, the app leaves the file unavailable and does not create a storage object. This is intentional. Do not weaken the app to accept an unscanned file. Keep the scanner patched and monitor its health and signature-update logs. A clean ClamAV result is a malware-screening control, not a guarantee that a file is harmless.

## Supabase migration and storage

Apply `supabase/migrations/0036_whatsapp_secure_media_storage.sql` once, after migration `0035_whatsapp_sla_and_routing.sql` has succeeded. The migration:

- Adds workspace-scoped media metadata and processing state, with a composite message/conversation/workspace/account foreign key.
- Adds a role-checked, atomic media-processing claim function.
- Creates the private `whatsapp-media` bucket with the 16 MiB size limit and MIME allowlist.
- Grants authenticated users read-only metadata access through workspace membership RLS. It grants no browser write access to the media table and no direct browser object access to the bucket.

Do not rerun a migration that has already succeeded. Existing WhatsApp message, CRM, SLA and routing records are not rewritten.

## Retention workflow

The workflow `.github/workflows/whatsapp-media-retention.yml` runs daily and can also be started manually from GitHub Actions. It uses the existing repository secrets:

- `RSH_WORKER_URL` — `https://ruffneck-social-hub.vercel.app`
- `SOCIAL_PUBLISH_CRON_SECRET` — the same strong value configured in Vercel

The endpoint processes up to 100 expired objects per run. If object deletion fails, the record remains eligible for the next run. The workflow must be enabled in the GitHub repository for automatic deletion to occur.

## Permissions and boundaries

- No new Meta scope is requested; the existing `whatsapp_business_messaging` access is used for media retrieval.
- Only owners, admins, managers and publishers can initiate retrieval. Any authenticated member of the owning workspace can download an unexpired clean file through the protected application route.
- A workspace boundary is enforced before retrieval and download. The service-role key and WhatsApp access token remain server-only.
- Meta URLs and provider access tokens are never returned to the browser or written to the database.
- The scanner receives file bytes over HTTPS, protected by a dedicated bearer token. It does not return file bytes to the application.
- Unsupported, mismatched, oversized, hash-invalid, infected or unscannable files are not made downloadable.
- No image preview, outbound media send, WhatsApp media template header, bulk messaging, auto-reply or background retrieval is added.

## Verification and acceptance

Run the package's focused checks:

- `npm run test:whatsapp-media`
- `npm run audit:whatsapp-media`
- `npm run test:whatsapp`
- `npm run test:whatsapp-operations`
- `npm run test:whatsapp-sla-routing`

Production acceptance additionally requires applying migration 0036, deploying and testing the scanner, checking private bucket access and retention in Supabase, testing a real inbound media webhook from an authorised WhatsApp number, and verifying an authenticated download from the correct workspace while denying a different workspace. The source package cannot perform these account-level steps.
