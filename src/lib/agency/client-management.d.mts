export type AgencyClientStatus = 'prospect' | 'onboarding' | 'active' | 'paused' | 'closed';
export type AgencyClientServiceLevel = 'basic' | 'standard' | 'premium';
export type AgencyClientInput = {
  clientName: unknown;
  contactName?: unknown;
  contactEmail?: unknown;
  contactPhone?: unknown;
  website?: unknown;
  status?: unknown;
  serviceLevel?: unknown;
  monthlyRetainer?: unknown;
  retainerCurrency?: unknown;
  startDate?: unknown;
  nextReviewDate?: unknown;
};
export type AgencyClientValidated = {
  clientName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  status: AgencyClientStatus;
  serviceLevel: AgencyClientServiceLevel;
  monthlyRetainer: number | null;
  retainerCurrency: string;
  startDate: string;
  nextReviewDate: string;
};
export function validateAgencyClientInput(input: AgencyClientInput):
  | { ok: true; value: AgencyClientValidated }
  | { ok: false; field: string; message: string };
export function validateAgencyClientNote(note: unknown): { ok: true; value: string } | { ok: false; message: string };
export function isAgencyClientStatus(value: unknown): value is AgencyClientStatus;
export type AgencyClientUsage = { used: number; limit: number; remaining: number; percent: number; reached: boolean; planCode: string };
export function normalizeAgencyClientUsage(input: unknown): AgencyClientUsage | null;
