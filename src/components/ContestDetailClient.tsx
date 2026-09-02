'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import CaptchaField from '@/components/CaptchaField';
import EtaCountdown from '@/components/EtaCountdown';
import toast from 'react-hot-toast';
import { sanitizeCmsHtml } from '@/lib/sanitize-html';
import { safeHttpUrl } from '@/lib/safe-url';
import { CONTEST_KIND_RU, CONTEST_STATUS_RU } from '@/lib/contest-eligibility-shared';
import { Upload } from 'lucide-react';

type Contest = {
  id: string;
  kind: string;
  title: string;
  summary: string | null;
  rulesHtml: string;
  prizeText: string | null;
  status: string;
  allowVoting: boolean;
  endsAt: string | null;
  voteEndsAt: string | null;
  booking: { title: string } | null;
  winners: Array<{ place: number; user: { name: string | null; publicCode: string | null } }>;
  _count: { submissions: number; raffleEntries: number };
  eligibility?: {
    minSocial: number | null;
    minReliability: number | null;
    needCheckIn: boolean;
    oneVotePerContest: boolean;
  };
};

type Sub = {
  id: string;
  title: string | null;
  bodyText: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  status: string;
  voteCount: number;
  user: { name: string | null; publicCode: string | null };
  iVoted?: boolean;
  isMine?: boolean;
};

const SUB_RU: Record<string, string> = {
  PENDING: 'На проверке',
  APPROVED: 'Одобрена',
  REJECTED: 'Отклонена',
};

export default function ContestDetailClient() {
  const { id } = useParams<{ id: string }>();
  const [contest, setContest] = useState<Contest | null>(null);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [elig, setElig] = useState<{ ok: boolean; message?: string } | null>(null);
  const [myVoteCount, setMyVoteCount] = useState(0);
  const [title, setTitle] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [token, setToken] = useState('');
  const [voteToken, setVoteToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [needAuth, setNeedAuth] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/contests/${id}`);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      setNeedAuth(true);
      return;
    }
    if (!res.ok) {
      toast.error(data.message || 'Не найдено');
      return;
    }
    setNeedAuth(false);
    setContest(data.contest);
    setSubs(data.submissions || []);
    setElig(data.eligibility || null);
    setMyVoteCount(Number(data.myVoteCount || 0));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/user/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Не удалось загрузить');
      if (data.url) {
        setImageUrl(data.url);
        toast.success('Фото загружено');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const submit = async () => {
    if (!token) {
      toast.error('Пройдите проверку');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/contests/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contestId: id,
          title,
          bodyText,
          linkUrl,
          imageUrl,
          captchaToken: token,
          website: '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Ошибка');
      toast.success('Работа отправлена на проверку');
      setToken('');
      setTitle('');
      setBodyText('');
      setLinkUrl('');
      setImageUrl('');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
      setToken('');
    } finally {
      setBusy(false);
    }
  };

  const vote = async (submissionId: string) => {
    if (!voteToken) {
      toast.error('Пройдите проверку перед голосованием');
      return;
    }
    try {
      const res = await fetch('/api/contests/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId,
          captchaToken: voteToken,
          website: '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Ошибка');
      toast.success('Голос учтён');
      setVoteToken('');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
      setVoteToken('');
    }
  };

  if (needAuth) {
    return (
      <div className="container" style={{ padding: '2rem 1rem', maxWidth: 520 }}>
        <section className="yp-surface yp-guest-gate" style={{ padding: '1.5rem', textAlign: 'center' }}>
          <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem' }}>Конкурс для участников</h1>
          <p style={{ margin: '0 0 1rem', color: 'var(--muted)' }}>
            Войдите, чтобы смотреть работы и голосовать.
          </p>
          <Link href={`/login?callbackUrl=/contests/${encodeURIComponent(String(id || ''))}`} className="btn btn-primary">
            Войти
          </Link>
        </section>
      </div>
    );
  }

  if (!contest) {
    return (
      <div className="container" style={{ padding: '2rem' }}>
        Загрузка…
      </div>
    );
  }

  const canVote =
    contest.allowVoting &&
    (contest.status === 'OPEN' || contest.status === 'VOTING') &&
    !(contest.eligibility?.oneVotePerContest && myVoteCount > 0);

  return (
    <div className="container yp-engage" style={{ padding: '1.5rem 1rem 3rem', maxWidth: 760 }}>
      <Link href="/contests" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
        ← Все конкурсы
      </Link>
      <h1 style={{ margin: '0.75rem 0 0.35rem', fontWeight: 800 }}>{contest.title}</h1>
      <p style={{ color: 'var(--muted)', margin: '0 0 1rem' }}>
        {CONTEST_KIND_RU[contest.kind] || "Конкурс"} · {CONTEST_STATUS_RU[contest.status] || "Неизвестно"}
        {contest.prizeText ? ` · приз: ${contest.prizeText}` : ''}
        {contest.booking ? ` · ${contest.booking.title}` : ''}
      </p>
      {contest.summary ? <p>{contest.summary}</p> : null}
      {contest.endsAt || contest.voteEndsAt ? (
        <div style={{ marginBottom: '1rem' }}>
          <EtaCountdown
            eta={contest.status === 'VOTING' && contest.voteEndsAt ? contest.voteEndsAt : contest.endsAt}
            prefix={contest.status === 'VOTING' ? 'Голосование' : 'До дедлайна'}
            doneLabel="Срок истёк"
          />
        </div>
      ) : null}

      {(contest.eligibility?.minSocial ||
        contest.eligibility?.minReliability ||
        contest.eligibility?.needCheckIn) && (
        <ul className="yp-engage__reqs">
          {contest.eligibility.minReliability ? (
            <li>Авторитет от {contest.eligibility.minReliability}</li>
          ) : null}
          {contest.eligibility.minSocial ? <li>Соцрейтинг от {contest.eligibility.minSocial}</li> : null}
          {contest.eligibility.needCheckIn ? <li>Нужен check-in на мероприятии</li> : null}
          {contest.eligibility.oneVotePerContest ? <li>Один голос на конкурс</li> : null}
        </ul>
      )}

      <div
        className="prose card-surface"
        style={{ padding: '1.15rem', marginBottom: '1.25rem' }}
        dangerouslySetInnerHTML={{ __html: sanitizeCmsHtml(contest.rulesHtml) }}
      />

      {contest.winners?.length > 0 && (
        <div className="card-surface" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
          <strong>Победители</strong>
          <ol>
            {contest.winners.map((w) => (
              <li key={w.place}>
                {w.user.name || 'Участник'}
                {w.user.publicCode ? ` (#${w.user.publicCode})` : ''}
              </li>
            ))}
          </ol>
        </div>
      )}

      {contest.kind === 'RAFFLE' && (
        <div className="card-surface" style={{ padding: '1.15rem', marginBottom: '1.25rem' }}>
          <p style={{ margin: 0 }}>
            Участники набираются по check-in на связанном событии. Сейчас в пуле:{' '}
            <strong>{contest._count.raffleEntries}</strong>. Итоги появятся здесь после розыгрыша.
          </p>
        </div>
      )}

      {contest.kind === 'SUBMISSION' && contest.status === 'OPEN' && (
        <div className="card-surface" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Подать работу</h2>
          {elig && !elig.ok ? (
            <p style={{ color: '#b45309', margin: 0 }}>{elig.message}</p>
          ) : (
            <>
              <input
                placeholder="Название"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid rgba(15,23,42,0.12)' }}
              />
              <textarea
                placeholder="Текст работы"
                rows={4}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid rgba(15,23,42,0.12)' }}
              />
              <input
                placeholder="Ссылка (необязательно)"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid rgba(15,23,42,0.12)' }}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={14} /> {uploading ? 'Загрузка…' : 'Загрузить фото'}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadImage(f);
                  }}
                />
                {imageUrl ? (
                  <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Фото добавлено</span>
                ) : null}
              </div>
              <CaptchaField onToken={setToken} />
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void submit()}>
                {busy ? 'Отправка…' : 'Отправить'}
              </button>
            </>
          )}
        </div>
      )}

      {contest.kind === 'SUBMISSION' && (
        <div>
          <h2 style={{ fontSize: '1.15rem' }}>Галерея работ</h2>
          {canVote && (
            <div style={{ marginBottom: '1rem' }}>
              <CaptchaField onToken={setVoteToken} />
              {contest.eligibility?.oneVotePerContest ? (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
                  Один голос на весь конкурс — выбирайте внимательно.
                </p>
              ) : null}
            </div>
          )}
          {!canVote && contest.allowVoting && myVoteCount > 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Вы уже голосовали в этом конкурсе.</p>
          ) : null}
          {subs.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>Пока нет работ.</p>
          ) : (
            <div style={{ display: 'grid', gap: '0.85rem' }}>
              {subs.map((s) => (
                <div key={s.id} className="card-surface" style={{ padding: '1rem' }}>
                  <strong>{s.title || 'Без названия'}</strong>
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                    {s.user.name || 'Участник'} · {SUB_RU[s.status] || s.status}
                    {s.status === 'APPROVED' ? ` · голосов: ${s.voteCount}` : ''}
                    {s.isMine ? ' · ваша' : ''}
                  </div>
                  {s.bodyText ? <p style={{ whiteSpace: 'pre-wrap' }}>{s.bodyText}</p> : null}
                  {safeHttpUrl(s.imageUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={safeHttpUrl(s.imageUrl)!} alt="" style={{ maxWidth: '100%', borderRadius: 12, marginTop: 8 }} />
                  ) : null}
                  {safeHttpUrl(s.linkUrl) ? (
                    <a href={safeHttpUrl(s.linkUrl)!} target="_blank" rel="noreferrer">
                      Ссылка
                    </a>
                  ) : null}
                  {canVote && s.status === 'APPROVED' && !s.isMine && !s.iVoted && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ marginTop: 8 }}
                      onClick={() => void vote(s.id)}
                    >
                      Голосовать
                    </button>
                  )}
                  {s.iVoted ? (
                    <span style={{ display: 'inline-block', marginTop: 8, fontSize: '0.85rem', color: '#0d9488' }}>
                      Ваш голос
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
