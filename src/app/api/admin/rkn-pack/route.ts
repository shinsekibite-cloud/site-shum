import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getSiteIdentity } from '@/lib/site-identity';
import {
  buildRknDocumentHtml,
  parseRknPack,
  serializeRknPack,
  type RknPackDraft,
} from '@/lib/rkn-pack';

function unauthorized() {
  return NextResponse.json({ message: 'Нет доступа' }, { status: 403 });
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'ADMIN') return unauthorized();

    const identity = await getSiteIdentity();
    const settings = await prisma.siteSettings.findUnique({ where: { id: '1' } });
    let pack = parseRknPack(settings?.rknPackJson);
    // Prefill empty fields from SiteSettings
    if (!pack.operatorFullName && settings?.operatorName) pack.operatorFullName = settings.operatorName;
    if (!pack.inn && settings?.operatorInn) pack.inn = settings.operatorInn;
    if (!pack.ogrn && settings?.operatorOgrn) pack.ogrn = settings.operatorOgrn;
    if (!pack.pdnEmail && settings?.pdnResponsibleEmail) pack.pdnEmail = settings.pdnResponsibleEmail;
    if (!pack.websiteUrl) pack.websiteUrl = identity.publicOrigin;
    if (!pack.legalAddress && settings?.address) pack.legalAddress = settings.address;

    const url = new URL(req.url);
    if (url.searchParams.get('format') === 'html') {
      const html = buildRknDocumentHtml(pack, identity.siteName);
      return new NextResponse(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    return NextResponse.json({ pack, siteName: identity.siteName });
  } catch (e) {
    console.error('GET rkn-pack', e);
    return NextResponse.json({ message: 'Ошибка' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'ADMIN') return unauthorized();
    const body = await req.json().catch(() => ({}));
    const pack = parseRknPack(JSON.stringify(body.pack || {})) as RknPackDraft;
    if (!pack.preparedBy) pack.preparedBy = session.user.name || session.user.email || 'Админ';
    pack.preparedAt = new Date().toISOString();

    await prisma.siteSettings.upsert({
      where: { id: '1' },
      update: { rknPackJson: serializeRknPack(pack) },
      create: { id: '1', rknPackJson: serializeRknPack(pack) },
    });

    // Sync key operator fields back to SiteSettings legal tab
    await prisma.siteSettings.update({
      where: { id: '1' },
      data: {
        operatorName: pack.operatorFullName || null,
        operatorInn: pack.inn || null,
        operatorOgrn: pack.ogrn || null,
        pdnResponsibleEmail: pack.pdnEmail || null,
        address: pack.legalAddress || undefined,
      },
    });

    return NextResponse.json({ ok: true, pack });
  } catch (e) {
    console.error('PUT rkn-pack', e);
    return NextResponse.json({ message: 'Ошибка сохранения' }, { status: 500 });
  }
}
