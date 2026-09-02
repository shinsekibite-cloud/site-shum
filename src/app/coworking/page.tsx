import type { Metadata } from 'next';
import CoworkingSignupFlow from '@/components/CoworkingSignupFlow';
import CoworkingGuestGate from '@/components/CoworkingGuestGate';
import { getCoworkingAvailability } from '@/lib/coworking-availability';
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
  const { dayKey, spaces } = await getCoworkingAvailability();
  const callback =
    sp.space != null && sp.space !== ''
      ? `/coworking?space=${encodeURIComponent(sp.space)}`
      : '/coworking';
  return (
    <div className="container cw-page cw-page--wide">
      <header className="cw-page-head">
        <p className="cw-eyebrow">Пространства ЦРМ</p>
        <h1>Записаться в коворкинг</h1>
        <p>Площадка, день и интервал — без лишних шагов.</p>
      </header>
      <CoworkingGuestGate callbackPath={callback}>
        <CoworkingSignupFlow
          initialSpaceId={sp.space}
          initialDayKey={dayKey}
          initialSpaces={spaces}
        />
      </CoworkingGuestGate>
    </div>
  );
}
