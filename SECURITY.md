# Security policy

## Supported release

Security reports should identify the affected RuffNeck Social Hub release or Git commit and the affected deployment environment, without including customer data, credentials or live provider tokens.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting / Security Advisory workflow for this repository. Do not publish exploit details, customer records, access tokens, webhook hashes, service-role keys or other secrets in public issues or pull requests.

Include the affected route or module, impact, a minimal reproducible description and safe evidence. Do not access data belonging to another workspace or organisation while testing.

## Response expectations

This project does not currently publish a contractual response-time commitment or a 24/7 security support SLA. Reports will be triaged by the maintainer; severity, affected releases and remediation status should be communicated through the private report.

## Security boundaries

- Never commit production credentials or customer exports.
- Keep provider secrets, webhook hashes, cron secrets and Supabase service-role credentials server-side.
- Report suspected cross-workspace access, webhook-authentication bypass, token disclosure, unsafe file handling or unauthorised message publishing as high-priority issues.
- Do not claim security certification or regulatory compliance based solely on the presence of RLS, encrypted tokens or automated audits.
