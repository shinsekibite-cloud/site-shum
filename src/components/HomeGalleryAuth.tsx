'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import HomeGallery from '@/components/HomeGallery';

/** Private homepage gallery: no items in static HTML; logged-in users fetch. */
export default function HomeGalleryAuth({
  homepageEnabled,
  title,
}: {
  homepageEnabled: boolean;
  title?: string;
}) {
  const { status } = useSession();
  const [json, setJson] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!homepageEnabled) return;
    if (status !== 'authenticated') {
      setReady(status === 'unauthenticated');
      return;
    }
    let cancelled = false;
    fetch('/api/public/gallery')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) {
          setJson(typeof d?.orgGalleryJson === 'string' ? d.orgGalleryJson : null);
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [homepageEnabled, status]);

  if (!homepageEnabled || !ready || !json) return null;
  return <HomeGallery enabled orgGalleryJson={json} title={title} />;
}
