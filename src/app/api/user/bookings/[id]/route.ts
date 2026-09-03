import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { AclError, aclJsonError, requireEndUser } from '@/lib/acl';
import {
  normalizeEventCategory,
  normalizeEventContactMode,
} from '@/lib/event-meta';

/**
 * Organizer updates public afisha fields on their own booking
 * (title, description, category, contacts) without changing time/space.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireEndUser();
    const { id } = await params;
    const userId = session.user.id;
    const body = await req.json().catch(() => ({}));

    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) {
      return NextResponse.json({ message: 'Бронь не найдена' }, { status: 404 });
    }
    if (booking.userId !== userId) {
      return NextResponse.json({ message: 'Можно редактировать только свою бронь' }, { status: 403 });
    }
    if (booking.status === 'REJECTED') {
      return NextResponse.json({ message: 'Отменённую бронь нельзя редактировать' }, { status: 400 });
    }
    if (booking.endTime.getTime() < Date.now()) {
      return NextResponse.json({ message: 'Прошедшую бронь нельзя редактировать' }, { status: 400 });
    }

    const titleTrim = String(body.title ?? booking.title).trim();
    const descTrim = String(body.description ?? booking.description ?? '').trim();
    if (titleTrim.length < 3) {
      return NextResponse.json({ message: 'Название — минимум 3 символа' }, { status: 400 });
    }
    if (descTrim.length < 10) {
      return NextResponse.json(
        { message: 'Опишите, для чего мероприятие (минимум 10 символов)' },
        { status: 400 }
      );
    }

    const categoryNorm = normalizeEventCategory(body.category ?? booking.category);
    const contactModeNorm = normalizeEventContactMode(body.contactMode ?? booking.contactMode);
    const showProfile =
      body.showOrganizerProfile !== undefined
        ? Boolean(body.showOrganizerProfile)
        : booking.showOrganizerProfile;

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        title: titleTrim.slice(0, 120),
        description: descTrim.slice(0, 2000),
        category: categoryNorm,
        contactMode: contactModeNorm,
        contactPhone:
          contactModeNorm === 'CUSTOM'
            ? String(body.contactPhone || '').trim().slice(0, 80) || null
            : null,
        contactTelegram:
          contactModeNorm === 'CUSTOM'
            ? String(body.contactTelegram || '').trim().slice(0, 200) || null
            : null,
        contactVk:
          contactModeNorm === 'CUSTOM'
            ? String(body.contactVk || '').trim().slice(0, 300) || null
            : null,
        contactMax:
          contactModeNorm === 'CUSTOM'
            ? String(body.contactMax || '').trim().slice(0, 300) || null
            : null,
        showOrganizerProfile: showProfile,
      },
      include: { space: true },
    });

    revalidatePath('/events');
    revalidatePath('/');
    revalidatePath('/dashboard');

    return NextResponse.json({ message: 'Анонс обновлён', booking: updated }, { status: 200 });
  } catch (e) {
    if (e instanceof AclError) return aclJsonError(e);
    console.error('patch booking meta', e);
    return NextResponse.json({ message: 'Ошибка сервера' }, { status: 500 });
  }
}
