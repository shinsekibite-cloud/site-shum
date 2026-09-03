import path from 'path';
import { getUploadRoot, resolveUploadPath } from '@/lib/upload-root';

/**
 * Non-public storage for encrypted archives and secrets.
 * Must NOT be under public/uploads (nginx aliases that tree).
 * Docker mounts ./data → /app/data.
 */
export function getPrivateRoot() {
  if (process.env.PRIVATE_DIR?.trim()) {
    return path.resolve(process.env.PRIVATE_DIR.trim());
  }
  return path.join(process.cwd(), 'data', 'private');
}

/**
 * Resolve a storagePath from DB.
 * - Legacy: `/uploads/backups/...` or `/uploads/lea/...` (still on disk until migrated)
 * - New: `private/backups/...` or `private/lea/...`
 */
export function resolvePrivateStoragePath(storagePath: string) {
  const trimmed = (storagePath || '').trim();
  if (!trimmed) {
    throw new Error('Empty storage path');
  }
  if (trimmed.startsWith('/uploads/')) {
    return resolveUploadPath(trimmed);
  }
  const rel = trimmed.replace(/^\/?private\//, '').replace(/^\//, '');
  const abs = path.resolve(getPrivateRoot(), rel);
  const root = path.resolve(getPrivateRoot());
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error('Path escapes private root');
  }
  return abs;
}

/** Legacy public dirs that must stop being web-reachable. */
export function legacySensitiveUploadDirs() {
  const root = getUploadRoot();
  return {
    backups: path.join(root, 'backups'),
    lea: path.join(root, 'lea'),
    vapid: path.join(root, '.vapid-keys.json'),
  };
}
