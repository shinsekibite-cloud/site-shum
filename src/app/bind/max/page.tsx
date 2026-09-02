import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { maskMaxUserId, peekMaxClaim, MAX_CLAIM_TTL_SEC } from '@/lib/messenger-link';

export const dynamic = 'force-dynamic';

export default async function BindMaxPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const sp = await searchParams;
  const token = String(sp.t || '').trim();
  const peeked = await peekMaxClaim(token);

  if (!peeked.ok) {
    const reason =
      peeked.reason === 'expired'
        ? 'Ссылка устарела. Откройте бота MAX снова и нажмите «Привязать аккаунт».'
        : peeked.reason === 'used'
          ? 'Ссылка уже использована. Запросите новую в боте командой /start.'
          : 'Ссылка привязки недействительна или подделана. Запросите новую в MAX-боте.';
    return (
      <main className="container" style={{ padding: '2rem 1rem', maxWidth: 520 }}>
        <h1 style={{ fontSize: '1.35rem', marginBottom: '0.75rem' }}>Привязка MAX</h1>
        <p style={{ marginBottom: '1.25rem', opacity: 0.85 }}>{reason}</p>
        <Link href="/dashboard/settings?section=messengers" className="btn btn-primary">
          Открыть настройки
        </Link>
      </main>
    );
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    const callback = `/bind/max?t=${encodeURIComponent(token)}`;
    redirect(`/login?callbackUrl=${encodeURIComponent(callback)}`);
  }

  const masked = maskMaxUserId(peeked.maxUserId);
  const mins = Math.round(MAX_CLAIM_TTL_SEC / 60);

  return (
    <main className="container" style={{ padding: '2rem 1rem', maxWidth: 520 }}>
      <h1 style={{ fontSize: '1.35rem', marginBottom: '0.5rem' }}>Привязка MAX</h1>
      <p style={{ marginBottom: '1rem', opacity: 0.85 }}>
        Подтвердите привязку защищённой ссылки к аккаунту{' '}
        <strong>{session.user.email || session.user.name || 'на сайте'}</strong>.
      </p>
      <div
        style={{
          padding: '1rem 1.1rem',
          borderRadius: 12,
          background: 'var(--sochi-surface, #f4f6f8)',
          marginBottom: '1.25rem',
        }}
      >
        <p style={{ margin: 0, fontSize: '0.95rem' }}>
          MAX ID: <code>{masked}</code>
        </p>
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', opacity: 0.75 }}>
          Ссылка одноразовая, действует около {mins} мин. После подтверждения повторно не сработает.
        </p>
      </div>
      <form action="/api/user/max-claim" method="post" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <input type="hidden" name="t" value={token} />
        <button type="submit" className="btn btn-primary">
          Подтвердить привязку
        </button>
        <Link href="/dashboard/settings?section=messengers" className="btn btn-secondary">
          Отмена
        </Link>
      </form>
    </main>
  );
}
