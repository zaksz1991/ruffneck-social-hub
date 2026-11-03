export type EntitlementResource = 'connected_accounts' | 'brands' | 'team_members' | 'ai_generations';
export type EntitlementUsage = { used: number; limit: number; remaining: number; percent: number; reached: boolean };
export type EntitlementSnapshot = {
  plan_code: string;
  plan_name: string;
  usage_month: string;
  subscription_status: string;
  resources: Record<EntitlementResource, EntitlementUsage>;
};
export function usagePercent(used: unknown, limit: unknown): number;
export function remainingUsage(used: unknown, limit: unknown): number;
export function normalizeEntitlementSnapshot(input: unknown): EntitlementSnapshot | null;
export function entitlementDeniedMessage(resource: string, used: unknown, limit: unknown): string;
