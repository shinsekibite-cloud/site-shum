import { prisma } from '@/lib/prisma';
import { MapPin, Phone, Mail, Clock, ExternalLink, MessageCircle, FileText, Navigation } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import YandexDirections from '@/components/YandexDirections';
import { geocodeAddress } from '@/lib/geocode';
import { ensureSystemPages } from '@/lib/system-pages';
import { SocialIconLink } from '@/components/SocialIcons';
import { isNextBuildPhase } from '@/lib/build-phase';

export const revalidate = 60;
export const dynamic = 'force-static';

const DEFAULT_WORK_HOURS = 'Пн–Пт: 9:00 – 18:00\nСб–Вс: выходной';

export default async function ContactsPage() {
  if (!isNextBuildPhase()) {
    await ensureSystemPages();
  }
  const settings = isNextBuildPhase()
    ? null
    : await prisma.siteSettings.findUnique({ where: { id: '1' } }).catch(() => null);
  const mapPoint = settings?.address ? await geocodeAddress(settings.address) : null;

  const siteName = settings?.siteName || 'Молодёжь Сочи';
  const supportEmail =
    ((settings as { supportEmail?: string | null } | null)?.supportEmail || '').trim() ||
    (settings?.contactEmail || '').trim() ||
    '';
  const contactEmail = (settings?.contactEmail || '').trim();
  const showGeneralEmail =
    !!contactEmail && contactEmail.toLowerCase() !== supportEmail.toLowerCase();
  const phone = (settings?.contactPhone || '').trim();
  const address = (settings?.address || '').trim();
  const workHoursRaw = ((settings as { workHours?: string | null } | null)?.workHours || '').trim();
  const workHours = workHoursRaw || DEFAULT_WORK_HOURS;

  const operatorName = ((settings as any)?.operatorName || '').trim();
  const operatorInn = ((settings as any)?.operatorInn || '').trim();
  const operatorOgrn = ((settings as any)?.operatorOgrn || '').trim();
  const pdnEmail =
    ((settings as any)?.pdnResponsibleEmail || '').trim() || supportEmail || contactEmail;
  const hasOperator = Boolean(operatorName || operatorInn || operatorOgrn || pdnEmail);

  const socials = [
    { key: 'vk', label: 'ВКонтакте', color: '#0077FF' },
    { key: 'tg', label: 'Telegram', color: '#0088cc' },
    { key: 'max', label: 'MAX', color: '#471AFF' },
    { key: 'ok', label: 'Одноклассники', color: '#ed812b' },
    { key: 'whatsapp', label: 'WhatsApp', color: '#25D366' },
    { key: 'rutube', label: 'Rutube', color: '#181C21' },
  ].filter((s) => (settings as any)?.[s.key + 'Enabled'] && (settings as any)?.[s.key + 'Link']);

  const card = (opts: {
    icon: ReactNode;
    tone: string;
    title: string;
    body: ReactNode;
    href?: string;
  }) => {
    const inner = (
      <div
        className="glass"
        style={{
          padding: '1.35rem',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          gap: '1rem',
          alignItems: 'flex-start',
          height: '100%',
        }}
      >
        <div
          style={{
            padding: '0.75rem',
            background: opts.tone,
            borderRadius: 12,
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {opts.icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              marginBottom: '0.3rem',
              fontSize: '0.8rem',
              color: 'var(--muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {opts.title}
          </div>
          <div style={{ fontSize: '1rem', lineHeight: 1.5 }}>{opts.body}</div>
        </div>
      </div>
    );
    return opts.href ? (
      <a href={opts.href} style={{ textDecoration: 'none', color: 'inherit', display: 'block', height: '100%' }}>
        {inner}
      </a>
    ) : (
      inner
    );
  };

  return (
    <div className="container" style={{ padding: '1.25rem 1.25rem 2rem', minHeight: 'auto' }}>
      <div>
        <h1 className="page-hero-title" style={{ textAlign: 'center', marginBottom: '0.35rem' }}>
          Контакты
        </h1>
        <p style={{ textAlign: 'center', color: 'var(--muted)', marginBottom: '1.15rem', fontSize: '1rem', lineHeight: 1.45 }}>
          {siteName} — как с нами связаться и чем помочь
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
            gap: '0.85rem',
            marginBottom: '1.15rem',
          }}
        >
          {card({
            icon: <MapPin size={22} color="var(--accent)" />,
            tone: 'rgba(244,63,94,0.1)',
            title: 'Адрес',
            body: address ? (
              <>
                <div style={{ marginBottom: '0.55rem', fontWeight: 600 }}>{address}</div>
                <YandexDirections address={address} placeName={siteName} point={mapPoint} compact />
              </>
            ) : (
              <span style={{ color: 'var(--muted)' }}>Адрес уточняется</span>
            ),
          })}

          {card({
            icon: <Phone size={22} color="var(--primary)" />,
            tone: 'rgba(59,130,246,0.1)',
            title: 'Телефон',
            body: phone ? <strong>{phone}</strong> : <span style={{ color: 'var(--muted)' }}>Номер скоро появится</span>,
            href: phone ? `tel:${phone.replace(/\s/g, '')}` : undefined,
          })}

          {card({
            icon: <Mail size={22} color="#7c3aed" />,
            tone: 'rgba(139,92,246,0.1)',
            title: 'Поддержка портала',
            body: supportEmail ? (
              <>
                <div style={{ fontWeight: 600 }}>{supportEmail}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: 6 }}>
                  Вопросы по кабинету, заявкам, билетам и техническим сбоям
                </div>
              </>
            ) : (
              <span style={{ color: 'var(--muted)' }}>Email поддержки не указан</span>
            ),
            href: supportEmail ? `mailto:${supportEmail}` : undefined,
          })}

          {showGeneralEmail &&
            card({
              icon: <Mail size={22} color="var(--primary)" />,
              tone: 'rgba(59,130,246,0.1)',
              title: 'Общий email',
              body: <strong>{contactEmail}</strong>,
              href: `mailto:${contactEmail}`,
            })}

          {card({
            icon: <Clock size={22} color="#059669" />,
            tone: 'rgba(16,185,129,0.1)',
            title: 'Режим работы',
            body: <div style={{ whiteSpace: 'pre-line' }}>{workHours}</div>,
          })}
        </div>

        {hasOperator && (
          <div
            className="allow-select"
            style={{
              marginBottom: '1.5rem',
              padding: '1.15rem 1.25rem',
              borderRadius: 16,
              border: '1px solid rgba(15,23,42,0.08)',
              background: '#f8fafc',
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Оператор персональных данных (152-ФЗ)</div>
            {operatorName ? <div style={{ marginBottom: 4 }}>{operatorName}</div> : null}
            {operatorInn ? <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>ИНН: {operatorInn}</div> : null}
            {operatorOgrn ? <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>ОГРН: {operatorOgrn}</div> : null}
            {pdnEmail ? (
              <div style={{ marginTop: 8, fontSize: '0.9rem' }}>
                Вопросы по ПДн:{' '}
                <a href={`mailto:${pdnEmail}`} style={{ color: 'var(--primary)', fontWeight: 600 }}>
                  {pdnEmail}
                </a>
              </div>
            ) : null}
            <div style={{ marginTop: 10, fontSize: '0.85rem' }}>
              <Link href="/privacy" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                Политика конфиденциальности
              </Link>
              {' · '}
              <Link href="/rules" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                Правила сайта
              </Link>
            </div>
          </div>
        )}

        {address && (
          <div className="contacts-directions" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem', fontWeight: 700 }}>
              <Navigation size={18} color="var(--primary)" /> Как добраться
            </div>
            <YandexDirections
              address={address}
              placeName={siteName}
              point={mapPoint}
              showMap
              splitLayout
            />
          </div>
        )}

        <div className="contacts-two-col">
          <div className="glass contacts-col-card">
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <MessageCircle size={18} /> Чем мы можем помочь
            </h2>
            <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--muted)', lineHeight: 1.7, fontSize: '0.95rem' }}>
              <li>Запись на мероприятия и вопросы по билетам / QR</li>
              <li>Заявки в проекты и клубы</li>
              <li>Бронирование молодёжных пространств</li>
              <li>Документы, самоуправление и партнёрские инициативы</li>
            </ul>
            <div
              className="contacts-action-row"
              style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginTop: '0.85rem', alignItems: 'center' }}
            >
              <Link href="/events" className="btn btn-primary" style={{ padding: '0.5rem 0.85rem', fontSize: '0.85rem' }}>
                Афиша
              </Link>
              <Link href="/documents" className="btn btn-secondary" style={{ padding: '0.5rem 0.85rem', fontSize: '0.85rem', gap: 6, display: 'inline-flex', alignItems: 'center' }}>
                <FileText size={14} /> Документы
              </Link>
              <Link href="/spaces" className="btn btn-secondary" style={{ padding: '0.5rem 0.85rem', fontSize: '0.85rem' }}>
                Пространства
              </Link>
              <Link href="/rules" className="btn btn-secondary" style={{ padding: '0.5rem 0.85rem', fontSize: '0.85rem' }}>
                Правила
              </Link>
              <Link href="/faq" className="btn btn-secondary" style={{ padding: '0.5rem 0.85rem', fontSize: '0.85rem' }}>
                Вопросы
              </Link>
            </div>
          </div>

          <div className="glass contacts-col-card">
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.65rem' }}>Мы в социальных сетях</h2>
            {socials.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'center' }}>
                {socials.map((s) => (
                  <a
                    key={s.key}
                    href={(settings as any)[s.key + 'Link']}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      color: s.color,
                      fontWeight: 600,
                      fontSize: '0.88rem',
                      textDecoration: 'none',
                    }}
                  >
                    <SocialIconLink
                      kind={s.key as 'vk' | 'tg' | 'ok' | 'whatsapp' | 'rutube' | 'max'}
                      href={(settings as any)[s.key + 'Link']}
                      size={36}
                    />
                    {s.label}
                  </a>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.95rem' }}>
                Ссылки на соцсети появятся позже.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
