'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import AboutTeamGrid, { type AboutTeamMember } from '@/components/AboutTeamGrid';

export default function AboutTeamAuth() {
  const { status } = useSession();
  const [members, setMembers] = useState<AboutTeamMember[] | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    fetch('/api/public/about-team')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setMembers(Array.isArray(d?.members) ? d.members : []);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (status !== 'authenticated') {
    return (
      <section className="about-section yp-surface" style={{ padding: '1.25rem' }}>
        <h2 className="about-section__title">Команда портала</h2>
        <p className="about-section__sub" style={{ marginBottom: '1rem' }}>
          Список сотрудников с именами и фото доступен только авторизованным пользователям.
        </p>
        <Link href="/login?callbackUrl=%2Fp%2Fabout" className="btn btn-primary">
          Войти, чтобы увидеть команду
        </Link>
      </section>
    );
  }

  if (!members) return null;
  return members.length ? <AboutTeamGrid members={members} /> : null;
}
