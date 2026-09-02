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
 * Service-style first viewport: pill headlines + rounded media + dual CTAs.
 * Brand stays hero-level; no full-bleed dark overlay.
 */
export default function HomeServiceHero({
  siteName,
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
    <section className="svc-hero">
      <div className="container svc-hero__grid">
        <div className="svc-hero__copy">
          <div className="svc-hero__pills" aria-label="Направления">
            <span className="svc-pill svc-pill--hero">{siteName}</span>
            <span className="svc-pill svc-pill--hero">Пространства</span>
            <span className="svc-pill svc-pill--hero">События. Ты.</span>
          </div>
          <p className="svc-hero__lead">Свободные залы, коворкинг и афиша — без лишних шагов.</p>
        </div>

        <div className="svc-hero__media">
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
          {(primary || secondary) && (
            <Link
              href={(primary || secondary)!.href}
              className="svc-hero__media-arrow"
              aria-label={(primary || secondary)!.label}
            >
              <ArrowRight size={22} />
            </Link>
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
