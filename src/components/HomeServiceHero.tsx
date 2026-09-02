import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

type Cta = { href: string; label: string };

type Props = {
  siteName: string;
  imageUrl: string;
  videoUrl?: string | null;
  mediaKind?: 'image' | 'video';
  primary?: Cta | null;
  secondary?: Cta | null;
  faceUrls?: string[];
};

/**
 * Hero = image (or video) only. Dual CTAs sit below the fold as service cards.
 */
export default function HomeServiceHero({
  imageUrl,
  videoUrl,
  mediaKind = 'image',
  primary,
  secondary,
  faceUrls = [],
}: Props) {
  const poster = (imageUrl || '/brand/hero-cover.jpg').trim();
  const video = (videoUrl || '').trim();
  const wantVideo = mediaKind === 'video' && Boolean(video);
  const faces = faceUrls.filter(Boolean).slice(0, 4);

  return (
    <section className="svc-hero svc-hero--image-only" aria-label="Главный баннер">
      <div className="container">
        <div className="svc-hero__media svc-hero__media--solo">
          {wantVideo ? (
            <video
              className="svc-hero__video"
              src={video}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="svc-hero__img" src={poster} alt="" />
          )}
        </div>
      </div>

      {(primary || secondary) && (
        <div className="container svc-hero__actions">
          {primary ? (
            <Link href={primary.href} className="svc-cta-card" prefetch>
              <div className="svc-cta-card__faces" aria-hidden>
                {(faces.length ? faces : [poster, poster, poster]).slice(0, 3).map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={`${src}-${i}`} src={src} alt="" />
                ))}
              </div>
              <span className="svc-pill svc-pill--brand">{primary.label}</span>
              <span className="svc-cta-card__arrow" aria-hidden>
                <ArrowRight size={18} />
              </span>
            </Link>
          ) : null}
          {secondary ? (
            <Link href={secondary.href} className="svc-cta-card svc-cta-card--alt" prefetch>
              <div
                className="svc-cta-card__round"
                style={{ backgroundImage: `url(${faces[0] || poster})` }}
                aria-hidden
              />
              <div className="svc-cta-card__text">
                <p>Ближайшие окна на площадках ЦРМ</p>
                <span className="svc-pill svc-pill--soft">{secondary.label}</span>
              </div>
              <span className="svc-cta-card__arrow" aria-hidden>
                <ArrowRight size={18} />
              </span>
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}
