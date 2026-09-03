'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import OpsFlagsClient from '@/components/OpsFlagsClient';
import OpsAccountPanel from '@/components/OpsAccountPanel';
import OpsPresentationClient from '@/components/OpsPresentationClient';
import OpsTopologyClient from '@/components/OpsTopologyClient';

type Tab = 'modules' | 'topology' | 'presentation' | 'account';

export default function OpsConsoleClient() {
  const [tab, setTab] = useState<Tab>('modules');

  useEffect(() => {
    document.documentElement.dataset.opsImmersive = tab === 'topology' ? '1' : '0';
    return () => {
      delete document.documentElement.dataset.opsImmersive;
    };
  }, [tab]);

  if (tab === 'topology') {
    return <OpsTopologyClient onBack={() => setTab('modules')} />;
  }

  return (
    <div className="ops-console">
      <div className="ops-console__tabs" role="tablist" aria-label="Разделы Ops">
        {(
          [
            { id: 'modules' as const, label: 'Модули' },
            { id: 'topology' as const, label: 'Топология' },
            { id: 'presentation' as const, label: 'Презентация' },
            { id: 'account' as const, label: 'Безопасность учётки' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className="ops-console__tab"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="ops-console__hint">
        Модуль выкл — прячет раздел и API. TECH всегда проходит. Сообщения: кабинет + иконка в шапке.{' '}
        <Link href="/">На сайт</Link>
        {' · '}
        <Link href="/dashboard">Кабинет</Link>
      </p>

      {tab === 'modules' ? (
        <OpsFlagsClient embedded />
      ) : tab === 'presentation' ? (
        <OpsPresentationClient />
      ) : (
        <OpsAccountPanel />
      )}
    </div>
  );
}
