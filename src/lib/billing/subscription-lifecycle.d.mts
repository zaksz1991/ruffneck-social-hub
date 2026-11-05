export const SUBSCRIPTION_LIFECYCLE_ADMIN_PHRASES: Readonly<{
  markPastDue: 'MARK PAST DUE';
  grantGrace: 'GRANT GRACE';
  expire: 'EXPIRE';
  confirmProviderCancellation: 'CANCELLED IN FLUTTERWAVE';
  finalizeCancellation: 'FINALIZE CANCELLATION';
}>;
export type SubscriptionLifecycleHealth =
  | 'healthy' | 'renewal_due' | 'renewal_review_required' | 'cancellation_requested'
  | 'provider_cancellation_required' | 'cancellation_ready_to_finalize' | 'grace_period'
  | 'past_due_review_required' | 'grace_elapsed_expiry_required' | 'expired' | 'cancelled' | 'invalid';
export type SubscriptionLifecycleRow = {
  id: string; workspaceId: string; planId: string; status: 'active' | 'past_due' | 'cancelled' | 'expired';
  providerPlanId: string; customerEmail: string; amount: number; currency: string; billingInterval: 'monthly' | 'yearly';
  currentPeriodStartedAt: string; currentPeriodEndsAt: string; cancelAtPeriodEnd: boolean;
  cancelRequestedAt: string | null; providerCancelledAt: string | null; gracePeriodEndsAt: string | null;
  cancelledAt: string | null; lastPaymentAt: string; createdAt: string | null; updatedAt: string | null;
  health: SubscriptionLifecycleHealth;
};
export function isSubscriptionUuid(value: unknown): value is string;
export function classifySubscriptionHealth(row: Partial<SubscriptionLifecycleRow> | null, now?: Date | string): SubscriptionLifecycleHealth;
export function normalizeSubscriptionLifecycleRows(input: unknown, now?: Date | string): { rows: SubscriptionLifecycleRow[]; invalidCount: number };
export function summarizeSubscriptionLifecycle(rows: unknown): Record<string, number>;
export function validateSubscriptionLifecycleAdminCommand(input?: { subscriptionId?: unknown; phrase?: unknown; expectedPhrase?: unknown; note?: unknown; days?: unknown }): string | null;
export function validateWorkspaceCancellationRequest(input?: { subscriptionId?: unknown; cancel?: unknown }): string | null;
