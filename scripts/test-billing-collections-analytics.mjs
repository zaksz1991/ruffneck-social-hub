import assert from 'node:assert/strict';
import {
  normalizeBillingAnalyticsWindow,
  normalizeBillingAnalyticsRows,
  aggregateBillingCollections,
  buildBillingCollectionsCsv,
} from '../src/lib/billing/collections-analytics.mjs';

assert.equal(normalizeBillingAnalyticsWindow('30'), 30);
assert.equal(normalizeBillingAnalyticsWindow('90'), 90);
assert.equal(normalizeBillingAnalyticsWindow('365'), 365);
assert.equal(normalizeBillingAnalyticsWindow('999'), 30);
assert.equal(normalizeBillingAnalyticsWindow('NaN'), 30);

const fixture = [
  { provider_transaction_id: '10001', provider_reference: 'invoice-starter-10001', provider_status: 'successful', amount: '5000.00', currency: 'ngn', paid_at: '2026-11-01T10:00:00.000Z', review_status: 'approved', review_source: 'webhook', reviewed_at: '2026-11-01T10:30:00.000Z', invoice_match: true },
  { provider_transaction_id: '10002', provider_reference: 'invoice-pro-10002', provider_status: 'successful', amount: '15000.00', currency: 'NGN', paid_at: '2026-11-02T10:00:00.000Z', review_status: 'approved', review_source: 'manual_reconciliation', reviewed_at: '2026-11-02T11:00:00.000Z', invoice_match: true },
  { provider_transaction_id: '10003', provider_reference: 'invoice-pending-10003', provider_status: 'successful', amount: 40000, currency: 'NGN', paid_at: '2026-11-03T10:00:00.000Z', review_status: 'pending', review_source: 'webhook', reviewed_at: null },
  { provider_transaction_id: '10004', provider_reference: 'invoice-attention-10004', provider_status: 'successful', amount: 7000, currency: 'USD', paid_at: '2026-11-03T10:00:00.000Z', review_status: 'needs_attention', review_source: 'webhook', reviewed_at: null },
  { provider_transaction_id: '10005', provider_reference: '=SUM(1,1)xxxxxxxx', provider_status: 'successful', amount: 1.5, currency: 'USD', paid_at: '2026-11-03T10:00:00.000Z', review_status: 'rejected', review_source: 'webhook', reviewed_at: null },
  { provider_transaction_id: '10006', provider_reference: 'invoice-not-required-10006', provider_status: 'failed', amount: 12, currency: 'NGN', paid_at: '2026-11-03T10:00:00.000Z', review_status: 'not_required', review_source: 'webhook', reviewed_at: null },
];

const normalized = normalizeBillingAnalyticsRows([...fixture, fixture[0], { provider_transaction_id: 'bad' }]);
assert.equal(normalized.rows.length, 6);
assert.equal(normalized.invalidCount, 2, 'duplicate IDs and malformed rows must be excluded');

const report = aggregateBillingCollections(normalized.rows, 90);
assert.equal(report.days, 90);
assert.equal(report.totalRecords, 6);
assert.equal(report.approvedCount, 2);
assert.equal(report.statusCounts.pending, 1);
assert.equal(report.statusCounts.needs_attention, 1);
assert.equal(report.statusCounts.rejected, 1);
assert.equal(report.statusCounts.not_required, 1);

const ngn = report.currencies.find((item) => item.currency === 'NGN');
const usd = report.currencies.find((item) => item.currency === 'USD');
assert.ok(ngn);
assert.ok(usd);
assert.equal(ngn.approvedAmount, 20000);
assert.equal(ngn.approvedCount, 2);
assert.equal(ngn.pendingAmount, 40000);
assert.equal(ngn.webhookApprovedCount, 1);
assert.equal(ngn.reconciledApprovedCount, 1);
assert.equal(usd.approvedAmount, 0, 'pending/attention/rejected payments must not count as collections');
assert.equal(usd.pendingAmount, 0);
assert.equal(usd.needsAttentionAmount, 7000);
assert.equal(usd.status.rejected.count, 1);

const csv = buildBillingCollectionsCsv(normalized.rows);
assert.ok(csv.startsWith('\uFEFF"provider_transaction_id"'));
assert.ok(csv.includes("'=SUM(1,1)xxxxxxxx"), 'formula-like CSV values must be neutralized');
assert.ok(!csv.includes('customer_email'), 'export must not include customer emails');
assert.ok(csv.includes('manual_reconciliation'));

console.log('Billing collections analytics tests passed: windows, strict row validation, deduplication, currency isolation, approved-only collections and formula-safe PII-minimized CSV.');
