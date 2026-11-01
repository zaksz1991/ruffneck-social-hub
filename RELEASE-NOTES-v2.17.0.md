# RuffNeck Social Hub v2.17.0 — Release notes

## AI platform-specific content adaptation

For each approved master post, Content Studio now offers **Generate platform versions with AI**. It asks the configured local/OpenAI-compatible model to produce separate copy for Instagram Business, Facebook Pages and LinkedIn Organizations.

The platform guidance differs by network: Instagram copy is structured for captions, Facebook copy uses a more conversational community style, and LinkedIn copy uses a professional organization-page style. The prompt instructs the model to preserve the master post's facts and primary language and not invent prices, offers, dates, results or commitments.

Each result is shown in an editable preview. Users can change the variant name and copy before saving it. Instagram and Facebook variants require one public HTTPS image, inherited from the master post when available; LinkedIn remains text-only. Saved outputs are ordinary provider-specific **draft variants**. They must still be submitted for review and approved separately before they can be selected for scheduling.

## Security and compatibility

- Generation requires an authenticated user with a content-creation role in the target workspace.
- The server verifies that the master content is approved and belongs to the workspace, and that its brand is in the same workspace.
- Saving rechecks workspace membership and master approval, validates each provider/name/body/media field, and uses the existing `create_content_variant` RPC.
- No model output is automatically approved, scheduled, published or sent.
- Reuses `LOCAL_AI_BASE_URL`, `LOCAL_AI_MODEL` and optional `LOCAL_AI_API_KEY`.
- No new environment variables, package dependencies or database migrations. Migration 0018 from v2.15.0 remains required for provider variants.

## Installation

1. Extract the complete replacement ZIP.
2. Replace the existing repository files with the extracted project.
3. Keep existing Vercel environment variables unchanged. The existing optional local AI endpoint settings enable the feature.
4. Push the replacement files to the existing GitHub `main` branch and allow the existing Vercel project to deploy.

Do not rerun migrations 0001–0018.

## Verification status

The package verification report is provided with the delivery. A syntax check or focused helper test does not establish a full Next.js build, live Supabase behavior, model endpoint availability or production deployment.
