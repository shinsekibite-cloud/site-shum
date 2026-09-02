/** Client-side offline queue for scanner check-ins (localStorage). */

export type QueuedScan = {
  id: string;
  code: string;
  method: 'QR' | 'MANUAL';
  bookingId?: string;
  queuedAt: number;
};

const KEY = 'yp_scanner_queue_v1';

function read(): QueuedScan[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: QueuedScan[]) {
  localStorage.setItem(KEY, JSON.stringify(items.slice(0, 200)));
}

export function listQueuedScans(): QueuedScan[] {
  return read();
}

export function enqueueScan(item: Omit<QueuedScan, 'id' | 'queuedAt'>): QueuedScan {
  const entry: QueuedScan = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: Date.now(),
  };
  const next = [...read(), entry];
  write(next);
  return entry;
}

export function removeQueuedScan(id: string) {
  write(read().filter((i) => i.id !== id));
}

export async function flushQueuedScans(
  post: (item: QueuedScan) => Promise<boolean>
): Promise<{ sent: number; left: number }> {
  const items = read();
  let sent = 0;
  const left: QueuedScan[] = [];
  for (const item of items) {
    try {
      const ok = await post(item);
      if (ok) sent += 1;
      else left.push(item);
    } catch {
      left.push(item);
    }
  }
  write(left);
  return { sent, left: left.length };
}
