import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { profanityResponse } from "@/lib/censor";
import { AclError, aclJsonError, requireEndUser } from "@/lib/acl";
import { notifyBookingStatus, notifyStaffNewBooking } from "@/lib/notifications";
import { promoteToParticipant } from "@/lib/participant";
import { bookingHourLimiter, rateLimitJson } from "@/lib/rateLimit";

export async function POST(req: Request) {
  try {
    const session = await requireEndUser();
    const userId = session.user.id;
    if (!userId) {
      return NextResponse.json({ message: "Необходимо авторизоваться" }, { status: 401 });
    }

    const { userBookingLimitMultiplier, boostedMax } = await import("@/lib/activity-limits");
    const { getUserCapabilities, AUTHORITY } = await import("@/lib/reputation");
    const caps = await getUserCapabilities(userId);
    if (!caps.canCreateBooking) {
      return NextResponse.json(
        {
          message: `Авторитет слишком низкий для бронирования площадок (нужно ≥ ${AUTHORITY.BOOKING_MIN}%, сейчас ${caps.authority}%). Приходите на мероприятия и соблюдайте правила.`,
        },
        { status: 403 }
      );
    }
    const bookMax = boostedMax(8, await userBookingLimitMultiplier(userId));
    if (!await bookingHourLimiter.checkAsync(`book:${userId}`, bookMax)) {
      return NextResponse.json(
        rateLimitJson(`Слишком много бронирований. Лимит: ${bookMax} в час.`),
        { status: 429 }
      );
    }

    const body = await req.json();
    const {
      spaceId,
      title,
      description,
      startTime,
      endTime,
      category,
      contactMode,
      contactPhone,
      contactTelegram,
      contactVk,
      contactMax,
      showOrganizerProfile,
    } = body;

    if (!spaceId || !title || !startTime || !endTime) {
      return NextResponse.json({ message: "Заполните обязательные поля" }, { status: 400 });
    }

    const titleTrim = String(title).trim();
    const descTrim = String(description || '').trim();
    if (titleTrim.length < 3 || titleTrim.length > 120) {
      return NextResponse.json({ message: "Название: от 3 до 120 символов" }, { status: 400 });
    }
    if (descTrim.length < 10 || descTrim.length > 2000) {
      return NextResponse.json({ message: "Описание: от 10 до 2000 символов" }, { status: 400 });
    }

    const dirty = profanityResponse(
      titleTrim,
      descTrim,
      String(contactPhone || ''),
      String(contactTelegram || ''),
      String(contactVk || ''),
      String(contactMax || '')
    );
    if (dirty) return dirty;

    const { normalizeEventCategory, normalizeEventContactMode } = await import('@/lib/event-meta');
    const categoryNorm = normalizeEventCategory(category);
    const contactModeNorm = normalizeEventContactMode(contactMode);
    const showProfile = showOrganizerProfile !== false;

    const start = new Date(startTime);
    const end = new Date(endTime);
    const now = new Date();

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ message: "Некорректный формат даты/времени" }, { status: 400 });
    }
    if (end <= start) {
      return NextResponse.json({ message: "Время окончания должно быть позже времени начала" }, { status: 400 });
    }
    if (end <= now) {
      return NextResponse.json({ message: "Нельзя бронировать интервал в прошлом" }, { status: 400 });
    }

    const settings = await prisma.siteSettings.findUnique({ where: { id: "1" } });
    const minBookingHours = settings?.minBookingHours ?? 3;
    const autoApprove = settings?.autoApproveBookings ?? false;
    const openTime = (settings as { bookingOpenTime?: string | null })?.bookingOpenTime || "09:00";
    const closeTime = (settings as { bookingCloseTime?: string | null })?.bookingCloseTime || "21:00";

    const { isWithinWorkingHours, bookingsConflictWithTurnover, BOOKING_TURNOVER_MS } = await import(
      '@/lib/booking-hours'
    );
    const hoursCheck = isWithinWorkingHours(start, end, openTime, closeTime);
    if (!hoursCheck.ok) {
      return NextResponse.json({ message: hoursCheck.message }, { status: 400 });
    }

    const hoursDiff = (start.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursDiff < minBookingHours) {
      return NextResponse.json({ message: `Бронирование возможно минимум за ${minBookingHours} ч. до начала.` }, { status: 400 });
    }

    const space = await prisma.space.findUnique({ where: { id: spaceId } });
    if (!space || space.status === "INACTIVE" || space.status === "COMPLETED") {
      return NextResponse.json({ message: "Площадка недоступна" }, { status: 400 });
    }

    const booking = await prisma.$transaction(async (tx) => {
      const candidates = await tx.booking.findMany({
        where: {
          spaceId,
          status: { in: ["PENDING", "APPROVED"] },
          startTime: { lt: new Date(end.getTime() + BOOKING_TURNOVER_MS) },
          endTime: { gt: new Date(start.getTime() - BOOKING_TURNOVER_MS) },
        },
        select: { id: true, userId: true, startTime: true, endTime: true },
      });

      const duplicateBooking = candidates.find(
        (b) =>
          b.userId === userId &&
          bookingsConflictWithTurnover(b.startTime, b.endTime, start, end, 0)
      );
      if (duplicateBooking) {
        throw new Error("DUPLICATE");
      }

      const conflictingBooking = candidates.find((b) =>
        bookingsConflictWithTurnover(b.startTime, b.endTime, start, end)
      );
      if (conflictingBooking) {
        throw new Error("CONFLICT");
      }

      return tx.booking.create({
        data: {
          title: titleTrim,
          description: descTrim,
          category: categoryNorm,
          contactMode: contactModeNorm,
          contactPhone: contactModeNorm === 'CUSTOM' ? String(contactPhone || '').trim().slice(0, 80) || null : null,
          contactTelegram: contactModeNorm === 'CUSTOM' ? String(contactTelegram || '').trim().slice(0, 200) || null : null,
          contactVk: contactModeNorm === 'CUSTOM' ? String(contactVk || '').trim().slice(0, 300) || null : null,
          contactMax: contactModeNorm === 'CUSTOM' ? String(contactMax || '').trim().slice(0, 300) || null : null,
          showOrganizerProfile: showProfile,
          startTime: start,
          endTime: end,
          spaceId,
          userId,
          status: autoApprove ? "APPROVED" : "PENDING",
        },
      });
    });

    if (autoApprove) {
      await promoteToParticipant(userId);
      if (session.user.email) {
        await notifyBookingStatus({
          to: session.user.email,
          userId,
          bookingId: booking.id,
          title: booking.title,
          spaceTitle: space.title,
          spaceAddress: space.address,
          startTime: booking.startTime,
          endTime: booking.endTime,
          status: "APPROVED",
        }).catch(() => null);
      }
    } else {
      // In-app: бронь ждёт согласования (письмо не шлём — админы уже уведомлены)
      const { createUserNotification } = await import("@/lib/security");
      const { formatMskDateTime } = await import("@/lib/booking-hours");
      void createUserNotification({
        userId,
        type: "BOOKING_REQUEST",
        title: "Бронь отправлена на согласование",
        body: `«${booking.title}» · ${space.title} · ${formatMskDateTime(booking.startTime)} (МСК)`,
        meta: { bookingId: booking.id, status: "PENDING", href: "/tickets", audience: "user" },
      }).catch(() => null);
    }

    const organizer = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    await notifyStaffNewBooking({
      bookingId: booking.id,
      title: booking.title,
      description: booking.description,
      spaceTitle: space.title,
      spaceAddress: space.address,
      startTime: booking.startTime,
      endTime: booking.endTime,
      status: autoApprove ? "APPROVED" : "PENDING",
      organizerName: organizer?.name || session.user.name,
      organizerEmail: organizer?.email || session.user.email,
    }).catch((e) => console.warn("notifyStaffNewBooking", e));

    return NextResponse.json(
      {
        message: autoApprove ? "Бронь создана и одобрена" : "Бронь успешно создана",
        bookingId: booking.id,
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error instanceof AclError) return aclJsonError(error);
    if (error?.message === "DUPLICATE") {
      return NextResponse.json(
        { message: "Вы уже забронировали это пространство на данное или пересекающееся время." },
        { status: 400 }
      );
    }
    if (error?.message === "CONFLICT") {
      return NextResponse.json(
        {
          message:
            'Интервал занят или слишком близко к другой брони (нужен зазор 10 мин., например после 10:00–11:00 — следующее с 11:10).',
        },
        { status: 409 }
      );
    }
    console.error("Ошибка при создании брони:", error);
    return NextResponse.json({ message: "Внутренняя ошибка сервера при бронировании" }, { status: 500 });
  }
}
