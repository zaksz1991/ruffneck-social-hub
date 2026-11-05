export type OrganizationCapabilityStatus = 'available' | 'setup' | 'manual';
export interface OrganizationCapability {
  title: string;
  status: OrganizationCapabilityStatus;
  detail: string;
}
export interface OrganizationCapabilityGroup {
  title: string;
  intro: string;
  capabilities: OrganizationCapability[];
}
export interface ProviderCapability {
  provider: string;
  state: string;
  detail: string;
}
export const organizationCapabilityGroups: OrganizationCapabilityGroup[];
export const providerCapabilityMatrix: ProviderCapability[];
export const organizationReadinessNotes: string[];
export function getOrganizationCapabilitySummary(): {
  available: number;
  setup: number;
  manual: number;
  total: number;
};
