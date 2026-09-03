import { NextRequest, NextResponse } from 'next/server';
import { buildSignedPrivacyDocument } from '@/lib/privacy-document';

/**
 * Download signed privacy policy.
 * ?format=html (default) — UTF-8 HTML (reliable on Android)
 * ?format=txt — UTF-16 LE with BOM (Android/Windows viewers often misread UTF-8)
 */
export async function GET(req: NextRequest) {
  const format = (req.nextUrl.searchParams.get('format') || 'html').toLowerCase();
  const doc = await buildSignedPrivacyDocument();

  if (format === 'txt') {
    // Many Android file viewers ignore charset=utf-8 and decode as Windows-1251.
    // UTF-16 LE + BOM (FF FE) is recognized by Android Text / Notepad reliably.
    const utf16 = Buffer.from(`\uFEFF${doc.plainText}`, 'utf16le');
    return new NextResponse(new Uint8Array(utf16), {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-16le',
        'Content-Disposition': `attachment; filename="politika-konfidencialnosti.txt"; filename*=UTF-8''politika-konfidencialnosti.txt`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  return new NextResponse(doc.html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="politika-konfidencialnosti-molodezh-sochi.html"; filename*=UTF-8''politika-konfidencialnosti-molodezh-sochi.html`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
