import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock, MapPin, Sun, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { findPlaceByRouteId } from '@/lib/resolve-entity';
import {
  PLACE_CATEGORY_META,
  normalizePlaceCategory,
  parseGalleryJson,
  placeCategoryCodesFor,
  resolvePlaceFeatures,
} from '@/lib/places';
import { encodeRouteParam } from '@/lib/route-id';
import { placeCover } from '@/lib/theme-covers';
import YandexDirections from '@/components/YandexDirections';
import ContentRenderer from '@/components/ContentRenderer';
import PhotoGallery from '@/components/PhotoGallery';
import PlaceFavoriteButton from '@/components/places/PlaceFavoriteButton';
import PlaceRatingWidget from '@/components/places/PlaceRatingWidget';
import PlaceReviewForm from '@/components/places/PlaceReviewForm';
import PlaceInviteFriends from '@/components/places/PlaceInviteFriends';
import PlaceShareButton from '@/components/places/PlaceShareButton';
import ViewBeacon from '@/components/ViewBeacon';
import Breadcrumbs from '@/components/Breadcrumbs';
import RelatedLinks from '@/components/RelatedLinks';
import { staticPlaceParams } from '@/lib/generate-public-static-params';

export const revalidate = 60;
export const dynamic = 'force-static';
export const dynamicParams = true;

export async function generateStaticParams() {
  return staticPlaceParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const place = await findPlaceByRouteId(id);
  const { brandedMetadata } = await import('@/lib/branded-metadata');
  if (!place || place.status !== 'PUBLISHED') {
    return brandedMetadata('Место', { description: 'Куда сходить в Сочи' });
  }
  return brandedMetadata(place.title, {
    description: place.summary || place.description.slice(0, 160),
  });
}

export default async function PlaceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const place = await findPlaceByRouteId(rawId);
  if (!place || place.status !== 'PUBLISHED') notFound();

  const [reviews, related] = await Promise.all([
    prisma.placeReview.findMany({
      where: { placeId: place.id, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        body: true,
        createdAt: true,
        user: { select: { name: true, image: true } },
      },
    }),
    prisma.place.findMany({
      where: {
        status: 'PUBLISHED',
        id: { not: place.id },
        OR: [{ category: place.category }, ...(place.district ? [{ district: place.district }] : [])],
      },
      orderBy: [{ ratingAvg: 'desc' }, { sortOrder: 'asc' }],
      take: 4,
      select: {
        id: true,
        title: true,
        slug: true,
        summary: true,
        image: true,
        category: true,
        ratingAvg: true,
        ratingCount: true,
        district: true,
      },
    }),
  ]);

  const catCodes = placeCategoryCodesFor(place);
  const features = resolvePlaceFeatures(place);
  const gallery = parseGalleryJson(place.galleryJson);
  const cover = placeCover(place, 0);
  const mapPoint =
    place.lat != null && place.lng != null ? { lat: place.lat, lon: place.lng } : null;

  return (
    <div className="places-detail">
      <section className="places-detail-hero" style={{ backgroundImage: `url(${cover})` }}>
        <div className="places-detail-hero__veil" />
        <div className="container places-detail-hero__content">
          <Breadcrumbs
            items={[
              { href: '/', label: 'Главная' },
              { href: '/places', label: 'Места' },
              { label: place.title },
            ]}
          />
          <Link href="/places" className="places-back">
            <ArrowLeft size={18} /> К каталогу
          </Link>
          <div className="places-detail-hero__cats" aria-label="Категории">
            {catCodes.map((code) => {
              const m = PLACE_CATEGORY_META[code];
              return (
                <span key={code} className="places-detail-hero__cat" style={{ color: m.color, background: m.bg }}>
                  {m.label}
                </span>
              );
            })}
          </div>
          <h1>{place.title}</h1>
          <ViewBeacon type="PLACE" id={place.id} initialCount={place.viewCount ?? 0} style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '0.5rem' }} />
          {place.summary ? <p className="places-detail-hero__summary">{place.summary}</p> : null}
          <div className="places-detail-cta">
            <div className="places-cta places-cta--hero places-cta--link">
              <YandexDirections
                address={place.address}
                placeName={place.title}
                point={mapPoint}
                compact
                style={{ color: 'inherit', fontSize: 'inherit', fontWeight: 'inherit' }}
              />
            </div>
            <PlaceShareButton title={place.title} />
            <PlaceFavoriteButton
              placeId={place.id}
              initialFavorited={false}
              initialCount={place.favoritesCount}
            />
            <PlaceInviteFriends placeId={place.id} placeTitle={place.title} />
          </div>
        </div>
      </section>

      <div className="container places-detail-body">
        <div className="places-detail-facts">
          {place.district || place.address ? (
            <div>
              <MapPin size={16} />
              <span>{[place.district, place.address].filter(Boolean).join(' · ')}</span>
            </div>
          ) : null}
          {place.bestSeason ? (
            <div>
              <Sun size={16} />
              <span>{place.bestSeason}</span>
            </div>
          ) : null}
          {place.visitTime ? (
            <div>
              <Clock size={16} />
              <span>{place.visitTime}</span>
            </div>
          ) : null}
          {place.priceHint ? (
            <div>
              <Wallet size={16} />
              <span>{place.priceHint}</span>
            </div>
          ) : null}
        </div>

        <section className="places-section places-section--features">
          <h2>Особенности</h2>
          <p className="places-section__lead">Что важно знать перед визитом</p>
          <div className="places-perks">
            {features.map((f, i) => (
              <article key={`${f.title}-${i}`} className="places-perk" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="places-perk__icon" aria-hidden>
                  {f.icon.slice(0, 1).toUpperCase()}
                </div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="places-section">
          <h2>О месте</h2>
          <div className="places-prose">
            <ContentRenderer template="DEFAULT" content={place.description} />
          </div>
        </section>

        {place.tips ? (
          <section className="places-section places-tips">
            <h2>Советы</h2>
            <p>{place.tips}</p>
          </section>
        ) : null}

        {gallery.length > 0 ? (
          <section className="places-section">
            <h2>Галерея</h2>
            <PhotoGallery images={gallery} />
          </section>
        ) : null}

        <section className="places-section">
          <h2>Маршрут</h2>
          <YandexDirections
            address={place.address}
            placeName={place.title}
            point={mapPoint}
            showMap
          />
        </section>

        <section className="places-section">
          <h2>Оценка</h2>
          <PlaceRatingWidget
            placeId={place.id}
            initialScore={null}
            ratingAvg={place.ratingAvg}
            ratingCount={place.ratingCount}
          />
        </section>

        <section className="places-section">
          <h2>Отзывы</h2>
          <PlaceReviewForm placeId={place.id} />
          <div className="places-reviews">
            {reviews.length === 0 ? (
              <p className="places-muted">Пока нет опубликованных отзывов — будьте первым.</p>
            ) : (
              reviews.map((r) => (
                <article key={r.id} className="places-review">
                  <header>
                    <strong>{r.user.name || 'Участник'}</strong>
                    <time dateTime={r.createdAt.toISOString()}>
                      {r.createdAt.toLocaleDateString('ru-RU')}
                    </time>
                  </header>
                  <p>{r.body}</p>
                </article>
              ))
            )}
          </div>
        </section>

        {related.length > 0 ? (
          <RelatedLinks
            title="Ещё рядом"
            items={related.map((r) => {
              const rCat = PLACE_CATEGORY_META[normalizePlaceCategory(r.category)];
              return {
                href: `/places/${encodeRouteParam(r.slug || r.id)}`,
                title: r.title,
                meta: [rCat.label, r.district].filter(Boolean).join(' · ') || r.summary,
              };
            })}
          />
        ) : null}
      </div>
    </div>
  );
}
