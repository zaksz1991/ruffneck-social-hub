const STATUSES = ['prospect', 'onboarding', 'active', 'paused', 'closed'];
const SERVICE_LEVELS = ['basic', 'standard', 'premium'];
const CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR', 'GHS', 'KES', 'ZAR'];

function clean(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function validDate(value) {
  if (!value) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateAgencyClientInput(input) {
  const source = input && typeof input === 'object' ? input : {};
  const value = {
    clientName: clean(source.clientName, 140),
    contactName: clean(source.contactName, 120),
    contactEmail: clean(source.contactEmail, 254).toLowerCase(),
    contactPhone: clean(source.contactPhone, 40),
    website: clean(source.website, 255),
    status: clean(source.status, 20) || 'prospect',
    serviceLevel: clean(source.serviceLevel, 20) || 'standard',
    monthlyRetainer: source.monthlyRetainer === '' || source.monthlyRetainer === null || source.monthlyRetainer === undefined
      ? null : Number(source.monthlyRetainer),
    retainerCurrency: clean(source.retainerCurrency, 3).toUpperCase() || 'NGN',
    startDate: clean(source.startDate, 10),
    nextReviewDate: clean(source.nextReviewDate, 10),
  };

  if (value.clientName.length < 2) return { ok: false, field: 'clientName', message: 'Enter a client or business name with at least 2 characters.' };
  if (value.contactName.length > 120) return { ok: false, field: 'contactName', message: 'Contact name is too long.' };
  if (value.contactEmail && !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value.contactEmail)) {
    return { ok: false, field: 'contactEmail', message: 'Enter a valid contact email address.' };
  }
  if (value.contactPhone && !/^[+0-9().\- ]{5,40}$/.test(value.contactPhone)) {
    return { ok: false, field: 'contactPhone', message: 'Use a valid phone number containing digits and standard phone symbols.' };
  }
  if (value.website) {
    try {
      const parsed = new URL(value.website);
      if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) throw new Error('invalid');
      value.website = parsed.toString();
    } catch {
      return { ok: false, field: 'website', message: 'Enter a complete website address beginning with https://.' };
    }
  }
  if (!STATUSES.includes(value.status)) return { ok: false, field: 'status', message: 'Select a valid client status.' };
  if (!SERVICE_LEVELS.includes(value.serviceLevel)) return { ok: false, field: 'serviceLevel', message: 'Select a valid service level.' };
  if (value.monthlyRetainer !== null && (!Number.isFinite(value.monthlyRetainer) || value.monthlyRetainer < 0 || value.monthlyRetainer > 1_000_000_000)) {
    return { ok: false, field: 'monthlyRetainer', message: 'Enter a retainer between 0 and 1,000,000,000.' };
  }
  if (!CURRENCIES.includes(value.retainerCurrency)) return { ok: false, field: 'retainerCurrency', message: 'Select a supported currency.' };
  if (!validDate(value.startDate)) return { ok: false, field: 'startDate', message: 'Enter a valid start date.' };
  if (!validDate(value.nextReviewDate)) return { ok: false, field: 'nextReviewDate', message: 'Enter a valid review date.' };
  if (value.startDate && value.nextReviewDate && value.nextReviewDate < value.startDate) {
    return { ok: false, field: 'nextReviewDate', message: 'The review date cannot be earlier than the start date.' };
  }
  return { ok: true, value };
}

export function validateAgencyClientNote(note) {
  const value = typeof note === 'string'
    ? note.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
    : '';
  if (value.length < 2) return { ok: false, message: 'Enter a note with at least 2 characters.' };
  if (value.length > 2000) return { ok: false, message: 'Notes cannot exceed 2,000 characters.' };
  return { ok: true, value };
}

export function isAgencyClientStatus(value) {
  return typeof value === 'string' && STATUSES.includes(value);
}

export function normalizeAgencyClientUsage(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const used = Number(input.used);
  const limit = Number(input.limit);
  if (!Number.isSafeInteger(used) || used < 0 || !Number.isSafeInteger(limit) || limit < 0) return null;
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    percent: limit === 0 ? (used > 0 ? 100 : 0) : Math.min(100, Math.round((used / limit) * 100)),
    reached: used >= limit,
    planCode: typeof input.plan_code === 'string' ? input.plan_code : 'free',
  };
}
