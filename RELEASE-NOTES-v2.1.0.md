# RuffNeck Social Hub v2.1.0

## LinkedIn organization publishing

This release extends the existing publishing worker to LinkedIn organization Pages. It supports **text-only** posts from approved content. Instagram and Facebook capabilities remain unchanged.

### What changed
- OAuth now requests `w_organization_social` in addition to `r_organization_admin`.
- The callback enables LinkedIn publishing only for connected organization accounts where administrator status was discovered and the workspace capability gate succeeds.
- The worker sends approved text posts to LinkedIn's REST Posts endpoint using the organization's URN.
- Token expiry is checked before dispatch. LinkedIn token refresh is not implemented.
- Media-bearing jobs are moved to manual review; no unsupported image upload is attempted.
- Uncertain POST responses are moved to manual review to avoid duplicate posts.

### Supabase
Apply only `supabase/migrations/0017_linkedin_organization_publishing.sql` after migrations 0001–0016. Do not rerun earlier migrations.

### LinkedIn application requirements
The LinkedIn application must have access to the Community Management API product/permission that grants `w_organization_social`, and the authorizing member must be an approved administrator of the organization. LinkedIn controls product access and app review. Existing LinkedIn connections must be reconnected to complete the updated OAuth consent.

### Supported publishing formats
| Provider | Format |
|---|---|
| Instagram Business | Single public HTTPS image |
| Facebook Pages | Single public HTTPS image |
| LinkedIn organizations | Text-only |

TikTok, YouTube, X and WhatsApp Business remain unimplemented.

### Verification status
Static source and package checks are performed for this ZIP. A live LinkedIn API publish, Supabase migration, full Next.js build and full test suite are not claimed as verified in this environment.
