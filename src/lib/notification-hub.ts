/**
 * In-process SSE hub for user notifications.
 * Single-node friendly; multi-replica should add Redis pub/sub later.
 */
import { EventEmitter } from 'events';

type NotifPayload = {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  meta?: string | null;
};

type HubEvents = {
  notify: (userId: string, payload: NotifPayload) => void;
};

class NotificationHub extends EventEmitter {
  publish(userId: string, payload: NotifPayload) {
    this.emit(`u:${userId}`, payload);
    this.emit('notify', userId, payload);
  }

  subscribe(userId: string, fn: (payload: NotifPayload) => void) {
    const key = `u:${userId}`;
    this.on(key, fn);
    return () => this.off(key, fn);
  }
}

const g = globalThis as unknown as { __ypNotifHub?: NotificationHub };
export const notificationHub = g.__ypNotifHub || (g.__ypNotifHub = new NotificationHub());

export type { NotifPayload, HubEvents };
