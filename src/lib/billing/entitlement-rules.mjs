const RESOURCE_KEYS = [
  'connected_accounts',
  'brands',
  'team_members',
  'ai_generations',
];

function safeCount(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

export function usagePercent(used, limit) {
  const safeUsed = safeCount(used);
  const safeLimit = safeCount(limit);
  if (safeLimit === 0) return safeUsed > 0 ? 100 : 0;
  return Math.min(100, Math.round((safeUsed / safeLimit) * 100));
}

export function remainingUsage(used, limit) {
  return Math.max(0, safeCount(limit) - safeCount(used));
}

export function normalizeEntitlementSnapshot(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input;
  const result = {
    plan_code: typeof value.plan_code === 'string' ? value.plan_code : 'free',
    plan_name: typeof value.plan_name === 'string' ? value.plan_name : 'Free',
    usage_month: typeof value.usage_month === 'string' ? value.usage_month : '',
    subscription_status: typeof value.subscription_status === 'string' ? value.subscription_status : 'free',
    resources: {},
  };
  for (const key of RESOURCE_KEYS) {
    const row = value[key] && typeof value[key] === 'object' ? value[key] : {};
    const used = safeCount(row.used);
    const limit = safeCount(row.limit);
    result.resources[key] = {
      used,
      limit,
      remaining: remainingUsage(used, limit),
      percent: usagePercent(used, limit),
      reached: used >= limit,
    };
  }
  return result;
}

export function entitlementDeniedMessage(resource, used, limit) {
  const labels = {
    connected_accounts: 'connected social accounts',
    brands: 'brands',
    team_members: 'team members',
    ai_generations: 'AI content generations',
  };
  const label = labels[resource] ?? 'this resource';
  return `Your workspace has reached its ${label} allowance (${safeCount(used)} of ${safeCount(limit)}). Remove an unused item or ask a workspace owner to review the subscription plan.`;
}
