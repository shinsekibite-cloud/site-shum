'use client';

import Link from 'next/link';
import { Gift, MessageCircle, Share2, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import EntityInviteFriends from '@/components/entity/EntityInviteFriends';

type Props = {
  kind: 'PROJECT' | 'CLUB';
  entityId: string;
  entityTitle: string;
};

/**
 * Compact team tools: invite friends on-site + share referral link + open Messages.
 * In-entity chat removed — conversation lives in /messages.
 */
export default function EntityTeamPanel({ kind, entityId, entityTitle }: Props) {
  const [refLink, setRefLink] = useState('');
  const [refCode, setRefCode] = useState('');
  const [loadingRef, setLoadingRef] = useState(true);

  const loadRef = useCallback(async () => {
    setLoadingRef(true);
    try {
      const res = await fetch('/api/referrals?lite=1', { cache: 'default' });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        setRefLink(String(data.registerLink || data.link || ''));
        setRefCode(String(data.code || ''));
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingRef(false);
    }
  }, []);

  useEffect(() => {
    void loadRef();
  }, [loadRef]);

  const shareReferral = async () => {
    if (!refLink) {
      toast.error('Ссылка ещё загружается');
      return;
    }
    const text = `Присоединяйся к «${entityTitle}» на молодёжном портале Сочи. Мой код: ${refCode || '—'}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: entityTitle, text, url: refLink });
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${refLink}`);
      toast.success('Реферальная ссылка скопирована');
    } catch {
      toast.error('Не удалось скопировать');
    }
  };

  const messagesHref = `/messages?entity=${encodeURIComponent(kind.toLowerCase())}&id=${encodeURIComponent(entityId)}`;

  return (
    <div className="entity-team-panel">
      <h3 className="entity-team-panel__title">
        <Users size={16} aria-hidden /> Для команды
      </h3>
      <p className="entity-team-panel__lead">
        Зовите друзей с сайта или по реферальной ссылке — за приглашённых и их друзей начисляются мбаллы
        (2 уровня).
      </p>

      <EntityInviteFriends kind={kind} entityId={entityId} entityTitle={entityTitle} />

      <div className="entity-team-panel__actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm entity-team-panel__btn"
          onClick={() => void shareReferral()}
          disabled={loadingRef && !refLink}
        >
          <Share2 size={15} aria-hidden />
          Рефералка
        </button>
        <Link href="/dashboard/referrals" className="btn btn-ghost btn-sm entity-team-panel__btn">
          <Gift size={15} aria-hidden />
          Условия
        </Link>
        <Link href={messagesHref} className="btn btn-primary btn-sm entity-team-panel__btn entity-team-panel__chat">
          <MessageCircle size={15} aria-hidden />
          Чат в сообщениях
        </Link>
      </div>
    </div>
  );
}
