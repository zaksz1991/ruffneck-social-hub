import { createHash } from 'node:crypto';

export type ReplySafetyLanguage = 'english' | 'hausa' | 'yoruba' | 'igbo' | 'pidgin' | 'french' | 'unknown';
export type ReplySafetyRisk = 'low' | 'review' | 'escalate';
export type ReplySafetyAssessment = {
  risk_level: ReplySafetyRisk;
  customer_language: ReplySafetyLanguage;
  draft_language: ReplySafetyLanguage;
  language_match: boolean | null;
  escalation_required: boolean;
  flags: string[];
  guidance: string;
  draft_fingerprint: string;
};

type LanguageResult = { language: ReplySafetyLanguage; confidence: 'high' | 'medium' | 'low' };

function clean(value: unknown, max = 6000): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

function normalized(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const LANGUAGE_MARKERS: Record<Exclude<ReplySafetyLanguage, 'unknown'>, string[]> = {
  english: ['the', 'and', 'you', 'your', 'please', 'with', 'this', 'that', 'can', 'help', 'thank', 'hello'],
  hausa: ['sannu', 'lafiya', 'yaya', 'na gode', 'mun gode', 'don Allah', 'ina', 'kuna', 'yau', 'zuwa', 'ne', 'ce'],
  yoruba: ['ẹ ṣé', 'e se', 'bawo', 'jọwọ', 'jowo', 'ṣe', 'se', 'lọwọ', 'owo', 'ẹ jọ̀ọ́', 'mo dupe', 'ẹ káàbọ̀'],
  igbo: ['ndewo', 'kedu', 'daalu', 'anyị', 'unu', 'biko', 'nnoo', 'ọ dị', 'ka ọ dị', 'imela'],
  pidgin: ['abeg', 'wetin', 'dey', 'wahala', 'una', 'sabi', 'no wahala', 'how far', 'I go', 'e don', 'make una'],
  french: ['bonjour', 'merci', 'vous', 'votre', 'nous', 'avec', 'pour', 'comment', 'est ce', 's il vous plait', 'je suis', 'bienvenue'],
};

export function detectReplyLanguage(value: unknown): LanguageResult {
  const text = normalized(clean(value));
  if (!text) return { language: 'unknown', confidence: 'low' };
  const scores = (Object.entries(LANGUAGE_MARKERS) as Array<[Exclude<ReplySafetyLanguage, 'unknown'>, string[]]>).map(([language, markers]) => {
    const score = markers.reduce((total, marker) => {
      const needle = normalized(marker);
      if (!needle) return total;
      const pattern = new RegExp(`(?:^| )${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: |$)`, 'u');
      return total + (pattern.test(text) ? 1 : 0);
    }, 0);
    return { language, score };
  }).sort((a, b) => b.score - a.score);

  const best = scores[0];
  const second = scores[1];
  if (!best || best.score === 0) return { language: 'unknown', confidence: 'low' };
  if (best.score >= 2 && best.score > (second?.score ?? 0)) return { language: best.language, confidence: 'high' };
  if (best.score >= 1 && best.score > (second?.score ?? 0)) return { language: best.language, confidence: 'medium' };
  return { language: best.language, confidence: 'low' };
}

function phraseMatches(text: string, phrases: string[]): boolean {
  const normalizedText = ` ${normalized(text)} `;
  return phrases.some((phrase) => {
    const candidate = normalized(phrase);
    return candidate.length >= 3 && normalizedText.includes(` ${candidate} `);
  });
}

function brandList(brandVoice: unknown, key: 'forbidden_claims' | 'escalation_triggers' | 'approved_facts'): string[] {
  if (!brandVoice || typeof brandVoice !== 'object' || Array.isArray(brandVoice)) return [];
  const list = (brandVoice as Record<string, unknown>)[key];
  if (!Array.isArray(list)) return [];
  return list.map((item) => clean(item, 300)).filter(Boolean).slice(0, 12);
}

export function fingerprintReplyDraft(value: unknown): string {
  return createHash('sha256').update(clean(value), 'utf8').digest('hex');
}

export function assessReplyDraftSafety(input: {
  customerMessage: unknown;
  draftText: unknown;
  brandVoice: unknown;
}): ReplySafetyAssessment {
  const customerMessage = clean(input.customerMessage);
  const draftText = clean(input.draftText);
  const customerLanguage = detectReplyLanguage(customerMessage);
  const draftLanguage = detectReplyLanguage(draftText);
  const flags: string[] = [];

  const forbiddenClaims = brandList(input.brandVoice, 'forbidden_claims');
  const escalationTriggers = brandList(input.brandVoice, 'escalation_triggers');
  const approvedFacts = brandList(input.brandVoice, 'approved_facts');

  if (phraseMatches(draftText, forbiddenClaims)) flags.push('brand_forbidden_claim');
  if (phraseMatches(customerMessage, escalationTriggers)) flags.push('brand_escalation_trigger');

  const highRiskCustomerPattern = /\b(password|passcode|one[- ]time code|otp|verification code|pin number|cvv|card number|bank account|bank details|hacked|fraud|identity theft|lawsuit|lawyer|police report|chargeback|refund request|medical emergency|injury|threat|blackmail|scam)\b/i;
  if (highRiskCustomerPattern.test(customerMessage)) flags.push('high_risk_customer_topic');

  const commitmentPattern = /\b(we guarantee|guaranteed|100\s*%|definitely|we have processed|your refund has been|delivery (?:will be|is guaranteed)|will arrive tomorrow|approved your|confirmed your|will receive)\b/i;
  const approvedText = normalized(approvedFacts.join(' '));
  const commitments = draftText.match(new RegExp(commitmentPattern.source, 'gi')) ?? [];
  const hasUnsubstantiatedCommitment = commitments.some((claim) => !approvedText.includes(normalized(claim)));
  if (hasUnsubstantiatedCommitment) flags.push('possible_unverified_commitment');

  if (/\b(system prompt|api key|access token|internal instruction|private credential)\b/i.test(draftText)) {
    flags.push('possible_sensitive_or_internal_content');
  }

  const languageComparable = customerLanguage.confidence !== 'low' && draftLanguage.confidence !== 'low' &&
    customerLanguage.language !== 'unknown' && draftLanguage.language !== 'unknown';
  const languageMatch = languageComparable ? customerLanguage.language === draftLanguage.language : null;
  if (languageMatch === false) flags.push('possible_language_mismatch');

  const escalationRequired = flags.some((flag) => [
    'brand_forbidden_claim',
    'brand_escalation_trigger',
    'high_risk_customer_topic',
    'possible_sensitive_or_internal_content',
  ].includes(flag));
  const riskLevel: ReplySafetyRisk = escalationRequired ? 'escalate' : flags.length ? 'review' : 'low';
  const guidance = escalationRequired
    ? 'Pause before sending. A trained team member should review the customer request, verify policy and facts, and take ownership of the response.'
    : flags.length
      ? 'Review the flagged items, verify every factual claim, and confirm the reply uses the customer’s language before approving it.'
      : 'No configured rule was triggered. A human must still verify the reply, current facts, tone and channel policy before sending.';

  return {
    risk_level: riskLevel,
    customer_language: customerLanguage.language,
    draft_language: draftLanguage.language,
    language_match: languageMatch,
    escalation_required: escalationRequired,
    flags,
    guidance,
    draft_fingerprint: fingerprintReplyDraft(draftText),
  };
}
