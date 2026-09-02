import path from 'path';

/**
 * Absolute root for uploaded files on disk.
 * Docker mounts `./public/uploads` → `/app/public/uploads`.
 * Prefer UPLOAD_DIR when set (absolute path inside the container).
 */
export function getUploadRoot() {
  if (process.env.UPLOAD_DIR?.trim()) {
    return path.resolve(process.env.UPLOAD_DIR.trim());
  }
  return path.join(process.cwd(), 'public', 'uploads');
}

/** Resolve a public `/uploads/...` URL to an absolute filesystem path. */
export function resolveUploadPath(storagePath: string) {
  const rel = storagePath.replace(/^\/uploads\//, '').replace(/^\//, '');
  return path.join(getUploadRoot(), rel);
}
