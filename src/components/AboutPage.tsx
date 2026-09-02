import Link from 'next/link';
import { Calendar, MapPin, Sparkles, Ticket, Users } from 'lucide-react';
import { sanitizeCmsHtml } from '@/lib/sanitize-html';
import { applySitePlaceholders } from '@/lib/site-identity-shared';
import type { ReactNode } from 'react';
import AboutTeamGrid, { type AboutTeamMember } from '@/components/AboutTeamGrid';

type Page = {
  title: string;
  content: string;
  images: string;
};

type Props = {
  page: Page;
  siteName: string;
  publicOrigin?: string;
  members: AboutTeamMember[];
  teamRequiresAuth?: boolean;
  teamSlot?: ReactNode;
};

const HIGHLIGHTS = [
  {
    icon: Ticket,
    title: 'Билеты и вход',
    text: 'Запись на события, QR на входе, отметка прихода и мбаллы за активность.',
  },
  {
    icon: Users,
    title: 'Проекты и клубы',
    text: 'Заявки, команды, чат участников и приглашения друзей.',
  },
  {
    icon: Calendar,
    title: 'Афиша и пространства',
    text: 'Календарь мероприятий и бронирование площадок Центра.',
  },
  {
    icon: MapPin,
    title: 'Куда сходить',
    text: 'Гид по пляжам, горам, паркам и смотровым точкам Сочи.',
  },
  {
    icon: Sparkles,
    title: 'Профиль и достижения',
    text: 'Достижения, портфолио, рейтинги авторитета и социума, эко-косметика.',
  },
] as const;

export default function AboutPage({ page, siteName, publicOrigin = '', members, teamRequiresAuth, teamSlot }: Props) {
  const cover = page.images?.trim() || '/brand/hero-cover.jpg';
  const identity = {
    siteName,
    publicOrigin,
    shortName: siteName,
    host: '',
  };
  const safeContent = sanitizeCmsHtml(applySitePlaceholders(page.content, identity));
  const lead = applySitePlaceholders(
    `{{SITE_NAME}} — проекты, клубы, афиша, пространства и сообщество в одном месте.`,
    identity
  );

  return (
    <div className="about-page">
      <section
        className="about-hero"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(12,26,34,0.28) 0%, rgba(12,26,34,0.72) 55%, rgba(12,26,34,0.9) 100%), url(${cover})`,
        }}
      >
        <div className="about-hero__inner cms-page-shell">
          <h1 className="about-hero__title">{page.title}</h1>
          <p className="about-hero__lead">{lead}</p>
          <div className="about-hero__cta">
            <Link href="/events" className="btn btn-primary">
              Афиша
            </Link>
            <Link href="/contacts" className="btn btn-secondary about-hero__cta-secondary">
              Контакты
            </Link>
          </div>
        </div>
      </section>

      <div className="cms-page-shell about-page__body">
        <section className="about-section" aria-labelledby="about-highlights-title">
          <h2 id="about-highlights-title" className="about-section__title">
            Что есть на портале
          </h2>
          <p className="about-section__sub">Коротко о главных возможностях — без лишней каши.</p>
          <ul className="about-highlights">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="about-highlight">
                <span className="about-highlight__icon" aria-hidden>
                  <item.icon size={18} />
                </span>
                <div className="about-highlight__text">
                  <strong>{item.title}</strong>
                  <span>{item.text}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="about-section about-section--prose" aria-label="Подробнее">
          <div
            className="prose about-prose cms-page-prose"
            dangerouslySetInnerHTML={{ __html: safeContent }}
          />
        </section>

        {teamSlot
          ? teamSlot
          : teamRequiresAuth ? (
          <section className="about-section yp-surface" style={{ padding: '1.25rem' }}>
            <h2 className="about-section__title">Команда портала</h2>
            <p className="about-section__sub" style={{ marginBottom: '1rem' }}>
              Список сотрудников с именами и фото доступен только авторизованным пользователям.
            </p>
            <Link href="/login?callbackUrl=%2Fp%2Fabout" className="btn btn-primary">
              Войти, чтобы увидеть команду
            </Link>
          </section>
        ) : members.length > 0 ? (
          <AboutTeamGrid members={members} />
        ) : null}

        <section className="about-section about-links" aria-label="Быстрые ссылки">
          <h2 className="about-section__title">Дальше по сайту</h2>
          <div className="about-links__row">
            <Link href="/projects">Проекты</Link>
            <Link href="/clubs">Клубы</Link>
            <Link href="/spaces">Пространства</Link>
            <Link href="/places">Куда сходить</Link>
            <Link href="/gallery">Галерея</Link>
            <Link href="/contacts">Контакты</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
