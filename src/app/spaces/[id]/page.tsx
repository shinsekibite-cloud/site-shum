import { ArrowLeft, CheckCircle, MapPin, CalendarPlus, Users } from 'lucide-react';
import ContentRenderer from '@/components/ContentRenderer';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ShareButton from '@/components/ShareButton';
import { prisma } from '@/lib/prisma';
import PhotoGallery from '@/components/PhotoGallery';
import YandexDirections from '@/components/YandexDirections';
import { geocodeAddress } from '@/lib/geocode';
import { amenityLabel, parseSpaceAmenities } from '@/lib/spaces';
import { decodeRouteParam } from '@/lib/route-id';
import { spaceCover } from '@/lib/theme-covers';
import { galleryUrls, parseGalleryItems } from '@/lib/gallery-shared';
import { staticSpaceParams } from '@/lib/generate-public-static-params';
import HallWeekGrid from '@/components/HallWeekGrid';
import GuestAuthPrompt from '@/components/GuestAuthPrompt';
import { isCoworkingSpace } from '@/lib/coworking';

export const revalidate = 60;
export const dynamic = 'force-static';
export const dynamicParams = true;

export async function generateStaticParams() {
  return staticSpaceParams();
}

export default async function SpaceDetail({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const id = decodeRouteParam(resolvedParams.id);
  const space = await prisma.space.findUnique({
    where: { id },
  });

  if (!space) {
    notFound();
  }

  const mapPoint =
    space.lat != null && space.lng != null
      ? { lat: space.lat, lon: space.lng }
      : space.address
        ? await geocodeAddress(space.address)
        : null;

  const galleryImages = galleryUrls(parseGalleryItems(space.gallery, 24));

  const amenities = parseSpaceAmenities(space.amenities);

  return (
    <div style={{ minHeight: 'auto', paddingBottom: '5rem', backgroundColor: '#fafafa' }}>
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '400px',
          backgroundImage: `url(${spaceCover(space, 0)})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(to top, rgba(15,23,42,0.9) 0%, rgba(15,23,42,0) 100%)',
          }}
        />

        <div
          className="container"
          style={{
            position: 'absolute',
            top: '1.5rem',
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'space-between',
            zIndex: 20,
          }}
        >
          <Link
            href="/spaces"
            style={{
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              textDecoration: 'none',
              fontWeight: 600,
              padding: '0.5rem 0',
            }}
          >
            <ArrowLeft size={18} /> Назад к пространствам
          </Link>
          <div>
            <ShareButton title={space.title} />
          </div>
        </div>

        <div
          className="container"
          style={{
            position: 'absolute',
            bottom: '2rem',
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            gap: '1.5rem',
            zIndex: 20,
          }}
        >
          <div style={{ flex: '1 1 300px' }}>
            <h1
              style={{
                fontSize: 'clamp(2rem, 5vw, 3rem)',
                fontWeight: 800,
                color: 'white',
                marginBottom: '0.5rem',
                lineHeight: 1.1,
              }}
            >
              {space.title}
            </h1>
            <div
              style={{
                display: 'flex',
                gap: '1rem',
                marginBottom: '0.75rem',
                color: 'rgba(255,255,255,0.9)',
                fontSize: '0.95rem',
                fontWeight: 500,
                flexWrap: 'wrap',
              }}
            >
              {space.category && (
                <span
                  style={{
                    background: 'rgba(255,255,255,0.15)',
                    padding: '0.15rem 0.65rem',
                    borderRadius: 999,
                    fontSize: '0.85rem',
                  }}
                >
                  {space.category}
                </span>
              )}
              {space.address && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <MapPin size={16} /> {space.address}
                </span>
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Users size={16} /> {space.capacity} чел.
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {space.status === 'COMPLETED' ? (
                <span
                  style={{
                    color: '#fca5a5',
                    fontWeight: 600,
                    background: 'rgba(239, 68, 68, 0.2)',
                    padding: '0.2rem 0.8rem',
                    borderRadius: '100px',
                  }}
                >
                  Завершено
                </span>
              ) : (
                <span
                  style={{
                    color: '#86efac',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: 'rgba(34, 197, 94, 0.2)',
                    padding: '0.2rem 0.8rem',
                    borderRadius: '100px',
                  }}
                >
                  <CheckCircle size={18} /> Открыто
                </span>
              )}
            </div>
          </div>

          {space.status !== 'COMPLETED' && (
            <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {isCoworkingSpace(space) ? (
                <Link
                  href={`/coworking?space=${encodeURIComponent(space.id)}`}
                  className="btn btn-secondary"
                  style={{ padding: '0.75rem 1.25rem', fontWeight: 600 }}
                >
                  В коворкинг
                </Link>
              ) : null}
              <GuestAuthPrompt
                href={`/spaces/${encodeURIComponent(space.id)}/book`}
                className="btn btn-primary"
                title="Забронировать зал"
              >
                <CalendarPlus size={18} /> Забронировать
              </GuestAuthPrompt>
            </div>
          )}
        </div>
      </div>

      <div className="container" style={{ marginTop: '2rem', padding: '0 clamp(1rem, 3vw, 2rem)' }}>
        {space.status !== 'COMPLETED' ? (
          <div style={{ marginBottom: '1.25rem' }}>
            <HallWeekGrid spaceId={space.id} />
          </div>
        ) : null}

        {amenities.length > 0 && (
          <div
            style={{
              backgroundColor: 'white',
              padding: 'clamp(1.25rem, 4vw, 1.75rem)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
              width: '100%',
              marginBottom: '1.25rem',
            }}
          >
            <h3
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                marginBottom: '0.85rem',
                color: 'var(--foreground)',
              }}
            >
              Особенности
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {amenities.map((id) => (
                <span
                  key={id}
                  style={{
                    padding: '0.45rem 0.85rem',
                    borderRadius: 999,
                    background: 'rgba(59,130,246,0.08)',
                    color: 'var(--primary)',
                    fontWeight: 600,
                    fontSize: '0.88rem',
                  }}
                >
                  {amenityLabel(id)}
                </span>
              ))}
            </div>
          </div>
        )}

        {space.address && (
          <div
            style={{
              backgroundColor: 'white',
              padding: 'clamp(1.25rem, 4vw, 1.75rem)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
              width: '100%',
              marginBottom: '1.25rem',
            }}
          >
            <h3
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                marginBottom: '0.35rem',
                color: 'var(--foreground)',
              }}
            >
              Как добраться
            </h3>
            <p style={{ color: 'var(--muted)', marginBottom: '1rem', fontSize: '0.95rem' }}>
              <MapPin size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
              {space.address}
            </p>
            <YandexDirections address={space.address} placeName={space.title} point={mapPoint} showMap />
          </div>
        )}

        <div
          style={{
            backgroundColor: 'white',
            padding: 'clamp(1.5rem, 5vw, 2.5rem)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
            width: '100%',
          }}
        >
          <h3
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              marginBottom: '2rem',
              color: 'var(--foreground)',
              borderBottom: '2px solid #f1f5f9',
              paddingBottom: '1rem',
            }}
          >
            Подробная информация
          </h3>
          <div style={{ fontSize: '1.1rem', lineHeight: 1.8, color: '#334155' }}>
            <ContentRenderer template={space.template} content={space.description} />
          </div>

          <PhotoGallery images={galleryImages} />
        </div>
      </div>
    </div>
  );
}
