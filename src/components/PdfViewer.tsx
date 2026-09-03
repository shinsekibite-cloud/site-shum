'use client';

import { useEffect, useRef, useState } from 'react';

type Props = { url: string; title: string };

/**
 * High-DPI local PDF renderer (pdf.js).
 * Canvas is painted at devicePixelRatio so text stays sharp on mobile Retina screens.
 */
export default function PdfViewer({ url, title }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    const render = async (showLoader: boolean) => {
      if (showLoader) {
        setLoading(true);
        setError('');
        setPageCount(0);
      }
      const host = hostRef.current;
      if (host) host.innerHTML = '';

      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

        const pdf = await pdfjs.getDocument({
          url,
          withCredentials: false,
          standardFontDataUrl: '/pdfjs/standard_fonts/',
        }).promise;
        if (cancelled) return;
        setPageCount(pdf.numPages);

        const container = hostRef.current;
        if (!container) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const cssWidth = Math.max(
          280,
          Math.min(container.clientWidth || window.innerWidth - 24, 1100)
        );

        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return;
          const page = await pdf.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const fitScale = (cssWidth / base.width) * zoom;
          const viewport = page.getViewport({ scale: fitScale * dpr });
          const cssViewport = page.getViewport({ scale: fitScale });

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { alpha: false });
          if (!ctx) continue;

          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${Math.floor(cssViewport.width)}px`;
          canvas.style.height = `${Math.floor(cssViewport.height)}px`;
          canvas.style.display = 'block';
          canvas.style.margin = '0 auto 1rem';
          canvas.style.maxWidth = '100%';
          canvas.style.boxShadow = '0 2px 8px rgba(15,23,42,0.14)';
          canvas.style.background = '#fff';
          canvas.setAttribute('aria-label', `${title} — стр. ${i}`);
          container.appendChild(canvas);

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          await page.render({
            canvasContext: ctx,
            canvas,
            viewport,
          }).promise;
        }

        if (!cancelled) setLoading(false);
      } catch (e) {
        console.error('PDF render error', e);
        if (!cancelled) {
          setError('Не удалось отобразить PDF на сайте. Используйте «Скачать».');
          setLoading(false);
        }
      }
    };

    render(true);

    const onResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!cancelled) render(false);
      }, 350);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelled = true;
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
    };
  }, [url, title, zoom]);

  return (
    <div style={{ background: '#e8eaed', borderRadius: 12, padding: '0.75rem 0.5rem 1rem', minHeight: '50vh' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 10,
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
          onClick={() => setZoom((z) => Math.max(0.75, Math.round((z - 0.25) * 100) / 100))}
          disabled={zoom <= 0.75}
        >
          −
        </button>
        <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600, minWidth: 64, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
          onClick={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.25) * 100) / 100))}
          disabled={zoom >= 2.5}
        >
          +
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
          onClick={() => setZoom(1)}
        >
          По ширине
        </button>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', color: '#475569', padding: '2rem', fontWeight: 600 }}>
          Загрузка PDF…
        </div>
      )}
      {error && (
        <div style={{ textAlign: 'center', color: '#b91c1c', padding: '2rem', fontWeight: 600 }}>{error}</div>
      )}
      {!loading && !error && pageCount > 0 && (
        <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          Страниц: {pageCount}
        </div>
      )}
      <div ref={hostRef} style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }} />
    </div>
  );
}
