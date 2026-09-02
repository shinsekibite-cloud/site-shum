import type { Metadata } from 'next';
import CoworkingSignupFlow from '@/components/CoworkingSignupFlow';
import { getSiteIdentity } from '@/lib/site-identity';

export async function generateMetadata(): Promise<Metadata> {
  const { siteName } = await getSiteIdentity();
  return {
    title: `Запись в коворкинг | ${siteName}`,
    description: 'Запишитесь в коворкинг ЦРМ за пару кликов',
  };
}

export default async function CoworkingPage({
  searchParams,
}: {
  searchParams: Promise<{ space?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="container cw-page">
      <header className="cw-page-head">
        <p className="cw-eyebrow">Пространства ЦРМ</p>
        <h1>Записаться в коворкинг</h1>
        <p>Выберите площадку, день и интервал — без лишних шагов брони зала.</p>
      </header>
      <CoworkingSignupFlow initialSpaceId={sp.space} />
    </div>
  );
}
