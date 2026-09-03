import { NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import { isPathInside } from '@/lib/safe-path';

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/**
 * Fallback media serving for environments where nginx does not alias /uploads.
 * Prefer nginx `location /uploads/` in production.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path: parts } = await ctx.params;
  if (!parts?.length) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  const safe = parts.map((p) => p.replace(/\.\./g, '')).filter(Boolean);
  const uploadsRoot = path.resolve(process.cwd(), 'public', 'uploads');
  const filePath = path.resolve(uploadsRoot, ...safe);
  if (!isPathInside(uploadsRoot, filePath)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }
    const buf = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    const disposition = ext === '.pdf' || ext.startsWith('.jp') || ext === '.png' || ext === '.webp' || ext === '.gif' || ext === '.txt'
      ? 'inline'
      : 'attachment';
    const name = path.basename(filePath).replace(/["\r\n]/g, '_');
    return new NextResponse(buf, {
      headers: {
        'Content-Type': mime,
        'Content-Disposition': `${disposition}; filename="${name}"`,
        'Cache-Control': 'public, max-age=604800',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
}
