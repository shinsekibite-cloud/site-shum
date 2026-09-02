import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { bumpReliability } from '@/lib/reliability';
import { applyModerationSocialHit } from '@/lib/reputation';
import { createUserNotification } from '@/lib/security';
import {
  scanUnsafeContent,
  safetyCategoryLabel,
  type SafetyScan,
} from '@/lib/censor';
import { getModerationConfig } from '@/lib/moderation-settings';

export async function notifyStaffModeration(opts: {
  flagId: string;
  actorName: string;
  categories: string[];
  severity: number;
  snippet: string;
}) {
  const staff = await prisma.user.findMany({
    where: {
      OR: [
        { role: 'ADMIN' },
        { role: 'MODERATOR', permissions: { contains: 'moderation' } },
      ],
      blockedAt: null,
      deletedAt: null,
    },
    select: { id: true },
    take: 40,
  });

  const cats = opts.categories.map(safetyCategoryLabel).join(', ');
  const title = 'Модерация: опасный контент в переписке';
  const body = `${opts.actorName || 'Пользователь'} · ${cats} · «${opts.snippet.slice(0, 120)}»`;

  await Promise.all(
    staff.map((s) =>
      createUserNotification({
        userId: s.id,
        type: 'MODERATION',
        title,
        body,
        meta: { href: '/admin/moderation', flagId: opts.flagId, audience: 'staff' },
      })
    )
  );
}

/** Tell staff who closed a moderation case. */
export async function notifyStaffModerationDecision(opts: {
  flagId: string;
  action: string;
  categoryLabel: string;
  reviewerId: string;
  reviewerName: string;
  excludeUserId?: string;
}) {
  const staff = await prisma.user.findMany({
    where: {
      OR: [
        { role: 'ADMIN' },
        { role: 'MODERATOR', permissions: { contains: 'moderation' } },
      ],
      blockedAt: null,
      deletedAt: null,
      ...(opts.excludeUserId ? { id: { not: opts.excludeUserId } } : {}),
    },
    select: { id: true },
    take: 40,
  });

  const verb = opts.action === 'ACTIONED' ? 'принято решение' : 'снято замечание';
  const title = 'Модерация: дело закрыто';
  const body = `${opts.reviewerName} · ${verb} · ${opts.categoryLabel}`;

  await Promise.all(
    staff.map((s) =>
      createUserNotification({
        userId: s.id,
        type: 'MODERATION',
        title,
        body,
        meta: {
          href: '/admin/moderation',
          flagId: opts.flagId,
          audience: 'staff',
          actorId: opts.reviewerId,
          actorName: opts.reviewerName,
          action: opts.action,
          handled: true,
        },
      })
    )
  );
}

/**
 * Soft-moderate a direct message: mask unsafe spans, flag for admins,
 * warn the sender and adjust reliability per service rules.
 */
export async function moderateDirectMessage(opts: {
  messageId: string;
  conversationId: string;
  senderId: string;
  originalBody: string;
  scan?: SafetyScan;
}) {
  const cfg = await getModerationConfig();
  if (!cfg.enabled) {
    return { flagged: false as const, body: opts.originalBody, warning: null as string | null };
  }

  const scan = opts.scan || scanUnsafeContent(opts.originalBody);
  if (!scan.flagged) {
    return { flagged: false as const, body: opts.originalBody, warning: null as string | null };
  }

  const primary = scan.categories[0] || 'PROFANITY';
  const delta = scan.reliabilityDelta;

  const flag = await prisma.contentFlag.create({
    data: {
      category: primary,
      categories: JSON.stringify(scan.categories),
      severity: scan.maxSeverity,
      sourceType: 'DIRECT_MESSAGE',
      sourceId: opts.messageId,
      conversationId: opts.conversationId,
      actorUserId: opts.senderId,
      originalText: opts.originalBody.slice(0, 4000),
      maskedText: scan.maskedText.slice(0, 4000),
      matches: JSON.stringify(scan.matches.slice(0, 40)),
      status: 'OPEN',
      reliabilityDelta: delta,
      warnIssued: true,
    },
    select: { id: true },
  });

  await prisma.directMessage.update({
    where: { id: opts.messageId },
    data: { body: scan.maskedText, flagged: true },
  });

  const reliability = await bumpReliability(opts.senderId, delta);
  if (delta) {
    await applyModerationSocialHit(opts.senderId, delta);
  }
  const warned = await prisma.user.update({
    where: { id: opts.senderId },
    data: { warnCount: { increment: 1 } },
    select: { warnCount: true, name: true, blockedAt: true },
  });

  const cats = scan.categories.map(safetyCategoryLabel).join(', ');
  let warning =
    `Сообщение содержит запрещённый контент (${cats}). Текст скрыт для собеседника. ` +
    `Предупреждение №${warned.warnCount}` +
    (delta ? `, рейтинг надёжности ${delta}` : '') +
    '. Повторные нарушения могут привести к блокировке.';

  let autoBlocked = false;
  if (
    cfg.autoBlockWarnThreshold > 0 &&
    warned.warnCount >= cfg.autoBlockWarnThreshold &&
    !warned.blockedAt
  ) {
    await prisma.user.update({
      where: { id: opts.senderId },
      data: {
        blockedAt: new Date(),
        blockedReason: `Автоблокировка: ${warned.warnCount} предупреждений модерации`,
      },
    });
    autoBlocked = true;
    warning += ` Аккаунт временно заблокирован (${warned.warnCount} предупреждений). Обратитесь в поддержку.`;
    await createUserNotification({
      userId: opts.senderId,
      type: 'MODERATION',
      title: 'Аккаунт заблокирован',
      body: warning,
      meta: { href: '/contacts', flagId: flag.id, autoBlocked: true },
    });
  } else {
    await createUserNotification({
      userId: opts.senderId,
      type: 'MODERATION',
      title: 'Предупреждение по правилам сервиса',
      body: warning,
      meta: { href: '/dashboard', flagId: flag.id },
    });
  }

  void notifyStaffModeration({
    flagId: flag.id,
    actorName: warned.name || 'Пользователь',
    categories: scan.categories,
    severity: scan.maxSeverity,
    snippet: scan.maskedText,
  }).catch(() => null);

  return {
    flagged: true as const,
    body: scan.maskedText,
    warning,
    reliabilityScore: reliability?.reliabilityScore ?? null,
    warnCount: warned.warnCount,
    autoBlocked,
  };
}

export function newTokenKeepAlive() {
  return randomBytes(24).toString('hex');
}
