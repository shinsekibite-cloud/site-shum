'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';

type Props = {
  imageUrl: string;
  videoUrl?: string | null;
  /** Exclusive display mode: image OR video (admin may store both assets). */
  mediaKind?: 'image' | 'video';
  /** Ken Burns for image mode only */
  mode?: 'static' | 'animated';
  children: React.ReactNode;
};

/**
 * One media plane only:
 * - image mode → CSS background (optional Ken Burns)
 * - video mode → <video> only (browser poster until first frame; no CSS photo under it)
 * Never crossfade photo↔video — that reads as jerking.
 */
export default function HomeHero({
  imageUrl,
  videoUrl,
  mediaKind = 'video',
  mode = 'animated',
  children,
}: Props) {
  const videoSrc = (videoUrl || '').trim();
  const poster = (imageUrl || '/brand/hero-cover.jpg').trim().replace(/^["']|["']$/g, '');
  const posterUrl = poster.startsWith('/') || poster.startsWith('http') ? poster : `/${poster}`;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    setFailed(false);
    setNeedsTap(false);
  }, [videoSrc, mediaKind]);

  const wantVideo = mediaKind === 'video' && Boolean(videoSrc) && !failed && !reduceMotion;
  const className = [
    'home-hero',
    wantVideo ? 'home-hero--video' : `home-hero--${mode}`,
    wantVideo && needsTap ? 'home-hero--needs-tap' : '',
  ]
    .filter(Boolean)
    .join(' ');

  useEffect(() => {
    if (!wantVideo) return;
    const el = videoRef.current;
    if (!el) return;

    let cancelled = false;

    const armAttrs = () => {
      el.muted = true;
      el.defaultMuted = true;
      el.volume = 0;
      el.setAttribute('muted', '');
      el.playsInline = true;
    };
    armAttrs();

    const tryPlay = () => {
      if (cancelled) return;
      armAttrs();
      if (!el.paused && !el.ended) {
        setNeedsTap(false);
        return;
      }
      const p = el.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          if (!cancelled) setNeedsTap(false);
        }).catch(() => {
          if (!cancelled) setNeedsTap(true);
        });
      }
    };

    const onError = () => {
      // Only hard-fallback to photo on a real media error — not on slow networks.
      if (!cancelled) setFailed(true);
    };

    el.addEventListener('loadeddata', tryPlay, { once: true });
    el.addEventListener('canplay', tryPlay, { once: true });
    el.addEventListener('playing', () => {
      if (!cancelled) setNeedsTap(false);
    });
    el.addEventListener('error', onError);
    tryPlay();

    return () => {
      cancelled = true;
      el.removeEventListener('error', onError);
      try {
        el.pause();
      } catch {
        /* ignore */
      }
    };
  }, [wantVideo, videoSrc]);

  const startFromTap = () => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    el.defaultMuted = true;
    el.volume = 0;
    void el.play()
      .then(() => setNeedsTap(false))
      .catch(() => undefined);
  };

  // Image mode paints CSS background. Video mode must NOT — otherwise poster + video
  // fight and look like photo↔video flicker.
  const sectionStyle = wantVideo
    ? undefined
    : ({ ['--home-hero-image' as string]: `url(${posterUrl})` } as React.CSSProperties);

  return (
    <section className={className} style={sectionStyle}>
      <div className="home-hero-media" aria-hidden>
        {wantVideo ? (
          <video
            ref={videoRef}
            className="home-hero-video"
            src={videoSrc}
            poster={posterUrl}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            disablePictureInPicture
          />
        ) : null}
      </div>
      <div className="home-hero-scrim" aria-hidden />
      <div className="home-hero-glow" aria-hidden />
      {needsTap ? (
        <button type="button" className="home-hero-play" onClick={startFromTap}>
          Смотреть видео
        </button>
      ) : null}
      <div className="container home-hero-inner">{children}</div>
    </section>
  );
}
