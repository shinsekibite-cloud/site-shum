/** Structured payloads for rich DirectMessage cards */

export type MessageKind = 'TEXT' | 'EVENT_INVITE' | 'PLACE_INVITE' | 'ENTITY_INVITE';

export type EventInviteMeta = {
  bookingId: string;
  title: string;
  startTime: string;
  endTime?: string | null;
  spaceTitle?: string | null;
  href: string;
  inviteId?: string;
  note?: string | null;
};

export type PlaceInviteMeta = {
  placeId: string;
  title: string;
  slug?: string | null;
  href: string;
  inviteId?: string;
  note?: string | null;
};

export type EntityInviteMeta = {
  inviteId: string;
  entityKind: 'PROJECT' | 'CLUB';
  entityId: string;
  title: string;
  href: string;
  note?: string | null;
};

export function parseMessageMeta(kind: string | null | undefined, raw: string | null | undefined) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (kind === 'EVENT_INVITE' && typeof parsed.bookingId === 'string') {
      return parsed as unknown as EventInviteMeta;
    }
    if (kind === 'PLACE_INVITE' && typeof parsed.placeId === 'string') {
      return parsed as unknown as PlaceInviteMeta;
    }
    if (kind === 'ENTITY_INVITE' && typeof parsed.inviteId === 'string') {
      return parsed as unknown as EntityInviteMeta;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function previewForMessage(kind: string | null | undefined, body: string, metaJson?: string | null) {
  if (kind === 'EVENT_INVITE') {
    const meta = parseMessageMeta(kind, metaJson) as EventInviteMeta | null;
    return meta?.title ? `Приглашение: ${meta.title}` : 'Приглашение на мероприятие';
  }
  if (kind === 'PLACE_INVITE') {
    const meta = parseMessageMeta(kind, metaJson) as PlaceInviteMeta | null;
    return meta?.title ? `Позвать: ${meta.title}` : 'Приглашение сходить';
  }
  if (kind === 'ENTITY_INVITE') {
    const meta = parseMessageMeta(kind, metaJson) as EntityInviteMeta | null;
    const label = meta?.entityKind === 'CLUB' ? 'клуб' : 'проект';
    return meta?.title ? `В ${label}: ${meta.title}` : 'Приглашение в команду';
  }
  return body;
}

export function formatEventWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Moscow',
    });
  } catch {
    return iso;
  }
}
