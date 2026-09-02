/**
 * One-shot: scan users for unsafe / gibberish profile text and open moderation flags.
 * Run inside web container: npx tsx scripts/scan-profile-safety.ts
 */
import { prisma } from '../src/lib/prisma';
import { containsUnsafeContent } from '../src/lib/censor';
import { validateDisplayName } from '../src/lib/profile-text-guard';

async function main() {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      nickname: true,
      bio: true,
      about: true,
      email: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  let flagged = 0;
  for (const u of users) {
    const reasons: string[] = [];
    const nameCheck = validateDisplayName(u.name || '');
    if (!nameCheck.ok) reasons.push(`name: ${nameCheck.message}`);
    if (containsUnsafeContent(u.name) || containsUnsafeContent(u.nickname) || containsUnsafeContent(u.bio) || containsUnsafeContent(u.about)) {
      reasons.push('unsafe lexicon');
    }
    if (!reasons.length) continue;

    const existing = await prisma.contentFlag.findFirst({
      where: {
        actorUserId: u.id,
        sourceType: 'PROFILE_TEXT',
        status: 'OPEN',
      },
      select: { id: true },
    });
    if (existing) continue;

    const snippet = [u.name, u.nickname, u.bio].filter(Boolean).join(' · ').slice(0, 400);
    await prisma.contentFlag.create({
      data: {
        category: 'PROFILE_TEXT',
        categories: JSON.stringify(['PROFILE_TEXT']),
        severity: 1,
        sourceType: 'PROFILE_TEXT',
        sourceId: u.id,
        actorUserId: u.id,
        originalText: snippet || u.email || u.id,
        maskedText: reasons.join('; ').slice(0, 400),
        matches: JSON.stringify(reasons),
        status: 'OPEN',
        reliabilityDelta: 0,
        warnIssued: false,
      },
    });
    flagged += 1;
    console.log('flagged', u.email, reasons.join(' | '));
  }
  console.log('done, flagged', flagged);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
