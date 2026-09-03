/**
 * TECH account must stay invisible in admin UIs and staff searches.
 * Server-side filters — never rely on client hiding alone.
 */

export const TECH_ROLE = 'TECH' as const;

/** Prisma where-fragment: exclude TECH accounts. */
export function excludeTechWhere() {
  return { role: { not: TECH_ROLE } as const };
}

/** Merge exclude-TECH into an existing where object. */
export function whereWithoutTech<T extends Record<string, unknown>>(where: T): T & { role: { not: typeof TECH_ROLE } } {
  return { ...where, role: { not: TECH_ROLE } };
}

export function isTechUser(role?: string | null) {
  return role === TECH_ROLE;
}

/** Drop TECH rows from admin API responses that already loaded users. */
export function omitTechUsers<T extends { role?: string | null }>(users: T[]): T[] {
  return users.filter((u) => u.role !== TECH_ROLE);
}
