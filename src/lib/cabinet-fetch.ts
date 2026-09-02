'use client';

import toast from 'react-hot-toast';

const TOAST_ID = 'yp-service-unavailable';
let lastToastAt = 0;

export function isModuleOffStatus(res: Response, body: unknown): boolean {
  if (res.status !== 503 && res.status !== 404) return false;
  const code =
    body && typeof body === 'object' && 'code' in body
      ? String((body as { code?: string }).code || '')
      : '';
  return code === 'MODULE_DISABLED' || code === 'MODULE_SOON';
}

export function notifyServiceUnavailable() {
  const now = Date.now();
  if (now - lastToastAt < 12_000) return;
  lastToastAt = now;
  toast.error('Сервис временно недоступен. Попробуйте обновить страницу через минуту.', {
    id: TOAST_ID,
  });
}

/** Parse JSON; silent on disabled modules; toast on unexpected 503/502/504. */
export async function readCabinetJson(res: Response): Promise<any> {
  const raw = await res.text();
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (res.ok) return body;
  if (isModuleOffStatus(res, body)) return null;
  if (res.status === 503 || res.status === 502 || res.status === 504) {
    notifyServiceUnavailable();
  }
  return body;
}

export async function cabinetGet(url: string, enabled = true): Promise<any> {
  if (!enabled) return null;
  try {
    const res = await fetch(url, { cache: 'default', credentials: 'same-origin' });
    return await readCabinetJson(res);
  } catch {
    notifyServiceUnavailable();
    return null;
  }
}
