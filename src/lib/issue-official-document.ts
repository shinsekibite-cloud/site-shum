import { prisma } from '@/lib/prisma';
import {
  generateOfficialDocumentPdf,
  makeSerialNumber,
  OFFICIAL_DOC_TYPE_META,
  type OfficialDocType,
} from '@/lib/official-documents';
import { unlockAchievement } from '@/lib/award-achievements';
import { getSiteIdentity } from '@/lib/site-identity';
import { createUserNotification } from '@/lib/security';

export type IssueOfficialInput = {
  userId: string;
  type: OfficialDocType;
  title: string;
  subtitle?: string | null;
  body?: string | null;
  recipientName?: string | null;
  issuerName?: string | null;
  issuedAt?: Date;
  template?: string;
  achievementCode?: string | null;
  issuedById?: string | null;
  linkToPortfolio?: boolean;
};

export async function issueOfficialDocument(input: IssueOfficialInput) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, name: true, email: true },
  });
  if (!user) throw new Error('Пользователь не найден');

  const identity = await getSiteIdentity();
  const type = input.type;
  const serialNumber = makeSerialNumber(type);
  const recipientName =
    (input.recipientName || '').trim() || user.name || user.email || 'Участник';
  const issuerName =
    (input.issuerName || '').trim() || identity.siteName;
  const issuedAt = input.issuedAt || new Date();
  const title = input.title.trim();
  if (!title) throw new Error('Укажите название');

  const { pdfPath } = await generateOfficialDocumentPdf({
    type,
    title,
    subtitle: input.subtitle,
    body: input.body,
    recipientName,
    issuerName,
    issuedAt,
    serialNumber,
    siteName: identity.siteName,
    template: input.template || 'classic',
  });

  let portfolioCertId: string | null = null;
  if (input.linkToPortfolio !== false) {
    let portfolio = await prisma.userPortfolio.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!portfolio) {
      portfolio = await prisma.userPortfolio.create({
        data: { userId: user.id, headline: recipientName, status: 'DRAFT' },
        select: { id: true },
      });
    }
    const cert = await prisma.portfolioCertificate.create({
      data: {
        portfolioId: portfolio.id,
        title: `${OFFICIAL_DOC_TYPE_META[type].label}: ${title}`,
        issuer: issuerName,
        issuedAt,
        fileUrl: pdfPath,
        fileName: `${serialNumber}.pdf`,
        mimeType: 'application/pdf',
        isVisible: true,
      },
    });
    portfolioCertId = cert.id;
  }

  const doc = await prisma.officialDocument.create({
    data: {
      userId: user.id,
      type,
      title,
      subtitle: input.subtitle?.trim() || null,
      body: input.body?.trim() || null,
      recipientName,
      issuerName,
      issuedAt,
      issuedById: input.issuedById || null,
      template: input.template || 'classic',
      serialNumber,
      achievementCode: input.achievementCode || null,
      portfolioCertId,
      pdfPath,
      status: 'ISSUED',
    },
  });

  await unlockAchievement(user.id, 'FIRST_OFFICIAL_DOC');
  if (type === 'DIPLOMA') await unlockAchievement(user.id, 'OFFICIAL_DIPLOMA');
  if (type === 'HONORARY') await unlockAchievement(user.id, 'OFFICIAL_HONORARY');
  if (type === 'CERTIFICATE') await unlockAchievement(user.id, 'OFFICIAL_CERTIFICATE');
  if (type === 'GRATITUDE') await unlockAchievement(user.id, 'OFFICIAL_GRATITUDE');
  if (input.achievementCode) {
    await unlockAchievement(user.id, input.achievementCode).catch(() => null);
  }

  try {
    await createUserNotification({
      userId: user.id,
      type: 'AWARD',
      title: `Вам выдан${type === 'GRATITUDE' ? 'а' : ''} ${OFFICIAL_DOC_TYPE_META[type].label.toLowerCase()}`,
      body: title,
      meta: { href: `/awards/${doc.id}`, awardId: doc.id },
    });
  } catch {
    /* optional */
  }

  return doc;
}
