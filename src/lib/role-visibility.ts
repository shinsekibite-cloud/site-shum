/**
 * UI visibility matrix by role (client-safe).
 * Server ACL remains in acl-shared / route guards.
 */
export type UiRole = 'GUEST' | 'USER' | 'PARTICIPANT' | 'MODERATOR' | 'ADMIN' | 'SCANNER' | 'TECH';

export function uiRoleFromSession(role?: string | null): UiRole {
  if (!role) return 'GUEST';
  if (
    role === 'USER' ||
    role === 'PARTICIPANT' ||
    role === 'MODERATOR' ||
    role === 'ADMIN' ||
    role === 'SCANNER' ||
    role === 'TECH'
  ) {
    return role;
  }
  return 'GUEST';
}

export function canSeeAdminChrome(role?: string | null) {
  return role === 'ADMIN' || role === 'MODERATOR' || role === 'TECH';
}

export function canSeeUserCabinet(role?: string | null) {
  return Boolean(role) && role !== 'SCANNER';
}
