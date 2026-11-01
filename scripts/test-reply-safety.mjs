import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(new URL('../src/lib/ai/reply-safety.ts', import.meta.url), 'utf8');
const compiled = ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext });
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const safety = await import(moduleUrl);
const tests = [];
const check = (name, fn) => { fn(); tests.push(name); };

check('brand escalation triggers are detected', () => {
  const result = safety.assessReplyDraftSafety({ customerMessage: 'I have a refund dispute.', draftText: 'A manager will review this.', brandVoice: { escalation_triggers: ['refund dispute'] } });
  assert.equal(result.risk_level, 'escalate');
  assert.equal(result.escalation_required, true);
  assert.ok(result.flags.includes('brand_escalation_trigger'));
});
check('forbidden claims are flagged', () => {
  const result = safety.assessReplyDraftSafety({ customerMessage: 'Tell me about the service.', draftText: 'We guarantee the best results.', brandVoice: { forbidden_claims: ['guarantee the best results'] } });
  assert.ok(result.flags.includes('brand_forbidden_claim'));
});
check('high-risk credential and fraud topics require escalation', () => {
  const result = safety.assessReplyDraftSafety({ customerMessage: 'Someone asked me for my OTP and bank details.', draftText: 'Please do not share them.', brandVoice: {} });
  assert.equal(result.escalation_required, true);
  assert.ok(result.flags.includes('high_risk_customer_topic'));
});
check('unverified commitments require review', () => {
  const result = safety.assessReplyDraftSafety({ customerMessage: 'When does my order arrive?', draftText: 'Delivery is guaranteed tomorrow.', brandVoice: { approved_facts: ['Office hours are weekdays.'] } });
  assert.equal(result.risk_level, 'review');
  assert.ok(result.flags.includes('possible_unverified_commitment'));
});
check('language mismatch is surfaced as a possibility', () => {
  const result = safety.assessReplyDraftSafety({ customerMessage: 'Sannu, ina son karin bayani.', draftText: 'Thank you for your message. How can we help?', brandVoice: {} });
  assert.equal(result.customer_language, 'hausa');
  assert.equal(result.draft_language, 'english');
  assert.equal(result.language_match, false);
});
check('Yoruba, Igbo and Nigerian Pidgin have language hints', () => {
  assert.equal(safety.detectReplyLanguage('Ẹ ṣé, ẹ jọ̀ọ́ ẹ ran mi lọwọ.').language, 'yoruba');
  assert.equal(safety.detectReplyLanguage('Ndewo, biko nyere m aka.').language, 'igbo');
  assert.equal(safety.detectReplyLanguage('Abeg, wetin dey happen?').language, 'pidgin');
});
check('an edited draft receives a different SHA-256 fingerprint', () => {
  assert.notEqual(safety.fingerprintReplyDraft('Thanks.'), safety.fingerprintReplyDraft('Thanks!'));
  assert.match(safety.fingerprintReplyDraft('Thanks.'), /^[a-f0-9]{64}$/);
});
check('assessment does not include an automatic send permission', () => {
  const result = safety.assessReplyDraftSafety({ customerMessage: 'Hello, please help.', draftText: 'Thank you. We can assist.', brandVoice: {} });
  assert.equal(Object.hasOwn(result, 'send_allowed'), false);
  assert.match(result.guidance, /human/i);
});

console.log(`Reply safety behaviour checks passed: ${tests.length}/${tests.length}`);
for (const name of tests) console.log(`PASS ${name}`);
