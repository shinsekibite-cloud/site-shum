import Link from 'next/link';
import { MODULE_FLAG_META, type ModuleFlagKey } from '@/lib/module-flags';

export const metadata = { title: 'Раздел недоступен' };

export default async function UnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; mode?: string }>;
}) {
  const sp = await searchParams;
  const mod = (sp.m || '').trim() as ModuleFlagKey | '';
  const soon = sp.mode === 'soon';
  const label =
    mod && MODULE_FLAG_META[mod as ModuleFlagKey]
      ? MODULE_FLAG_META[mod as ModuleFlagKey].label
      : mod || '';

  return (
    <div className="container" style={{ padding: '3rem 1rem', maxWidth: 520, textAlign: 'center' }}>
      <h1 style={{ fontWeight: 800, marginBottom: '0.75rem' }}>
        {soon ? 'Раздел в разработке' : 'Раздел временно отключён'}
      </h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>
        {soon
          ? label
            ? `«${label}» скоро появится на портале. Следите за новостями.`
            : 'Этот раздел скоро появится на портале. Следите за новостями.'
          : label
            ? `Модуль «${label}» сейчас выключен технической службой.`
            : 'Этот раздел сейчас выключен технической службой.'}
      </p>
      <Link href="/" className="btn btn-primary">
        На главную
      </Link>
    </div>
  );
}
