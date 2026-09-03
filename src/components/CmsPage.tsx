import React from 'react';
import { sanitizeCmsHtml } from '@/lib/sanitize-html';
import { applySitePlaceholders, DEFAULT_SITE_NAME } from '@/lib/site-identity-shared';

interface CmsPageProps {
  page: {
    title: string;
    content: string;
    images: string;
    template: string;
  };
  siteName?: string;
  publicOrigin?: string;
}

/**
 * CMS page templates. To add a new template:
 * 1. Add <option> in admin/pages (and optionally projects/clubs/spaces)
 * 2. Add a case here (and in ContentRenderer for entity pages)
 * No DB migration needed — template is a free-form string.
 */
export default function CmsPage({ page, siteName = '', publicOrigin = '' }: CmsPageProps) {
  const cover = page.images || '';
  const safeContent = sanitizeCmsHtml(
    applySitePlaceholders(page.content, {
      siteName: siteName || DEFAULT_SITE_NAME,
      publicOrigin,
      shortName: siteName || DEFAULT_SITE_NAME,
      host: '',
    })
  );

  const renderDefault = () => (
    <div className="cms-page-shell" style={{ paddingTop: '2rem', paddingBottom: '3rem' }}>
      <h1 className="page-hero-title" style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
        {page.title}
      </h1>
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt=""
          style={{
            display: 'block',
            width: '100%',
            maxHeight: '420px',
            objectFit: 'cover',
            borderRadius: '16px',
            margin: '0 0 2rem',
          }}
        />
      ) : null}
      <div
        className="prose cms-page-prose"
        style={{ fontSize: '1.1rem', lineHeight: 1.8, color: '#334155' }}
        dangerouslySetInnerHTML={{ __html: safeContent }}
      />
    </div>
  );

  const renderHero = () => (
    <div>
      <section
        style={{
          position: 'relative',
          minHeight: 'min(72vh, 620px)',
          display: 'flex',
          alignItems: 'flex-end',
          background: cover
            ? `linear-gradient(180deg, rgba(15,23,42,0.12) 0%, rgba(15,23,42,0.78) 100%), url(${cover}) center/cover no-repeat`
            : 'linear-gradient(135deg, #0d9488 0%, #0f766e 40%, #0c1f1c 100%)',
          color: 'white',
          padding: 'clamp(2.5rem, 6vw, 4.5rem) 0',
        }}
      >
        <div className="cms-page-shell" style={{ width: '100%' }}>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.85, fontWeight: 700 }}>
            МКУ города Сочи
          </p>
          <h1 style={{ fontSize: 'clamp(2.35rem, 5.5vw, 3.75rem)', fontWeight: 800, margin: 0, lineHeight: 1.12, maxWidth: '22ch' }}>
            {page.title}
          </h1>
        </div>
      </section>
      <div className="cms-page-shell" style={{ paddingTop: 'clamp(2rem, 4vw, 3.25rem)', paddingBottom: '3rem' }}>
        <div
          className="prose about-prose cms-page-prose"
          style={{ fontSize: '1.08rem', lineHeight: 1.8, color: '#334155' }}
          dangerouslySetInnerHTML={{ __html: safeContent }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `
            .about-prose h2 { font-size: 1.45rem; margin: 2rem 0 0.75rem; color: #0f172a; }
            .about-prose .team-grid {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
              gap: 1rem;
              margin: 1.25rem 0 2rem;
            }
            .about-prose .team-card {
              background: #fff;
              border: 1px solid rgba(15,23,42,0.08);
              border-radius: 16px;
              overflow: hidden;
              text-align: center;
              box-shadow: 0 8px 24px rgba(15,23,42,0.05);
            }
            .about-prose .team-card img {
              width: 100%;
              aspect-ratio: 1;
              object-fit: cover;
              display: block;
              margin: 0;
              border-radius: 0;
            }
            .about-prose .team-card strong {
              display: block;
              padding: 0.65rem 0.55rem 0.15rem;
              font-size: 0.92rem;
              color: #0f172a;
            }
            .about-prose .team-card span {
              display: block;
              padding: 0 0.55rem 0.85rem;
              font-size: 0.78rem;
              color: #64748b;
            }
          `,
          }}
        />
      </div>
    </div>
  );

  const renderTeam = () => (
    <div>
      <section
        style={{
          background: cover
            ? `linear-gradient(180deg, rgba(15,23,42,0.35), rgba(15,23,42,0.75)), url(${cover}) center/cover`
            : 'linear-gradient(135deg, #0369a1 0%, #2563eb 50%, #0f172a 100%)',
          color: '#fff',
          padding: '3rem 0 2.5rem',
        }}
      >
        <div className="cms-page-shell">
          <h1 className="page-hero-title" style={{ margin: 0 }}>{page.title}</h1>
          <p style={{ margin: '0.75rem 0 0', opacity: 0.9, maxWidth: '42rem' }}>
            Команда и направления работы Центра.
          </p>
        </div>
      </section>
      <div className="cms-page-shell" style={{ paddingTop: '2rem', paddingBottom: '3rem' }}>
        <div
          className="prose about-prose team-content cms-page-prose"
          style={{ fontSize: '1.05rem', lineHeight: 1.75, color: '#334155' }}
          dangerouslySetInnerHTML={{ __html: safeContent }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `
            .team-content .team-grid {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
              gap: 1rem;
              margin-top: 1.5rem;
            }
            .team-content .team-card {
              background: #fff;
              border-radius: 16px;
              border: 1px solid rgba(15,23,42,0.08);
              overflow: hidden;
              text-align: center;
            }
            .team-content .team-card img { width: 100%; aspect-ratio: 1; object-fit: cover; margin: 0; border-radius: 0; }
            .team-content .team-card strong { display:block; padding: 0.6rem 0.5rem 0.1rem; font-size: 0.9rem; }
            .team-content .team-card span { display:block; padding: 0 0.5rem 0.75rem; font-size: 0.75rem; color: #64748b; }
          `,
          }}
        />
      </div>
    </div>
  );

  const renderGallery = () => (
    <div className="cms-page-shell" style={{ paddingTop: '2rem', paddingBottom: '3rem' }}>
      <h1 className="page-hero-title" style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
        {page.title}
      </h1>
      <div style={{ width: '100%' }}>
        <p style={{ color: 'var(--muted)', marginBottom: '2rem' }}>Фотоотчеты и моменты нашей жизни</p>
        <div className="gallery-content prose cms-page-prose" dangerouslySetInnerHTML={{ __html: safeContent }} />
      </div>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          .gallery-content img {
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            transition: transform 0.3s;
            cursor: pointer;
            margin-bottom: 1rem;
          }
          .gallery-content img:hover {
            transform: scale(1.02);
          }
        `,
        }}
      />
    </div>
  );

  const renderFAQ = () => (
    <div className="cms-page-shell" style={{ paddingTop: '2rem', paddingBottom: '3rem' }}>
      <h1 className="page-hero-title" style={{ marginBottom: '2rem', textAlign: 'left' }}>
        {page.title}
      </h1>
      <div className="prose faq-content cms-page-prose" dangerouslySetInnerHTML={{ __html: safeContent }} />
      <style
        dangerouslySetInnerHTML={{
          __html: `
          .faq-content h2, .faq-content h3 {
            color: var(--primary);
            margin-top: 2rem;
            margin-bottom: 0.5rem;
            padding-bottom: 0.5rem;
            border-bottom: 1px solid rgba(0,0,0,0.05);
          }
          .faq-content p {
            color: var(--muted);
            margin-bottom: 1.5rem;
          }
        `,
        }}
      />
    </div>
  );

  switch (page.template) {
    case 'HERO':
      return renderHero();
    case 'GALLERY':
      return renderGallery();
    case 'TEAM':
      return renderTeam();
    case 'FAQ':
      return renderFAQ();
    default:
      return renderDefault();
  }
}
