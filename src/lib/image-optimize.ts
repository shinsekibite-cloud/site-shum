import sharp from 'sharp';
import { detectImageType, looksLikeScriptPayload } from '@/lib/image-magic';

/** Incoming raw upload cap (before optimization). */
export const IMAGE_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;

export type ImagePreset =
  | 'avatar'
  | 'cover'
  | 'content'
  | 'logo'
  | 'hero'
  | 'editor';

type PresetConfig = {
  /** Longest edge (px); square for avatar/logo */
  maxEdge: number;
  width?: number;
  height?: number;
  fit: keyof sharp.FitEnum;
  quality: number;
  /** Prefer square crop for faces / logos */
  square?: boolean;
};

const PRESETS: Record<ImagePreset, PresetConfig> = {
  avatar: { maxEdge: 512, width: 512, height: 512, fit: 'cover', quality: 82, square: true },
  logo: { maxEdge: 512, width: 512, height: 512, fit: 'inside', quality: 85, square: true },
  cover: { maxEdge: 1920, width: 1920, height: 1080, fit: 'inside', quality: 82 },
  hero: { maxEdge: 2400, width: 2400, height: 1350, fit: 'inside', quality: 80 },
  content: { maxEdge: 1600, fit: 'inside', quality: 80 },
  editor: { maxEdge: 1600, fit: 'inside', quality: 80 },
};

/** Map upload subdir (or special keys) → optimization preset. */
export function presetForUploadTarget(subdirOrKind: string): ImagePreset {
  const key = subdirOrKind.replace(/^\/+|\/+$/g, '').split('/')[0] || 'content';
  switch (key) {
    case 'avatars':
    case 'avatar':
      return 'avatar';
    case 'portfolio':
    case 'portfolio-certs':
    case 'cover':
      return 'cover';
    case 'brand':
      return 'hero';
    case 'logo':
      return 'logo';
    case 'editor':
    case '':
      return 'editor';
    default:
      return 'content';
  }
}

export type OptimizedImage = {
  buffer: Buffer;
  ext: 'webp' | 'gif' | 'jpg' | 'png';
  mime: string;
  width: number;
  height: number;
  bytesIn: number;
  bytesOut: number;
};

function isHeicLike(buf: Buffer, fileName = ''): boolean {
  const name = fileName.toLowerCase();
  if (name.endsWith('.heic') || name.endsWith('.heif')) return true;
  if (buf.length < 12) return false;
  const brand = buf.subarray(4, 12).toString('ascii');
  return brand.startsWith('ftyp') && /heic|heif|mif1|msf1/i.test(buf.subarray(8, 16).toString('ascii'));
}

/**
 * Validate + optimize a user-uploaded image:
 * EXIF rotate, resize to preset, strip metadata, encode WebP (or keep animated GIF).
 */
export async function optimizeUploadedImage(
  input: Buffer,
  opts: {
    preset?: ImagePreset;
    fileName?: string;
  } = {}
): Promise<OptimizedImage> {
  const bytesIn = input.length;
  if (bytesIn <= 0) throw new Error('Пустой файл');
  if (bytesIn > IMAGE_UPLOAD_MAX_BYTES) {
    throw new Error('Файл слишком большой (максимум 15 МБ до сжатия)');
  }
  if (looksLikeScriptPayload(input)) {
    throw new Error('Недопустимое содержимое файла');
  }

  const detected = detectImageType(input);
  if (!detected) {
    if (isHeicLike(input, opts.fileName)) {
      throw new Error(
        'Формат HEIC/HEIF не поддерживается. Сохраните фото как JPEG или PNG в галерее и загрузите снова.'
      );
    }
    throw new Error('Недопустимый формат файла (JPEG, PNG, WebP, GIF)');
  }

  const preset = PRESETS[opts.preset || 'content'];

  try {
    const pipeline = sharp(input, {
      failOn: 'none',
      animated: detected.ext === 'gif',
      limitInputPixels: 40_000_000,
    }).rotate();

    const meta = await pipeline.metadata();
    const animatedGif = detected.ext === 'gif' && (meta.pages || 1) > 1;

    // Keep animated GIFs (resized) — WebP animation support varies by browser/context
    if (animatedGif) {
      const out = await sharp(input, { animated: true, failOn: 'none' })
        .rotate()
        .resize({
          width: preset.square ? preset.width : preset.width || preset.maxEdge,
          height: preset.square ? preset.height : preset.height || preset.maxEdge,
          fit: preset.fit,
          withoutEnlargement: true,
        })
        .gif({ effort: 4 })
        .toBuffer({ resolveWithObject: true });

      return {
        buffer: out.data,
        ext: 'gif',
        mime: 'image/gif',
        width: out.info.width,
        height: out.info.height,
        bytesIn,
        bytesOut: out.data.length,
      };
    }

    let img = sharp(input, { failOn: 'none' }).rotate();

    if (preset.square && preset.width && preset.height) {
      img = img.resize(preset.width, preset.height, {
        fit: preset.fit,
        withoutEnlargement: false,
        position: 'attention',
      });
    } else {
      img = img.resize({
        width: preset.width || preset.maxEdge,
        height: preset.height || preset.maxEdge,
        fit: preset.fit,
        withoutEnlargement: true,
      });
    }

    const out = await img
      .webp({
        quality: preset.quality,
        effort: 4,
        smartSubsample: true,
      })
      .toBuffer({ resolveWithObject: true });

    // If WebP somehow larger than a well-compressed JPEG source and small, keep jpeg
    // (rare). Prefer WebP always for consistency on the site.
    return {
      buffer: out.data,
      ext: 'webp',
      mime: 'image/webp',
      width: out.info.width,
      height: out.info.height,
      bytesIn,
      bytesOut: out.data.length,
    };
  } catch (e) {
    if (e instanceof Error && /unsupported|heif|heic/i.test(e.message)) {
      throw new Error(
        'Не удалось обработать изображение. Сохраните как JPEG/PNG/WebP и попробуйте снова.'
      );
    }
    throw e instanceof Error ? e : new Error('Ошибка обработки изображения');
  }
}
