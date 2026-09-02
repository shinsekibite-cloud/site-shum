/** Client-safe gallery parsers (no Prisma / Node deps). */

export type GalleryModerationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type GalleryItem = {
  url: string;
  caption?: string;
  /** Missing status = legacy approved */
  status?: GalleryModerationStatus;
  createdAt?: string;
};

export function parseGalleryItems(raw: unknown, max = 48): GalleryItem[] {
  if (!raw) return [];
  let data: unknown = raw;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return [];
    try {
      data = JSON.parse(t);
    } catch {
      return t
        .split(/[\n,]+/)
        .map((u) => u.trim())
        .filter((u) => u.startsWith('/') || /^https?:\/\//i.test(u))
        .slice(0, max)
        .map((url) => ({ url }));
    }
  }
  if (!Array.isArray(data)) return [];
  const out: GalleryItem[] = [];
  for (const row of data) {
    if (typeof row === 'string') {
      const url = row.trim();
      if (url.startsWith('/') || /^https?:\/\//i.test(url)) out.push({ url });
    } else if (row && typeof row === 'object' && typeof (row as GalleryItem).url === 'string') {
      const url = String((row as GalleryItem).url).trim();
      if (!url) continue;
      const caption = (row as GalleryItem).caption?.trim();
      const statusRaw = String((row as GalleryItem).status || '').toUpperCase();
      const status =
        statusRaw === 'PENDING' || statusRaw === 'APPROVED' || statusRaw === 'REJECTED'
          ? (statusRaw as GalleryModerationStatus)
          : undefined;
      const createdAt = (row as GalleryItem).createdAt?.trim();
      out.push({
        url,
        ...(caption ? { caption } : {}),
        ...(status ? { status } : {}),
        ...(createdAt ? { createdAt } : {}),
      });
    }
    if (out.length >= max) break;
  }
  return out;
}

export function serializeGalleryItems(items: GalleryItem[], max = 48): string {
  return JSON.stringify(
    items
      .map((i) => ({
        url: String(i.url || '').trim(),
        ...(i.caption?.trim() ? { caption: i.caption.trim().slice(0, 120) } : {}),
        ...(i.status ? { status: i.status } : {}),
        ...(i.createdAt ? { createdAt: i.createdAt } : {}),
      }))
      .filter((i) => i.url)
      .slice(0, max)
  );
}

/** Persist as JSON string[] for entity galleries (clubs/projects/spaces). */
export function serializeGalleryUrls(urls: string[], max = 24): string | null {
  const clean = urls
    .map((u) => String(u || '').trim())
    .filter((u) => u.startsWith('/') || /^https?:\/\//i.test(u))
    .slice(0, max);
  return clean.length ? JSON.stringify(clean) : null;
}

export function galleryUrls(items: GalleryItem[]): string[] {
  return items.map((i) => i.url);
}
