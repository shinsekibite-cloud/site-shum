import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { containsProfanity } from '@/lib/censor';
import { normalizeVkGroupId, vkGroupPublicUrl } from '@/lib/vk-group';
import {
  downloadNewsImage,
  isPlaceholderNewsCover,
  pickVkPhotoUrl,
  pickVkVideo,
  resolveVkVideoEmbed,
} from '@/lib/vk-media';
import { isAfishaWeekPost, parseAfishaWeekFromVkText } from '@/lib/afisha-from-vk';
import { serializeAfishaWeek } from '@/lib/afisha-week';
import {
  describeVkSyncSchedule,
  parseVkSyncSchedule,
  shouldRunVkSyncNow,
} from '@/lib/vk-sync-schedule';

const CRON_SECRET = process.env.CRON_SECRET || '';

function postTitle(text: string, videoTitle: string | null) {
  const first = (text.split('\n')[0] || '').trim();
  if (first) {
    return first.length > 80 ? `${first.slice(0, 80)}...` : first;
  }
  if (videoTitle) return videoTitle.slice(0, 80);
  return 'Видео';
}

async function mediaFromAttachments(attachments: unknown, vkPostId: string, apiToken: string) {
  const photoUrl = pickVkPhotoUrl(attachments);
  const video = pickVkVideo(attachments);
  const videoEmbedUrl = video ? await resolveVkVideoEmbed(apiToken, video) : null;
  const thumbSource = photoUrl || video?.thumbUrl || null;
  const localImageUrl = thumbSource
    ? await downloadNewsImage(thumbSource, `vk_${vkPostId.replace(/[^0-9_-]/g, '')}`)
    : null;
  return { videoEmbedUrl, localImageUrl, videoTitle: video?.title || null };
}

type SyncOpts = { force?: boolean };

async function runSync(opts: SyncOpts = {}) {
  const settings = await prisma.siteSettings.findUnique({ where: { id: '1' } });
  const envToken = (process.env.VK_SERVICE_TOKEN || process.env.VK_API_TOKEN || '').trim();
  const apiToken = (settings?.vkApiToken || envToken || '').trim();
  const groupRaw = (settings?.vkGroupId || process.env.VK_GROUP_ID || '').trim();
  const syncEnabled =
    Boolean(settings?.vkSyncEnabled) ||
    (Boolean(apiToken) && process.env.VK_SYNC_FORCE === '1');
  const schedule = parseVkSyncSchedule(
    (settings as { vkSyncScheduleJson?: string | null } | null)?.vkSyncScheduleJson
  );

  if (!settings) {
    return { ok: false, message: 'Настройки сайта не найдены.' };
  }
  if (!syncEnabled) {
    return {
      ok: false,
      message:
        'Автоимпорт выключен. Включите «Автоимпорт новостей из VK» в админке → VK API и сохраните.',
      code: 'disabled',
    };
  }
  if (!apiToken) {
    return {
      ok: false,
      message:
        'Нет сервисного ключа VK. Укажите токен в админке → VK API (или VK_SERVICE_TOKEN в .env).',
      code: 'no_token',
    };
  }
  if (!groupRaw) {
    return {
      ok: false,
      message: 'Не указана группа VK. Пример: crm.sochi',
      code: 'no_group',
    };
  }

  // Hourly cron: skip quietly outside configured Moscow hours (manual force always runs)
  if (!opts.force && !shouldRunVkSyncNow(schedule)) {
    return {
      ok: true,
      skippedSchedule: true,
      message: `Сейчас не время по расписанию (${describeVkSyncSchedule(schedule)}).`,
      schedule: describeVkSyncSchedule(schedule),
    };
  }

  const groupId = normalizeVkGroupId(groupRaw);
  if (!groupId) {
    return { ok: false, message: 'Некорректный ID или адрес группы VK.' };
  }

  const isNumeric = /^-?\d+$/.test(groupId);
  const ownerParam = isNumeric ? `owner_id=${groupId}` : `domain=${encodeURIComponent(groupId)}`;
  const vkApiUrl = `https://api.vk.com/method/wall.get?${ownerParam}&count=20&access_token=${apiToken}&v=5.131`;
  const response = await fetch(vkApiUrl);
  const data = await response.json();

  if (data.error) {
    console.error('VK API Error:', data.error);
    return { ok: false, message: 'Ошибка VK API: ' + (data.error.error_msg || 'Неизвестная ошибка') };
  }

  const posts = data.response?.items || [];
  let addedCount = 0;
  let skippedDup = 0;
  let updatedVideo = 0;
  let updatedCovers = 0;
  let afishaUpdated = false;

  for (const post of posts) {
    if (post.copy_history || post.marked_as_ads) continue;

    const textRaw = typeof post.text === 'string' ? post.text : '';
    const videoProbe = pickVkVideo(post.attachments);
    if (!textRaw.trim() && !videoProbe) continue;
    if (textRaw.trim() && containsProfanity(textRaw)) continue;

    const vkPostId = `${post.owner_id}_${post.id}`;
    const vkLink = `https://vk.ru/wall${post.owner_id}_${post.id}`;
    const isAfisha = Boolean(textRaw && isAfishaWeekPost(textRaw));

    if (!afishaUpdated && isAfisha) {
      const cfg = parseAfishaWeekFromVkText(textRaw, { vkLink });
      await prisma.siteSettings.update({
        where: { id: '1' },
        data: {
          afishaWeekEnabled: true,
          afishaWeekJson: serializeAfishaWeek(cfg),
        },
      });
      afishaUpdated = true;
    }

    const existing = await prisma.news.findUnique({ where: { vkPostId } });

    if (existing) {
      const needCover = isPlaceholderNewsCover(existing.imageUrl);
      const needVideo = !String(existing.videoEmbedUrl || '').trim();
      if (needCover || needVideo) {
        const media = await mediaFromAttachments(post.attachments, vkPostId, apiToken);
        const patch: { videoEmbedUrl?: string; imageUrl?: string } = {};
        if (needVideo && media.videoEmbedUrl) patch.videoEmbedUrl = media.videoEmbedUrl;
        if (needCover && media.localImageUrl) patch.imageUrl = media.localImageUrl;
        if (Object.keys(patch).length) {
          await prisma.news.update({ where: { id: existing.id }, data: patch });
          if (patch.videoEmbedUrl) updatedVideo++;
          if (patch.imageUrl) updatedCovers++;
        }
      }
      skippedDup++;
      continue;
    }

    if (isAfisha) {
      skippedDup++;
      continue;
    }

    const media = await mediaFromAttachments(post.attachments, vkPostId, apiToken);
    const text = textRaw.trim() || media.videoTitle || 'Видео из ВКонтакте';
    const title = postTitle(text, media.videoTitle);

    await prisma.news.create({
      data: {
        vkPostId,
        title,
        text,
        imageUrl: media.localImageUrl,
        videoEmbedUrl: media.videoEmbedUrl,
        vkLink,
        createdAt: new Date(post.date * 1000),
        status: 'PUBLISHED',
        publishedAt: new Date(post.date * 1000),
      },
    });
    addedCount++;
  }

  const publicUrl = vkGroupPublicUrl(groupId);
  await prisma.siteSettings.update({
    where: { id: '1' },
    data: {
      vkLastSync: new Date(),
      ...(publicUrl && !settings.vkLink ? { vkLink: publicUrl, vkEnabled: true } : {}),
    },
  });
  return {
    ok: true,
    message: `Синхронизация завершена. Добавлено: ${addedCount}, без дублей: ${skippedDup}, обложки: ${updatedCovers}, видео: ${updatedVideo}, афиша недели: ${afishaUpdated ? 'обновлена' : 'без изменений'}`,
    added: addedCount,
    skipped: skippedDup,
    updatedCovers,
    updatedVideo,
    afishaUpdated,
    group: groupId,
    schedule: describeVkSyncSchedule(schedule),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret') || request.headers.get('x-cron-secret') || '';
  const force = searchParams.get('force') === '1';

  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runSync({ force });
    if (!result.ok) {
      return NextResponse.json(
        { message: result.message, code: (result as { code?: string }).code },
        { status: 400 }
      );
    }
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Ошибка синхронизации VK (cron):', error);
    return NextResponse.json({ error: 'Внутренняя ошибка', details: message }, { status: 500 });
  }
}

export async function POST() {
  const { getServerSession } = await import('next-auth');
  const { authOptions } = await import('@/lib/auth');
  const session = await getServerSession(authOptions);
  // @ts-ignore
  if (!session || (session.user as { role?: string })?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runSync({ force: true });
    if (!result.ok) {
      return NextResponse.json(
        { message: result.message, code: (result as { code?: string }).code },
        { status: 400 }
      );
    }
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Ошибка синхронизации VK (manual):', error);
    return NextResponse.json({ error: 'Внутренняя ошибка', details: message }, { status: 500 });
  }
}
