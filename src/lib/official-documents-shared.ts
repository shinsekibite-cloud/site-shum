/** Client-safe official document labels/types (no Node fs). */

export type OfficialDocType =
  | 'DIPLOMA'
  | 'CERTIFICATE'
  | 'GRATITUDE'
  | 'HONORARY'
  | 'AWARD';

export const OFFICIAL_DOC_TYPE_META: Record<
  OfficialDocType,
  { label: string; labelGenitive: string; accent: [number, number, number] }
> = {
  DIPLOMA: { label: 'Диплом', labelGenitive: 'диплома', accent: [0.06, 0.35, 0.45] },
  CERTIFICATE: { label: 'Сертификат', labelGenitive: 'сертификата', accent: [0.15, 0.35, 0.55] },
  GRATITUDE: { label: 'Благодарность', labelGenitive: 'благодарности', accent: [0.35, 0.28, 0.12] },
  HONORARY: { label: 'Почётная грамота', labelGenitive: 'почётной грамоты', accent: [0.45, 0.2, 0.15] },
  AWARD: { label: 'Награда', labelGenitive: 'награды', accent: [0.12, 0.4, 0.32] },
};

export const OFFICIAL_DOC_TEMPLATES = ['classic', 'modern', 'formal'] as const;
export type OfficialDocTemplate = (typeof OFFICIAL_DOC_TEMPLATES)[number];
