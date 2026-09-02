import { PRIVACY_POLICY_VERSION } from '@/lib/consent-versions';

export type PrivacyConsentState = {
  privacyAcceptedAt?: Date | string | null;
  privacyFirstAcceptedAt?: Date | string | null;
  privacyPolicyVersion?: string | null;
  privacyRefusedAt?: Date | string | null;
};

/** True when user must accept the current privacy policy before using the portal. */
export function needsPrivacyReconsent(user: PrivacyConsentState | null | undefined): boolean {
  if (!user) return false;
  if (user.privacyRefusedAt) return true;
  if (!user.privacyAcceptedAt) return true;
  const ver = (user.privacyPolicyVersion || '').trim();
  if (!ver) return true;
  return ver !== PRIVACY_POLICY_VERSION;
}

export { PRIVACY_POLICY_VERSION };
