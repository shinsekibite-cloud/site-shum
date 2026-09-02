import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import dns from 'dns/promises';
import net from 'net';
import { detectImageType, looksLikeScriptPayload } from '@/lib/image-magic';

const MIN_BYTES = 8_000; // skip 1x1 gif trackers / tiny stubs

/** Hosts allowed for VK wall image download (after redirects). */
const VK_IMAGE_HOST_RE =
  /^(?:[\w-]+\.)*(?:userapi\.com|vk-cdn\.net|vkuseraudio\.net|vk\.com|vk\.ru|vkcc\.com)$/i;

function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^::ffff:/, '');
  if (v === '::1' || v === '0.0.0.0') return true;
  if (net.isIP(v) === 4) {
    const p = v.split('.').map(Number);
    if (p[0] === 10) return true;
    if (p[0] === 127) return true;
    if (p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
    return false;
  }
  if (net.isIP(v) === 6) {
    if (v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true;
    return false;
  }
  return true;
}

async function assertSafeRemoteImageUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('bad url');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('bad protocol');
  if (u.username || u.password) throw new Error('userinfo');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!VK_IMAGE_HOST_RE.test(host)) throw new Error('host not allowlisted');
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('private ip');
  } else {
    const looked = await dns.lookup(host, { all: true, verbatim: true });
    if (!looked.length) throw new Error('dns empty');
    for (const row of looked) {
      if (isPrivateIp(row.address)) throw new Error('private dns');
    }
  }
  return u;
}

/** Stock / legacy covers that should be replaced by a real VK download. */
export function isPlaceholderNewsCover(imageUrl: string | null | undefined): boolean {
  const u = String(imageUrl || '').trim();
  if (!u) return true;
  return (
    /news-default/i.test(u) ||
    /section-news/i.test(u) ||
    /\/covers\/news-/i.test(u) ||
    u.startsWith('/media/news/') ||
    u === '/hero-bg.jpg' ||
    u === '/brand/templates/section-news.svg'
  );
}

function requestBuffer(url: string, redirects = 0): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    void (async () => {
      try {
        const safe = await assertSafeRemoteImageUrl(url);
        const lib = safe.protocol === 'https:' ? https : http;
        const req = lib.get(
          safe,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; YoungPortal/1.0; +https://py.idivles.ru)',
              Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            },
            timeout: 20000,
          },
          (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              res.resume();
              const next = res.headers.location.startsWith('http')
                ? res.headers.location
                : new URL(res.headers.location, safe).toString();
              return resolve(requestBuffer(next, redirects + 1));
            }
            if (res.statusCode !== 200) {
              res.resume();
              return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const chunks: Buffer[] = [];
            let total = 0;
            const MAX = 8 * 1024 * 1024;
            res.on('data', (c: Buffer) => {
              total += c.length;
              if (total > MAX) {
                req.destroy();
                reject(new Error('too large'));
                return;
              }
              chunks.push(c);
            });
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
          }
        );
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('timeout'));
        });
      } catch (e) {
        reject(e);
      }
    })();
  });
}

/** Download remote image; return local public URL or null if invalid. */
export async function downloadNewsImage(
  url: string,
  destBasename: string,
  uploadDir = path.join(process.cwd(), 'public', 'uploads', 'news')
): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const buf = await requestBuffer(url);
    if (buf.length < MIN_BYTES) return null;
    if (looksLikeScriptPayload(buf)) return null;
    const detected = detectImageType(buf);
    if (!detected) return null;
    // Reject 1x1 / tiny dimensions encoded as GIF/PNG stubs by size only (already MIN_BYTES)
    fs.mkdirSync(uploadDir, { recursive: true });
    const fileName = `${destBasename}.${detected.ext}`;
    const dest = path.join(uploadDir, fileName);
    fs.writeFileSync(dest, buf);
    return `/uploads/news/${fileName}`;
  } catch {
    return null;
  }
}

/** Pick largest real photo URL from VK wall attachment list. */
export function pickVkPhotoUrl(attachments: unknown): string | null {
  if (!Array.isArray(attachments)) return null;
  let best: { url: string; area: number } | null = null;
  for (const a of attachments as any[]) {
    if (!a || a.type !== 'photo' || !a.photo?.sizes) continue;
    for (const s of a.photo.sizes as Array<{ url?: string; width?: number; height?: number }>) {
      if (!s?.url) continue;
      const area = (s.width || 0) * (s.height || 0);
      if (area < 40_000) continue; // skip tiny thumbs / trackers
      if (!best || area > best.area) best = { url: s.url, area };
    }
  }
  return best?.url || null;
}

export type VkVideoInfo = {
  embedUrl: string;
  thumbUrl: string | null;
  title: string | null;
  ownerId: number;
  videoId: number;
  accessKey: string | null;
};

function largestImageUrl(
  images: Array<{ url?: string; width?: number; height?: number }> | undefined
): string | null {
  if (!Array.isArray(images)) return null;
  let best: { url: string; area: number } | null = null;
  for (const s of images) {
    if (!s?.url) continue;
    const area = (s.width || 0) * (s.height || 0);
    if (!best || area > best.area) best = { url: s.url, area };
  }
  return best?.url || null;
}

/** Allow only VK official embed player URLs. */
export function isAllowedVkVideoEmbed(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host !== 'vk.com' && host !== 'vk.ru') return false;
    return u.pathname === '/video_ext.php';
  } catch {
    return false;
  }
}

export function normalizeVkVideoEmbed(url: string): string | null {
  if (!isAllowedVkVideoEmbed(url)) return null;
  try {
    const u = new URL(url);
    u.protocol = 'https:';
    u.hostname = 'vk.com';
    // Drop noisy tracking params; keep oid/id/hash
    const keep = new URLSearchParams();
    for (const key of ['oid', 'id', 'hash', 'hd']) {
      const v = u.searchParams.get(key);
      if (v) keep.set(key, v);
    }
    if (!keep.get('oid') || !keep.get('id')) return null;
    u.search = keep.toString();
    return u.toString();
  } catch {
    return null;
  }
}

function buildVkVideoEmbed(ownerId: number, videoId: number, accessKey?: string | null): string {
  const params = new URLSearchParams({
    oid: String(ownerId),
    id: String(videoId),
  });
  if (accessKey) params.set('hash', accessKey);
  return `https://vk.com/video_ext.php?${params.toString()}`;
}

/**
 * Extract first playable VK video from wall attachments.
 * Prefers official `player` URL; otherwise builds video_ext.php from ids.
 */
export function pickVkVideo(attachments: unknown): VkVideoInfo | null {
  if (!Array.isArray(attachments)) return null;
  for (const a of attachments as any[]) {
    if (!a || a.type !== 'video' || !a.video) continue;
    const v = a.video;
    const ownerId = Number(v.owner_id);
    const videoId = Number(v.id);
    if (!Number.isFinite(ownerId) || !Number.isFinite(videoId)) continue;

    const accessKey = typeof v.access_key === 'string' && v.access_key ? v.access_key : null;
    let embedUrl =
      (typeof v.player === 'string' && normalizeVkVideoEmbed(v.player)) ||
      buildVkVideoEmbed(ownerId, videoId, accessKey);

    if (!isAllowedVkVideoEmbed(embedUrl)) continue;

    const thumbUrl =
      largestImageUrl(v.image) ||
      largestImageUrl(v.photo) ||
      (typeof v.photo_800 === 'string' ? v.photo_800 : null) ||
      (typeof v.photo_640 === 'string' ? v.photo_640 : null) ||
      (typeof v.photo_320 === 'string' ? v.photo_320 : null) ||
      null;

    return {
      embedUrl,
      thumbUrl,
      title: typeof v.title === 'string' && v.title.trim() ? v.title.trim() : null,
      ownerId,
      videoId,
      accessKey,
    };
  }
  return null;
}

/** Enrich embed URL via video.get when wall attachment lacked a working player/hash. */
export async function resolveVkVideoEmbed(
  apiToken: string,
  video: VkVideoInfo
): Promise<string> {
  if (video.embedUrl.includes('hash=')) return video.embedUrl;
  try {
    const videos = video.accessKey
      ? `${video.ownerId}_${video.videoId}_${video.accessKey}`
      : `${video.ownerId}_${video.videoId}`;
    const apiUrl = `https://api.vk.com/method/video.get?videos=${encodeURIComponent(videos)}&access_token=${encodeURIComponent(apiToken)}&v=5.131`;
    const res = await fetch(apiUrl);
    const data = await res.json();
    const item = data?.response?.items?.[0];
    const player = typeof item?.player === 'string' ? normalizeVkVideoEmbed(item.player) : null;
    if (player) return player;
  } catch {
    // keep constructed embed
  }
  return video.embedUrl;
}
