# v5.4.0 Release Notes

RuffNeck Social Hub's AI Provider Variant Studio now adapts one campaign brief into as many as five social-platform drafts: Facebook, Instagram, LinkedIn, TikTok and YouTube.

TikTok receives a short-form caption. YouTube receives a video title and description. Provider-specific text limits are enforced when generating, saving and (where applicable) at the database boundary. YouTube titles are not prefixed with an internal platform label, so the saved title remains suitable for its video metadata field.

The five-platform draft-save operation remains atomic. Each draft is workspace/brand-bound, tagged with its target provider and saved in `draft` status. The platform scheduling RPC still requires an approved content item and connected matching social account. TikTok and YouTube additionally require media to be attached before scheduling.

This upgrade carries forward the v5.3.1 compatibility exports that the preceding Vercel build found missing.

No changes are made to provider authentication, media upload or direct publishing. No new environment variables are required.
