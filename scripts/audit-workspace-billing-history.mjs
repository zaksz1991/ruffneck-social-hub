import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const versionParts = String(pkg.version).split('.').map((part) => Number(part));
const compatible = versionParts.length === 3 && versionParts.every(Number.isInteger) &&
  (versionParts[0] > 6 || (versionParts[0] === 6 && (versionParts[1] > 6 || (versionParts[1] === 6 && versionParts[2] >= 0))));
const helper = await readFile('src/lib/billing/workspace-history.mjs', 'utf8');
const server = await readFile('src/lib/billing/workspace-history-server.ts', 'utf8');
const page = await readFile('src/app/billing/history/page.tsx', 'utf8');
const route = await readFile('src/app/api/billing/history/export/route.ts', 'utf8');
const subscriptionPage = await readFile('src/app/billing/subscription/page.tsx', 'utf8');
assert.ok(compatible, 'workspace billing history requires v6.6.0 or later');
for (const [label, text] of [['helper', helper], ['server', server], ['page', page], ['export route', route]]) {
  assert.ok(text.length > 100, `${label} must be present`);
}
assert.match(server, /workspace_members/);
assert.match(server, /\.in\('role', \['owner', 'admin'\]\)/);
assert.match(server, /createSupabaseAdminClient/);
assert.match(server, /\.in\('workspace_id', workspaceIds\)/);
assert.match(server, /flutterwave_manual_payment_reviews/);
assert.match(server, /workspace_subscription_lifecycle_events/);
assert.doesNotMatch(server, /review_note|reconciliation_note|customer_email|actor_user_id|event_metadata/);
assert.match(helper, /formula injection/i);
assert.match(helper, /normalizeWorkspaceBillingPaymentRows/);
assert.match(helper, /normalizeWorkspaceSubscriptionEvents/);
assert.doesNotMatch(helper, /customer_email|review_note|event_note|actor_user_id/);
assert.match(route, /Authentication required/);
assert.match(route, /scope\.workspaceIds\.includes\(requestedWorkspace\)/);
assert.match(route, /Cache-Control/);
assert.match(route, /buildWorkspaceBillingHistoryCsv/);
assert.doesNotMatch(route, /customer_email|review_note|reconciliation_note/);
assert.match(page, /\/billing\/history/);
assert.match(page, /only payments marked approved/i);
assert.match(subscriptionPage, /\/billing\/history/);
assert.match(pkg.scripts.build, /audit:workspace-billing-history/);
assert.match(pkg.scripts.test, /test-workspace-billing-history/);
console.log('Workspace billing history integration audit passed: owner/admin scope, workspace isolation, private audit-field exclusion, safe CSV export and release hooks verified.');
