export type ContentInput = {
  title: string;
  body: string;
};

export type ContentValidationResult =
  | { ok: true; value: ContentInput }
  | { ok: false; reason: 'title' | 'body' };

export function validateContentInput(titleValue: unknown, bodyValue: unknown): ContentValidationResult {
  const title = typeof titleValue === 'string' ? titleValue.trim() : '';
  const body = typeof bodyValue === 'string' ? bodyValue.trim() : '';

  if (title.length < 2 || title.length > 160) return { ok: false, reason: 'title' };
  if (body.length < 1 || body.length > 5000) return { ok: false, reason: 'body' };
  return { ok: true, value: { title, body } };
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function canCreateContent(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager' || role === 'publisher';
}

export function canReviewContent(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager' || role === 'client_approver';
}
