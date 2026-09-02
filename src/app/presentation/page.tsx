import type { Metadata } from 'next';
import Link from 'next/link';
import { getSiteIdentity } from '@/lib/site-identity';

export async function generateMetadata(): Promise<Metadata> {
  const { siteName } = await getSiteIdentity();
  return {
    title: 'Презентация портала',
    description: `Две версии презентации ${siteName}: полный функционал и необходимый набор.`,
  };
}

export default async function PresentationPage() {
  const { siteName } = await getSiteIdentity();

  return (
    <main className="container" style={{ paddingTop: '2.5rem', paddingBottom: '4rem', maxWidth: 960 }}>
      <p
        style={{
          margin: 0,
          color: 'var(--muted, #6b7280)',
          fontSize: '0.85rem',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          fontWeight: 700,
        }}
      >
        {siteName}
      </p>
      <h1
        style={{
          fontFamily: 'var(--font-unbounded), sans-serif',
          fontSize: 'clamp(1.75rem, 4vw, 2.6rem)',
          lineHeight: 1.15,
          margin: '0.5rem 0 0.75rem',
        }}
      >
        Презентация функционала портала
      </h1>
      <p style={{ fontSize: '1.05rem', lineHeight: 1.55, maxWidth: '42rem', marginBottom: '1.75rem' }}>
        Две версии со слайдами, полноэкранным режимом и видео со звуком. Листайте стрелками, свайпом или
        кнопками — управление не перекрывается панелью браузера.
      </p>

      <div
        style={{
          display: 'grid',
          gap: '1rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          marginBottom: '2rem',
        }}
      >
        <article
          style={{
            borderRadius: 16,
            border: '1px solid rgba(0,0,0,0.08)',
            padding: '1.25rem 1.3rem',
            background: 'linear-gradient(160deg, #fff, #f3fbf8)',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: '0.75rem',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
            }}
          >
            Версия 1
          </p>
          <h2 style={{ margin: '0.4rem 0 0.55rem', fontSize: '1.35rem' }}>Полный функционал</h2>
          <p style={{ margin: '0 0 1rem', color: 'var(--muted)', lineHeight: 1.45 }}>
            Полный обзор возможностей портала для молодёжи: кабинет, события, сообщества и сервисы Центра.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem' }}>
            <Link href="/presentation/view/full" className="btn btn-primary" style={{ textDecoration: 'none' }}>
              Открыть слайды
            </Link>
            <a href="/presentation/deck/tour.mp4" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
              Видео со звуком
            </a>
            <a
              href="/downloads/youngportal-presentation-full-latest.tgz"
              className="btn btn-secondary"
              style={{ textDecoration: 'none' }}
              download
            >
              Скачать .tgz
            </a>
          </div>
        </article>

        <article
          style={{
            borderRadius: 16,
            border: '1px solid rgba(0,0,0,0.08)',
            padding: '1.25rem 1.3rem',
            background: 'linear-gradient(160deg, #fff, #fff8f1)',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: '0.75rem',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
            }}
          >
            Версия 2
          </p>
          <h2 style={{ margin: '0.4rem 0 0.55rem', fontSize: '1.35rem' }}>Необходимый</h2>
          <p style={{ margin: '0 0 1rem', color: 'var(--muted)', lineHeight: 1.45 }}>
            О нас + команда, проекты (фиксированный список), гранты, Добро.Центр, клубы, самоуправление,
            пространства с бронью, документы, контакты, новости.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem' }}>
            <Link
              href="/presentation/view/necessary"
              className="btn btn-primary"
              style={{ textDecoration: 'none' }}
            >
              Открыть слайды
            </Link>
            <a
              href="/presentation/necessary/tour.mp4"
              className="btn btn-secondary"
              style={{ textDecoration: 'none' }}
            >
              Видео со звуком
            </a>
            <a
              href="/downloads/youngportal-presentation-necessary-latest.tgz"
              className="btn btn-secondary"
              style={{ textDecoration: 'none' }}
              download
            >
              Скачать .tgz
            </a>
          </div>
        </article>
      </div>

      <div
        style={{
          borderRadius: 16,
          overflow: 'hidden',
          border: '1px solid rgba(0,0,0,0.08)',
          marginBottom: '1.5rem',
          background: '#061018',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/presentation/deck/media/cover.jpg"
          alt="Обложка презентации"
          style={{ display: 'block', width: '100%', maxHeight: 320, objectFit: 'cover' }}
        />
      </div>

      <p style={{ color: 'var(--muted)', lineHeight: 1.5, margin: 0 }}>
        Контакты Центра: 8 (862) 253-32-37 · cddim_sochi@mail.ru
      </p>
    </main>
  );
}
