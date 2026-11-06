import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const requirements = [
  ['src/app/approvals/page.tsx', [
    'supabase.auth.getUser()',
    ".from('workspace_members')",
    'canUseClientApprovalPortal(role)',
    ".from('content_items')",
    ".eq('status', 'in_review')",
    "supabase.from('content_reviews')",
    'reviewClientApproval',
    'Approval is not publication.',
  ]],
  ['src/app/actions/client-approvals.ts', [
    'supabase.auth.getUser()',
    ".from('workspace_members')",
    'canUseClientApprovalPortal(membership.role)',
    "supabase.rpc('review_content_item'",
    'parseClientApprovalDecision',
    "revalidatePath('/approvals')",
    "revalidatePath('/content')",
  ]],
  ['src/lib/content/client-approval.ts', [
    "'client_approver'",
    "'changes_requested'",
    'note.length > 1000',
    "parsed.protocol !== 'https:'",
  ]],
  ['src/app/page.tsx', [
    'href="/approvals"',
    'Client approvals',
    'Campaign intelligence and planning',
    'official Meta post insights',
  ]],
  ['src/lib/product/organization-capabilities.mjs', [
    'Client approval portal',
    'Invited client_approver members',
  ]],
  ['scripts/test-client-approval-portal.mjs', [
    'role access',
    'note rules',
    'media URL safety',
  ]],
];
const failures = [];
for (const [relative, tokens] of requirements) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    failures.push(`${relative}: missing file`);
    continue;
  }
  const source = fs.readFileSync(file, 'utf8');
  for (const token of tokens) {
    if (!source.includes(token)) failures.push(`${relative}: missing contract ${JSON.stringify(token)}`);
  }
}
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const versionParts = String(pkg.version ?? '').split('.').map(Number);
if (versionParts.length !== 3 || !versionParts.every(Number.isInteger) || versionParts[0] < 6 || (versionParts[0] === 6 && versionParts[1] < 8)) {
  failures.push(`package.json: client approval portal requires v6.8.0 or later, found ${pkg.version}`);
}
if (!String(pkg.scripts?.build ?? '').includes('audit:client-approval-portal')) {
  failures.push('package.json: client approval audit must run before Next.js build');
}
if (!String(pkg.scripts?.test ?? '').includes('test:client-approval-portal')) {
  failures.push('package.json: client approval regression test missing from npm test');
}
if (failures.length) {
  console.error(`Client approval portal audit failed: ${failures.length} issue(s).`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log('Client approval portal audit passed: source contracts and v6.8.0+ release compatibility verified.');
