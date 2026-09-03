import React from 'react';
import { sanitizeCmsHtml } from '@/lib/sanitize-html';

interface ContentRendererProps {
  template: string;
  content: string | null;
}

export default function ContentRenderer({ template, content }: ContentRendererProps) {
  const htmlContent = sanitizeCmsHtml(content) || 'Описание отсутствует.';

  switch (template) {
    case 'GALLERY':
      return (
        <div style={{ margin: '0 auto', textAlign: 'center' }}>
          <div className="gallery-content prose" dangerouslySetInnerHTML={{ __html: htmlContent }} />
          <style dangerouslySetInnerHTML={{__html: `
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
          `}} />
        </div>
      );
    
    case 'TEAM':
      return (
        <div style={{ margin: '0 auto', backgroundColor: 'white', padding: '2rem', borderRadius: 'var(--radius-xl)', boxShadow: '0 10px 40px rgba(0,0,0,0.05)' }}>
          <div className="prose team-content" dangerouslySetInnerHTML={{ __html: htmlContent }} />
        </div>
      );

    case 'FAQ':
      return (
        <div style={{ margin: '0 auto' }}>
          <div className="prose faq-content" dangerouslySetInnerHTML={{ __html: htmlContent }} />
          <style dangerouslySetInnerHTML={{__html: `
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
          `}} />
        </div>
      );

    case 'HERO':
      return (
        <div style={{ margin: '0 auto', textAlign: 'center', padding: '4rem 1rem', background: 'linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(147,51,234,0.1) 100%)', borderRadius: 'var(--radius-2xl)', marginBottom: '2rem' }}>
          <div className="prose hero-content" dangerouslySetInnerHTML={{ __html: htmlContent }} />
          <style dangerouslySetInnerHTML={{__html: `
            .hero-content h1, .hero-content h2 {
              font-size: 3rem;
              line-height: 1.2;
              background: linear-gradient(to right, var(--primary), #9333ea);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              margin-bottom: 1.5rem;
            }
            .hero-content p {
              font-size: 1.25rem;
              color: var(--muted);
              max-width: min(48rem, 100%);
              margin: 0 auto 2rem auto;
            }
          `}} />
        </div>
      );

    case 'FEATURES':
      return (
        <div style={{ margin: '0 auto' }}>
          <div className="prose features-content" dangerouslySetInnerHTML={{ __html: htmlContent }} />
          <style dangerouslySetInnerHTML={{__html: `
            .features-content {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
              gap: 2rem;
            }
            .features-content > * {
              background: white;
              padding: 2rem;
              border-radius: var(--radius-xl);
              box-shadow: 0 10px 40px rgba(0,0,0,0.04);
              border: 1px solid rgba(0,0,0,0.03);
              text-align: center;
              transition: transform 0.3s;
            }
            .features-content > *:hover {
              transform: translateY(-5px);
            }
            .features-content img {
              width: 64px;
              height: 64px;
              margin: 0 auto 1rem auto;
              border-radius: 50%;
            }
            .features-content h3 {
              color: var(--foreground);
              margin-bottom: 0.5rem;
              font-size: 1.25rem;
            }
            .features-content p {
              color: var(--muted);
              font-size: 0.95rem;
              margin: 0;
            }
          `}} />
        </div>
      );

    case 'CONTACTS':
      return (
        <div style={{ margin: '0 auto', background: '#f8fafc', padding: '3rem', borderRadius: 'var(--radius-xl)', display: 'flex', gap: '3rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 400px' }}>
            <div className="prose contacts-content" dangerouslySetInnerHTML={{ __html: htmlContent }} />
          </div>
          <style dangerouslySetInnerHTML={{__html: `
            .contacts-content h2 {
              color: var(--foreground);
              font-size: 2rem;
              margin-bottom: 1.5rem;
            }
            .contacts-content p {
              font-size: 1.1rem;
              color: var(--muted);
              margin-bottom: 1rem;
              display: flex;
              align-items: center;
              gap: 0.75rem;
            }
            .contacts-content a {
              color: var(--primary);
              text-decoration: none;
              font-weight: 600;
            }
          `}} />
        </div>
      );

    default:
      return (
        <div className="prose" dangerouslySetInnerHTML={{ __html: htmlContent }} />
      );
  }
}
