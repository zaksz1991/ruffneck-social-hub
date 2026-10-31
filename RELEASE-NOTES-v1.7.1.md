# RuffNeck Social Hub v1.7.1

## Facebook OAuth build repair

Fixed a production TypeScript build failure in `src/app/api/integrations/facebook/start/route.ts`. The route previously referenced `authorizationUrl` before its declaration. The redundant pre-declaration mutation was removed. `buildFacebookAuthorizationUrl` already receives the signed OAuth state and adds it to the authorization URL.

No database migration or environment-variable changes are required. This is a complete replacement release based on v1.7.0.
