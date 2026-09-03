import { NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { publishedWhere } from '@/lib/publish';
import { rejectIfModuleDisabled } from '@/lib/require-module';

const EXT_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/**
 * Stream a published document with correct MIME and Content-Disposition.
 * ?disposition=inline  → open in browser (PDF preview / new tab)
 * ?disposition=attachment → force download
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const blocked = await rejectIfModuleDisabled('documents');
  if (blocked) return blocked;

  const { id } = await ctx.params;
  const doc = await prisma.siteDocument.findFirst({
    where: { id, ...publishedWhere() },
  });
  if (!doc) {
    return NextResponse.json({ message: 'Документ не найден' }, { status: 404 });
  }

  const urlPath = doc.fileUrl.replace(/^\/+/, '');
  if (!urlPath.startsWith('uploads/')) {
    return NextResponse.json({ message: 'Некорректный путь файла' }, { status: 400 });
  }

  const uploadsRoot = path.resolve(process.cwd(), 'public', 'uploads');
  const filePath = path.resolve(process.cwd(), 'public', urlPath);
  const { isPathInside } = await import('@/lib/safe-path');
  if (!isPathInside(uploadsRoot, filePath)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      return NextResponse.json({ message: 'Файл не найден' }, { status: 404 });
    }
    const buf = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = EXT_MIME[ext] || doc.mimeType || 'application/octet-stream';

    const { searchParams } = new URL(req.url);
    const disposition =
      searchParams.get('disposition') === 'attachment' ? 'attachment' : 'inline';
    const safeName = doc.fileName.replace(/["\r\n]/g, '_') || `document${ext}`;

    return new NextResponse(buf, {
      headers: {
        'Content-Type': mime,
        'Content-Length': String(info.size),
        'Content-Disposition': `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ message: 'Файл не найден' }, { status: 404 });
  }
}
