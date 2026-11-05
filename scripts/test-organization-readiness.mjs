import assert from 'node:assert/strict';
import {
  organizationCapabilityGroups,
  organizationReadinessNotes,
  providerCapabilityMatrix,
  getOrganizationCapabilitySummary,
} from '../src/lib/product/organization-capabilities.mjs';

const summary = getOrganizationCapabilitySummary();
assert.equal(summary.total, organizationCapabilityGroups.reduce((sum, group) => sum + group.capabilities.length, 0));
assert.ok(summary.available > 0);
assert.ok(summary.setup > 0);
assert.ok(summary.manual > 0);
assert.equal(providerCapabilityMatrix.length, 6);
assert.ok(providerCapabilityMatrix.find((item) => item.provider === 'TikTok').detail.includes('Direct public/scheduled publishing is not claimed.'));
assert.ok(providerCapabilityMatrix.find((item) => item.provider === 'YouTube').detail.includes('Public/scheduled publishing and monetisation reporting are not claimed.'));
assert.ok(organizationReadinessNotes.some((note) => note.includes('No SOC 2')));
assert.ok(organizationCapabilityGroups.flatMap((group) => group.capabilities).every((item) => ['available', 'setup', 'manual'].includes(item.status)));
console.log('Organization readiness helper tests passed: status classification, provider limits and governance notes verified.');
