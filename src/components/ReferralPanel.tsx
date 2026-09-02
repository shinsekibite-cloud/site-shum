'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Gift, Share2, Users, ShieldCheck, Leaf, Sparkles, Link2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { REFERRAL_STATUS_RU, statusRu } from '@/lib/status-labels-ru';

type Dash = {
  code: string;
  link: string;
  registerLink: string;
  stats: {
    invited: number;
    qualified: number;
    rejected: number;
    ecoEarned: number;
    socialEarned: number;
    authorityEarned: number;
  };
  rewards: Record<string, number>;
  referredBy: { name?: string | null; code?: string | null; publicCode?: string | null } | null;
  recent: {
    id: string;
    status: string;
    createdAt: string;
    qualifiedAt: string | null;
    referee: { name?: string | null; publicCode?: string | null; image?: string | null };
  }[];
};


export default function ReferralPanel() {
  const [data, setData] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/referrals', { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.message || 'Не удалось загрузить');
        setData(null);
        return;
      }
      setData(json);
    } catch {
      setError('Сеть недоступна');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} скопирована`);
    } catch {
      toast.error('Не удалось скопировать');
    }
  };

  const share = async () => {
    if (!data) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Приглашение на портал',
          text: 'Заходи на молодёжный портал Сочи по моей ссылке',
          url: data.registerLink || data.link,
        });
        return;
      }
    } catch {
      /* fall through */
    }
    void copy(data.registerLink || data.link, 'Ссылка');
  };

  if (loading && !data) {
    return (
      <div className="referral-panel is-loading" aria-busy>
        Загрузка реферальной программы…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="referral-panel">
        <div className="referral-panel__head">
          <h3 className="referral-panel__title">
            <Gift size={18} aria-hidden /> Пригласи друзей
          </h3>
        </div>
        <p className="referral-panel__note">{error || 'Пока недоступно'}</p>
        <button type="button" className="btn btn-secondary" onClick={() => void load()}>
          Повторить
        </button>
      </div>
    );
  }

  return (
    <section className="referral-panel referral-panel--modern" aria-label="Реферальная программа">
      <div className="referral-panel__head">
        <div>
          <h3 className="referral-panel__title">
            <Gift size={18} aria-hidden /> Пригласи друзей
          </h3>
          <p className="referral-panel__lead">
            Друг регистрируется по ссылке и приходит на событие — вы оба получаете эко и социум.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => void share()}>
          <Share2 size={15} /> Поделиться
        </button>
      </div>

      <div className="referral-panel__link-box">
        <div className="referral-panel__code-row">
          <span className="referral-panel__code-label">
            <Link2 size={14} /> Код
          </span>
          <code className="referral-panel__code">{data.code}</code>
          <button type="button" className="btn btn-secondary" onClick={() => void copy(data.code, 'Код')}>
            <Copy size={14} />
          </button>
        </div>
        <div className="referral-panel__link-actions">
          <button type="button" className="btn btn-secondary" onClick={() => void copy(data.link, 'Ссылка')}>
            <Copy size={15} /> Ссылка-приглашение
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void copy(data.registerLink, 'Ссылка на регистрацию')}
          >
            На регистрацию
          </button>
        </div>
      </div>

      <div className="referral-panel__stats" aria-label="Статистика">
        <div>
          <Users size={16} /> <strong>{data.stats.invited}</strong>
          <span>приглашено</span>
        </div>
        <div>
          <ShieldCheck size={16} /> <strong>{data.stats.qualified}</strong>
          <span>с check-in</span>
        </div>
        <div>
          <Leaf size={16} /> <strong>{data.stats.ecoEarned}</strong>
          <span>эко</span>
        </div>
        <div>
          <Sparkles size={16} /> <strong>+{data.stats.socialEarned}</strong>
          <span>социум</span>
        </div>
      </div>

      <button
        type="button"
        className="referral-panel__rules-toggle"
        aria-expanded={rulesOpen}
        onClick={() => setRulesOpen((v) => !v)}
      >
        {rulesOpen ? 'Скрыть правила' : 'Как начисляется'}
      </button>
      {rulesOpen ? (
        <div className="referral-panel__rules">
          <ul>
            <li>
              Регистрация: вам до <b>{data.rewards.ECO_SIGNUP_REFERRER}</b> эко, другу{' '}
              <b>{data.rewards.ECO_SIGNUP_REFEREE}</b>.
            </li>
            <li>
              Инструктаж друга: +<b>{data.rewards.ECO_INSTRUCTIONS_REFERRER}</b> эко вам.
            </li>
            <li>
              Отметка на событии: +<b>{data.rewards.ECO_CHECKIN_REFERRER}</b> эко вам, +
              <b>{data.rewards.ECO_CHECKIN_REFEREE}</b> другу.
            </li>
            <li>
              Вехи 3 / 10 check-in: +{data.rewards.ECO_MILESTONE_3} / +{data.rewards.ECO_MILESTONE_10} мб.
            </li>
            <li>
              Уровень 2: если ваш друг пригласит своего друга, вам ~{Math.round((data.rewards.L2_SIGNUP_PCT || 0.2) * 100)}%
              от эко за его регистрацию и ~{Math.round((data.rewards.L2_CHECKIN_PCT || 0.15) * 100)}% от эко за его
              check-in.
            </li>
            <li>
              Лимиты {data.rewards.DAILY_ECO_CAP_REFERRER}/сутки и {data.rewards.WEEKLY_ECO_CAP_REFERRER}/неделя.
              Накрутки отсекаем.
            </li>
          </ul>
        </div>
      ) : null}

      {data.referredBy ? (
        <p className="referral-panel__note">
          Вас пригласил: <strong>{data.referredBy.name || 'участник'}</strong>
          {data.referredBy.code ? ` · ${data.referredBy.code}` : ''}
        </p>
      ) : null}

      {data.recent.length > 0 ? (
        <div className="referral-panel__list">
          <strong>Недавние</strong>
          <ul>
            {data.recent.slice(0, 12).map((r) => (
              <li key={r.id}>
                <span>{r.referee.name || r.referee.publicCode || 'Участник'}</span>
                <span className={`referral-panel__badge is-${r.status.toLowerCase()}`}>
                  {statusRu(REFERRAL_STATUS_RU, r.status)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="referral-panel__note">Пока пусто — поделитесь ссылкой в чате или соцсетях.</p>
      )}
    </section>
  );
}
