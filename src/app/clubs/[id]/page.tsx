import { ArrowLeft, Calendar, CheckCircle, ExternalLink, MapPin, Send, Users } from 'lucide-react';
import ContentRenderer from '@/components/ContentRenderer';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import ApplyButton from '@/components/ApplyButton';
import ShareButton from '@/components/ShareButton';
import PhotoGallery from '@/components/PhotoGallery';
import { Metadata } from 'next';
import {
  parseClubTags,
  parseGalleryJson,
  resolveClubSignupUrl,
  signupCtaLabel,
  stripHtml,
  stripSignupLinesFromHtml,
} from '@/lib/clubs';
import YandexDirections from '@/components/YandexDirections';
import EntityPlanPanel, { EntityPlanSummary } from '@/components/entity/EntityPlanPanel';
import { EntityApplyStatus, EntityMembersPanel, EntityCuratorBlock } from '@/components/entity/EntityAuthIslands';
import ViewBeacon from '@/components/ViewBeacon';
import { staticClubParams } from '@/lib/generate-public-static-params';
import { decodeRouteParam } from '@/lib/route-id';
import { clubCover } from '@/lib/theme-covers';

export const revalidate = 60;
export const dynamic = 'force-static';
export const dynamicParams = true;

export async function generateStaticParams() {
  return staticClubParams();
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const resolvedParams = await params;
  const id = decodeRouteParam(resolvedParams.id);
  const club = await prisma.club.findUnique({ where: { id } });
  if (!club || club.status === 'INACTIVE') return { title: 'Клуб не найден' };
  const desc = stripHtml(club.description).slice(0, 160);
  const { withSiteBrand, getSiteIdentity } = await import('@/lib/site-identity');
  const { siteName } = await getSiteIdentity();
  return {
    title: withSiteBrand(club.title, siteName),
    description: desc,
    openGraph: {
      title: club.title,
      description: desc,
      images: club.image ? [club.image] : [],
    },
  };
}

export default async function ClubDetail({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const id = decodeRouteParam(resolvedParams.id);

  const club = await prisma.club.findUnique({
    where: { id },
    include: {
      _count: {
        select: { applications: { where: { status: 'APPROVED' } } },
      },
    },
  });

  if (!club || club.status === 'INACTIVE') notFound();

  const galleryImages = parseGalleryJson(club.gallery);
  const tags = parseClubTags(club.tags);
  const memberCount = club._count.applications;
  const signupUrl = resolveClubSignupUrl(club);
  const descriptionHtml = stripSignupLinesFromHtml(club.description, signupUrl);

  const related = await prisma.club.findMany({
    where: {
      status: 'ACTIVE',
      id: { not: club.id },
    },
    orderBy: { updatedAt: 'desc' },
    take: 3,
    select: { id: true, title: true, image: true, meetingSchedule: true },
  });

  const open = club.status !== 'COMPLETED';
  const publicCuratorContact =
    club.curatorContact && club.curatorContactPublic !== false ? club.curatorContact : null;


  return (
    <div style={{ minHeight: 'auto', paddingBottom: '4rem', backgroundColor: '#f8fafc' }}>
      <div
        className="club-hero"
        style={{
          backgroundImage: `url(${clubCover(club, 0)})`,
        }}
      >
        <div className="club-hero__shade" aria-hidden />

        <div className="container club-hero__top">
          <Link href="/clubs" className="club-hero__back">
            <ArrowLeft size={18} /> К клубам
          </Link>
          <ShareButton title={club.title} />
        </div>

        <div className="container club-hero__bottom">
          <div className="club-hero__info">
            <h1 className="club-hero__title">{club.title.replace(/^Клуб:\s*/i, '')}</h1>
            <ViewBeacon type="CLUB" id={club.id} initialCount={club.viewCount ?? 0} style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '0.5rem' }} />
            <div className="club-hero__meta">
              {club.meetingSchedule && (
                <span>
                  <Calendar size={15} /> {club.meetingSchedule}
                </span>
              )}
              {club.meetingPlace && (
                <span>
                  <MapPin size={15} /> {club.meetingPlace}
                </span>
              )}
              <span>
                <Users size={15} /> {memberCount} в клубе
              </span>
              {open ? (
                <span className="club-hero__status is-open">
                  <CheckCircle size={15} /> Набор открыт
                </span>
              ) : (
                <span className="club-hero__status is-closed">Набор закрыт</span>
              )}
            </div>
            <EntityPlanSummary goal={club.goal} mission={club.mission} />
          </div>

          {open && (
            <div className="club-hero-actions">
              {signupUrl ? (
                <a
                  href={signupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary club-hero-actions__btn"
                >
                  {/t\.me|telegram/i.test(signupUrl) ? <Send size={16} /> : <ExternalLink size={16} />}
                  {signupCtaLabel(signupUrl)}
                </a>
              ) : null}
              <EntityApplyStatus kind="club" id={club.id} open={open} />
            </div>
          )}
        </div>
      </div>

      <div className="container" style={{ marginTop: '1.25rem', padding: '0 clamp(1rem, 3vw, 1.5rem)' }}>
        {tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: '1rem' }}>
            {tags.map((t) => (
              <span
                key={t}
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: '#1d4ed8',
                  background: '#fff',
                  border: '1px solid rgba(37,99,235,0.2)',
                  padding: '0.3rem 0.7rem',
                  borderRadius: 999,
                }}
              >
                {t.startsWith('#') ? t : `#${t}`}
              </span>
            ))}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.6fr) minmax(240px, 0.9fr)',
            gap: '1rem',
            alignItems: 'start',
          }}
          className="club-detail-grid"
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <EntityPlanPanel
              entityKind="club"
              entityTitle={club.title.replace(/^Клуб:\s*/i, '')}
              goal={club.goal}
              mission={club.mission}
              roadmapJson={club.roadmapJson}
              rolesJson={club.rolesJson}
              tasksJson={club.tasksJson}
            />

            <div
              style={{
                background: '#fff',
                padding: 'clamp(1.25rem, 4vw, 2rem)',
                borderRadius: 16,
                border: '1px solid rgba(15,23,42,0.06)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
              }}
            >
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '1rem' }}>О клубе</h2>
            <div style={{ fontSize: '1.05rem', lineHeight: 1.75, color: '#334155' }}>
              <ContentRenderer template={club.template} content={descriptionHtml} />
              {signupUrl ? (
                <div style={{ marginTop: '1.15rem' }}>
                  <a
                    href={signupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '0.75rem 1.2rem',
                      fontSize: '0.95rem',
                    }}
                  >
                    {/t\.me|telegram/i.test(signupUrl) ? <Send size={16} /> : <ExternalLink size={16} />}
                    {signupCtaLabel(signupUrl)}
                  </a>
                </div>
              ) : null}
            </div>
            {galleryImages.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 750, marginBottom: '0.75rem' }}>Галерея</h3>
                <PhotoGallery images={galleryImages} />
              </div>
            )}
            </div>
          </div>

          <aside style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div
              style={{
                background: '#fff',
                padding: '1.1rem 1.15rem',
                borderRadius: 16,
                border: '1px solid rgba(15,23,42,0.06)',
              }}
            >
              <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.75rem' }}>Встречи</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, color: '#475569', fontSize: '0.92rem' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Calendar size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                  <span>{club.meetingSchedule || 'Расписание уточняется у куратора'}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <MapPin size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                  <span>{club.meetingPlace || 'Место встреч сообщат после вступления'}</span>
                </div>
                {club.meetingPlace && (
                  <div style={{ marginTop: 4 }}>
                    <YandexDirections address={club.meetingPlace} placeName={club.title} compact />
                  </div>
                )}
              </div>
            </div>

            <EntityCuratorBlock
              clubId={club.id}
              curatorName={club.curatorName}
              publicContact={publicCuratorContact}
            />

            <EntityMembersPanel
              kind="club"
              id={club.id}
              title={club.title}
              memberCount={memberCount}
              open={open}
              showApply={false}
            />

            {open && (
              <div
                id="club-apply"
                style={{
                  background: 'linear-gradient(145deg, rgba(37,99,235,0.08), #fff 55%)',
                  padding: '1.1rem 1.15rem',
                  borderRadius: 16,
                  border: '1px solid rgba(37,99,235,0.15)',
                }}
              >
                <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.35rem' }}>Хотите вступить?</h3>
                <p style={{ margin: '0 0 0.85rem', color: 'var(--muted)', fontSize: '0.88rem', lineHeight: 1.45 }}>
                  {signupUrl
                    ? 'Можно записаться по внешней ссылке или оставить заявку на сайте — куратор ответит в личном кабинете.'
                    : 'Оставьте короткое сообщение — так куратору проще вас принять. Заявку можно подать только один раз.'}
                </p>
                {signupUrl ? (
                  <a
                    href={signupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      width: '100%',
                      marginBottom: '0.65rem',
                      padding: '0.75rem 1rem',
                    }}
                  >
                    {/t\.me|telegram/i.test(signupUrl) ? <Send size={16} /> : <ExternalLink size={16} />}
                    {signupCtaLabel(signupUrl)}
                  </a>
                ) : null}
                <ApplyButton clubId={club.id} withMessage />
              </div>
            )}
          </aside>
        </div>

        {related.length > 0 && (
          <div style={{ marginTop: '1.75rem' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.85rem' }}>Ещё клубы</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '0.75rem' }}>
              {related.map((r) => (
                <Link
                  key={r.id}
                  href={`/clubs/${encodeURIComponent(r.id)}`}
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'center',
                    padding: '0.75rem',
                    borderRadius: 14,
                    background: '#fff',
                    border: '1px solid rgba(15,23,42,0.06)',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      flexShrink: 0,
                      background: r.image
                        ? `center/cover url(${r.image})`
                        : 'linear-gradient(135deg,#2563eb,#0ea5e9)',
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 750, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.title.replace(/^Клуб:\s*/i, '')}
                    </div>
                    {r.meetingSchedule && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>{r.meetingSchedule}</div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 860px) {
          .club-detail-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
