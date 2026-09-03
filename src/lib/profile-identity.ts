/** Monthly identity field change cooldowns (name / email / phone). */
import { prisma } from '@/lib/prisma';

export const IDENTITY_COOLDOWN_DAYS = 30;

const ACTIONS = {
  name: 'profile_change_name',
  email: 'profile_change_email',
  phone: 'profile_change_phone',
} as const;

export type IdentityField = keyof typeof ACTIONS;

function mskDayStart(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const day = fmt.format(d); // YYYY-MM-DD
  return new Date(`${day}T00:00:00+03:00`);
}

export function identityCooldownMs() {
  return IDENTITY_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
}

export async function lastIdentityChangeAt(userId: string, field: IdentityField) {
  const row = await prisma.userActionLog.findFirst({
    where: { userId, action: ACTIONS[field], success: true },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}

export async function identityChangeAllowed(userId: string, field: IdentityField) {
  const last = await lastIdentityChangeAt(userId, field);
  if (!last) return { ok: true as const, lastAt: null as Date | null, nextAt: null as Date | null };
  const nextAt = new Date(last.getTime() + identityCooldownMs());
  if (Date.now() >= nextAt.getTime()) {
    return { ok: true as const, lastAt: last, nextAt: null as Date | null };
  }
  return { ok: false as const, lastAt: last, nextAt };
}

export async function recordIdentityChange(userId: string, field: IdentityField, email?: string | null) {
  await prisma.userActionLog.create({
    data: {
      userId,
      userEmail: email || undefined,
      action: ACTIONS[field],
      category: 'profile',
      summary: `Смена ${field === 'name' ? 'имени' : field === 'email' ? 'почты' : 'телефона'}`,
      success: true,
    },
  });
}

export async function identityLocksForUser(userId: string) {
  const [name, email, phone] = await Promise.all([
    identityChangeAllowed(userId, 'name'),
    identityChangeAllowed(userId, 'email'),
    identityChangeAllowed(userId, 'phone'),
  ]);
  return {
    name: { locked: !name.ok, nextAt: name.nextAt?.toISOString() ?? null },
    email: { locked: !email.ok, nextAt: email.nextAt?.toISOString() ?? null },
    phone: { locked: !phone.ok, nextAt: phone.nextAt?.toISOString() ?? null },
    cooldownDays: IDENTITY_COOLDOWN_DAYS,
  };
}

/** Tag suggestions: 1 custom proposal per MSK calendar day. */
export async function canProposeTagToday(userId: string) {
  const start = mskDayStart();
  const count = await prisma.profileTagSuggestion.count({
    where: { userId, createdAt: { gte: start } },
  });
  return count < 1;
}
