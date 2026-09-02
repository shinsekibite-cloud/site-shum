import HomeServiceHero from '@/components/HomeServiceHero';
import HomeGallery from '@/components/HomeGallery';
import { getSiteIdentity } from '@/lib/site-identity';
import { clubCover, projectCover, spaceCover } from '@/lib/theme-covers';
import { getHomeCatalog } from '@/lib/home-catalog';
import { formatRuDate } from '@/lib/format-date';
import { getModuleFlags } from '@/lib/module-flags';
import HomeGalleryAuth from '@/components/HomeGalleryAuth';
import AuthAfishaSection from '@/components/AuthAfishaSection';
import FreeNowSpaces from '@/components/FreeNowSpaces';
import UpcomingEvents from '@/components/UpcomingEvents';
import GovWidgetsSection from '@/components/GovWidgetsSection';
import { ArrowRight, Calendar, MapPin, Users, FileText, Phone } from 'lucide-react';
import NewsCoverImage from '@/components/NewsCoverImage';
import EntityCoverImage from '@/components/EntityCoverImage';
import NewsMediaBadge from '@/components/NewsMediaBadge';
import Link from 'next/link';
import { Metadata } from 'next';
import GuestAuthPrompt from '@/components/GuestAuthPrompt';

export async function generateMetadata(): Promise<Metadata> {
  const { siteName, publicOrigin } = await getSiteIdentity();
  return {
    title: { absolute: `${siteName} | Официальный портал` },
    description: `Официальный портал ${siteName}. Участвуй в проектах, находи единомышленников в клубах и бронируй пространства.`,
    alternates: { canonical: publicOrigin },
  };
}

export const revalidate = 60;
// Do not force-static: admin hero mediaKind must apply after deploy without a
// long stale bake that shows photo while DB says video.

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export default async function Home() {
  const [{ latestProjects, latestClubs, latestSpaces, latestNews, siteSettings }, modules] =
    await Promise.all([getHomeCatalog(), getModuleFlags()]);

  const { siteName } = await getSiteIdentity();
  const heroUrl = (siteSettings?.heroImageUrl || '').trim() || '/brand/hero-cover.jpg';
  // Both assets may be stored; display mode is exclusive (image | video).
  const heroVideo = (siteSettings?.heroVideoUrl || '').trim() || null;
  const storedKind = (siteSettings?.heroMediaKind || '').trim().toLowerCase();
  // Strictly follow admin radio: video only when kind is video AND a file exists.
  const heroMediaKind: 'image' | 'video' =
    storedKind === 'video' && Boolean(heroVideo) ? 'video' : 'image';
  const galleryPublic =
    modules.gallery !== false &&
    Boolean(siteSettings?.galleryHomepageEnabled) &&
    Boolean(siteSettings?.galleryPublicEnabled);
  const galleryAuthOnly =
    modules.gallery !== false &&
    Boolean(siteSettings?.galleryHomepageEnabled) &&
    !siteSettings?.galleryPublicEnabled;

  const showProjects = modules.projects !== false;
  const showClubs = modules.clubs !== false;
  const showSpaces = modules.spaces !== false;
  const showEvents = modules.events !== false;
  const showNews = modules.news !== false;
  const showDocuments = modules.documents !== false;

  const heroPrimary = showSpaces
    ? { href: '/coworking', label: 'Записаться в коворкинг' }
    : showEvents
      ? { href: '/events', label: 'Записаться на событие' }
      : showProjects
        ? { href: '/projects', label: 'Проекты' }
        : null;
  const heroSecondary = showSpaces
    ? { href: '/spaces?filter=free_today', label: 'Свободные залы' }
    : showEvents
      ? { href: '/events', label: 'Афиша' }
      : null;

  return (
    <div className="home-page">
      {heroMediaKind === 'image' ? (
        <link rel="preload" as="image" href={heroUrl} fetchPriority="high" />
      ) : null}
      <HomeServiceHero
        siteName={siteName}
        imageUrl={heroUrl}
        videoUrl={heroVideo}
        mediaKind={heroMediaKind === 'video' && heroVideo ? 'video' : 'image'}
        primary={heroPrimary}
        secondary={heroSecondary}
        faceUrls={latestSpaces.slice(0, 3).map((s, i) => spaceCover(s, i))}
      />

      <div className="container home-sections">
        {showSpaces ? <FreeNowSpaces /> : null}

        {showProjects && (
        <section className="home-section">
          <div className="home-section-head">
            <div>
              <h2 className="home-section-title">Свежие проекты</h2>
              <p className="home-section-sub">Актуальные инициативы, к которым можно присоединиться</p>
            </div>
            <Link href="/projects" className="home-section-link">
              Смотреть все <ArrowRight size={18} />
            </Link>
          </div>
          {latestProjects.length === 0 ? (
            <p className="home-empty">Пока нет опубликованных проектов.</p>
          ) : (
            <div className="grid-cards">
              {latestProjects.map((project, idx) => (
                <Link key={project.id} href={`/projects/${encodeURIComponent(project.id)}`} className="catalog-card">
                  <div className="catalog-img-wrap" style={{ position: 'relative' }}>
                    <EntityCoverImage
                      src={projectCover(project, idx)}
                      alt={project.title}
                      fallback={projectCover(project, idx + 3)}
                      className="catalog-img"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                  </div>
                  <div className="catalog-card-body">
                    <h3 className="catalog-card-title">{project.title}</h3>
                    <p className="line-clamp-3 catalog-card-text">{stripHtml(project.description)}</p>
                    <div className="catalog-card-meta">
                      <span>Открыт для заявок</span>
                      <span className="catalog-card-more">Подробнее</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
        )}

        {showClubs && (
        <section className="home-section">
          <div className="home-section-head">
            <div>
              <h2 className="home-section-title">Клубы по интересам</h2>
              <p className="home-section-sub">Найди сообщество и занимайся тем, что близко</p>
            </div>
            <Link href="/clubs" className="home-section-link">
              Все клубы <ArrowRight size={18} />
            </Link>
          </div>
          {latestClubs.length === 0 ? (
            <p className="home-empty">Клубы скоро появятся в каталоге.</p>
          ) : (
            <div className="grid-cards">
              {latestClubs.map((club, idx) => (
                <Link key={club.id} href={`/clubs/${encodeURIComponent(club.id)}`} className="catalog-card">
                  <div className="catalog-img-wrap" style={{ position: 'relative' }}>
                    <EntityCoverImage
                      src={clubCover(club, idx)}
                      alt={club.title}
                      fallback={clubCover(club, idx + 3)}
                      className="catalog-img"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                  </div>
                  <div className="catalog-card-body">
                    <h3 className="catalog-card-title">{club.title}</h3>
                    <p className="line-clamp-3 catalog-card-text">{stripHtml(club.description)}</p>
                    <div className="catalog-card-meta">
                      <span>
                        <Users size={16} /> Открыт для заявок
                      </span>
                      <span className="catalog-card-more">Подробнее</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
        )}

        {showSpaces && (
        <section className="home-section">
          <div className="home-section-head">
            <div>
              <h2 className="home-section-title">Пространства</h2>
              <p className="home-section-sub">Площадки для встреч, репетиций и своих мероприятий</p>
            </div>
            <Link href="/spaces" className="home-section-link">
              Все пространства <ArrowRight size={18} />
            </Link>
          </div>
          {latestSpaces.length === 0 ? (
            <p className="home-empty">Свободных пространств пока нет в каталоге.</p>
          ) : (
            <div className="grid-cards">
              {latestSpaces.map((space, idx) => (
                <article key={space.id} className="catalog-card catalog-card--hit" style={{ position: 'relative' }}>
                  <Link
                    href={`/spaces/${encodeURIComponent(space.id)}`}
                    className="catalog-card__hit-link"
                    aria-label={space.title}
                  />
                  <div className="catalog-img-wrap" style={{ position: 'relative' }}>
                    <EntityCoverImage
                      src={spaceCover(space, idx)}
                      alt={space.title}
                      fallback={spaceCover(space, idx + 3)}
                      className="catalog-img"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                  </div>
                  <div className="catalog-card-body">
                    <h3 className="catalog-card-title">{space.title}</h3>
                    <p className="line-clamp-3 catalog-card-text">
                      {space.description ? stripHtml(space.description) : 'Молодёжная площадка для ваших событий'}
                    </p>
                    <div className="catalog-card-meta">
                      <span>
                        <MapPin size={16} /> {space.address || `до ${space.capacity} чел.`}
                      </span>
                      <span className="catalog-card-more">Подробнее</span>
                    </div>
                    <div className="catalog-card__interactive" style={{ marginTop: '0.65rem' }}>
                      <GuestAuthPrompt
                        href={`/spaces/${encodeURIComponent(space.id)}/book`}
                        className="btn btn-primary"
                        title="Забронировать зал"
                        asButton
                      >
                        Забронировать
                      </GuestAuthPrompt>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        )}

        {showEvents && (
        <section className="home-section">
          <div className="home-section-head">
            <div>
              <h2 className="home-section-title">Ближайшие мероприятия</h2>
              <p className="home-section-sub">События в молодёжных пространствах города</p>
            </div>
            <Link href="/events" className="home-section-link">
              Календарь <ArrowRight size={18} />
            </Link>
          </div>
          {siteSettings?.publicEventsVisibility ? (
            <UpcomingEvents hideTitle />
          ) : (
            <AuthAfishaSection hideTitle />
          )}
        </section>
        )}

        {galleryPublic ? (
          <HomeGallery
            enabled
            orgGalleryJson={siteSettings?.orgGalleryJson}
            title="Деятельность портала"
          />
        ) : galleryAuthOnly ? (
          <HomeGalleryAuth homepageEnabled title="Деятельность портала" />
        ) : null}

        {showNews && (
        <section className="home-section">
          <div className="home-section-head">
            <div>
              <h2 className="home-section-title">Новости</h2>
              <p className="home-section-sub">Что происходит в молодёжной повестке</p>
            </div>
            <Link href="/news" className="home-section-link">
              Все новости <ArrowRight size={18} />
            </Link>
          </div>
          {latestNews.length === 0 ? (
            <p className="home-empty">Новостей пока нет — загляните позже.</p>
          ) : (
            <div className="grid-cards">
              {latestNews.map((item) => {
                const when = item.publishedAt || item.createdAt;
                const title = item.title?.trim() || stripHtml(item.text).slice(0, 80) || 'Новость';
                return (
                  <Link key={item.id} href={`/news/${item.id}`} className="catalog-card">
                    <div className="catalog-img-wrap" style={{ position: 'relative' }}>
                      <NewsCoverImage
                        src={item.imageUrl}
                        alt={title}
                        className="catalog-img"
                        sizes="(max-width: 768px) 100vw, 33vw"
                      />
                      <NewsMediaBadge hasVideo={!!item.videoEmbedUrl} />
                    </div>
                    <div className="catalog-card-body">
                      <h3 className="catalog-card-title">{title}</h3>
                      <p className="line-clamp-3 catalog-card-text">{stripHtml(item.text)}</p>
                      <div className="catalog-card-meta">
                        <span>
                          <Calendar size={16} />{' '}
                          {formatRuDate(when, { day: 'numeric', month: 'long' })}
                        </span>
                        <span className="catalog-card-more">Читать</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
        )}

        <GovWidgetsSection
          enabled={Boolean(siteSettings?.govWidgetsEnabled)}
          title={siteSettings?.govWidgetsTitle || 'Госуслуги'}
          widgetsJson={siteSettings?.govWidgetsJson}
          variant="compact"
        />

        <section className="home-cta">
          <h2 className="home-cta-title">Готовы начать?</h2>
          <p className="home-cta-text">
            Документы и контакты — если нужна помощь с заявкой или бронированием.
          </p>
          <div className="home-cta-actions">
            {showDocuments ? (
              <Link href="/documents" className="btn btn-primary home-hero-btn">
                <FileText size={18} style={{ marginRight: 8 }} /> Документы
              </Link>
            ) : null}
            <Link href="/contacts" className="btn btn-secondary home-hero-btn">
              <Phone size={18} style={{ marginRight: 8 }} /> Контакты
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
