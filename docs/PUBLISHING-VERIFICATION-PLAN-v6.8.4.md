# Publishing verification plan — v6.8.4

## Current server-dispatch contract inspected on public main

The scheduled worker at `src/app/api/cron/publishing/route.ts` claims due queue jobs and routes only three providers to scheduled dispatch adapters:

- `instagram` → `dispatchInstagramImage`
- `facebook` → `dispatchFacebookImage`
- `linkedin` → `dispatchLinkedInText`

The current adapter source at `src/lib/publishing/instagram-dispatch.ts` confirms:

- Instagram requires exactly one HTTPS media reference and publishes it as an image feed post.
- Facebook Pages require exactly one HTTPS media reference and publish it through the Page photos endpoint.
- LinkedIn organisation publishing is text-only; the worker does not refresh LinkedIn tokens.
- Ambiguous or unconfirmed provider POST outcomes are sent to manual review rather than blindly retried.

The Publishing Queue page documents separate TikTok creator-inbox transfer and YouTube private upload workflows. Those are not equivalent to scheduled public posts.

## Controlled live acceptance tests still required

Run only with organisation-owned test accounts and non-customer test content. Verify each provider separately; a source audit is not a live provider test.

| Test | Required evidence | Pass condition |
|---|---|---|
| OAuth connection | Provider account identity, granted scopes and server-side connection validation | Account shows connected only after successful token validation |
| Instagram image | Approved single-image item, one destination | Provider returns a post ID; queue row is `succeeded` with provider ID |
| Facebook Page image | Approved single-image item, one Page | Provider returns a post ID; queue row is `succeeded` with provider ID |
| LinkedIn text | Approved text-only item, organisation destination | `x-restli-id` or provider post ID is persisted and queue row is `succeeded` |
| Mixed batch rejection | Select formats incompatible with at least one chosen destination | No queue row is created for any destination in the rejected batch |
| TikTok | Use its separate creator-inbox transfer | Transfer state is recorded; creator completes final post in TikTok |
| YouTube | Use its separate private upload | Private upload is recorded and reviewed in YouTube Studio before any public visibility change |
| Analytics | Compare app metrics with each provider's native dashboard | Metrics retain provider/source labels and are not presented as cross-platform equivalents without mapping |
| Worker reliability | Inspect GitHub Actions execution history and Vercel route responses | Five-minute trigger operates; queue rows reach confirmed terminal states or explicit review states |
| Token expiry | Test expired/near-expiry tokens on non-production accounts | Reconnect or refresh outcome is recorded safely; no blind duplicate publish occurs |

## Evidence to retain for each live test

Record provider, account type, test content ID, scheduled time and timezone, GitHub Actions run, worker response, queue state, provider post/video ID, provider-side post URL, timestamp, API error code if any, and operator who confirmed the result. Do not include access tokens or secrets.

## Release limitations

This release does not add adapters for new networks, expand media types, verify remote media MIME types or public reachability, or certify provider app review. The full test suite, full TypeScript semantic check, Vercel production build and live provider posts must be completed separately.
