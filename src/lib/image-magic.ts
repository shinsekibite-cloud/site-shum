/** Detect real image type from magic bytes; map to safe extension. */

export type DetectedImage = { mime: string; ext: 'jpg' | 'png' | 'webp' | 'gif' }

export function detectImageType(buf: Buffer): DetectedImage | null {
  if (buf.length < 12) return null
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' }
  }
  // PNG
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' }
  }
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return { mime: 'image/gif', ext: 'gif' }
  }
  // WEBP: RIFF....WEBP
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: 'webp' }
  }
  return null
}

/** Reject SVG/HTML/script disguised as images. */
export function looksLikeScriptPayload(buf: Buffer): boolean {
  const head = buf.subarray(0, Math.min(buf.length, 512)).toString('utf8').toLowerCase()
  return (
    head.includes('<svg') ||
    head.includes('<html') ||
    head.includes('<script') ||
    head.includes('<?xml')
  )
}
