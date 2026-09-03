/** Prefer nickname over legal/full name everywhere in the cabinet. */
export function profileDisplayName(opts: {
  nickname?: string | null;
  name?: string | null;
  fallback?: string;
}): string {
  const nick = (opts.nickname || '').trim();
  const name = (opts.name || '').trim();
  return nick || name || opts.fallback || 'Профиль';
}

/** Names that are really role titles stored in User.name */
export function isRoleLikeName(name: string | null | undefined): boolean {
  const n = (name || '').trim().toLowerCase();
  if (!n) return false;
  return /администратор|модератор|техслужб|сканер|участник|пользователь|оператор/.test(n);
}

/** Show legal name under nickname only when it adds real identity info. */
export function shouldShowLegalSub(
  nickname: string | null | undefined,
  name: string | null | undefined
): boolean {
  const nick = (nickname || '').trim();
  const legal = (name || '').trim();
  if (!nick || !legal || nick === legal) return false;
  if (isRoleLikeName(legal)) return false;
  return true;
}
