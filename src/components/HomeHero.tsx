'use client';

import { useEffect, useRef, useState } from 'react';

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
 * Hero media: strictly one plane — image or video.
 * Video uses poster={imageUrl}; cover CSS var is never painted under video.
 * On video error → fall back to image (video unmounted).
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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const playingRef = useRef(false);

  useEffect(() => {
    setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  useEffect(() => {
    setFailed(false);
    setPlaying(false);
    setNeedsTap(false);
    playingRef.current = false;
  }, [videoSrc, mediaKind]);

  const wantVideo = mediaKind === 'video' && Boolean(videoSrc) && !failed && !reduceMotion;
  const className = [
    'home-hero',
    wantVideo ? 'home-hero--video' : `home-hero--${mode}`,
    wantVideo && playing ? 'home-hero--playing' : '',
    wantVideo && needsTap ? 'home-hero--needs-tap' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const posterCss = `url(${poster.startsWith('/') || poster.startsWith('http') ? poster : `/${poster}`})`;
  const cssUrl = posterCss;

  useEffect(() => {
    if (!wantVideo) return;
    const el = videoRef.current;
    if (!el) return;

    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 3;
    playingRef.current = false;

    const armAttrs = () => {
      el.muted = true;
      el.defaultMuted = true;
      el.volume = 0;
      el.setAttribute('muted', '');
      el.playsInline = true;
    };
    armAttrs();

    const markPlaying = () => {
      if (cancelled) return;
      playingRef.current = true;
      setNeedsTap(false);
      setPlaying(true);
    };

    const tryPlay = () => {
      if (cancelled || failed || attempts >= MAX_ATTEMPTS) return;
      attempts += 1;
      armAttrs();
      if (!el.paused && !el.ended) {
        markPlaying();
        return;
      }
      const p = el.play();
      if (p && typeof p.then === 'function') {
        p.then(markPlaying).catch(() => {
          if (!cancelled) {
            setNeedsTap(true);
            setPlaying(false);
          }
        });
      }
    };

    const onFrame = () => {
      if (cancelled) return;
      if (el.readyState >= 2) markPlaying();
      tryPlay();
    };

    if (el.readyState >= 2) onFrame();
    else {
      el.addEventListener('loadeddata', onFrame, { once: true });
      el.addEventListener('canplay', onFrame, { once: true });
    }

    el.addEventListener('playing', markPlaying);
    const onError = () => {
      if (!cancelled) setFailed(true);
    };
    el.addEventListener('error', onError);
    const stallTimer = window.setTimeout(() => {
      if (!cancelled && !playingRef.current) setFailed(true);
    }, 8000);

    try {
      el.load();
    } catch {
      /* ignore */
    }
    tryPlay();

    return () => {
      cancelled = true;
      window.clearTimeout(stallTimer);
      el.removeEventListener('loadeddata', onFrame);
      el.removeEventListener('canplay', onFrame);
      el.removeEventListener('playing', markPlaying);
      el.removeEventListener('error', onError);
      try {
        el.pause();
      } catch {
        /* ignore */
      }
    };
  }, [wantVideo, videoSrc, failed]);

  const startFromTap = () => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    el.defaultMuted = true;
    el.volume = 0;
    void el.play()
      .then(() => {
        setNeedsTap(false);
        setPlaying(true);
      })
      .catch(() => undefined);
  };

  return (
    <section className={className} style={{ ['--home-hero-image' as string]: cssUrl }}>
      <div className="home-hero-media" aria-hidden>
        {wantVideo ? (
          <video
            ref={videoRef}
            className="home-hero-video"
            src={videoSrc}
            poster={poster}
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
