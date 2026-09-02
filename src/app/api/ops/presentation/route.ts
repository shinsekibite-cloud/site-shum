import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { authOptions } from '@/lib/auth';
import { isTechRole } from '@/lib/module-flags';
import { isDeckSlug, type PresentationDeck, type PresentationSlide } from '@/lib/presentation-types';
import { readDeck, writeDeck, uploadsDir } from '@/lib/presentation-store';
import { defaultFullDeck, defaultNecessaryDeck } from '@/lib/presentation-defaults';

export const dynamic = 'force-dynamic';

async function requireTech() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isTechRole(session.user.role)) return null;
  return session;
}

export async function GET(req: Request) {
  if (!(await requireTech())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const url = new URL(req.url);
  const slug = url.searchParams.get('deck') || 'full';
  if (!isDeckSlug(slug)) {
    return NextResponse.json({ error: 'Unknown deck' }, { status: 400 });
  }
  return NextResponse.json({ deck: readDeck(slug) });
}

export async function PUT(req: Request) {
  if (!(await requireTech())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as
    | { deck?: PresentationDeck; action?: string; slug?: string }
    | null;
  if (!body) return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });

  if (body.action === 'reset') {
    const slug = body.slug || 'full';
    if (!isDeckSlug(slug)) return NextResponse.json({ error: 'Unknown deck' }, { status: 400 });
    const deck = writeDeck(slug === 'full' ? defaultFullDeck() : defaultNecessaryDeck());
    return NextResponse.json({ ok: true, deck });
  }

  const deck = body.deck;
  if (!deck || !isDeckSlug(deck.slug) || !Array.isArray(deck.slides)) {
    return NextResponse.json({ error: 'Invalid deck' }, { status: 400 });
  }
  const cleaned: PresentationDeck = {
    slug: deck.slug,
    title: String(deck.title || '').slice(0, 120) || (deck.slug === 'full' ? 'Полный функционал' : 'Необходимый'),
    subtitle: deck.subtitle ? String(deck.subtitle).slice(0, 200) : undefined,
    slides: deck.slides.map((s: PresentationSlide, i: number) => ({
      id: String(s.id || `slide-${i + 1}`).slice(0, 64),
      kicker: s.kicker ? String(s.kicker).slice(0, 120) : undefined,
      title: String(s.title || 'Слайд').slice(0, 200),
      lead: s.lead ? String(s.lead).slice(0, 2000) : undefined,
      bullets: Array.isArray(s.bullets)
        ? s.bullets.map((b) => String(b).slice(0, 400)).filter(Boolean).slice(0, 20)
        : undefined,
      cards: Array.isArray(s.cards)
        ? s.cards
            .map((c) => ({
              title: String(c.title || '').slice(0, 120),
              text: String(c.text || '').slice(0, 400),
            }))
            .filter((c) => c.title)
            .slice(0, 24)
        : undefined,
      image: s.image ? String(s.image).slice(0, 500) : null,
      footer: s.footer ? String(s.footer).slice(0, 120) : undefined,
    })),
  };
  const saved = writeDeck(cleaned);
  return NextResponse.json({ ok: true, deck: saved });
}

export async function POST(req: Request) {
  if (!(await requireTech())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const form = await req.formData();
  const slugRaw = String(form.get('deck') || 'full');
  if (!isDeckSlug(slugRaw)) {
    return NextResponse.json({ error: 'Unknown deck' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: 'Max 8MB' }, { status: 400 });
  }
  const type = file.type || '';
  if (!/^image\/(png|jpe?g|webp|gif)$/i.test(type)) {
    return NextResponse.json({ error: 'Only images' }, { status: 400 });
  }
  const ext = type.includes('png')
    ? 'png'
    : type.includes('webp')
      ? 'webp'
      : type.includes('gif')
        ? 'gif'
        : 'jpg';
  const name = `shot-${Date.now()}.${ext}`;
  const dir = uploadsDir(slugRaw);
  const buf = Buffer.from(await file.arrayBuffer());
  writeFileSync(join(dir, name), buf);
  const folder = slugRaw === 'full' ? 'deck' : 'necessary';
  const url = `/presentation/${folder}/media/uploads/${name}`;
  return NextResponse.json({ ok: true, url });
}
