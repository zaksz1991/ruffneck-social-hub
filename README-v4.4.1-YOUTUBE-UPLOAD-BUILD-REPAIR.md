# RuffNeck Social Hub v4.4.1 — YouTube upload build repair

## Purpose

Repairs the Vercel TypeScript failure reported for `src/app/api/integrations/youtube/upload/route.ts` at the `fetch(..., { body })` call. The private-upload route previously passed a Node `Buffer<ArrayBufferLike>` directly as `BodyInit`. Current TypeScript DOM fetch definitions reject that generic Buffer type.

## Change

`toYouTubeUploadBody` copies the bounded media bytes into a standalone, exact-length `ArrayBuffer`. The upload route passes that `ArrayBuffer` to `fetch`. This avoids a type assertion, avoids sending an oversized pooled Buffer backing store, and keeps the bytes identical.

## Preserved behavior

- Approved content only; explicit upload consent remains required.
- Verified HTTPS hostname allowlist remains required.
- Existing 64 MiB maximum transfer bound remains in force.
- YouTube uploads remain private.
- Unknown outcomes are not automatically retried.
- No OAuth permissions, Supabase schema, environment variables or Meta/LinkedIn/TikTok behavior changed.

## Verification

See `VERIFICATION-v4.4.1.md` for commands/tests run and limits. A successful complete Next.js build must still be confirmed by the deployment build before treating production as verified.
