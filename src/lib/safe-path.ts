import path from 'path';

/** True if resolved `candidate` is inside `root` (with path-separator guard). */
export function isPathInside(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  const prefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
  return resolved === resolvedRoot || resolved.startsWith(prefix);
}

/** Resolve a public uploads-relative path and ensure it stays under uploads/. */
export function resolveUnderUploads(relativeOrUrl: string): string | null {
  const cleaned = String(relativeOrUrl || '')
    .replace(/^\/+/, '')
    .replace(/^public\//, '');
  if (!cleaned.startsWith('uploads/')) return null;
  const root = path.join(process.cwd(), 'public', 'uploads');
  const abs = path.join(process.cwd(), 'public', cleaned);
  if (!isPathInside(root, abs)) return null;
  return abs;
}
