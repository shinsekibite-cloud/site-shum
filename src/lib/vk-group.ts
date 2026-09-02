/** Normalize VK group id / screen name / URL for wall.get. */
export function normalizeVkGroupId(raw: string | null | undefined): string {
  let s = String(raw || '').trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\/(m\.)?(vk\.com|vk\.ru)\//i, '');
  s = s.replace(/^(club|public|event)/i, '');
  s = s.split(/[/?#]/)[0].replace(/\/+$/, '').trim();
  // Numeric without minus → group owner_id is negative
  if (/^\d+$/.test(s)) return `-${s}`;
  return s;
}

export function vkGroupPublicUrl(groupId: string | null | undefined): string | null {
  const id = normalizeVkGroupId(groupId);
  if (!id) return null;
  if (/^-?\d+$/.test(id)) {
    const n = id.replace(/^-/, '');
    return `https://vk.ru/club${n}`;
  }
  return `https://vk.ru/${id}`;
}
