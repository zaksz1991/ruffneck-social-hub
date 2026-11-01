# Release notes — v2.18.0

## Brand Voice Studio

Added structured voice settings to the Brands & clients area. Workspace owners and admins can define the brand's tone, languages, approved facts, forbidden claims and escalation triggers. Values are saved to the existing `brands.voice_profile` column and are available to the optional AI campaign draft assistant, provider-specific copy adaptation and Instagram reply drafting through the existing sanitization function.

The database independently verifies workspace ownership and role, validates field sizes, and records an audit event without copying the profile text into audit metadata. Other roles have read-only access.

Apply migration `0019_brand_voice_profiles.sql` once after migration 0018. No new environment variables or dependencies are required. AI remains optional and human-governed.
