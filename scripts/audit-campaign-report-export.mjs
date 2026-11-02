import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const component = readFileSync('src/app/campaigns/ai-campaign-insights.tsx', 'utf8');
const helper = readFileSync('src/lib/reporting/campaign-report-export.ts', 'utf8');
const styles = readFileSync('src/app/campaigns/ai-campaign-insights.css', 'utf8');
const test = readFileSync('scripts/test-campaign-report-export.mjs', 'utf8');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(pkg.version === '5.6.0', 'package.json must identify the 5.6.0 release');
check(component.includes('buildCampaignReportCsv') && component.includes('campaignReportFilename'), 'campaign coach must use the shared report exporter');
check(component.includes('Download CSV report'), 'campaign coach must expose CSV download');
check(component.includes('Print / Save as PDF') && component.includes('window.print()'), 'campaign coach must expose browser print/PDF output');
check(helper.includes("/^[\\t\\r\\n ]*[=+\\-@]/"), 'CSV exporter must neutralise spreadsheet formula injection');
check(helper.includes(`replaceAll('"', '""')`), 'CSV exporter must escape embedded quote characters');
check(helper.includes('officialByPlatform') && helper.includes('Recommended experiment'), 'CSV must include platform and experiment detail');
check(styles.includes('@media print') && styles.includes('.aic-report-actions{display:none!important}'), 'print stylesheet must isolate the printable report and hide export controls');
check(pkg.scripts.build.includes('audit:campaign-report-export'), 'production build must run the reporting integration audit');
check(pkg.scripts.test.includes('test-campaign-report-export.mjs'), 'test pipeline must run the report exporter regression tests');
check(test.includes('formula-like campaign text must be neutralised'), 'regression test must cover spreadsheet formula injection');

const compatibilityAudits = [
  'audit-campaign-intelligence.mjs',
  'audit-provider-analytics.mjs',
  'audit-linkedin-analytics.mjs',
  'audit-tiktok-integration.mjs',
  'audit-youtube-integration.mjs',
  'audit-instagram-comments.mjs',
  'audit-whatsapp-integration.mjs',
  'audit-whatsapp-media-replies.mjs',
];
for (const file of compatibilityAudits) {
  try {
    const source = readFileSync(`scripts/${file}`, 'utf8');
    check(source.includes("'5.6.0'"), `${file} must accept the 5.6.0 release`);
  } catch {
    failures.push(`${file} is missing from the release overlay`);
  }
}

if (failures.length) {
  console.error(`Campaign report export audit failed: ${failures.length} issue(s).`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Campaign report export audit passed: export UI, formula-safe CSV, print isolation, test hooks and release compatibility verified.');
}
