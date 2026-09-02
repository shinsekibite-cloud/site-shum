import Link from 'next/link';
import PhotoGallery from '@/components/PhotoGallery';
import { galleryUrls, parseGalleryItems } from '@/lib/gallery-shared';

type Props = {
  orgGalleryJson?: string | null;
  enabled?: boolean;
  title?: string;
};

export default function HomeGallery({
  orgGalleryJson,
  enabled = true,
  title = 'Деятельность портала',
}: Props) {
  if (!enabled) return null;
  const items = parseGalleryItems(orgGalleryJson, 36);
  const urls = galleryUrls(items);
  if (!urls.length) return null;

  return (
    <section className="home-section home-gallery">
      <div className="home-gallery__head">
        <div>
          <h2 className="home-gallery__title">{title}</h2>
          <p className="home-gallery__sub">
            Моменты работы администрации — пространства, события и команда
          </p>
        </div>
        <Link href="/gallery" className="home-section-link">
          Смотреть все
        </Link>
      </div>
      <PhotoGallery images={urls} />
    </section>
  );
}
