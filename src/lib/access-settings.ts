import { prisma } from '@/lib/prisma';
import { getModuleFlags } from '@/lib/module-flags';

export type AccessSettings = {
  registrationEnabled: boolean;
  messagingEnabled: boolean;
  smsLoginEnabled: boolean;
  esiaLoginEnabled: boolean;
};

export const DEFAULT_ACCESS_SETTINGS: AccessSettings = {
  registrationEnabled: true,
  messagingEnabled: true,
  smsLoginEnabled: false,
  esiaLoginEnabled: false,
};

export async function getAccessSettings(): Promise<AccessSettings> {
  try {
    const [row, flags] = await Promise.all([
      prisma.siteSettings.findUnique({
        where: { id: '1' },
        select: {
          registrationEnabled: true,
          messagingEnabled: true,
          smsLoginEnabled: true,
          esiaLoginEnabled: true,
        },
      }),
      getModuleFlags(),
    ]);
    return {
      registrationEnabled: row?.registrationEnabled !== false && flags.registration !== false,
      messagingEnabled: row?.messagingEnabled !== false && flags.messaging !== false,
      smsLoginEnabled: Boolean(row?.smsLoginEnabled),
      esiaLoginEnabled: Boolean(row?.esiaLoginEnabled),
    };
  } catch {
    return { ...DEFAULT_ACCESS_SETTINGS };
  }
}

export function isStaffRole(role: string | null | undefined) {
  return role === 'ADMIN' || role === 'MODERATOR' || role === 'TECH';
}
