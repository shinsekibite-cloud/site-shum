'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PresentationDeck, PresentationSlide } from '@/lib/presentation-types';

type Props = {
  deck: PresentationDeck;
  videoHref?: string;
  contacts?: string;
};

function SlideBody({ slide }: { slide: PresentationSlide }) {
  return (
    <div className="yp-deck__body">
      <div className="yp-deck__copy">
        {slide.kicker ? <div className="yp-deck__kicker">{slide.kicker}</div> : null}
        <h1 className="yp-deck__title">{slide.title}</h1>
        {slide.lead ? <p className="yp-deck__lead">{slide.lead}</p> : null}
        {slide.bullets?.length ? (
          <ul className="yp-deck__list">
            {slide.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        ) : null}
        {slide.cards?.length ? (
          <div className="yp-deck__cards">
            {slide.cards.map((c) => (
              <article key={c.title} className="yp-deck__card">
                <h3>{c.title}</h3>
                <p>{c.text}</p>
              </article>
            ))}
          </div>
        ) : null}
      </div>
      {slide.image ? (
        <div className="yp-deck__shot">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={slide.image} alt="" />
        </div>
      ) : null}
    </div>
  );
}

export default function PresentationDeckPlayer({ deck, videoHref, contacts }: Props) {
  const slides = deck.slides;
  const [index, setIndex] = useState(0);
  const [fs, setFs] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);
  const contactLine =
    (contacts || deck.contacts || '').trim() || '8 (862) 253-32-37 · cddim_sochi@mail.ru';

  const go = useCallback(
    (n: number) => {
      if (!slides.length) return;
      setIndex(((n % slides.length) + slides.length) % slides.length);
    },
    [slides.length]
  );

  const next = useCallback(() => go(index + 1), [go, index]);
  const prev = useCallback(() => go(index - 1), [go, index]);

  const toggleFs = useCallback(async () => {
    const el = rootRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
        setFs(true);
      } else {
        await document.exitFullscreen();
        setFs(false);
      }
    } catch {
      setFs((v) => !v);
      el.classList.toggle('is-css-fs');
    }
  }, []);

  useEffect(() => {
    const onFs = () => setFs(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        prev();
      } else if (e.key === 'f' || e.key === 'F' || e.key === 'F11') {
        e.preventDefault();
        void toggleFs();
      } else if (e.key === 'Home') {
        e.preventDefault();
        go(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        go(slides.length - 1);
      } else if (e.key === 'Escape' && rootRef.current?.classList.contains('is-css-fs')) {
        rootRef.current.classList.remove('is-css-fs');
        setFs(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, toggleFs, go, slides.length]);

  const slide = slides[index];
  const progress = slides.length ? ((index + 1) / slides.length) * 100 : 0;

  return (
    <div
      ref={rootRef}
      className={`yp-deck${fs ? ' is-fs' : ''}`}
      onTouchStart={(e) => {
        touchX.current = e.changedTouches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        touchX.current = null;
        if (start == null) return;
        const dx = (e.changedTouches[0]?.clientX ?? start) - start;
        if (Math.abs(dx) < 48) return;
        if (dx < 0) next();
        else prev();
      }}
    >
      <div className="yp-deck__progress" style={{ width: `${progress}%` }} />

      <header className="yp-deck__top">
        <div>
          <strong>{deck.title}</strong>
          {deck.subtitle ? <span>{deck.subtitle}</span> : null}
        </div>
        <div className="yp-deck__top-actions">
          {videoHref ? (
            <a className="yp-deck__chip" href={videoHref}>
              Видео
            </a>
          ) : null}
          <a className="yp-deck__chip" href="/presentation">
            К версиям
          </a>
          <button type="button" className="yp-deck__chip" onClick={() => void toggleFs()}>
            {fs ? '✕' : '⛶'}
          </button>
        </div>
      </header>

      <div className="yp-deck__stage">
        <button type="button" className="yp-deck__hit yp-deck__hit--prev" aria-label="Назад" onClick={prev} />
        <button type="button" className="yp-deck__hit yp-deck__hit--next" aria-label="Вперёд" onClick={next} />
        {slide ? (
          <section className="yp-deck__slide" key={slide.id}>
            <SlideBody slide={slide} />
            <footer className="yp-deck__foot">
              <span className="yp-deck__contacts">{contactLine}</span>
              <span>
                {String(index + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
              </span>
            </footer>
          </section>
        ) : null}
      </div>

      <nav className="yp-deck__controls" aria-label="Навигация по слайдам">
        <button type="button" onClick={prev} aria-label="Назад">
          ←
        </button>
        <span className="yp-deck__counter">
          {index + 1} / {slides.length}
        </span>
        <button type="button" onClick={next} aria-label="Вперёд">
          →
        </button>
        <button type="button" className="yp-deck__fs" onClick={() => void toggleFs()}>
          ⛶
        </button>
      </nav>
    </div>
  );
}
