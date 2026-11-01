import { describe, expect, it } from 'vitest';
import {
  customerStageLabel,
  maskProviderParticipantId,
  normalizeCustomerTags,
  validateCustomerProfileInput,
} from './customer-crm';

describe('customer CRM validation', () => {
  it('normalizes, lowercases and de-duplicates tags', () => {
    expect(normalizeCustomerTags(' VIP, repeat buyer, VIP,  Kano SME ')).toEqual(['vip', 'repeat buyer', 'kano sme']);
  });

  it('rejects more than twelve tags', () => {
    expect(normalizeCustomerTags(Array.from({ length: 13 }, (_, index) => `tag${index}`).join(','))).toBeNull();
  });

  it('rejects unsafe tag punctuation and overly long tags', () => {
    expect(normalizeCustomerTags('vip,drop<script>')).toBeNull();
    expect(normalizeCustomerTags('a'.repeat(25))).toBeNull();
  });

  it('accepts Hausa, Yoruba and other unicode letters in tags', () => {
    expect(normalizeCustomerTags('abokin ciniki, ọja, abokin ciniki')).toEqual(['abokin ciniki', 'ọja']);
  });

  it('validates optional customer labels and relationship stages', () => {
    expect(validateCustomerProfileInput({ displayLabel: '', relationshipStage: 'lead', tags: 'new' })).toMatchObject({ ok: true, value: { displayLabel: null, relationshipStage: 'lead' } });
    expect(validateCustomerProfileInput({ displayLabel: 'A', relationshipStage: 'lead', tags: '' }).ok).toBe(false);
    expect(validateCustomerProfileInput({ displayLabel: 'Client One', relationshipStage: 'unknown', tags: '' }).ok).toBe(false);
  });

  it('masks provider IDs and labels known relationship stages', () => {
    expect(maskProviderParticipantId('1234567890')).toBe('Contact ····7890');
    expect(maskProviderParticipantId('')).toBe('Unknown contact');
    expect(customerStageLabel('at_risk')).toBe('At risk');
    expect(customerStageLabel('unknown')).toBe('Unclassified');
  });
});
