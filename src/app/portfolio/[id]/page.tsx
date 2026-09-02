'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Download,
  ExternalLink,
  FileText,
  MapPin,
  Printer,
  X,
} from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';
import { ACHIEVEMENTS, CATEGORY_META, groupByAchievementCategory, TIER_META } from '@/lib/achievements';

type Cert = {
  title: string;
  issuer?: string | null;
  issuedAt?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
};

type Payload = {
  headline: string | null;
  summary: string | null;
  coverImage: string | null;
  sections: { title: string; body: string; type: string; mediaUrl?: string | null }[];
  certificates: Cert[];
  achievementCodes: string[];
  user: {
    name: string | null;
    nickname?: string | null;
    city?: string | null;
    image?: string | null;
    publicCode?: string | null;
  };
};

function isImageCert(c: Cert) {
  if (!c.fileUrl) return false;
  if (c.mimeType && /^image\//i.test(c.mimeType)) return true;
  return /\.(jpe?g|png|webp|gif)(\?|$)/i.test(c.fileUrl) || /\.(jpe?g|png|webp|gif)$/i.test(c.fileName || '');
}

export default function PortfolioPublicPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [payload, setPayload] = useState<Payload | null>(null);
  const [canDownload, setCanDownload] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<Cert | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/portfolio/${encodeURIComponent(id)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.message || 'Не найдено');
        if (!cancelled) {
          setPayload(j.payload);
          setCanDownload(Boolean(j.canDownload));
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const downloadHref = useMemo(
    () => `/api/portfolio/${encodeURIComponent(id)}/download?mode=download`,
    [id]
  );
  const printHref = useMemo(
    () => `/api/portfolio/${encodeURIComponent(id)}/download?mode=print`,
    [id]
  );

  if (loading) {
    return <div className="cms-page-shell portfolio-page" style={{ padding: '3rem 1rem' }}>Загрузка портфолио…</div>;
  }
  if (error || !payload) {
    return (
      <div className="cms-page-shell portfolio-page" style={{ padding: '3rem 1rem' }}>
        <h1>Портфолио</h1>
        <p style={{ color: 'var(--muted)' }}>{error || 'Не найдено'}</p>
        <Link href="/">На главную</Link>
      </div>
    );
  }

  const name = payload.user.nickname || payload.user.name || 'Участник';
  const profileHref = `/u/${payload.user.publicCode || id}`;

  return (
    <div className="portfolio-page">
      <section
        className="portfolio-hero"
        style={
          payload.coverImage
            ? {
                backgroundImage: `linear-gradient(180deg, rgba(15,23,42,0.2), rgba(15,23,42,0.88)), url(${payload.coverImage})`,
              }
            : undefined
        }
      >
        <div className="cms-page-shell portfolio-hero__inner">
          <UserAvatar
            name={name}
            image={payload.user.image}
            size={88}
            style={{ border: '3px solid rgba(255,255,255,0.9)', boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}
          />
          <div className="portfolio-hero__text">
            <p className="portfolio-hero__eyebrow">Портфолио</p>
            <h1>{name}</h1>
            {payload.headline ? <p className="portfolio-hero__headline">{payload.headline}</p> : null}
            {payload.user.city ? (
              <p className="portfolio-hero__city">
                <MapPin size={14} aria-hidden /> {payload.user.city}
              </p>
            ) : null}
          </div>
          <div className="portfolio-hero__actions">
            <Link href={profileHref} className="btn btn-secondary portfolio-action-btn">
              <ExternalLink size={16} /> Профиль
            </Link>
            {canDownload ? (
              <>
                <a
                  href={downloadHref}
                  className="btn btn-primary portfolio-action-btn"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download size={16} /> Скачать
                </a>
                <a
                  href={printHref}
                  className="btn btn-secondary portfolio-action-btn"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Printer size={16} /> Печать
                </a>
              </>
            ) : null}
          </div>
        </div>
      </section>

      <div className="cms-page-shell portfolio-body">
        {canDownload ? (
          <p className="portfolio-doc-hint">
            <strong>Скачать</strong> — сохраняет подписанный HTML с картинками грамот (в т.ч. из PDF).{' '}
            <strong>Печать</strong> — сразу открывает диалог печати. В диалоге можно выбрать «Сохранить как PDF».
          </p>
        ) : null}

        {payload.summary ? <p className="portfolio-summary">{payload.summary}</p> : null}

        <div className="portfolio-sections">
          {payload.sections.map((s, i) => (
            <article key={`${s.title}-${i}`} className="glass portfolio-section">
              <h2>{s.title}</h2>
              <div className="portfolio-section__body">{s.body}</div>
              {s.mediaUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.mediaUrl} alt="" className="portfolio-section__media" />
              ) : null}
            </article>
          ))}
        </div>

        {payload.certificates.length > 0 ? (
          <section className="portfolio-block">
            <div className="portfolio-block__head">
              <h2>Грамоты, сертификаты, дипломы</h2>
              <span>{payload.certificates.length}</span>
            </div>
            <div className="portfolio-certs">
              {payload.certificates.map((c, i) => {
                const img = isImageCert(c);
                return (
                  <article key={`${c.title}-${i}`} className="portfolio-cert glass">
                    {img && c.fileUrl ? (
                      <button
                        type="button"
                        className="portfolio-cert__preview"
                        onClick={() => setLightbox(c)}
                        aria-label={`Открыть превью: ${c.title}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={c.fileUrl} alt={c.title} />
                      </button>
                    ) : (
                      <div className="portfolio-cert__preview is-file">
                        <FileText size={28} />
                        <span>{c.fileUrl ? 'PDF / файл' : 'Без файла'}</span>
                      </div>
                    )}
                    <div className="portfolio-cert__meta">
                      <strong>{c.title}</strong>
                      <div>
                        {[c.issuer, c.issuedAt?.slice(0, 10)].filter(Boolean).join(' · ') || '—'}
                      </div>
                      {c.fileUrl ? (
                        <a href={c.fileUrl} target="_blank" rel="noreferrer">
                          Открыть файл
                        </a>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {payload.achievementCodes.length > 0 ? (
          <section className="portfolio-block">
            <div className="portfolio-block__head">
              <h2>
                <Award size={18} aria-hidden /> Достижения портала
              </h2>
              <span>{payload.achievementCodes.length}</span>
            </div>
            <div className="portfolio-ach-groups">
              {groupByAchievementCategory(
                payload.achievementCodes.map((code) => ({ code }))
              ).map((group) => (
                <div key={group.category} className="portfolio-ach-group">
                  <h3>
                    {CATEGORY_META[group.category].label}
                    <em>{group.items.length}</em>
                  </h3>
                  <div className="portfolio-achs">
                    {group.items.map(({ code }) => {
                      const def = ACHIEVEMENTS.find((a) => a.code === code);
                      const tier = def ? TIER_META[def.tier] : null;
                      return (
                        <div
                          key={code}
                          className="portfolio-ach"
                          title={def?.description || code}
                          style={
                            tier
                              ? {
                                  borderColor: `${tier.color}33`,
                                  background: `linear-gradient(135deg, ${tier.bg}, #fff 70%)`,
                                }
                              : undefined
                          }
                        >
                          <span className="portfolio-ach__tier" style={tier ? { color: tier.color } : undefined}>
                            {def?.tier === 'gold' ? '★' : def?.tier === 'silver' ? '◆' : '●'}
                          </span>
                          <span>{def?.title || code}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {lightbox?.fileUrl ? (
        <div
          className="portfolio-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.title}
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="portfolio-lightbox__close"
            aria-label="Закрыть"
            onClick={() => setLightbox(null)}
          >
            <X size={20} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox.fileUrl}
            alt={lightbox.title}
            onClick={(e) => e.stopPropagation()}
          />
          <p>{lightbox.title}</p>
        </div>
      ) : null}
    </div>
  );
}
