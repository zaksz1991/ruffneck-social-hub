# Changelog — v5.4.0

- Expanded AI Provider Variant Studio from Facebook, Instagram and LinkedIn to also support TikTok and YouTube.
- Added platform-specific guidance, title/body limits and YouTube UTF-8 byte validation.
- Added TikTok UTF-16 caption validation in both application and database layers.
- Expanded the atomic draft-save RPC and content target-platform constraint to five providers.
- Preserved the v5.3.1 AI provider compatibility exports to address the preceding missing-export build failure.
- Added a database scheduling guard requiring media references for TikTok and YouTube.
- Retained manual editing, selection, approval and publishing workflow; no automatic publishing added.
