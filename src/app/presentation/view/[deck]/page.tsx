import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PresentationDeckPlayer from '@/components/PresentationDeckPlayer';
import { isDeckSlug, DEFAULT_PRESENTATION_CONTACTS } from '@/lib/presentation-types';
import { readDeck } from '@/lib/presentation-store';
import { prisma } from '@/lib/prisma';
import '@/app/presentation-deck.css';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ deck: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { deck: raw } = await params;
  if (!isDeckSlug(raw)) return { title: 'Презентация' };
  const deck = readDeck(raw);
  return {
    title: deck.title,
    description: deck.subtitle || 'Презентация портала',
  };
}

export default async function PresentationViewPage({ params }: Props) {
  const { deck: raw } = await params;
  if (!isDeckSlug(raw)) notFound();
  const deck = readDeck(raw);
  const folder = raw === 'full' ? 'deck' : 'necessary';

  const settings = await prisma.siteSettings.findUnique({
    where: { id: '1' },
    select: { contactPhone: true, contactEmail: true },
  });
  const phone = (settings?.contactPhone || '').trim();
  const email = (settings?.contactEmail || '').trim();
  const contacts =
    [phone, email].filter(Boolean).join(' · ') ||
    deck.contacts ||
    DEFAULT_PRESENTATION_CONTACTS;

  return (
    <PresentationDeckPlayer
      deck={deck}
      videoHref={`/presentation/${folder}/tour.mp4`}
      contacts={contacts}
    />
  );
}
