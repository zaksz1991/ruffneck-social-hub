export type SavedReplyProvider = 'instagram' | 'facebook';
export type SavedReplyScope = 'all' | SavedReplyProvider;

export type SavedReplyInput = {
  providerScope: string;
  title: string;
  body: string;
};

export type SavedReplyValidation =
  | { ok: true; value: { providerScope: SavedReplyScope; title: string; body: string } }
  | { ok: false; reason: 'provider' | 'title' | 'body' };

export function validateSavedReplyInput(input: SavedReplyInput): SavedReplyValidation {
  const providerScope = input.providerScope.trim();
  const title = input.title.trim();
  const body = input.body.trim();
  if (!['all', 'instagram', 'facebook'].includes(providerScope)) return { ok: false, reason: 'provider' };
  if (title.length < 2 || title.length > 80) return { ok: false, reason: 'title' };
  if (body.length < 1 || body.length > 2000) return { ok: false, reason: 'body' };
  return { ok: true, value: { providerScope: providerScope as SavedReplyScope, title, body } };
}

export function savedReplyAppliesTo(scope: SavedReplyScope, provider: SavedReplyProvider): boolean {
  return scope === 'all' || scope === provider;
}
