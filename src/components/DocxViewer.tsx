'use client';

import { useEffect, useRef, useState } from 'react';

type Props = { url: string };

/**
 * High-fidelity DOCX preview via docx-preview (local, no Office Online).
 * Keeps Word page layout/fonts and scales pages to fit the viewport width.
 */
export default function DocxViewer({ url }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    const fitToWidth = (host: HTMLElement) => {
      const wrapper = host.querySelector('.docx-wrapper') as HTMLElement | null;
      if (!wrapper) return;

      // Reset before measuring
      wrapper.style.transform = '';
      wrapper.style.width = '';
      wrapper.style.margin = '';
      host.style.height = '';

      const page = wrapper.querySelector('section.docx') as HTMLElement | null;
      if (!page) return;

      const avail = host.clientWidth;
      const pageWidth = page.scrollWidth || page.offsetWidth || 794;
      if (pageWidth <= 0 || avail <= 0) return;

      const scale = Math.min(1, avail / pageWidth);
      wrapper.style.transformOrigin = 'top left';
      wrapper.style.transform = `scale(${scale})`;
      // Compensate layout so following content isn't left with huge empty gap
      wrapper.style.width = `${100 / scale}%`;
      const scaledHeight = wrapper.scrollHeight * scale;
      host.style.height = `${Math.ceil(scaledHeight)}px`;
      host.style.overflow = 'hidden';
    };

    (async () => {
      setLoading(true);
      setError('');
      const host = hostRef.current;
      if (!host) return;
      host.innerHTML = '';
      host.style.height = '';

      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Не удалось загрузить файл');
        const arrayBuffer = await res.arrayBuffer();
        if (cancelled) return;

        const { renderAsync } = await import('docx-preview');
        await renderAsync(arrayBuffer, host, undefined, {
          className: 'docx',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: true,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          useBase64URL: true,
          experimental: true,
        });

        if (cancelled) return;
        fitToWidth(host);
        setLoading(false);

        resizeObserver = new ResizeObserver(() => {
          if (!cancelled && hostRef.current) fitToWidth(hostRef.current);
        });
        resizeObserver.observe(host);
      } catch (e) {
        console.error('DOCX render error', e);
        if (!cancelled) {
          setError('Не удалось отобразить DOCX. Скачайте файл и откройте в Word.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
    };
  }, [url]);

  return (
    <div style={{ position: 'relative', minHeight: '50vh' }}>
      {loading && (
        <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#475569', fontWeight: 600 }}>
          Загрузка документа…
        </div>
      )}
      {error && (
        <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#b91c1c', fontWeight: 600 }}>{error}</div>
      )}
      <div
        ref={hostRef}
        className="docx-preview-host"
        style={{
          display: loading || error ? 'none' : 'block',
          background: '#e8eaed',
          borderRadius: 12,
          padding: '0.75rem 0',
          width: '100%',
        }}
      />
      {!loading && !error && (
        <p style={{ margin: '0.65rem 0 0', fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center' }}>
          Разметка как в Word; на узком экране страница подогнана по ширине.
        </p>
      )}
    </div>
  );
}
