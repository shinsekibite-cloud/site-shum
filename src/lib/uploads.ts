import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import crypto from 'crypto';
import { detectImageType } from '@/lib/image-magic';
import {
  IMAGE_UPLOAD_MAX_BYTES,
  optimizeUploadedImage,
  presetForUploadTarget,
  type ImagePreset,
} from '@/lib/image-optimize';

const DOC_MIME = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

const DOC_ALLOWED = new Set<string>([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-word',
  'application/octet-stream',
]);
const DOC_MAX = 20 * 1024 * 1024;

export type SaveImageOptions = {
  preset?: ImagePreset;
  fallbackUrl?: string;
};

/**
 * Validate, optimize (WebP), and store an image under public/uploads/{subdir}.
 * Used by portfolio, avatars, admin CMS, editor — one global pipeline.
 */
export async function saveUploadedImage(
  file: File | null | undefined,
  subdir: string,
  fallbackUrlOrOpts: string | SaveImageOptions = ''
): Promise<string> {
  const opts: SaveImageOptions =
    typeof fallbackUrlOrOpts === 'string'
      ? { fallbackUrl: fallbackUrlOrOpts }
      : fallbackUrlOrOpts || {};
  const fallbackUrl = opts.fallbackUrl || '';

  if (!file || file.size <= 0) return fallbackUrl;

  if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
    throw new Error('Файл слишком большой (максимум 15 МБ до сжатия)');
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const preset = opts.preset || presetForUploadTarget(subdir);
  const optimized = await optimizeUploadedImage(buffer, {
    preset,
    fileName: file.name,
  });

  const fileName = `${crypto.randomUUID()}.${optimized.ext}`;
  const uploadDir = join(process.cwd(), 'public', 'uploads', subdir);
  await mkdir(uploadDir, { recursive: true });
  await writeFile(join(uploadDir, fileName), optimized.buffer);
  return `/uploads/${subdir}/${fileName}`;
}

const VIDEO_MAX = 40 * 1024 * 1024;

/** Save muted hero / brand MP4 (basic magic-byte check). */
export async function saveUploadedVideo(
  file: File | null | undefined,
  subdir: string,
  fallbackUrl = ''
): Promise<string> {
  if (!file || file.size <= 0) return fallbackUrl;
  if (file.size > VIDEO_MAX) {
    throw new Error('Видео слишком большое (максимум 40 МБ)');
  }
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();
  if (!type.includes('mp4') && !name.endsWith('.mp4') && !type.includes('quicktime') && !name.endsWith('.mov')) {
    throw new Error('Допустимы только MP4 / MOV');
  }
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const head = buffer.subarray(0, 12).toString('ascii');
  if (!head.includes('ftyp') && buffer[4] !== 0x66) {
    const box = buffer.subarray(4, 8).toString('ascii');
    if (box !== 'ftyp') throw new Error('Некорректный видеофайл');
  }
  const ext = name.endsWith('.mov') ? 'mov' : 'mp4';
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const uploadDir = join(process.cwd(), 'public', 'uploads', subdir);
  await mkdir(uploadDir, { recursive: true });
  await writeFile(join(uploadDir, fileName), buffer);
  return `/uploads/${subdir}/${fileName}`;
}

import { isOfficeDoc } from '@/lib/document-types';

export type SavedDocument = {
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

function resolveDocMime(file: File): { mime: string; ext: string } | null {
  const extRaw = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  let mime = file.type || '';

  if (extRaw && extRaw in DOC_MIME) {
    if (['doc', 'docx', 'pdf', 'txt'].includes(extRaw) || !DOC_ALLOWED.has(mime) || mime === 'application/octet-stream') {
      mime = DOC_MIME[extRaw as keyof typeof DOC_MIME];
    }
  }

  if (!mime || (!DOC_ALLOWED.has(mime) && !(extRaw in DOC_MIME))) {
    return null;
  }
  if (mime === 'application/octet-stream') return null;

  const ext = extRaw || (mime.includes('wordprocessingml') ? 'docx' : mime.includes('msword') ? 'doc' : 'bin');
  return { mime, ext };
}

/** Save PDF / Word / image / text document under public/uploads/{subdir}. Images are optimized. */
export async function saveUploadedDocument(
  file: File | null | undefined,
  subdir = 'documents'
): Promise<SavedDocument | null> {
  if (!file || file.size <= 0) return null;

  if (file.size > DOC_MAX) {
    throw new Error('Файл слишком большой (максимум 20 МБ)');
  }

  const resolved = resolveDocMime(file);
  if (!resolved) {
    throw new Error('Допустимы PDF, DOC, DOCX, изображения (JPEG/PNG/WebP/GIF) и TXT');
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const uploadDir = join(process.cwd(), 'public', 'uploads', subdir);
  await mkdir(uploadDir, { recursive: true });

  // Image certificates / docs → same WebP pipeline
  const asImage = detectImageType(buffer);
  if (asImage || resolved.mime.startsWith('image/')) {
    const optimized = await optimizeUploadedImage(buffer, {
      preset: presetForUploadTarget(subdir),
      fileName: file.name,
    });
    const storedName = `${crypto.randomUUID()}.${optimized.ext}`;
    await writeFile(join(uploadDir, storedName), optimized.buffer);
    return {
      url: `/uploads/${subdir}/${storedName}`,
      fileName: file.name.slice(0, 180),
      mimeType: optimized.mime,
      sizeBytes: optimized.bytesOut,
    };
  }

  const storedName = `${crypto.randomUUID()}.${resolved.ext}`;
  await writeFile(join(uploadDir, storedName), buffer);

  return {
    url: `/uploads/${subdir}/${storedName}`,
    fileName: file.name.slice(0, 180),
    mimeType: resolved.mime,
    sizeBytes: file.size,
  };
}

export { isOfficeDoc, isViewableInBrowser } from '@/lib/document-types';
export { IMAGE_UPLOAD_MAX_BYTES } from '@/lib/image-optimize';
