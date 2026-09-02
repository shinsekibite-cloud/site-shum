/** Client helpers for Web Push subscription (browser only). */

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function getPushStatus(): Promise<{
  publicKey: string | null;
  subscribed: boolean;
  deviceCount: number;
  permission: NotificationPermission | 'unsupported';
}> {
  if (!pushSupported()) {
    return { publicKey: null, subscribed: false, deviceCount: 0, permission: 'unsupported' };
  }
  try {
    const res = await fetch('/api/user/push');
    const data = await res.json().catch(() => ({}));
    return {
      publicKey: typeof data.publicKey === 'string' ? data.publicKey : null,
      subscribed: Boolean(data.subscribed),
      deviceCount: Number(data.deviceCount) || 0,
      permission: Notification.permission,
    };
  } catch {
    return {
      publicKey: null,
      subscribed: false,
      deviceCount: 0,
      permission: Notification.permission,
    };
  }
}

export async function enableWebPush(): Promise<{ ok: boolean; message?: string }> {
  if (!pushSupported()) {
    return { ok: false, message: 'Браузер не поддерживает push' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, message: 'Разрешите уведомления в настройках браузера' };
  }

  const status = await getPushStatus();
  if (!status.publicKey) {
    return { ok: false, message: 'Сервер push не настроен' };
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(status.publicKey),
    });
  }

  const res = await fetch('/api/user/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, message: data.message || 'Не удалось сохранить подписку' };
  }

  // Quiet confirmation push
  await fetch('/api/user/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'test' }),
  }).catch(() => null);

  return { ok: true };
}

export async function disableWebPush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch('/api/user/push', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => null);
      await sub.unsubscribe().catch(() => null);
    } else {
      await fetch('/api/user/push', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      }).catch(() => null);
    }
  } catch {
    /* ignore */
  }
}
